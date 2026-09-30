// Weight — a calculator whose one rule is that every number costs as many taps
// as its value. That holds everywhere: coefficients, exponents, root indices,
// and integral limits are all multi-tapped. The graph sits on the side; the
// derivative and the integral are independent toggles above it, and the
// integral's limits are click-to-set boxes.

const display = document.getElementById('display');
const readout = document.getElementById('readout');
const tallyButton = document.getElementById('tally');
const tallyCountEl = document.getElementById('tallyCount');
const tallyMarksEl = document.getElementById('tallyMarks');

const OPS = ['+', '−', '×', '÷', '^', '%'];
const isOp = (x) => OPS.includes(x);
const isFuncTok = (t) => typeof t === 'string' && t.endsWith('(');
const MAX_MARKS = 40;
const GROUP = 5;
const ROOT = 'nthRoot(';

const TO_MATH = { '−': '-', '×': '*', '÷': '/', '%': ' mod ' };
const toMath = (t) => TO_MATH[t] ?? t;
const TO_DISPLAY = { 'sin(': 'sin(', 'cos(': 'cos(', 'tan(': 'tan(', 'log(': 'ln(', 'log10(': 'log(', 'nthRoot(': 'root(' };
const toDisplay = (t) => TO_DISPLAY[t] ?? t;

let expr = [];
let currentTally = 0;
let tallyTouched = false;
let justEvaluated = false;
let awaitingRoot = false, rootTarget = null;

let showDeriv = false, showInteg = false;
let boundA = 0, boundB = 2, activeBound = null;   // 'a' | 'b' | null

/* ---------- sound ---------- */
let audio = null, soundOn = false;
function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
function playTick() {
  if (!soundOn) return;
  const c = ensureAudio(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
  o.type = 'triangle'; o.frequency.value = 220;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.11);
}
const soundToggle = document.getElementById('soundToggle');
soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  if (soundOn) ensureAudio();
  soundToggle.setAttribute('aria-pressed', String(soundOn));
  soundToggle.textContent = 'tap sound: ' + (soundOn ? 'on' : 'off');
});

/* ---------- tally marks ---------- */
function pulse(el, cls) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}
function addMark(isNew) {
  let g = tallyMarksEl.lastElementChild;
  if (!g || g.childElementCount >= GROUP) { g = document.createElement('span'); g.className = 'mark-group'; tallyMarksEl.appendChild(g); }
  const m = document.createElement('span'); m.className = isNew ? 'mark is-new' : 'mark'; g.appendChild(m);
}
function countMarks() { let n = 0; for (const g of tallyMarksEl.children) n += g.childElementCount; return n; }
function renderMarks(count, tapped) {
  const shown = Math.min(count, MAX_MARKS), overflow = count - shown;
  if (tapped && overflow === 0 && shown === countMarks() + 1) { addMark(true); return; }
  tallyMarksEl.innerHTML = '';
  for (let i = 0; i < shown; i++) addMark(false);
  if (overflow > 0) { const m = document.createElement('span'); m.className = 'mark-overflow'; m.textContent = '+' + overflow; tallyMarksEl.appendChild(m); }
}

/* ---------- math ---------- */
function exprString(tokens) { return tokens.map(toMath).join(' '); }
function hasVar(tokens) { return tokens.includes('x'); }
function compileExpr(tokens) {
  const src = exprString(tokens).trim();
  if (!src) return null;
  try { const node = math.parse(src); const c = node.compile(); c.evaluate({ x: 1 }); return { node, compiled: c }; }
  catch (e) { return null; }
}
function evalAt(c, x) { try { const v = c.evaluate({ x }); return typeof v === 'number' && isFinite(v) ? v : NaN; } catch (e) { return NaN; } }
function exprWithPending() { const p = expr.slice(); if (!inNumberBox() && tallyTouched) p.push(String(currentTally)); return p; }

/* ---------- state helpers ---------- */
function inNumberBox() { return awaitingRoot || activeBound !== null; }

