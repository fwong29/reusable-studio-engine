// Weight — a calculator whose one rule is that every number costs as many taps
// as its value. That rule holds everywhere now: building a graph, setting an
// exponent, or entering the limits of an integral, each number is multi-tapped.
// The graph sits on the side; one key cycles the analysis between the
// derivative and the definite integral.

const machine = document.querySelector('.calc');
const display = document.getElementById('display');
const readout = document.getElementById('readout');
const tallyButton = document.getElementById('tally');
const tallyCountEl = document.getElementById('tallyCount');
const tallyMarksEl = document.getElementById('tallyMarks');
const opGlyphEl = document.getElementById('opGlyph');
const opPipsEl = document.getElementById('opPips');
const modeGlyphEl = document.getElementById('modeGlyph');
const modePipsEl = document.getElementById('modePips');

const OPS = ['+', '−', '×', '÷', '^', '%'];
const isOp = (x) => OPS.includes(x);
const MAX_MARKS = 40;
const GROUP = 5;

// Functions cycle on one key; each stored token is math.js-ready with a
// prettier display glyph. Roots are handled separately by the root key, which
// takes any index into a multi-tapped box (nth root).
const FUNCS = ['sin(', 'cos(', 'tan(', 'log(', 'log10('];
const FUNC_GLYPH = { 'sin(': 'sin(', 'cos(': 'cos(', 'tan(': 'tan(', 'log(': 'ln(', 'log10(': 'log(' };
const isFunc = (t) => FUNCS.includes(t);
const PARENS = ['(', ')'];
const ROOT = 'nthRoot(';

const TO_MATH = { '−': '-', '×': '*', '÷': '/', '%': ' mod ' };
const toMath = (tok) => TO_MATH[tok] ?? tok;
const TO_DISPLAY = { ...FUNC_GLYPH, 'nthRoot(': 'root(' };
const toDisplay = (tok) => TO_DISPLAY[tok] ?? tok;

let expr = [];            // committed tokens: numbers (strings), operators, 'x'
let currentTally = 0;     // pending multi-tapped number
let tallyTouched = false;
let opCycleIdx = -1;

let mode = 'deriv';       // 'deriv' | 'integ'
let bound = 'idle';       // 'idle' | 'lower' | 'upper' | 'done'
let loA = null, loB = null, integVal = null;
let funcIdx = 0;          // which function the ƒ key will insert next
let awaitingRoot = false; // root key pressed; multi-tapping the index into its box
let rootTarget = null;    // [start,end] operand range the root will wrap

/* ---------- sound (opt-in) ---------- */
let audio = null, soundOn = false;
function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
function playTick() {
  if (!soundOn) return;
  const ctx = ensureAudio();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 220;
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.11);
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
  if (!g || g.childElementCount >= GROUP) {
    g = document.createElement('span'); g.className = 'mark-group'; tallyMarksEl.appendChild(g);
  }
  const m = document.createElement('span'); m.className = isNew ? 'mark is-new' : 'mark'; g.appendChild(m);
}
function countMarks() { let n = 0; for (const g of tallyMarksEl.children) n += g.childElementCount; return n; }
function renderMarks(count, tapped) {
  const shown = Math.min(count, MAX_MARKS), overflow = count - shown;
  if (tapped && overflow === 0 && shown === countMarks() + 1) { addMark(true); return; }
  tallyMarksEl.innerHTML = '';
  for (let i = 0; i < shown; i++) addMark(false);
  if (overflow > 0) {
    const more = document.createElement('span'); more.className = 'mark-overflow'; more.textContent = '+' + overflow;
    tallyMarksEl.appendChild(more);
  }
}

