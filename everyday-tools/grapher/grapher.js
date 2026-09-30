// Grapher — a small graphing/calculus companion to Weight. It uses math.js for
// parsing and for exact (symbolic) derivatives; the definite integral is a
// numeric Simpson's-rule approximation. Separate from Weight; the tap ritual
// stays over there.

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
const exprEl = document.getElementById('expr');
const msgEl = document.getElementById('msg');
const showDeriv = document.getElementById('showDeriv');
const derivExprEl = document.getElementById('derivExpr');
const aEl = document.getElementById('a');
const bEl = document.getElementById('b');
const areaBtn = document.getElementById('area');
const areaOut = document.getElementById('areaOut');

// world view: center (cx,cy) and scale (px per unit)
let cx = 0, cy = 0, scale = 40;
let fn = null, dfn = null, dStr = '';
let W = 0, H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

const sx = (x) => W / 2 + (x - cx) * scale;
const sy = (y) => H / 2 - (y - cy) * scale;
const wx = (px) => cx + (px - W / 2) / scale;

function compile() {
  const src = exprEl.value.trim();
  msgEl.hidden = true;
  if (!src) { fn = null; dfn = null; return; }
  try {
    const node = math.parse(src);
    fn = node.compile();
    fn.evaluate({ x: 1 }); // probe
    try {
      const d = math.derivative(node, 'x');
      dStr = d.toString();
      dfn = d.compile();
      derivExprEl.textContent = "y' = " + dStr;
    } catch (e) {
      dfn = null;
      derivExprEl.textContent = "y' (n/a)";
    }
  } catch (e) {
    fn = null; dfn = null;
    msgEl.textContent = 'Could not read that expression: ' + e.message;
    msgEl.hidden = false;
  }
}

function evalAt(compiled, x) {
  try {
    const v = compiled.evaluate({ x });
    return typeof v === 'number' && isFinite(v) ? v : NaN;
  } catch (e) {
    return NaN;
  }
}

function niceStep(px) {
  const raw = 60 / px * (scale); // aim ~60px per major line, in world units
  const target = 60 / scale;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const n = target / pow;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * pow;
}

function drawGrid() {
  const step = niceStep(scale);
  ctx.lineWidth = 1;
  ctx.font = '10px Space Mono, monospace';
  ctx.textBaseline = 'top';

  const left = wx(0), right = wx(W);
  const startX = Math.ceil(left / step) * step;
  for (let x = startX; x <= right; x += step) {
    const px = sx(x);
    ctx.strokeStyle = Math.abs(x) < 1e-9 ? '#c9bda1' : '#ece3d0';
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    if (Math.abs(x) > 1e-9) {
      ctx.fillStyle = '#a99e86';
      ctx.fillText(+x.toFixed(6), px + 3, sy(0) + 3);
    }
  }
  const top = cy + (H / 2) / scale, bot = cy - (H / 2) / scale;
  const startY = Math.ceil(bot / step) * step;
  for (let y = startY; y <= top; y += step) {
    const py = sy(y);
    ctx.strokeStyle = Math.abs(y) < 1e-9 ? '#c9bda1' : '#ece3d0';
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    if (Math.abs(y) > 1e-9) {
      ctx.fillStyle = '#a99e86';
      ctx.fillText(+y.toFixed(6), sx(0) + 3, py + 3);
    }
  }
}

function plot(compiled, color, dash) {
  if (!compiled) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  let pen = false;
  for (let px = 0; px <= W; px++) {
    const y = evalAt(compiled, wx(px));
    if (isNaN(y)) { pen = false; continue; }
    const py = sy(y);
    if (!pen) { ctx.moveTo(px, py); pen = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function shadeArea(a, b) {
  if (!fn || !(b > a)) return;
  ctx.fillStyle = 'rgba(217, 87, 42, 0.18)';
  ctx.beginPath();
  ctx.moveTo(sx(a), sy(0));
  const steps = Math.max(2, Math.round((sx(b) - sx(a))));
  for (let i = 0; i <= steps; i++) {
    const x = a + (b - a) * (i / steps);
    const y = evalAt(fn, x);
    ctx.lineTo(sx(x), sy(isNaN(y) ? 0 : y));
  }
  ctx.lineTo(sx(b), sy(0));
  ctx.closePath();
  ctx.fill();
}

function simpson(a, b, n) {
  if (n % 2) n++;
  const h = (b - a) / n;
  let sum = evalAt(fn, a) + evalAt(fn, b);
  for (let i = 1; i < n; i++) {
    const y = evalAt(fn, a + i * h);
    if (isNaN(y)) return NaN;
    sum += (i % 2 ? 4 : 2) * y;
  }
  return (h / 3) * sum;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawGrid();
  const a = parseFloat(aEl.value), b = parseFloat(bEl.value);
  if (fn && isFinite(a) && isFinite(b)) shadeArea(Math.min(a, b), Math.max(a, b));
  plot(fn, '#d9572a');
  if (showDeriv.checked) plot(dfn, '#2f6f6b', [6, 5]);
}

function recompute() { compile(); draw(); }

exprEl.addEventListener('input', recompute);
showDeriv.addEventListener('change', draw);
[aEl, bEl].forEach((el) => el.addEventListener('input', draw));

areaBtn.addEventListener('click', () => {
  const a = parseFloat(aEl.value), b = parseFloat(bEl.value);
  if (!fn) { areaOut.textContent = '—'; return; }
  if (!isFinite(a) || !isFinite(b)) { areaOut.textContent = 'set bounds'; return; }
  const val = simpson(Math.min(a, b), Math.max(a, b), 1000);
  const signed = b < a ? -val : val;
  areaOut.textContent = isNaN(signed) ? 'undefined here' : '= ' + (+signed.toFixed(6));
  draw();
});

// pan
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cx -= (e.clientX - lastX) / scale;
  cy += (e.clientY - lastY) / scale;
  lastX = e.clientX; lastY = e.clientY;
  draw();
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  scale = Math.max(4, Math.min(4000, scale * factor));
  draw();
}, { passive: false });

window.addEventListener('resize', resize);
recompute();
resize();
