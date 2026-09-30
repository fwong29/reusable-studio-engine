// Ambient background field, inspired by the Netlify Drop landing page: a grid
// of dots that push away from the cursor, and a soft darkening around it. It
// lives behind the calculator, responds only to the mouse, and never captures
// clicks. Disabled under prefers-reduced-motion (a static grid instead).

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SP = 38;    // grid spacing
const R = 150;    // interaction radius
const PUSH = 26;  // max displacement toward/away from cursor

let W = 0, H = 0, cols = 0, rows = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(W / SP) + 1;
  rows = Math.ceil(H / SP) + 1;
}
resize();
window.addEventListener('resize', resize);

const css = getComputedStyle(document.documentElement);
const dotColor = (css.getPropertyValue('--key-edge').trim() || '#d9cdb3');

let mx = -9999, my = -9999, sx = -9999, sy = -9999;
window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { mx = -9999; my = -9999; } });

function dots(dynamic) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = dotColor;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let x = i * SP, y = j * SP, r = 1.3;
      if (dynamic) {
        const dx = x - sx, dy = y - sy;
        const dist = Math.hypot(dx, dy);
        if (dist < R && dist > 0.001) {
          const f = 1 - dist / R;
          x += (dx / dist) * f * PUSH;
          y += (dy / dist) * f * PUSH;
          r = 1.3 + f * 1.6;
        }
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function frame() {
  sx += (mx - sx) * 0.15;
  sy += (my - sy) * 0.15;
  dots(true);
  if (sx > -9000) {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.5);
    g.addColorStop(0, 'rgba(33, 29, 24, 0.32)');
    g.addColorStop(1, 'rgba(33, 29, 24, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

if (reduce) dots(false);
else requestAnimationFrame(frame);