/* ---------- display ---------- */
function exprWithPending() {
  const parts = expr.slice();
  if (tallyTouched) parts.push(String(currentTally));
  return parts;
}
function render(fx = {}) {
  tallyCountEl.textContent = String(currentTally);
  renderMarks(currentTally, fx.tap);

  if (bound === 'lower' || bound === 'upper') {
    const n = tallyTouched ? String(currentTally) : '·';
    display.textContent = (bound === 'lower' ? 'lower limit = ' : 'upper limit = ') + n;
  } else if (awaitingRoot) {
    display.textContent = 'root index = ' + (tallyTouched ? String(currentTally) : '·');
  } else {
    const parts = exprWithPending().map(toDisplay);
    display.textContent = parts.length ? parts.join(' ') : '0';
  }

  if (fx.tap) pulse(tallyCountEl, 'is-tick');
  updateParenDisplay();
  updateReadout();
  if (awaitingRoot) readout.textContent = 'ⁿ√ tap the root index (blank = 2), then =';
  drawGraph();
}

/* ---------- expression / math ---------- */
function exprString(tokens) {
  return tokens.map(toMath).join(' ');
}
function compileExpr(tokens) {
  const src = exprString(tokens).trim();
  if (!src) return null;
  try {
    const node = math.parse(src);
    const c = node.compile();
    c.evaluate({ x: 1 });
    return { node, compiled: c };
  } catch (e) { return null; }
}
function evalAt(compiled, x) {
  try { const v = compiled.evaluate({ x }); return typeof v === 'number' && isFinite(v) ? v : NaN; }
  catch (e) { return NaN; }
}

/* ---------- input ---------- */
function commitPending() {
  if (!tallyTouched) return false;
  expr.push(String(currentTally));
  currentTally = 0; tallyTouched = false;
  return true;
}

// True while a number is being multi-tapped into a "box" (integral limit or
// root index) rather than into the expression.
function inNumberBox() { return bound === 'lower' || bound === 'upper' || awaitingRoot; }

// Editing the expression after an integral was computed drops the stale
// shading/result and returns to normal building.
function leaveDone() {
  if (bound === 'done') { bound = 'idle'; integVal = null; loA = loB = null; }
}

function pressTally() {
  if (inNumberBox()) {
    currentTally += 1; tallyTouched = true; playTick();
    render({ tap: true });
    return;
  }
  leaveDone();
  currentTally += 1; tallyTouched = true; playTick();
  render({ tap: true });
}

function pressX() {
  if (inNumberBox()) return;
  leaveDone();
  commitPending();
  expr.push('x');
  render();
}

function updateOpDisplay() {
  opGlyphEl.textContent = opCycleIdx < 0 ? '+' : OPS[opCycleIdx];
  Array.from(opPipsEl.children).forEach((p, i) => p.classList.toggle('on', i === opCycleIdx));
}
function pressOperator(op) {
  if (inNumberBox()) return;
  leaveDone();
  if (expr.length === 0 && !tallyTouched) return;
  commitPending();
  if (isOp(expr[expr.length - 1])) expr[expr.length - 1] = op;
  else expr.push(op);
  render();
}
function cycleOperator() {
  if (inNumberBox()) return;
  leaveDone();
  if (expr.length === 0 && !tallyTouched) return;
  const lastIsOp = isOp(expr[expr.length - 1]);
  opCycleIdx = lastIsOp ? (opCycleIdx + 1) % OPS.length : 0;
  pressOperator(OPS[opCycleIdx]);
  updateOpDisplay();
}

/* ---------- function key (√ ∛ sin cos ln) ---------- */
const fnGlyphEl = document.getElementById('fnGlyph');
const fnPipsEl = document.getElementById('fnPips');
function updateFnDisplay() {
  fnGlyphEl.textContent = FUNC_GLYPH[FUNCS[funcIdx]].replace('(', '');
  Array.from(fnPipsEl.children).forEach((p, i) => p.classList.toggle('on', i === funcIdx));
}
function cycleFunction() {
  if (inNumberBox()) return;
  leaveDone();
  const last = expr[expr.length - 1];
  if (isFunc(last)) {
    funcIdx = (funcIdx + 1) % FUNCS.length;
    expr[expr.length - 1] = FUNCS[funcIdx];
  } else {
    commitPending();
    funcIdx = 0;
    expr.push(FUNCS[0]);
  }
  updateFnDisplay();
  render();
}

