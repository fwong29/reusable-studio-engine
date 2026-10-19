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
      if (pending) { const q = pending; pending = null; startGame(q.id, q.mode); }
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
let pending = null;      // game waiting for the camera to be ready
const keys = {};   // camera-only: kept empty so game keyboard branches never fire
Pose.swingCb = (info) => { if (current && current.swing) current.swing(info); };

const GAMES = [
  { id: 'golf', name: 'Golf', emoji: '⛳', ready: true },
  { id: 'bowling', name: 'Bowling', emoji: '🎳', ready: true },
  { id: 'baseball', name: 'Baseball', emoji: '⚾', ready: true },
  { id: 'tennis', name: 'Tennis', emoji: '🎾', ready: true },
  { id: 'pingpong', name: 'Ping Pong', emoji: '🏓', ready: true },
  { id: 'runner', name: 'Endless Runner', emoji: '🏃', ready: true },
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
const FACTORY = { golf: Golf, bowling: Bowling, baseball: Baseball, tennis: Tennis, pingpong: PingPong, runner: Runner };
function startGame(id, mode) {
  if (!Pose.ready) {                 // camera is required — wait for it, then start
    pending = { id, mode };
    modeButtons.innerHTML = '<div class="waiting">📷 turn on your camera to play…</div>';
    if (!Pose.on) enableCamera();
    return;
  }
  modeSelect.hidden = true; hud.hidden = false;
  current = FACTORY[id] ? FACTORY[id](mode) : null;
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
/* ============================ GOLF — first-person / down-the-course ============================ */
function Golf(mode) {
  const twoP = mode === '2p'; const colors = ['#ff6f5e', '#4aa3ff'];
  const PAR = 4, START = 380;
  const P = []; for (let i = 0; i < (twoP ? 2 : 1); i++) P[i] = { dist: START, strokes: 0, holed: false };
  let turn = 0, aim = 0, power = 0, charging = false, pdir = 1, fly = null, msg = '', msgT = 0;
  let wind = Math.random() * 2 - 1;
  const hy = () => H * 0.42;

  function hud() {
    setScore([
      ...(twoP ? P.map((pl, i) => ({ who: 'P' + (i + 1), val: pl.strokes + (pl.holed ? '✓' : '') })) : [{ who: 'Strokes', val: P[0].strokes }]),
      { who: 'Par', val: PAR }, { who: 'To pin', val: Math.round(P[turn].dist) + 'y' },
    ], twoP ? turn : -1);
  }
  hud();
  function shot(pw) {
    const p = P[turn]; if (fly || p.holed) return; p.strokes++; hud();
    const putt = p.dist <= 22;
    const maxY = putt ? Math.min(p.dist + 5, 32) : Math.min(255, p.dist * 1.1);
    const yards = putt ? pw * maxY : 40 + pw * (maxY - 40);
    const miss = aim * 0.55 + wind * 0.3 * (putt ? 0.15 : 1);
    fly = { t: 0, yards, miss, putt, fy: hy() + (1 - Math.min(1, p.dist / START)) * H * 0.2 };
  }
  function scoreName(s) { const d = s - PAR; return d <= -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : (d + ' over'); }
  function afterShot() { if (!twoP) return; if (P.every(p => p.holed)) { msg = P[0].strokes === P[1].strokes ? "It's a tie!" : 'P' + (P[0].strokes < P[1].strokes ? 1 : 2) + ' wins!'; msgT = 1e6; return; } let n = turn; for (let k = 0; k < P.length; k++) { n = (n + 1) % P.length; if (!P[n].holed) break; } turn = n; wind = Math.random() * 2 - 1; hud(); }

  return {
    key(k, down) { const p = P[turn]; if (fly || !p || p.holed) return;
      if (down && k === 'ArrowLeft') aim = Math.max(-1, aim - 0.08);
      if (down && k === 'ArrowRight') aim = Math.min(1, aim + 0.08);
      if (k === ' ') { if (down) charging = true; else if (charging) { charging = false; shot(power); power = 0; } } },
    swing(info) { const p = P[turn]; if (fly || !p || p.holed) return; aim = Math.max(-1, Math.min(1, aim + leanOf(info.player) * 0.3)); shot(info.power); },
    update() {
      if (charging) { power += 0.022 * pdir; if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; } }
      if (keys['ArrowLeft']) aim = Math.max(-1, aim - 0.02);
      if (keys['ArrowRight']) aim = Math.min(1, aim + 0.02);
      if (fly) { fly.t += 0.03; if (fly.t >= 1) { const p = P[turn]; let nd = p.dist - fly.yards + Math.abs(fly.miss) * (fly.putt ? 2 : 7); if (nd < 0) nd = -nd * 0.5; p.dist = Math.max(0, nd);
        if (p.dist <= 2 && fly.putt) { p.holed = true; msg = (twoP ? 'P' + (turn + 1) : 'You') + ' holed out — ' + scoreName(p.strokes) + '!'; msgT = 160; }
        fly = null; aim *= 0.3; hud(); afterShot(); } }
      if (msgT > 0) msgT--;
    },
    draw() {
      ctx.clearRect(0, 0, W, H);
      let g = ctx.createLinearGradient(0, 0, 0, hy()); g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#dff3ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy());
      ctx.fillStyle = '#86c97a'; ctx.fillRect(0, hy() - 2, W, H - hy());
      const cx = W / 2 + aim * W * 0.1, topW = 46, botW = W * 0.6;
      ctx.fillStyle = '#5fb24e'; ctx.beginPath(); ctx.moveTo(cx - topW, hy()); ctx.lineTo(cx + topW, hy()); ctx.lineTo(W / 2 + botW, H); ctx.lineTo(W / 2 - botW, H); ctx.closePath(); ctx.fill();
      for (let i = 1; i < 7; i++) { const t = i / 7; const yy = hy() + (H - hy()) * t * t; ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1 + t * 3; ctx.beginPath(); ctx.moveTo(cx - (topW + (botW - topW) * t * t), yy); ctx.lineTo(cx + (topW + (botW - topW) * t * t), yy); ctx.stroke(); }
      // trees
      for (let i = 0; i < 6; i++) { const t = i / 6, yy = hy() + (H - hy()) * t * t, sz = 10 + t * 70; tree(cx - (topW + (botW - topW) * t * t) - sz * 0.5, yy, sz); tree(cx + (topW + (botW - topW) * t * t) + sz * 0.5, yy, sz); }
      const near = 1 - Math.min(1, P[turn].dist / START), fS = 0.5 + near * 2.4;
      flag(cx, hy() + near * H * 0.18, fS);
      let bx = W / 2, by = H * 0.86, bs = 9;
      if (fly) { const t = fly.t, arc = Math.sin(t * Math.PI); bx = W / 2 + fly.miss * W * 0.18 * t; by = H * 0.86 - (H * 0.86 - fly.fy) * t - arc * H * 0.17; bs = 9 * (1 - t * 0.78); }
      const p = P[turn];
      if (!fly && !p.holed) {
        drawMascot(W / 2 - 46, H * 0.9, 22, colors[turn]);
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(W / 2, H * 0.86); ctx.lineTo(cx, hy() + 10); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(28, H * 0.4, 18, H * 0.4);
        const ph = H * 0.4 * power; ctx.fillStyle = power > .82 ? '#ff5e5e' : '#ffd24a'; ctx.fillRect(28, H * 0.8 - ph, 18, ph);
        ctx.strokeStyle = '#23303a'; ctx.lineWidth = 2; ctx.strokeRect(28, H * 0.4, 18, H * 0.4);
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, Math.max(2, bs), 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(35,48,58,.7)'; ctx.font = '700 13px Nunito'; ctx.textAlign = 'right';
      ctx.fillText('wind ' + Math.abs(Math.round(wind * 15)) + 'mph ' + (wind > 0 ? '▶' : '◀'), W - 16, 74);
      miniMap(P[turn].dist, START);
      if (msgT > 0) { ctx.fillStyle = 'rgba(35,48,58,.9)'; ctx.font = '800 32px "Baloo 2"'; ctx.textAlign = 'center'; ctx.fillText(msg, W / 2, H * 0.25); }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 14px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Pose.ready ? 'swing your arm to hit · lean to aim' : '← → aim · hold SPACE for power, release to swing', W / 2, H - 16);
    },
  };
  function tree(x, y, s) { ctx.fillStyle = '#3e7d39'; ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.5, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - s * 0.08, y - s * 0.1, s * 0.16, s * 0.3); }
  function flag(x, y, s) { ctx.fillStyle = '#1b2a16'; ctx.beginPath(); ctx.ellipse(x, y, 12 * s, 4 * s, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#eee'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 40 * s); ctx.stroke(); ctx.fillStyle = '#ff5e5e'; ctx.beginPath(); ctx.moveTo(x, y - 40 * s); ctx.lineTo(x + 18 * s, y - 34 * s); ctx.lineTo(x, y - 28 * s); ctx.fill(); }
  function miniMap(dist, start) { const w = 150, h = 16, x = W / 2 - w / 2, y = 54; ctx.fillStyle = 'rgba(31,74,41,.85)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); const t = 1 - Math.min(1, dist / start); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(x + 8 + t * (w - 16), y + h / 2, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w - 8, y + h / 2, 3, 0, 7); ctx.fill(); }
}

/* ============================ BOWLING — POV lane ============================ */
function Bowling(mode) {
  const twoP = mode === '2p'; const colors = ['#ff6f5e', '#4aa3ff'];
  const hy = () => H * 0.34;
  const P = []; for (let i = 0; i < (twoP ? 2 : 1); i++) P[i] = { score: 0, frame: 1 };
  let turn = 0, pins = Array(10).fill(true), rollsLeft = 2, pinsThisFrame = 0;
  let aim = 0, power = 0, charging = false, pdir = 1, curve = 0, ball = null, msg = '', msgT = 0;
  const FRAMES = 3;
  const pinX = [0, -1, 1, -2, 0, 2, -3, -1, 1, 3];   // lateral offsets
  const pinRow = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3];

  function hud() { setScore([...(twoP ? P.map((pl, i) => ({ who: 'P' + (i + 1), val: pl.score })) : [{ who: 'Score', val: P[0].score }]), { who: 'Frame', val: P[turn].frame + '/' + FRAMES }], twoP ? turn : -1); }
  hud();
  function roll(pw) { if (ball) return; ball = { t: 0, ax: aim, pw, curve }; }
  function resolve() {
    const b = ball; const arrive = b.ax + b.curve * 0.8;             // where ball reaches the pins (lane units)
    const spread = 1.1 + b.pw * 1.6;
    let knocked = 0;
    pins.forEach((up, i) => { if (up && Math.abs(pinX[i] - arrive * 3) < spread + pinRow[i] * 0.3) { pins[i] = false; knocked++; } });
    pinsThisFrame += knocked;
    const p = P[turn];
    if (pins.every(x => !x)) { p.score += pinsThisFrame; msg = rollsLeft === 2 ? 'STRIKE! ✨' : 'SPARE!'; msgT = 110; endFrame(); }
    else if (rollsLeft > 1) { rollsLeft--; msg = knocked + ' down'; msgT = 70; }
    else { p.score += pinsThisFrame; msg = knocked + ' down'; msgT = 80; endFrame(); }
    ball = null; power = 0; curve = 0; hud();
  }
  function endFrame() {
    pins = Array(10).fill(true); rollsLeft = 2; pinsThisFrame = 0;
    const p = P[turn];
    if (twoP) { let n = (turn + 1) % 2; if (n === 0) { /* both played this frame */ } turn = n; if (turn === 0) P.forEach(x => x.frame++); else { } }
    else { p.frame++; }
    if ((twoP ? Math.min(P[0].frame, P[1].frame) : p.frame) > FRAMES) { finish(); }
    hud();
  }
  function finish() { if (twoP) { msg = P[0].score === P[1].score ? "Tie!" : 'P' + (P[0].score > P[1].score ? 1 : 2) + ' wins!'; } else msg = 'Final: ' + P[0].score; msgT = 1e6; }

  return {
    key(k, down) { if (ball) return;
      if (down && k === 'ArrowLeft') aim = Math.max(-1, aim - 0.08);
      if (down && k === 'ArrowRight') aim = Math.min(1, aim + 0.08);
      if (k === ' ') { if (down) charging = true; else if (charging) { charging = false; roll(power); } } },
    swing(info) { if (ball) return; curve = -leanOf(info.player); roll(info.power); },
    update() {
      if (charging) { power += 0.02 * pdir; if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; } }
      if (keys['ArrowLeft']) aim = Math.max(-1, aim - 0.02); if (keys['ArrowRight']) aim = Math.min(1, aim + 0.02);
      if (ball) { ball.t += 0.025; if (ball.t >= 1) resolve(); }
      if (msgT > 0) msgT--;
    },
    draw() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#20242e'; ctx.fillRect(0, 0, W, hy());
      // lane trapezoid
      const cx = W / 2, topW = 34, botW = W * 0.3;
      ctx.fillStyle = '#e8c98f'; ctx.beginPath(); ctx.moveTo(cx - topW, hy()); ctx.lineTo(cx + topW, hy()); ctx.lineTo(cx + botW, H); ctx.lineTo(cx - botW, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b2f3a'; // gutters
      ctx.beginPath(); ctx.moveTo(cx - topW, hy()); ctx.lineTo(cx - topW - 10, hy()); ctx.lineTo(cx - botW - 46, H); ctx.lineTo(cx - botW, H); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + topW, hy()); ctx.lineTo(cx + topW + 10, hy()); ctx.lineTo(cx + botW + 46, H); ctx.lineTo(cx + botW, H); ctx.closePath(); ctx.fill();
      // pins at horizon
      pins.forEach((up, i) => { if (!up) return; const px = cx + pinX[i] * (topW / 3.2); const py = hy() - 6 - pinRow[i] * 7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(px, py, 4, 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ff5e5e'; ctx.fillRect(px - 3, py - 3, 6, 2); });
      // ball
      let bx = cx + aim * 30, by = H * 0.9, bs = 20;
      if (ball) { const t = ball.t; bx = cx + (ball.ax * 30) + ball.curve * t * t * 60; by = H * 0.9 - (H * 0.9 - hy()) * t; bs = 20 * (1 - t * 0.85); }
      ctx.fillStyle = colors[turn]; ctx.beginPath(); ctx.arc(bx, by, Math.max(3, bs), 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(bx - bs * 0.3, by - bs * 0.3, Math.max(1, bs * 0.18), 0, 7); ctx.fill();
      if (!ball) {
        drawMascot(cx - 60, H * 0.92, 20, colors[turn]);
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(24, H * 0.45, 16, H * 0.35);
        const ph = H * 0.35 * power; ctx.fillStyle = power > .82 ? '#ff5e5e' : '#ffd24a'; ctx.fillRect(24, H * 0.8 - ph, 16, ph);
      }
      if (msgT > 0) { ctx.fillStyle = 'rgba(255,247,230,.95)'; ctx.font = '800 36px "Baloo 2"'; ctx.textAlign = 'center'; ctx.fillText(msg, W / 2, H * 0.2); }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 14px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Pose.ready ? 'swing your arm to bowl · lean to curve' : '← → aim · hold SPACE for power, release to bowl', W / 2, H - 16);
    },
  };
}

/* ============================ BASEBALL — POV batter ============================ */
function Baseball(mode) {
  const twoP = mode === '2p'; const colors = ['#ff6f5e', '#4aa3ff'];
  const hy = () => H * 0.34;
  let pitchesLeft = 9, score = 0, pitch = null, result = '', resT = 0, swungAt = null;
  function hud() { setScore([{ who: twoP ? 'Batter' : 'You', val: score + ' hr' }, { who: 'Pitches', val: pitchesLeft }], -1); }
  hud();
  function newPitch() { if (pitchesLeft <= 0) { result = 'Game over — ' + score + ' home runs!'; resT = 1e6; return; } pitch = { t: 0, lane: (Math.random() * 2 - 1) * 0.5, spd: 0.016 + Math.random() * 0.01, swung: false, hit: null }; }
  newPitch();
  function swing(pw) {
    if (!pitch || pitch.swung) return; pitch.swung = true; pitchesLeft--;
    const t = pitch.t; const good = t > 0.78 && t < 0.96;              // timing window
    if (!good) { pitch.hit = { type: 'miss' }; result = t < 0.78 ? 'Early!' : 'Late!'; }
    else { const quality = 1 - Math.abs(0.88 - t) / 0.1; const homer = pw * quality > 0.55; pitch.hit = { type: homer ? 'hr' : 'hit', dir: (pitch.lane) + (Math.random() * .4 - .2), pw: pw * quality };
      if (homer) { score++; result = 'HOME RUN! 💥'; } else result = 'Base hit!'; hud(); }
    resT = 90; setTimeout(() => { pitch = null; newPitch(); }, 900);
  }
  return {
    key(k, down) { if (down && k === ' ') swing(0.8); },
    swing(info) { swing(info.power); },
    update() { if (pitch && !pitch.swung) { pitch.t += pitch.spd; if (pitch.t >= 1.05) { pitch.swung = true; pitchesLeft--; result = 'Strike!'; resT = 80; hud(); setTimeout(() => { pitch = null; newPitch(); }, 700); } }
      if (resT > 0) resT--; },
    draw() {
      ctx.clearRect(0, 0, W, H);
      let g = ctx.createLinearGradient(0, 0, 0, hy()); g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#dff3ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy());
      ctx.fillStyle = '#6cbf5b'; ctx.fillRect(0, hy(), W, H - hy());
      // infield diamond (dirt) in perspective
      ctx.fillStyle = '#d7a86a'; ctx.beginPath(); ctx.moveTo(W / 2, hy() + 4); ctx.lineTo(W * 0.75, H * 0.8); ctx.lineTo(W / 2, H); ctx.lineTo(W * 0.25, H * 0.8); ctx.closePath(); ctx.fill();
      // pitcher mound silhouette
      ctx.fillStyle = '#4a7a42'; ctx.beginPath(); ctx.ellipse(W / 2, hy() + 10, 26, 8, 0, 0, 7); ctx.fill();
      drawMascot(W / 2, hy() - 6, 12, '#cfd8dc');
      // ball from pitcher toward batter
      if (pitch) { const t = Math.min(1, pitch.t); const bx = W / 2 + pitch.lane * W * 0.2 * t; const by = hy() + (H * 0.82 - hy()) * t; const bs = 4 + t * 14;
        if (pitch.hit && pitch.hit.type && pitch.hit.type !== 'miss') { // hit: ball flies away up
          const ht = Math.min(1, (pitch.t - (pitch.swungT || pitch.t))); }
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d33'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, bs, 0, 7); ctx.fill(); ctx.stroke(); }
      // batter
      drawMascot(W / 2 - 70, H * 0.9, 24, colors[0]);
      if (resT > 0) { ctx.fillStyle = 'rgba(35,48,58,.9)'; ctx.font = '800 34px "Baloo 2"'; ctx.textAlign = 'center'; ctx.fillText(result, W / 2, H * 0.24); }
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 14px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Pose.ready ? 'swing when the ball reaches you!' : 'press SPACE to swing — time it!', W / 2, H - 16);
    },
  };
}

/* ============================ TENNIS / PING PONG — shared court ============================ */
function Rally(mode, opts) {
  const twoP = mode === '2p'; const colors = ['#ff6f5e', '#4aa3ff'];
  const toWin = 5; const sc = [0, 0];
  const court = opts.court;    // color
  let ball = { x: W / 2, y: H / 2, vx: 4, vy: opts.speed, owner: 1 };
  const pad = [{ x: W / 2 }, { x: W / 2 }];   // pad[0] bottom (P1), pad[1] top (P2/CPU)
  const padW = opts.padW; let msg = '', msgT = 0, serve = true;
  function hud() { setScore([{ who: 'P1', val: sc[0] }, { who: twoP ? 'P2' : 'CPU', val: sc[1] }], -1); }
  hud();
  function reset(dir) { ball = { x: W / 2, y: H / 2, vx: (Math.random() * 2 - 1) * 3, vy: dir * opts.speed }; }
  function hit(i, pw) { if ((i === 0 && ball.vy < 0) || (i === 1 && ball.vy > 0)) return; // only hit when coming to you
    const near = i === 0 ? ball.y > H * 0.7 : ball.y < H * 0.3; if (!near) return;
    ball.vy = (i === 0 ? -1 : 1) * (opts.speed + pw * opts.speed); ball.vx += (ball.x - pad[i].x) * 0.12; }
  return {
    key(k, down) { if (k === 'ArrowLeft') pad[0].x += down ? -24 : 0; if (k === 'ArrowRight') pad[0].x += down ? 24 : 0; if (down && k === ' ') hit(0, 0.8);
      if (twoP) { if (k === 'a') pad[1].x += down ? -24 : 0; if (k === 'd') pad[1].x += down ? 24 : 0; if (down && k === 's') hit(1, 0.8); } },
    swing(info) { hit(info.player === 0 ? 0 : 1, info.power); },
    update() {
      // paddle control: lean (webcam) or held keys
      if (Pose.ready) { pad[0].x = W / 2 + leanOf(0) * W * 0.4; if (twoP && Pose.people[1]) pad[1].x = W / 2 + leanOf(1) * W * 0.4; }
      if (keys['ArrowLeft']) pad[0].x -= 7; if (keys['ArrowRight']) pad[0].x += 7;
      if (twoP) { if (keys['a']) pad[1].x -= 7; if (keys['d']) pad[1].x += 7; }
      else { pad[1].x += ((ball.x) - pad[1].x) * 0.07; }   // CPU
      pad[0].x = Math.max(padW, Math.min(W - padW, pad[0].x)); pad[1].x = Math.max(padW, Math.min(W - padW, pad[1].x));
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x < 12 || ball.x > W - 12) ball.vx *= -1;
      // auto-return on contact (so you don't have to also press, but swing adds power)
      if (ball.vy > 0 && ball.y > H * 0.86 && Math.abs(ball.x - pad[0].x) < padW) { ball.vy = -opts.speed; ball.vx += (ball.x - pad[0].x) * 0.1; }
      if (ball.vy < 0 && ball.y < H * 0.14 && Math.abs(ball.x - pad[1].x) < padW) { ball.vy = opts.speed; ball.vx += (ball.x - pad[1].x) * 0.1; }
      if (ball.y > H) { sc[1]++; hud(); point(1); } else if (ball.y < 0) { sc[0]++; hud(); point(0); }
      if (msgT > 0) msgT--;
    },
    draw() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = court; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 4; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeRect(6, 6, W - 12, H - 12);
      // paddles
      ctx.fillStyle = colors[0]; roundRect(pad[0].x - padW, H - 26, padW * 2, 14, 7);
      ctx.fillStyle = colors[1]; roundRect(pad[1].x - padW, 12, padW * 2, 14, 7);
      // ball
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, opts.ball, 0, 7); ctx.fill();
      if (msgT > 0) { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.font = '800 34px "Baloo 2"'; ctx.textAlign = 'center'; ctx.fillText(msg, W / 2, H / 2 - 10); }
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '700 13px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(Pose.ready ? 'lean to move · swing to smash' : (twoP ? 'P1 ← → + Space · P2 A D + S' : '← → move · Space to smash'), W / 2, H - 6);
    },
  };
  function point(scorer) {
    if (sc[scorer] >= toWin) { msg = (scorer === 0 ? 'P1' : (twoP ? 'P2' : 'CPU')) + ' wins!'; msgT = 1e6; ball.vx = ball.vy = 0; return; }
    msg = 'Point ' + (scorer === 0 ? 'P1' : (twoP ? 'P2' : 'CPU')); msgT = 60; reset(scorer === 0 ? -1 : 1);
  }
}
function Tennis(mode) { return Rally(mode, { court: '#4a8f4e', speed: 7, padW: 52, ball: 9 }); }
function PingPong(mode) { return Rally(mode, { court: '#20507a', speed: 9, padW: 40, ball: 7 }); }

