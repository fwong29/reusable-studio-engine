import { setupCanvas } from './src/canvas/setupCanvas.js';
import { createLoop } from './src/canvas/loop.js';
import { createInput } from './src/input/input.js';

const canvas = document.getElementById('scene');
const ctx = setupCanvas(canvas);
const input = createInput(canvas);

createLoop(ctx, canvas, input);
