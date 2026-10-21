// sense.js: reads the camera, turns readings into our four signals, applies
// table.js, and writes window.sense.
//
// The instrument is the one from the Make a Face lab: MediaPipe Face Landmarker,
// 478 points and the same 52 named scores (press B to see them live), pinned to
// one version so it cannot change under us mid-module.
//
// What stays in the browser: every frame is read and dropped. Nothing here saves
// a frame or a landmark list. The model downloads once when the page loads;
// after that the Network panel should stay quiet.

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const video = document.querySelector('#camera');
const button = document.querySelector('#start');
const readout = document.querySelector('#readout');
const scores = document.querySelector('#scores');

let landmarker = null;
let lastVideoTime = -1;
let latestScores = []; // the 52 named scores from the last frame, for the B panel only
let failed = false;    // the camera did not start; the readout holds the reason

// ---- Signals --------------------------------------------------------------
// Each function gets one frame's result and returns a number from 0 to 1.
// One owner each; the name has to match a name in table.js signals.
//
// Landmarks used (x and y run 0 to 1 across the frame):
//   10 forehead  152 chin  1 nose tip
//   33 / 133 right eye corners    362 / 263 left eye corners
//   159 / 145 right eyelids       386 / 374 left eyelids

const SIGNALS = {
  // near (FW): the height of the found face over the height of the frame.
  // 0.05 of the frame reads 0 (far wall), 0.45 reads 1 (a face filling it).
  // No face found reads 0, which is what the nobody row leans on.
  near: result => {
    const face = result.faceLandmarks[0];
    if (!face) return 0;
    const height = Math.abs(face[152].y - face[10].y);
    return clamp((height - 0.05) / 0.4);
  },

  // still (JC): how far the nose travelled over the last second, against a
  // ceiling of 6% of the frame. No movement for a full second reads 1.
  still: (() => {
    const CEILING = 0.06;
    const WINDOW = 1000; // ms
    let last = null;
    let moves = []; // { t, d } for the last second only — nothing older is kept
    return result => {
      const face = result.faceLandmarks[0];
      const now = performance.now();
      if (!face) { last = null; moves = []; return 0; }
      const nose = face[1];
      if (last) moves.push({ t: now, d: Math.hypot(nose.x - last.x, nose.y - last.y) });
      last = nose;
      while (moves.length && now - moves[0].t > WINDOW) moves.shift();
      if (!moves.length) return 0; // first frame with a face: no history yet
      const travelled = moves.reduce((sum, m) => sum + m.d, 0);
      return clamp(1 - travelled / CEILING);
    };
  })(),

  // facing (DO): how far the nose sits from the midpoint between the eye
  // corners, against half the eye-to-eye span. Square on reads 1, side-on 0.
  facing: result => {
    const face = result.faceLandmarks[0];
    if (!face) return 0;
    const span = Math.abs(face[263].x - face[33].x);
    if (span < 0.001) return 0; // a face turned almost fully away: no span to divide by
    const middle = (face[263].x + face[33].x) / 2;
    return clamp(1 - Math.abs(face[1].x - middle) / (span / 2));
  },

  // open (BE): the eyelid gap over the eye's own width, averaged across both
  // eyes, so it does not change when the person walks closer. 0.1 reads 0
  // (closed), 0.35 reads 1 (wide).
  open: result => {
    const face = result.faceLandmarks[0];
    if (!face) return 0;
    const right = lidRatio(face, 159, 145, 33, 133);
    const left = lidRatio(face, 386, 374, 362, 263);
    return clamp(((right + left) / 2 - 0.1) / 0.25);
  },
};

function lidRatio(face, upper, lower, inner, outer) {
  const width = Math.abs(face[outer].x - face[inner].x);
  if (width < 0.001) return 0;
  return Math.abs(face[upper].y - face[lower].y) / width;
}

// One of the 52 scores by name, or 0 when no face is in view. Kept for the B
// panel's sake and for any signal we move onto a named score later.
function score(result, name) {
  const face = result.faceBlendshapes[0];
  if (!face) return 0;
  const found = face.categories.find(c => c.categoryName === name);
  return found ? found.score : 0;
}