/* ---------- parentheses key (context-smart; pip shows which it will insert) ---------- */
const parenGlyphEl = document.getElementById('parenGlyph');
const parenPipsEl = document.getElementById('parenPips');
function nextParen() {
  let open = 0;
  for (const t of expr) { if (t.endsWith('(')) open++; else if (t === ')') open--; }
  const last = expr[expr.length - 1];
  const operandLast = tallyTouched || (last && (last === ')' || last === 'x' || (!isOp(last) && !last.endsWith('('))));
  return (open > 0 && operandLast) ? ')' : '(';
}
function updateParenDisplay() {
  const p = nextParen();
  parenGlyphEl.textContent = p;
  const idx = p === '(' ? 0 : 1;
  Array.from(parenPipsEl.children).forEach((el, i) => el.classList.toggle('on', i === idx));
}
function pressParen() {
  if (inNumberBox()) return;
  leaveDone();
  const p = nextParen();
  commitPending();
  expr.push(p);
  render();
}

/* ---------- root key (any index, into a multi-tapped box) ---------- */
function lastOperandRange() {
  const n = expr.length; if (n === 0) return null;
  const last = expr[n - 1];
  if (last === ')') {
    let depth = 0;
    for (let i = n - 1; i >= 0; i--) {
      const t = expr[i];
      if (t === ')') depth++;
      else if (t.endsWith('(')) { depth--; if (depth === 0) return [i, n - 1]; }
    }
    return null;
  }
  if (!isOp(last) && !last.endsWith('(')) return [n - 1, n - 1];
  return null;
}
function pressRoot() {
  if (inNumberBox()) return;
  leaveDone();
  commitPending();
  const r = lastOperandRange();
  if (!r) return;                 // nothing to take the root of yet
  rootTarget = r;
  awaitingRoot = true;
  currentTally = 0; tallyTouched = false;
  render();
}
function applyRoot(n) {
  const [s, e] = rootTarget;
  const operand = expr.slice(s, e + 1);
  expr = [...expr.slice(0, s), ROOT, ...operand, ',', String(n), ')', ...expr.slice(e + 1)];
  rootTarget = null;
}

function setMode(m) {
  mode = m;
  modeGlyphEl.textContent = mode === 'deriv' ? 'd/dx' : '∫';
  const active = mode === 'deriv' ? 0 : 1;
  Array.from(modePipsEl.children).forEach((p, i) => p.classList.toggle('on', i === active));
  bound = 'idle'; loA = loB = integVal = null;
  render();
}
function cycleMode() { setMode(mode === 'deriv' ? 'integ' : 'deriv'); }

function pressEquals() {
  if (awaitingRoot) {
    const n = tallyTouched ? currentTally : 2;   // blank index defaults to a square root
    applyRoot(n);
    awaitingRoot = false; currentTally = 0; tallyTouched = false;
    render();
    return;
  }
  if (mode === 'integ') {
    // guided, multi-tapped limits
    if (bound === 'idle' || bound === 'done') {
      commitPending();                     // land any coefficient/exponent into f(x)
      if (!compileExpr(expr)) return;      // need a valid f(x) first
      bound = 'lower'; currentTally = 0; tallyTouched = false; integVal = null; loA = loB = null;
    } else if (bound === 'lower') {
      loA = tallyTouched ? currentTally : 0; currentTally = 0; tallyTouched = false; bound = 'upper';
    } else if (bound === 'upper') {
      loB = tallyTouched ? currentTally : 0; currentTally = 0; tallyTouched = false; bound = 'done';
      computeIntegral();
    }
    render();
    return;
  }
  // derivative mode: land any pending number, then fit the view
  commitPending();
  fitView();
  render();
}