/* ============================ ENDLESS RUNNER — 3-lane POV ============================ */
function Runner(mode) {
  const hy = () => H * 0.32;
  const laneX = (lane, t) => { const spread = 40 + t * t * (W * 0.42); return W / 2 + lane * spread; };
  let lane = 0, targetLane = 0, jump = 0, crouch = 0, obstacles = [], spawnT = 0, dist = 0, speed = 0.012, over = false;
  function hud() { setScore([{ who: 'Distance', val: Math.round(dist) + 'm' }], -1); }
  hud();
  function spawn() { const l = [-1, 0, 1][Math.floor(Math.random() * 3)]; const type = Math.random() < 0.5 ? 'low' : 'high'; obstacles.push({ lane: l, t: 0, type }); }
  return {
    key(k, down) { if (!down) return; if (over) return;
      if (k === 'ArrowLeft') targetLane = Math.max(-1, targetLane - 1);
      if (k === 'ArrowRight') targetLane = Math.min(1, targetLane + 1);
      if (k === 'ArrowUp' || k === ' ') jump = 1; if (k === 'ArrowDown') crouch = 1; },
    swing() {},
    update() {
      if (over) return;
      if (Pose.ready) { const l = leanOf(0); targetLane = l < -0.33 ? -1 : l > 0.33 ? 1 : 0; const hd = headY(0); if (hd > 0 && hd < 0.3) jump = 1; if (hd > 0.6) crouch = 1; }
      lane += (targetLane - lane) * 0.25;
      if (jump > 0) jump = Math.max(0, jump - 0.04); if (crouch > 0) crouch = Math.max(0, crouch - 0.05);
      dist += 1 + speed * 100; speed += 0.000004;
      spawnT += speed * 60; if (spawnT > 1) { spawnT = 0; spawn(); }
      obstacles.forEach(o => o.t += speed);
      obstacles = obstacles.filter(o => {
        if (o.t > 0.9 && o.t < 1.02 && Math.abs(o.lane - lane) < 0.4) {
          const dodged = (o.type === 'low' && jump > 0.3) || (o.type === 'high' && crouch > 0.3);
          if (!dodged) { over = true; }
        }
        return o.t < 1.1;
      });
    },
    draw() {
      ctx.clearRect(0, 0, W, H);
      let g = ctx.createLinearGradient(0, 0, 0, hy()); g.addColorStop(0, '#2a3b6b'); g.addColorStop(1, '#5a6fb0'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy());
      ctx.fillStyle = '#3a3f52'; ctx.beginPath(); ctx.moveTo(W / 2 - 30, hy()); ctx.lineTo(W / 2 + 30, hy()); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      // lane dividers
      for (const d of [-0.5, 0.5]) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.setLineDash([20, 20]); ctx.beginPath(); ctx.moveTo(laneX(d, 0), hy()); ctx.lineTo(laneX(d, 1), H); ctx.stroke(); } ctx.setLineDash([]);
      // obstacles (far -> near)
      obstacles.slice().sort((a, b) => a.t - b.t).forEach(o => { const x = laneX(o.lane, o.t), y = hy() + (H - hy()) * o.t, s = 10 + o.t * o.t * 90;
        ctx.fillStyle = o.type === 'low' ? '#ff6f5e' : '#b35cff';
        if (o.type === 'low') roundRect(x - s * 0.5, y - s * 0.5, s, s * 0.5, 6); else roundRect(x - s * 0.5, y - s * 1.6, s, s * 0.6, 6); });
      // player
      const px = laneX(lane, 1), py = H * 0.86 - jump * 120; drawMascot(px, py + (crouch > 0 ? 18 : 0), crouch > 0 ? 18 : 26, '#ffd24a');
      if (over) { ctx.fillStyle = 'rgba(35,48,58,.9)'; ctx.font = '800 40px "Baloo 2"'; ctx.textAlign = 'center'; ctx.fillText('Crash! ' + Math.round(dist) + 'm', W / 2, H * 0.4); ctx.font = '700 16px Nunito'; ctx.fillText('press menu to run again', W / 2, H * 0.4 + 36); }
      else { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 14px Nunito'; ctx.textAlign = 'center'; ctx.fillText(Pose.ready ? 'lean to switch lanes · jump up to hop · crouch to duck' : '← → lanes · ↑/Space jump · ↓ crouch', W / 2, H - 14); }
      hud();
    },
  };
}

function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

buildMenu();