function clamp(x) {
  return Math.min(1, Math.max(0, x));
}

// Smoothing: each new reading moves the signal a fraction of the way. Higher is
// jumpier, lower is calmer. Thresholds in table.js read the smoothed numbers.
const SMOOTHING = 0.25;

// ---- The State Table, applied ----------------------------------------------

const signals = window.sense.signals; // the object fake-sense.js made, kept
let candidate = null;
let candidateSince = 0;

function applyTable(now) {
  const rows = window.TABLE.states;
  const winner = rows.find(row => row.when(signals));
  if (!winner || winner.name === window.sense.state) {
    candidate = null;
    return;
  }
  if (winner.name !== candidate) {
    candidate = winner.name;
    candidateSince = now;
  }
  if (now - candidateSince >= winner.hold * 1000) {
    window.sense.state = winner.name;
    window.sense.since = now;
    candidate = null;
  }
}

// ---- The loop ---------------------------------------------------------------

function tick() {
  const now = performance.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    for (const name of window.TABLE.signals) {
      const read = SIGNALS[name];
      if (!read) continue;
      signals[name] += (clamp(read(result)) - signals[name]) * SMOOTHING;
    }
    latestScores = result.faceBlendshapes[0] ? result.faceBlendshapes[0].categories : [];
  }
  applyTable(now);
  requestAnimationFrame(tick);
}

async function start() {
  button.disabled = true;
  button.textContent = 'Loading the model…';
  let FaceLandmarker, FilesetResolver;
  try {
    ({ FaceLandmarker, FilesetResolver } = await import(LIBRARY));
  } catch (err) {
    console.error(err);
    showFailure('The face library did not load (cdn.jsdelivr.net is blocked or offline). ' +
      'Press D: the fake sensor still works, so keep building the piece.');
    return;
  }
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const options = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    };
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = 'CPU'; // some machines refuse the GPU path
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    }
    button.textContent = 'Asking for the camera…';
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await video.play();
    for (const name of window.TABLE.signals) {
      if (!SIGNALS[name]) console.warn(`table.js names a signal "${name}" that sense.js does not read yet.`);
    }
    window.senseLive = true;
    failed = false;
    button.remove();
    requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    showFailure(`Camera did not start: ${err.message}`);
  }
}

function showFailure(message) {
  button.disabled = false;
  button.textContent = 'Did not start. Try again';
  failed = true;
  readout.hidden = false;
  readout.textContent = message;
}

button.addEventListener('click', start);

// ---- Readouts ---------------------------------------------------------------
// D shows the object piece.js reads. B shows all 52 scores. V shows the camera.
// All off by default, so a visitor sees the piece and nothing else.

addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (key === 'd') {
    if (failed) { failed = false; readout.hidden = false; return; } // swap the message for the fake readout
    readout.hidden = !readout.hidden;
  }
  if (key === 'b') scores.hidden = !scores.hidden;
  if (key === 'v') video.classList.toggle('shown');
});

function drawReadouts() {
  if (!readout.hidden && !failed) {
    const { state, signals: s, since } = window.sense;
    const held = ((performance.now() - since) / 1000).toFixed(1);
    const lines = Object.entries(s).map(([k, v]) => `${k.padEnd(8)} ${v.toFixed(2)}`);
    readout.textContent =
      `${window.senseLive ? 'camera on' : 'fake: keys 1-6, mouse, shift+mouse'}\n` +
      `state    ${state}  (${held} s)\n` + lines.join('\n');
  }
  if (!scores.hidden) {
    scores.textContent = latestScores.length
      ? latestScores.map(c => `${c.categoryName.padEnd(20)} ${c.score.toFixed(2)}`).join('\n')
      : 'no face in view (start the camera first)';
  }
  requestAnimationFrame(drawReadouts);
}
requestAnimationFrame(drawReadouts);
