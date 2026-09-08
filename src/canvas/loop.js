import { mapRange } from '../utils/math.js';

// Signal: mouse X. Parameter: pulse frequency. Behavior: the ring's radius
// breathes faster as the signal moves toward the right edge of the canvas.
export function createLoop(ctx, canvas, input) {
  let t = 0;

  function frame() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    const frequency = mapRange(input.x, 0, width, 0.5, 6);
    t += frequency * 0.02;

    const baseRadius = Math.min(width, height) * 0.15;
    const radius = baseRadius + Math.sin(t) * baseRadius * 0.4;

    ctx.beginPath();
    ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.stroke();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