function pressClear() {
  expr = []; currentTally = 0; tallyTouched = false; opCycleIdx = -1;
  bound = 'idle'; loA = loB = integVal = null;
  awaitingRoot = false; rootTarget = null;
  updateOpDisplay();
  render();
}
function pressBackspace() {
  if (inNumberBox()) {
    if (currentTally > 0) { currentTally -= 1; tallyTouched = currentTally > 0; }
    render(); return;
  }
  if (currentTally > 0) { currentTally -= 1; tallyTouched = currentTally > 0; }
  else if (expr.length > 0) expr.pop();
  render();
}

/* ---------- readout + integral ---------- */
function updateReadout() {
  if (mode === 'deriv') {
    const e = compileExpr(exprWithPending());
    if (!e) { readout.textContent = "y' = —"; return; }
    try { readout.textContent = "y' = " + math.derivative(e.node, 'x').toString(); }
    catch (err) { readout.textContent = "y' (not differentiable here)"; }
  } else {
    if (bound === 'lower') readout.textContent = '∫ tap the lower limit, then =';
    else if (bound === 'upper') readout.textContent = '∫ tap the upper limit, then =';
    else if (bound === 'done' && integVal != null)
      readout.textContent = `∫ from ${loA} to ${loB} = ` + (isNaN(integVal) ? 'undefined' : +integVal.toFixed(6));
    else readout.textContent = '∫ press = to set limits';
  }
}
function simpson(fn, a, b, n) {
  if (b === a) return 0;
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = evalAt(fn, a) + evalAt(fn, b);
  for (let i = 1; i < n; i++) { const y = evalAt(fn, a + i * h); if (isNaN(y)) return NaN; s += (i % 2 ? 4 : 2) * y; }
  return (h / 3) * s;
}
function computeIntegral() {
  const e = compileExpr(expr);
  if (!e || loA == null || loB == null) { integVal = NaN; return; }
  const lo = Math.min(loA, loB), hi = Math.max(loA, loB);
  const v = simpson(e.compiled, lo, hi, 1000);
  integVal = loB < loA ? -v : v;
}

/* ---------- graph ---------- */
const canvas = document.getElementById('graph');
const gx = canvas.getContext('2d');
let cx = 0, cy = 0, scale = 40, GW = 0, GH = 0;

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

function niceStep() {
  const target = 64 / scale, pow = Math.pow(10, Math.floor(Math.log10(target))), n = target / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}
