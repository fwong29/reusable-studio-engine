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

/* ============================ GOLF (full side-view hole) ============================ */
function Golf(mode) {
  const twoP = mode === '2p';
  const colors = ['#ff6f5e', '#4aa3ff'];
  const COURSE = 3200;            // world length of the hole
  const HOLE_X = 2980;            // pin world x
  const PAR = 4;
  // ground height (screen y) for a world x
  const base = () => H * 0.72;
  const greenStart = HOLE_X - 360;
  const bunker = { x: 2050, w: 260 };
  const water = { x: 1250, w: 240 };
  function groundY(x) {
    if (x >= greenStart) return base() - 18;                       // green plateau
    let y = base();
    y += Math.sin(x * 0.0016) * 26 + Math.sin(x * 0.0041) * 12;    // gentle hills
    if (x > bunker.x && x < bunker.x + bunker.w) y += 26;          // bunker dip
    return y;
  }
  function terrainAt(x) {
    if (x >= greenStart) return 'green';
    if (x > water.x && x < water.x + water.w) return 'water';
    if (x > bunker.x && x < bunker.x + bunker.w) return 'bunker';
    return 'fairway';
  }

  const players = [];
  for (let i = 0; i < (twoP ? 2 : 1); i++) players[i] = { strokes: 0, holed: false, ball: null, lastSafe: 120 };
  let turn = 0;
  let angle = 42, power = 0, charging = false, pdir = 1, swinging = false;
  let camX = 0, msg = '', msgT = 0;

  function resetBall(p) { p.ball = { x: p.lastSafe, y: groundY(p.lastSafe) - 8, vx: 0, vy: 0, state: 'ready' }; }
  players.forEach(resetBall);

  function hud() {
    const p = players[turn];
    const dist = Math.max(0, Math.round((HOLE_X - p.ball.x) / 7));
    setScore([
      ...(twoP ? players.map((pl, i) => ({ who: 'P' + (i + 1), val: pl.strokes + (pl.holed ? '✓' : '') })) : [{ who: 'Strokes', val: players[0].strokes }]),
      { who: 'Par', val: PAR }, { who: 'To pin', val: dist + 'y' },
    ], twoP ? turn : -1);
  }
  hud();

  function launch(pw) {
    const p = players[turn]; const b = p.ball;
    if (b.state !== 'ready' || p.holed) return;
    p.strokes++; hud();
    const onGreen = terrainAt(b.x) === 'green';
    const spd = onGreen ? 4 + pw * 10 : 11 + pw * 30;      // putt is gentler
    const ang = onGreen ? 4 : angle;
    b.vx = Math.cos(ang * Math.PI / 180) * spd;
    b.vy = -Math.sin(ang * Math.PI / 180) * spd;
    b.state = onGreen ? 'roll' : 'flight';
    charging = false; power = 0;
  }

  return {
    key(k, down) {
      const b = players[turn].ball; if (!b || b.state !== 'ready') return;
      if (down && k === 'ArrowUp') angle = Math.min(80, angle + 2);
      if (down && k === 'ArrowDown') angle = Math.max(8, angle - 2);
      if (k === ' ') { if (down) charging = true; else if (charging) launch(power); }
    },
    swing(info) {
      const b = players[turn].ball; if (!b || b.state !== 'ready') return;
      launch(info.power);     // power from how fast you swing your arm
    },
    update() {
      if (charging) { power += 0.022 * pdir; if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; } }
      if (keys['ArrowUp']) angle = Math.min(80, angle + 0.8);
      if (keys['ArrowDown']) angle = Math.max(8, angle - 0.8);

      const p = players[turn]; const b = p.ball;
      if (b && (b.state === 'flight' || b.state === 'roll')) {
        if (b.state === 'flight') {
          b.vy += 0.42; b.x += b.vx; b.y += b.vy;
          const g = groundY(b.x);
          if (b.y >= g) {              // landed
            b.y = g;
            const t = terrainAt(b.x);
            if (t === 'water') { msg = 'Splash! +1 penalty'; msgT = 90; p.strokes++; p.lastSafe = Math.max(120, water.x - 60); resetBall(p); hud(); afterShot(); return; }
            b.vy = 0; b.vx *= (t === 'bunker' ? 0.25 : 0.55); b.state = 'roll';
          }
        } else {                       // rolling
          const slope = (groundY(b.x + 4) - groundY(b.x - 4)) / 8;
          b.vx += slope * 0.9;
          b.vx *= (terrainAt(b.x) === 'bunker' ? 0.86 : terrainAt(b.x) === 'green' ? 0.965 : 0.94);
          b.x += b.vx; b.y = groundY(b.x) - 6;
          if (b.x < 20) { b.x = 20; b.vx = 0; }
          // sink?
          const d = Math.abs(b.x - HOLE_X);
          if (terrainAt(b.x) === 'green' && d < 16 && Math.abs(b.vx) < 3.2) {
            p.holed = true; b.state = 'done';
            msg = (twoP ? 'P' + (turn + 1) : 'You') + ' holed out — ' + scoreName(p.strokes) + '!'; msgT = 160; hud(); afterShot(); return;
          }
          if (Math.abs(b.vx) < 0.18) { b.state = 'ready'; if (terrainAt(b.x) !== 'water') p.lastSafe = b.x; afterShot(); }
        }
      }
      // camera follows the active ball
      const target = (b ? b.x : 0) - W * 0.32;
      camX += (target - camX) * 0.08;
      camX = Math.max(0, Math.min(COURSE - W + 200, camX));
      if (msgT > 0) msgT--;
    },
    draw() {
      ctx.clearRect(0, 0, W, H);
      sky(); hills();
      // ground fill
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 6) { const wx = sx + camX; ctx.lineTo(sx, groundY(wx)); }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = '#6cbf5b'; ctx.fill();
      ctx.strokeStyle = '#4f9e43'; ctx.lineWidth = 3; ctx.stroke();
      // green patch
      rectWorld(greenStart, HOLE_X + 120, '#8fe07a', 10);
      // bunker + water
      rectWorld(bunker.x, bunker.x + bunker.w, '#f1d196', 0);
      waterWorld(water.x, water.x + water.w);
      // flag + hole
      const hx = HOLE_X - camX;
      if (hx > -40 && hx < W + 40) {
        const gy = groundY(HOLE_X);
        ctx.fillStyle = '#1b2a16'; ctx.beginPath(); ctx.ellipse(hx, gy, 12, 5, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, gy); ctx.lineTo(hx, gy - 78); ctx.stroke();
        ctx.fillStyle = '#ff5e5e'; ctx.beginPath(); ctx.moveTo(hx, gy - 78); ctx.lineTo(hx + 30, gy - 70); ctx.lineTo(hx, gy - 62); ctx.fill();
      }
      // ball + mascot + aim
      const p = players[turn], b = p.ball; const bx = b.x - camX, by = b.y;
      if (b.state === 'ready' && !p.holed) {
        drawMascot(bx - 30, by - 30, 24, colors[turn]);
        // aim/power indicator
        const aLen = 46 + power * 60;
        ctx.strokeStyle = 'rgba(35,48,58,.55)'; ctx.lineWidth = 4; ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(-angle * Math.PI / 180) * aLen, by + Math.sin(-angle * Math.PI / 180) * aLen); ctx.stroke(); ctx.setLineDash([]);
        // power bar
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(bx - 32, by - 74, 64, 9);
        ctx.fillStyle = power > .82 ? '#ff5e5e' : '#ffd24a'; ctx.fillRect(bx - 32, by - 74, 64 * power, 9);
        // angle label
        ctx.fillStyle = 'rgba(35,48,58,.7)'; ctx.font = '700 12px Nunito'; ctx.textAlign = 'left';
        ctx.fillText(Math.round(angle) + '°', bx + 10, by - 50);
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.fill(); ctx.stroke();

      if (msgT > 0) { ctx.fillStyle = 'rgba(35,48,58,.9)'; ctx.font = '800 32px "Baloo 2"'; ctx.textAlign = 'center'; ctx.fillText(msg, W / 2, H * 0.26); }
      ctx.fillStyle = 'rgba(35,48,58,.6)'; ctx.font = '700 14px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Pose.ready ? 'swing your arm to hit — swing harder = more power' : '↑ ↓ angle · hold SPACE for power, release to swing', W / 2, H - 16);
    },
  };

  function afterShot() { if (twoP) maybeAdvance(); }
  function maybeAdvance() {
    if (players.every(pl => pl.holed)) {
      const win = players[0].strokes === players[1].strokes ? "It's a tie!" : 'P' + (players[0].strokes < players[1].strokes ? 1 : 2) + ' wins!';
      msg = win; msgT = 100000; return;
    }
    // give the turn to the other player if theirs isn't done AND current ball is resting
    const b = players[turn].ball;
    if ((players[turn].holed || b.state === 'ready')) {
      let n = turn;
      for (let k = 0; k < players.length; k++) { n = (n + 1) % players.length; if (!players[n].holed) break; }
      if (n !== turn) { turn = n; camX = players[turn].ball.x - W * 0.32; }
      hud();
    }
  }
  function scoreName(s) { const d = s - PAR; return d <= -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : (d + ' over'); }

  function sky() { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8fd3ff'); g.addColorStop(.6, '#cdeeff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function hills() {
    ctx.fillStyle = '#9bd98c';
    for (let i = 0; i < 4; i++) { const hx = ((i * 900 - camX * 0.4) % (W + 600)) - 300 + (i % 2) * 200; ctx.beginPath(); ctx.ellipse(hx, H * 0.6, 340, 150, 0, Math.PI, 0); ctx.fill(); }
  }
  function rectWorld(x0, x1, color, raise) {
    const a = x0 - camX, b = x1 - camX; if (b < 0 || a > W) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(a, groundY(x0) - raise);
    for (let wx = x0; wx <= x1; wx += 6) ctx.lineTo(wx - camX, groundY(wx) - raise);
    ctx.lineTo(b, H); ctx.lineTo(a, H); ctx.closePath(); ctx.fill();
  }
  function waterWorld(x0, x1) {
    const a = x0 - camX, b = x1 - camX; if (b < 0 || a > W) return;
    ctx.fillStyle = '#5fc4e8'; ctx.beginPath(); ctx.moveTo(a, groundY(x0));
    for (let wx = x0; wx <= x1; wx += 6) ctx.lineTo(wx - camX, groundY(wx) + 6);
    ctx.lineTo(b, H); ctx.lineTo(a, H); ctx.closePath(); ctx.fill();
  }
}

function GolfOLD(mode) {
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