/* ---------- display ---------- */
function render(fx = {}) {
  tallyCountEl.textContent = String(currentTally);
  renderMarks(currentTally, fx.tap);

  if (awaitingRoot) {
    display.textContent = 'root index = ' + (tallyTouched ? String(currentTally) : '·');
  } else if (activeBound) {
    display.textContent = 'limit ' + activeBound + ' = ' + (tallyTouched ? String(currentTally) : String(activeBound === 'a' ? boundA : boundB));
  } else {
    const parts = exprWithPending().map(toDisplay);
    display.textContent = parts.length ? parts.join(' ') : '0';
  }

  if (fx.tap) pulse(tallyCountEl, 'is-tick');
  updateReadout();
  updateBoundsUI();
  drawGraph();
}
function updateReadout() {
  if (awaitingRoot) { readout.textContent = 'ⁿ√ tap the root index (blank = 2), then ='; return; }
  if (justEvaluated) { readout.textContent = '= ' + expr[0]; return; }
  if (showDeriv) {
    const e = compileExpr(exprWithPending());
    if (e && hasVar(exprWithPending())) {
      try { readout.textContent = "y' = " + math.derivative(e.node, 'x').toString(); return; } catch (_) {}
    }
  }
  readout.textContent = 'every number costs as many taps as its value';
}

/* ---------- number entry ---------- */
function commitPending() {
  if (!tallyTouched) return false;
  expr.push(String(currentTally)); currentTally = 0; tallyTouched = false; return true;
}
function pressTally() {
  if (awaitingRoot || activeBound) { currentTally += 1; tallyTouched = true; playTick(); render({ tap: true }); return; }
  if (justEvaluated) { expr = []; justEvaluated = false; }
  currentTally += 1; tallyTouched = true; playTick(); render({ tap: true });
}

/* ---------- expression edits (blocked while a number box is active) ---------- */
function pressOperator(op) {
  if (inNumberBox()) return;
  justEvaluated = false;
  if (expr.length === 0 && !tallyTouched) return;
  commitPending();
  if (isOp(expr[expr.length - 1])) expr[expr.length - 1] = op; else expr.push(op);
  render();
}

// One key cycles the four basic operators + − × ÷ (^ and % have their own keys).
const OPS4 = ['+', '−', '×', '÷'];
const opGlyphEl = document.getElementById('opGlyph');
const opPipsEl = document.getElementById('opPips');
let opIdx = -1;
function updateOpDisplay() {
  opGlyphEl.textContent = opIdx < 0 ? '+' : OPS4[opIdx];
  Array.from(opPipsEl.children).forEach((p, i) => p.classList.toggle('on', i === opIdx));
}
function cycleOperator() {
  if (inNumberBox()) return;
  justEvaluated = false;
  if (expr.length === 0 && !tallyTouched) return;
  const lastIsOp = isOp(expr[expr.length - 1]);
  opIdx = lastIsOp ? (opIdx + 1) % OPS4.length : 0;
  commitPending();
  if (isOp(expr[expr.length - 1])) expr[expr.length - 1] = OPS4[opIdx]; else expr.push(OPS4[opIdx]);
  updateOpDisplay();
  render();
}
function pressX() {
  if (inNumberBox()) return;
  justEvaluated = false; commitPending(); expr.push('x'); render();
}
function insertFunc(tok) {
  if (inNumberBox()) return;
  justEvaluated = false; commitPending(); expr.push(tok); render();
}
function pressParen(p) {
  if (inNumberBox()) return;
  justEvaluated = false; commitPending(); expr.push(p); render();
}

/* ---------- root (any index, into a multi-tapped box) ---------- */
function lastOperandRange() {
  const n = expr.length; if (n === 0) return null;
  const last = expr[n - 1];
  if (last === ')') {
    let depth = 0;
    for (let i = n - 1; i >= 0; i--) { const t = expr[i]; if (t === ')') depth++; else if (isFuncTok(t)) { depth--; if (depth === 0) return [i, n - 1]; } }
    return null;
  }
  if (!isOp(last) && !isFuncTok(last)) return [n - 1, n - 1];
  return null;
}
function pressRoot() {
  if (inNumberBox()) return;
  justEvaluated = false; commitPending();
  const r = lastOperandRange(); if (!r) return;
  rootTarget = r; awaitingRoot = true; currentTally = 0; tallyTouched = false; render();
}
function applyRoot(n) {
  const [s, e] = rootTarget; const operand = expr.slice(s, e + 1);
  expr = [...expr.slice(0, s), ROOT, ...operand, ',', String(n), ')', ...expr.slice(e + 1)];
  rootTarget = null;
}

