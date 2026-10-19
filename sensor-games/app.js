// Motion Arcade — body-controlled minigames. Original mascots, local play.
// Shared webcam→pose pipeline (ml5 bodyPose / MoveNet); every game also has a
// keyboard fallback so it works with no camera.

const video = document.getElementById('cam');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const modeSelect = document.getElementById('modeSelect');
const modeTitle = document.getElementById('modeTitle');
const modeButtons = document.getElementById('modeButtons');
const gameGrid = document.getElementById('gameGrid');
const hud = document.getElementById('hud');
const scorebar = document.getElementById('scorebar');
const poseHud = document.getElementById('poseHud');
const poseCanvas = document.getElementById('poseCanvas');
const poseCtx = poseCanvas.getContext('2d');
const poseStatus = document.getElementById('poseStatus');
const camBtn = document.getElementById('camBtn');

let W = 0, H = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize); resize();

/* ============================ POSE PIPELINE ============================ */
const Pose = {
  on: false, ready: false, poses: [],
  // latest named keypoints per tracked person, normalized 0..1 (x mirrored)
  people: [],
  swingCb: null,
  _hist: [{}, {}],   // wrist history per person for swing detection
};
let bodyPose = null;

async function enableCamera() {
  if (Pose.on) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    video.srcObject = stream;
    await video.play();
    poseHud.hidden = false;
    poseStatus.textContent = 'loading model…';
    bodyPose = ml5.bodyPose('MoveNet', { maxPoses: 2, flipped: true }, () => {
      bodyPose.detectStart(video, (results) => { Pose.poses = results || []; onPoses(); });
      Pose.ready = true; poseStatus.textContent = 'tracking';
    });
    Pose.on = true;
    camBtn.textContent = '✓ camera on';
    camBtn.classList.add('on');
  } catch (e) {
    poseStatus.textContent = 'camera blocked';
    alert('Could not start the camera (' + e.message + ').\nYou can still play everything on the keyboard.');
  }
}
camBtn.addEventListener('click', enableCamera);

function kp(pose, name) {
  const k = pose.keypoints.find(p => p.name === name);
  return k && k.confidence > 0.3 ? k : null;
}
function onPoses() {
  // normalize to 0..1 using the video intrinsic size
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  Pose.people = Pose.poses.map(p => {
    const get = (n) => { const k = kp(p, n); return k ? { x: k.x / vw, y: k.y / vh } : null; };
    return {
      nose: get('nose'),
      lWrist: get('left_wrist'), rWrist: get('right_wrist'),
      lShoulder: get('left_shoulder'), rShoulder: get('right_shoulder'),
      lHip: get('left_hip'), rHip: get('right_hip'),
      lKnee: get('left_knee'), rKnee: get('right_knee'),
    };
  });
  detectSwings();
  drawPosePreview();
}

// swing = a wrist moving fast; emit peak speed when it crosses then falls
function detectSwings() {
  const now = performance.now();
  Pose.people.forEach((person, i) => {
    const w = person.rWrist || person.lWrist;
    const h = Pose._hist[i] || (Pose._hist[i] = {});
    if (!w) { h.last = null; return; }
    if (h.last) {
      const dt = (now - h.t) / 1000 || 0.016;
      const sp = Math.hypot(w.x - h.last.x, w.y - h.last.y) / dt; // units/sec
      h.peak = Math.max(h.peak || 0, sp);
      if (sp > 1.1 && !h.swinging) { h.swinging = true; h.peak = sp; h.ax = h.last.x; }
      if (h.swinging && sp < 0.35) {
        h.swinging = false;
        const dir = (w.x - h.ax) >= 0 ? 'right' : 'left';
        if (Pose.swingCb) Pose.swingCb({ player: i, power: Math.min(1, (h.peak - 1.1) / 2.4), dir, peak: h.peak });
        h.peak = 0;
      }
    }
    h.last = { x: w.x, y: w.y }; h.t = now;
  });
}
// body lean (-1 left .. 1 right) and vertical (crouch/jump) for a given person
function leanOf(i) {
  const p = Pose.people[i]; if (!p) return 0;
  const s = p.nose || (p.lShoulder && p.rShoulder ? { x: (p.lShoulder.x + p.rShoulder.x) / 2 } : null);
  return s ? Math.max(-1, Math.min(1, (s.x - 0.5) * 3)) : 0;
}
function headY(i) { const p = Pose.people[i]; return p && p.nose ? p.nose.y : 0.5; }