function grid() {
  const step = niceStep();
  gx.lineWidth = 1; gx.font = '10px Space Mono, monospace'; gx.textBaseline = 'top';
  const left = wx(0), right = wx(GW);
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    gx.strokeStyle = Math.abs(x) < 1e-9 ? '#c9bda1' : '#efe7d5';
    gx.beginPath(); gx.moveTo(px(x), 0); gx.lineTo(px(x), GH); gx.stroke();
  }
  const bot = cy - (GH / 2) / scale, top = cy + (GH / 2) / scale;
  for (let y = Math.ceil(bot / step) * step; y <= top; y += step) {
    gx.strokeStyle = Math.abs(y) < 1e-9 ? '#c9bda1' : '#efe7d5';
    gx.beginPath(); gx.moveTo(0, py(y)); gx.lineTo(GW, py(y)); gx.stroke();
  }
}
function plot(compiled, color, dash) {
  gx.strokeStyle = color; gx.lineWidth = 2; gx.setLineDash(dash || []);
  gx.beginPath(); let pen = false;
  for (let p = 0; p <= GW; p++) {
    const y = evalAt(compiled, wx(p));
    if (isNaN(y)) { pen = false; continue; }
    const yy = py(y);
    if (!pen) { gx.moveTo(p, yy); pen = true; } else gx.lineTo(p, yy);
  }
  gx.stroke(); gx.setLineDash([]);
}
function shade(compiled, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  gx.fillStyle = 'rgba(217,87,42,0.18)';
  gx.beginPath(); gx.moveTo(px(lo), py(0));
  const steps = Math.max(2, Math.round(px(hi) - px(lo)));
  for (let i = 0; i <= steps; i++) {
    const x = lo + (hi - lo) * (i / steps), y = evalAt(compiled, x);
    gx.lineTo(px(x), py(isNaN(y) ? 0 : y));
  }
  gx.lineTo(px(hi), py(0)); gx.closePath(); gx.fill();
}
function fitView() {
  const e = compileExpr(expr); if (!e) return;
  let lo = Infinity, hi = -Infinity;
  for (let x = -10; x <= 10; x += 0.5) { const y = evalAt(e.compiled, x); if (!isNaN(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
  if (lo < hi && isFinite(lo) && isFinite(hi)) { cy = (lo + hi) / 2; scale = Math.max(6, Math.min(200, GH / (hi - lo + 4))); }
}
function drawGraph() {
  gx.clearRect(0, 0, GW, GH);
  grid();
  const e = compileExpr(exprWithPending());
  if (!e) return;
  if (mode === 'integ' && bound === 'done' && loA != null && loB != null) shade(e.compiled, loA, loB);
  plot(e.compiled, '#d9572a');
  if (mode === 'deriv') {
    try { plot(math.derivative(e.node, 'x').compile(), '#2f6f6b', [6, 5]); } catch (err) {}
  }
}
let drag = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; cx -= (e.clientX - lx) / scale; cy += (e.clientY - ly) / scale; lx = e.clientX; ly = e.clientY; drawGraph(); });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.max(4, Math.min(4000, scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); drawGraph(); }, { passive: false });

/* ---------- wiring ---------- */
tallyButton.addEventListener('click', pressTally);
document.getElementById('xKey').addEventListener('click', pressX);
document.getElementById('opKey').addEventListener('click', cycleOperator);
document.getElementById('fnKey').addEventListener('click', cycleFunction);
document.getElementById('parenKey').addEventListener('click', pressParen);
document.getElementById('rootKey').addEventListener('click', pressRoot);
document.getElementById('modeKey').addEventListener('click', cycleMode);
document.querySelectorAll('[data-type="control"]').forEach((key) => {
  key.addEventListener('click', () => {
    const v = key.dataset.value;
    if (v === 'C') pressClear();
    else if (v === '⌫') pressBackspace();
    else if (v === '=') pressEquals();
  });
});

const KEY_ACTIONS = {
  ' ': pressTally,
  'Shift': cycleOperator,
  'x': pressX, 'X': pressX,
  'm': cycleMode, 'M': cycleMode,
  'f': cycleFunction, 'F': cycleFunction,
  'r': pressRoot, 'R': pressRoot,
  '(': pressParen, ')': pressParen,
  '+': () => pressOperator('+'), '-': () => pressOperator('−'),
  '*': () => pressOperator('×'), '/': () => pressOperator('÷'),
  '^': () => pressOperator('^'), '%': () => pressOperator('%'),
  'Enter': pressEquals, '=': pressEquals,
  'Backspace': pressBackspace, 'Escape': pressClear,
};
window.addEventListener('keydown', (e) => {
  const action = KEY_ACTIONS[e.key];
  if (!action) return;
  if (e.repeat) { e.preventDefault(); return; }
  e.preventDefault();
  action();
});

window.addEventListener('resize', resizeGraph);
updateOpDisplay();
updateFnDisplay();
updateParenDisplay();
setMode('deriv');
resizeGraph();

// A shareable example seed: /?demo shows x^2 with its derivative, so a link
// can open on a curve rather than a blank grid.
if (new URLSearchParams(location.search).get('demo')) {
  expr = ['x', '^', '2'];
  fitView();
}
render();