/* ---------- integral bound boxes (click to set, multi-tap the number) ---------- */
function clickChip(which) {
  if (!showInteg) return;
  if (activeBound) { if (tallyTouched) { if (activeBound === 'a') boundA = currentTally; else boundB = currentTally; } }
  else { commitPending(); }   // don't lose a number being built into the expression
  activeBound = which; currentTally = 0; tallyTouched = false; render();
}
function commitBound() {
  if (activeBound && tallyTouched) { if (activeBound === 'a') boundA = currentTally; else boundB = currentTally; }
  activeBound = null; currentTally = 0; tallyTouched = false;
}
function effBounds() {
  const a = (activeBound === 'a' && tallyTouched) ? currentTally : boundA;
  const b = (activeBound === 'b' && tallyTouched) ? currentTally : boundB;
  return [a, b];
}

/* ---------- equals / clear / backspace ---------- */
function pressEquals() {
  if (awaitingRoot) { const n = tallyTouched ? currentTally : 2; applyRoot(n); awaitingRoot = false; currentTally = 0; tallyTouched = false; render(); return; }
  if (activeBound) { commitBound(); render(); return; }
  commitPending();
  if (expr.length && !hasVar(expr)) {
    const e = compileExpr(expr);
    if (e) { let v; try { v = e.compiled.evaluate({}); } catch (_) { v = NaN; }
      if (typeof v === 'number' && isFinite(v)) { expr = [String(Math.round(v * 1e10) / 1e10)]; justEvaluated = true; render(); return; } }
  }
  fitView(); render();
}
function pressClear() {
  expr = []; currentTally = 0; tallyTouched = false; justEvaluated = false;
  awaitingRoot = false; rootTarget = null; activeBound = null; opIdx = -1;
  updateOpDisplay();
  render();
}
function pressBackspace() {
  if (inNumberBox()) { if (currentTally > 0) { currentTally -= 1; tallyTouched = currentTally > 0; } render(); return; }
  justEvaluated = false;
  if (currentTally > 0) { currentTally -= 1; tallyTouched = currentTally > 0; }
  else if (expr.length > 0) expr.pop();
  render();
}

/* ---------- analysis toggles ---------- */
const derivToggle = document.getElementById('derivToggle');
const integToggle = document.getElementById('integToggle');
const boundsEl = document.getElementById('bounds');
const chipA = document.getElementById('chipA');
const chipB = document.getElementById('chipB');
const areaVal = document.getElementById('areaVal');

derivToggle.addEventListener('click', () => { showDeriv = !showDeriv; derivToggle.setAttribute('aria-pressed', String(showDeriv)); render(); });
integToggle.addEventListener('click', () => {
  showInteg = !showInteg; integToggle.setAttribute('aria-pressed', String(showInteg));
  boundsEl.hidden = !showInteg;
  if (!showInteg) { activeBound = null; }
  render();
});
chipA.addEventListener('click', () => clickChip('a'));
chipB.addEventListener('click', () => clickChip('b'));

function updateBoundsUI() {
  const [a, b] = effBounds();
  chipA.textContent = String(a);
  chipB.textContent = String(b);
  chipA.classList.toggle('active', activeBound === 'a');
  chipB.classList.toggle('active', activeBound === 'b');
  if (showInteg) {
    const e = compileExpr(expr.filter(t => t !== undefined));
    if (e) {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      let v = simpson(e.compiled, lo, hi, 1000); if (b < a) v = -v;
      areaVal.textContent = isNaN(v) ? '= undefined' : '= ' + (+v.toFixed(4));
    } else areaVal.textContent = '';
  }
}
function simpson(fn, a, b, n) {
  if (b === a) return 0; if (n % 2) n++;
  const h = (b - a) / n; let s = evalAt(fn, a) + evalAt(fn, b);
  for (let i = 1; i < n; i++) { const y = evalAt(fn, a + i * h); if (isNaN(y)) return NaN; s += (i % 2 ? 4 : 2) * y; }
  return (h / 3) * s;
}

