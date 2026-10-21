// fake-sense.js: the same object, with no sensor attached.
//
// Loaded first, so piece.js never reads an empty object. Until the camera is on:
//   number keys 1-6 set the state, in the order of the rows in table.js
//   the mouse sets near (left to right) and still (top to bottom)
//   shift + the mouse sets facing (left to right) and open (top to bottom)
// When sense.js goes live it sets window.senseLive and this file stops writing.
//
// facing starts at 1 and open at 0.3 — someone square to the screen with ordinary
// eyes. Starting them at 0 made turning-away true the moment the page loaded.

(function () {
  const names = window.TABLE.states.map(row => row.name);
  const [near, still, facing, open] = window.TABLE.signals;
  const REST = { [facing]: 1, [open]: 0.3 };

  const signals = {};
  for (const name of window.TABLE.signals) signals[name] = REST[name] || 0;

  window.sense = {
    state: 'nobody',
    signals,
    since: performance.now(),
  };

  addEventListener('keydown', e => {
    if (window.senseLive) return;
    const row = Number(e.key) - 1;
    if (row >= 0 && row < names.length && names[row] !== window.sense.state) {
      window.sense.state = names[row];
      window.sense.since = performance.now();
    }
  });

  // Four signals, two at a time: the mouse drives the pair, shift picks which.
  addEventListener('pointermove', e => {
    if (window.senseLive) return;
    const x = e.clientX / innerWidth;
    const y = e.clientY / innerHeight;
    if (e.shiftKey) {
      if (facing) signals[facing] = x;
      if (open) signals[open] = y;
    } else {
      if (near) signals[near] = x;
      if (still) signals[still] = y;
    }
  });
})();