function drawPosePreview() {
  poseCtx.clearRect(0, 0, 160, 120);
  poseCtx.fillStyle = '#0b1118'; poseCtx.fillRect(0, 0, 160, 120);
  const cols = ['#ff6f5e', '#4aa3ff'];
  Pose.people.forEach((p, i) => {
    poseCtx.fillStyle = cols[i] || '#fff';
    Object.values(p).forEach(pt => { if (pt) { poseCtx.beginPath(); poseCtx.arc(pt.x * 160, pt.y * 120, 3, 0, 7); poseCtx.fill(); } });
  });
}

/* ============================ MASCOTS (original) ============================ */
// A round cartoon buddy: body blob, eyes, cap, optional club/bat/racket.
function drawMascot(x, y, s, color, opt = {}) {
  const face = opt.face || '#fff3dc';
  ctx.save(); ctx.translate(x, y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(0, s * 0.95, s * 0.7, s * 0.2, 0, 0, 7); ctx.fill();
  // body
  ctx.fillStyle = color;
  roundBlob(0, 0, s);
  // belly
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(0, s * 0.25, s * 0.42, s * 0.5, 0, 0, 7); ctx.fill();
  // eyes
  ctx.fillStyle = '#23303a';
  ctx.beginPath(); ctx.arc(-s * 0.22, -s * 0.1, s * 0.09, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.1, s * 0.09, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-s * 0.19, -s * 0.13, s * 0.03, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.25, -s * 0.13, s * 0.03, 0, 7); ctx.fill();
  // smile
  ctx.strokeStyle = '#23303a'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, s * 0.02, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // cheeks
  ctx.fillStyle = 'rgba(255,120,110,.5)';
  ctx.beginPath(); ctx.arc(-s * 0.34, s * 0.08, s * 0.08, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.34, s * 0.08, s * 0.08, 0, 7); ctx.fill();
  // cap
  ctx.fillStyle = shade(color, -30);
  ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.55, Math.PI, 0); ctx.fill();
  ctx.fillRect(-s * 0.55, -s * 0.5, s * 1.1, s * 0.12);
  ctx.fillRect(s * 0.3, -s * 0.5, s * 0.5, s * 0.1); // brim
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -s * 0.75, s * 0.1, 0, 7); ctx.fill(); // pom
  ctx.restore();
}
function roundBlob(cx, cy, s) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.6, s * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ============================ GAME SHELL ============================ */
let current = null;      // current game instance
let rafId = null;
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; if (current && current.key) current.key(e.key, true); });
window.addEventListener('keyup', e => { keys[e.key] = false; if (current && current.key) current.key(e.key, false); });
Pose.swingCb = (info) => { if (current && current.swing) current.swing(info); };

const GAMES = [
  { id: 'golf', name: 'Golf', emoji: '⛳', ready: true },
  { id: 'bowling', name: 'Bowling', emoji: '🎳', ready: false },
  { id: 'baseball', name: 'Baseball', emoji: '⚾', ready: false },
  { id: 'tennis', name: 'Tennis', emoji: '🎾', ready: false },
  { id: 'pingpong', name: 'Ping Pong', emoji: '🏓', ready: false },
  { id: 'runner', name: 'Endless Runner', emoji: '🏃', ready: false },
];