/* ---------- graph ---------- */
const canvas = document.getElementById('graph');
const gx = canvas.getContext('2d');
let cx = 0, cy = 0, scale = 40, GW = 0, GH = 0;
let hoverPx = null;

function resizeGraph() {
  const dpr = window.devicePixelRatio || 1;
  GW = canvas.clientWidth; GH = canvas.clientHeight;
  canvas.width = GW * dpr; canvas.height = GH * dpr;
  gx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGraph();
}
const px = (x) => GW / 2 + (x - cx) * scale;
const py = (y) => GH / 2 - (y - cy) * scale;
const wx = (p) => cx + (p - GW / 2) / scale;
function niceStep() { const target = 64 / scale, pow = Math.pow(10, Math.floor(Math.log10(target))), n = target / pow; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow; }
function grid() {
  const step = niceStep();
  gx.lineWidth = 1; gx.font = '10px Space Mono, monospace'; gx.textBaseline = 'top'; gx.fillStyle = '#a99e86';
  const left = wx(0), right = wx(GW);
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    gx.strokeStyle = Math.abs(x) < 1e-9 ? '#c9bda1' : '#efe7d5';
    gx.beginPath(); gx.moveTo(px(x), 0); gx.lineTo(px(x), GH); gx.stroke();
    if (Math.abs(x) > 1e-9) gx.fillText(+x.toFixed(4), px(x) + 3, py(0) + 3);
  }
  const bot = cy - (GH / 2) / scale, top = cy + (GH / 2) / scale;
  for (let y = Math.ceil(bot / step) * step; y <= top; y += step) {
    gx.strokeStyle = Math.abs(y) < 1e-9 ? '#c9bda1' : '#efe7d5';
    gx.beginPath(); gx.moveTo(0, py(y)); gx.lineTo(GW, py(y)); gx.stroke();
    if (Math.abs(y) > 1e-9) gx.fillText(+y.toFixed(4), px(0) + 3, py(y) + 3);
  }
}
function plot(c, color, dash) {
  gx.strokeStyle = color; gx.lineWidth = 2; gx.setLineDash(dash || []);
  gx.beginPath(); let pen = false;
  for (let p = 0; p <= GW; p++) { const y = evalAt(c, wx(p)); if (isNaN(y)) { pen = false; continue; } const yy = py(y); if (!pen) { gx.moveTo(p, yy); pen = true; } else gx.lineTo(p, yy); }
  gx.stroke(); gx.setLineDash([]);
}
function shade(c, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  gx.fillStyle = 'rgba(217,87,42,0.18)';
  gx.beginPath(); gx.moveTo(px(lo), py(0));
  const steps = Math.max(2, Math.round(px(hi) - px(lo)));
  for (let i = 0; i <= steps; i++) { const x = lo + (hi - lo) * (i / steps), y = evalAt(c, x); gx.lineTo(px(x), py(isNaN(y) ? 0 : y)); }
  gx.lineTo(px(hi), py(0)); gx.closePath(); gx.fill();
}
function fitView() {
  const e = compileExpr(expr); if (!e || !hasVar(expr)) return;
  let lo = Infinity, hi = -Infinity;
  for (let x = -8; x <= 8; x += 0.25) { const y = evalAt(e.compiled, x); if (!isNaN(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
  if (lo < hi && isFinite(lo) && isFinite(hi)) { cy = (lo + hi) / 2; scale = Math.max(6, Math.min(120, Math.min(GW / 18, GH / ((hi - lo) * 1.3 + 2)))); }
}
function hoverMarker(c) {
  if (hoverPx == null) return;
  const xw = wx(hoverPx), yw = evalAt(c, xw);
  if (isNaN(yw)) return;
  const mx = px(xw), my = py(yw);
  gx.strokeStyle = 'rgba(217,87,42,0.4)'; gx.lineWidth = 1; gx.setLineDash([3, 3]);
  gx.beginPath(); gx.moveTo(mx, my); gx.lineTo(mx, py(0)); gx.moveTo(mx, my); gx.lineTo(px(0), my); gx.stroke(); gx.setLineDash([]);
  gx.fillStyle = '#d9572a'; gx.beginPath(); gx.arc(mx, my, 4.5, 0, Math.PI * 2); gx.fill();
  const label = '(' + (+xw.toFixed(2)) + ', ' + (+yw.toFixed(2)) + ')';
  gx.font = '12px Space Mono, monospace';
  const w = gx.measureText(label).width + 12;
  let lx = mx + 10, ly = my - 26; if (lx + w > GW) lx = mx - 10 - w; if (ly < 0) ly = my + 10;
  gx.fillStyle = '#211d18'; gx.beginPath(); gx.roundRect(lx, ly, w, 20, 6); gx.fill();
  gx.fillStyle = '#f4ecdc'; gx.textBaseline = 'middle'; gx.fillText(label, lx + 6, ly + 11); gx.textBaseline = 'top';
}
function drawGraph() {
  gx.clearRect(0, 0, GW, GH);
  grid();
  const e = compileExpr(exprWithPending());
  if (!e) return;
  if (showInteg) { const [a, b] = effBounds(); shade(e.compiled, a, b); }
  plot(e.compiled, '#d9572a');
  if (showDeriv && hasVar(exprWithPending())) { try { plot(math.derivative(e.node, 'x').compile(), '#2f6f6b', [6, 5]); } catch (_) {} }
  hoverMarker(e.compiled);
}
let drag = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; hoverPx = null; canvas.setPointerCapture(e.pointerId); if (activeBound) commitBound(); });
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  if (drag) { cx -= (e.clientX - lx) / scale; cy += (e.clientY - ly) / scale; lx = e.clientX; ly = e.clientY; drawGraph(); return; }
  hoverPx = e.clientX - rect.left; drawGraph();
});
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointerleave', () => { hoverPx = null; drawGraph(); });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.max(4, Math.min(4000, scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); drawGraph(); }, { passive: false });

