export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  return ctx;
}