function buildMenu() {
  gameGrid.innerHTML = '';
  GAMES.forEach(g => {
    const b = document.createElement('button');
    b.className = 'card'; b.disabled = !g.ready;
    b.innerHTML = `<span class="emoji">${g.emoji}</span><span class="name">${g.name}</span>` +
      (g.ready ? '' : '<span class="soon">soon</span>');
    b.addEventListener('click', () => openModes(g));
    gameGrid.appendChild(b);
  });
}
function openModes(g) {
  modeTitle.textContent = g.name;
  modeButtons.innerHTML = '';
  const modes = g.id === 'runner'
    ? [{ k: '1p', label: '1 Player', sub: 'solo run' }]
    : [{ k: '1p', label: '1 Player', sub: 'vs the course' }, { k: '2p', label: '2 Players', sub: 'take turns' }];
  modes.forEach(m => {
    const b = document.createElement('button'); b.className = 'mode-btn';
    b.innerHTML = `${m.label}<small>${m.sub}</small>`;
    b.addEventListener('click', () => startGame(g.id, m.k));
    modeButtons.appendChild(b);
  });
  menu.hidden = true; modeSelect.hidden = false;
}
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', toMenu));
function toMenu() {
  if (rafId) cancelAnimationFrame(rafId); rafId = null; current = null;
  hud.hidden = true; modeSelect.hidden = true; menu.hidden = false;
}
function startGame(id, mode) {
  modeSelect.hidden = true; hud.hidden = false;
  if (id === 'golf') current = Golf(mode);
  if (!current) { toMenu(); return; }
  loop();
}
function setScore(chips, activeIdx) {
  scorebar.innerHTML = '';
  chips.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'scorechip' + (i === activeIdx ? ' active' : '');
    d.innerHTML = `<span class="who">${c.who}</span>${c.val}`;
    scorebar.appendChild(d);
  });
}
function loop() { current.update(); current.draw(); rafId = requestAnimationFrame(loop); }

