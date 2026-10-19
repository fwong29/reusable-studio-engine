// piece.js: reads window.sense inside its own frame loop and answers.
//
// Flat black and white: one ring, one pulse, grain, and a hum. No gauge, no
// numbers, no label — a visitor should be able to tell the states apart by
// watching, with nobody explaining. It reads the object and never the camera.

const canvas = document.querySelector('#piece');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}
addEventListener('resize', resize);
resize();

// The table's "the piece does" column, as numbers.
//   ring   radius, as a share of the smaller side      pulse  ms per breath, 0 = none
//   weight ring thickness in px                        grain  how much noise sits on it
//   light  how far the ground comes up off black       tone   Hz, 0 = silence
//   level  how loud the hum is                         air    lowpass cutoff in Hz
const LOOK = {
  nobody:         { ring: 0.00, weight: 0.0, pulse: 0,    grain: 0.00, light: 0.00, tone: 0,   level: 0.000, air: 300 },
  passing:        { ring: 0.95, weight: 1.5, pulse: 4000, grain: 0.55, light: 0.06, tone: 110, level: 0.030, air: 600 },
  arriving:       { ring: 0.30, weight: 2.5, pulse: 3000, grain: 0.40, light: 0.08, tone: 165, level: 0.050, air: 900 },
  holding:        { ring: 0.22, weight: 3.5, pulse: 2000, grain: 0.00, light: 0.10, tone: 165, level: 0.018, air: 1400 },
  widening:       { ring: 0.34, weight: 2.5, pulse: 1200, grain: 0.25, light: 0.22, tone: 247, level: 0.060, air: 1800 },
  'turning-away': { ring: 0.70, weight: 1.0, pulse: 5000, grain: 0.85, light: 0.04, tone: 110, level: 0.040, air: 2600 },
};

// A state with no look above still shows up, so a new row in table.js is visible
// the moment it fires.
const FALLBACK = { ring: 0.5, weight: 2, pulse: 2000, grain: 0.3, light: 0.5, tone: 330, level: 0.04, air: 1200 };

const now = { ...LOOK.nobody };   // what is on screen, easing toward the target
let phase = 0;                    // the breath, kept across pulse changes so it never jumps
let lastFrame = performance.now();
let lastDraw = 0;

// ---- The hum ----------------------------------------------------------------
// Built on the first click or key, because a browser will not make sound before
// one. M mutes it. Nothing is loaded; it is one oscillator.

let audio = null;
let muted = false;

function startAudio() {
  if (audio || muted) return;
  try {
    build();
  } catch (err) {
    console.warn('No audio on this machine; the piece runs silent.', err);
  }
}

function build() {
  const ctxA = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctxA.createOscillator();
  const filter = ctxA.createBiquadFilter();
  const gain = ctxA.createGain();
  osc.type = 'sine';
  osc.frequency.value = LOOK.nobody.tone || 110;
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(ctxA.destination);
  osc.start();
  audio = { ctxA, osc, filter, gain };
}
addEventListener('pointerdown', startAudio);
addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'm') {
    muted = !muted;
    if (audio) audio.gain.gain.value = 0;
  } else {
    startAudio();
  }
});

function hum(look) {
  if (!audio) return;
  const t = audio.ctxA.currentTime;
  const level = muted ? 0 : look.level;
  audio.gain.gain.setTargetAtTime(level, t, 0.4);
  if (look.tone) audio.osc.frequency.setTargetAtTime(look.tone, t, 0.6);
  audio.filter.frequency.setTargetAtTime(look.air, t, 0.8);
}

// ---- The frame --------------------------------------------------------------

function frame() {
  const { state, since } = window.sense;
  const t = performance.now();

  // nobody: the piece stops. One frame a second, nothing moving, nothing kept.
  if (state === 'nobody' && t - lastDraw < 1000) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(t - lastFrame, 100); // a backgrounded tab must not jump the easing
  lastFrame = t;
  lastDraw = t;

  const target = LOOK[state] || FALLBACK;
  const ease = 1 - Math.pow(0.001, dt / 1000); // same speed whatever the frame rate
  for (const key of Object.keys(now)) now[key] += (target[key] - now[key]) * ease;
  hum(target);

  // The breath. A longer pulse is a slower breath; 0 stops it where it stands.
  if (now.pulse > 1) phase += dt / now.pulse;
  const breath = 1 + 0.06 * Math.sin(phase * Math.PI * 2);

  const w = canvas.width;
  const h = canvas.height;
  const held = t - since;
  const settled = Math.min(1, held / 600); // the first moments of a state arrive, not snap

  const light = Math.round(now.light * 255);
  ctx.fillStyle = `rgb(${light}, ${light}, ${light})`;
  ctx.fillRect(0, 0, w, h);

  // Grain: noise that clears as the piece sharpens. Drawn, never stored.
  const dots = Math.round(now.grain * 2600);
  if (dots > 0) {
    ctx.fillStyle = 'rgba(242, 239, 233, 0.22)';
    for (let i = 0; i < dots; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5 * devicePixelRatio, 1.5 * devicePixelRatio);
    }
  }

  // The ring.
  const radius = Math.min(w, h) / 2 * now.ring * breath;
  if (radius > 1) {
    ctx.globalAlpha = settled;
    ctx.strokeStyle = '#f2efe9';
    ctx.lineWidth = now.weight * devicePixelRatio;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