document.getElementById('zoomIn').addEventListener('click', () => { scale = Math.min(4000, scale * 1.25); drawGraph(); });
document.getElementById('zoomOut').addEventListener('click', () => { scale = Math.max(4, scale / 1.25); drawGraph(); });

/* ---------- wiring ---------- */
tallyButton.addEventListener('click', pressTally);
document.getElementById('xKey').addEventListener('click', pressX);
document.getElementById('rootKey').addEventListener('click', pressRoot);
document.getElementById('opKey').addEventListener('click', cycleOperator);
document.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => pressOperator(b.dataset.op)));
document.querySelectorAll('[data-fn]').forEach((b) => b.addEventListener('click', () => insertFunc(b.dataset.fn)));
document.querySelectorAll('[data-paren]').forEach((b) => b.addEventListener('click', () => pressParen(b.dataset.paren)));
document.querySelectorAll('[data-value]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.value;
  if (v === 'C') pressClear(); else if (v === '⌫') pressBackspace(); else if (v === '=') pressEquals();
}));

const KEY_ACTIONS = {
  ' ': pressTally, 'Shift': cycleOperator, 'x': pressX, 'X': pressX, 'r': pressRoot, 'R': pressRoot,
  '(': () => pressParen('('), ')': () => pressParen(')'),
  '+': () => pressOperator('+'), '-': () => pressOperator('−'),
  '*': () => pressOperator('×'), '/': () => pressOperator('÷'),
  '^': () => pressOperator('^'), '%': () => pressOperator('%'),
  'Enter': pressEquals, '=': pressEquals, 'Backspace': pressBackspace, 'Escape': pressClear,
};
window.addEventListener('keydown', (e) => {
  const a = KEY_ACTIONS[e.key]; if (!a) return;
  if (e.repeat) { e.preventDefault(); return; }
  e.preventDefault(); a();
});

window.addEventListener('resize', resizeGraph);
updateOpDisplay();
resizeGraph();
if (new URLSearchParams(location.search).has('demo')) { expr = ['x', '^', '2']; showDeriv = true; derivToggle.setAttribute('aria-pressed', 'true'); }
render();