/* ============================ GOLF ============================ */
function Golf(mode) {
  const twoP = mode === '2p';
  const colors = ['#ff6f5e', '#4aa3ff'];
  const hole = { x: 0, y: 0, r: 16 };
  const players = [];
  let turn = 0, charging = false, power = 0, pdir = 1, aim = 0, message = '', msgT = 0;

  function layout() {
    hole.x = W * 0.8; hole.y = H * 0.74;
    for (let i = 0; i < (twoP ? 2 : 1); i++) {
      players[i] = players[i] || { strokes: 0, sunk: false };
      players[i].ball = { x: W * 0.16 + i * 40, y: H * 0.8, vx: 0, vy: 0, moving: false };
    }
  }
  layout();
  aim = Math.atan2(hole.y - players[0].ball.y, hole.x - players[0].ball.x);

  function refreshHud() {
    setScore(players.map((p, i) => ({ who: twoP ? 'P' + (i + 1) : 'You', val: p.strokes + (p.sunk ? ' ✓' : '') })), turn);
  }
  refreshHud();

  function doSwing(pw) {
    const p = players[turn]; if (p.ball.moving || p.sunk) return;
    p.strokes++; refreshHud();
    const speed = 6 + pw * 20;
    p.ball.vx = Math.cos(aim) * speed; p.ball.vy = Math.sin(aim) * speed; p.ball.moving = true;
    charging = false; power = 0;
  }

  return {
    key(k, down) {
      const p = players[turn]; if (!p || p.ball.moving || p.sunk) return;
      if (k === 'ArrowLeft') aim -= down ? 0.06 : 0;
      if (k === 'ArrowRight') aim += down ? 0.06 : 0;
      if (k === ' ') { if (down) charging = true; else if (charging) doSwing(power); }
    },
    swing(info) {
      // only the player whose turn it is (or nearest) controls in turn-based golf
      const p = players[turn]; if (!p || p.ball.moving || p.sunk) return;
      // aim nudged by body lean, power from swing speed
      aim += leanOf(info.player) * 0.25;
      doSwing(info.power);
    },
    update() {
      // aim with held arrows handled in key(); charge meter oscillates
      const p = players[turn];
      if (charging) { power += 0.02 * pdir; if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; } }
      if (keys['ArrowLeft'] && p && !p.ball.moving) aim -= 0.04;
      if (keys['ArrowRight'] && p && !p.ball.moving) aim += 0.04;

      players.forEach((pl, i) => {
        const b = pl.ball; if (!b.moving) return;
        b.x += b.vx; b.y += b.vy; b.vx *= 0.975; b.vy *= 0.975;
        if (b.x < 14) { b.x = 14; b.vx *= -0.6; } if (b.x > W - 14) { b.x = W - 14; b.vx *= -0.6; }
        if (b.y < H * 0.46) { b.y = H * 0.46; b.vy *= -0.6; } if (b.y > H - 14) { b.y = H - 14; b.vy *= -0.6; }
        const d = Math.hypot(b.x - hole.x, b.y - hole.y);
        const sp = Math.hypot(b.vx, b.vy);
        if (d < hole.r && sp < 6) { pl.sunk = true; b.moving = false; message = (twoP ? 'P' + (i + 1) : 'You') + ' sank it in ' + pl.strokes + '!'; msgT = 120; refreshHud(); nextIfNeeded(); }
        else if (sp < 0.4) { b.moving = false; if (twoP) { advanceTurn(); } }
      });
      if (msgT > 0) msgT--;
    },
    draw() {
      ctx.clearRect(0, 0, W, H);
      // fairway
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      // flag + hole
      ctx.fillStyle = '#1d2a17'; ctx.beginPath(); ctx.ellipse(hole.x, hole.y, hole.r, hole.r * 0.55, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hole.x, hole.y); ctx.lineTo(hole.x, hole.y - 70); ctx.stroke();
      ctx.fillStyle = '#ff5e5e'; ctx.beginPath(); ctx.moveTo(hole.x, hole.y - 70); ctx.lineTo(hole.x + 34, hole.y - 60); ctx.lineTo(hole.x, hole.y - 50); ctx.fill();

      const p = players[turn];
      // aim arrow + power (only when it's a live turn)
      if (p && !p.ball.moving && !p.sunk) {
        const b = p.ball;
        ctx.strokeStyle = 'rgba(35,48,58,.5)'; ctx.lineWidth = 4; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(aim) * 90, b.y + Math.sin(aim) * 90); ctx.stroke(); ctx.setLineDash([]);
        // power meter
        if (charging) {
          ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(b.x - 30, b.y - 60, 60, 10);
          ctx.fillStyle = power > .8 ? '#ff5e5e' : '#ffd24a'; ctx.fillRect(b.x - 30, b.y - 60, 60 * power, 10);
        }
      }
      // balls + mascots
      players.forEach((pl, i) => {
        const b = pl.ball;
        if (i === turn && !pl.sunk) drawMascot(b.x - 34, b.y - 36, 26, colors[i]);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, 7); ctx.fill(); ctx.stroke();
      });
      // message
      if (msgT > 0) {
        ctx.fillStyle = 'rgba(35,48,58,.85)'; ctx.font = '800 34px "Baloo 2"'; ctx.textAlign = 'center';
        ctx.fillText(message, W / 2, H * 0.3);
      }
      // controls hint
      ctx.fillStyle = 'rgba(35,48,58,.55)'; ctx.font = '700 14px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Pose.ready ? 'swing your arm to hit · lean to aim' : '← → aim · hold SPACE for power, release to swing', W / 2, H - 16);
    },
  };

  function advanceTurn() {
    // move to next not-sunk player
    let n = turn;
    for (let k = 0; k < players.length; k++) { n = (n + 1) % players.length; if (!players[n].sunk) break; }
    turn = n; aim = Math.atan2(hole.y - players[turn].ball.y, hole.x - players[turn].ball.x); refreshHud();
  }
  function nextIfNeeded() {
    if (!twoP) { message += '  (press menu to replay)'; return; }
    if (players.every(p => p.sunk)) {
      const win = players[0].strokes === players[1].strokes ? 'Tie!' : 'P' + (players[0].strokes < players[1].strokes ? 1 : 2) + ' wins!';
      message = win; msgT = 100000;
    } else advanceTurn();
  }
}

buildMenu();
