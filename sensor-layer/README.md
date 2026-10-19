# Sensor Layer prototype

A piece that watches the person in front of it. One ring, one breath, grain and a
hum; no gauge, no numbers, no label. It reads four signals off a face and answers
with the six states in our table.

- **Live:** https://fwong29.github.io/reusable-studio-engine/sensor-layer/
- **Repo:** https://github.com/fwong29/reusable-studio-engine (this project lives in `sensor-layer/`)
- **State Table:** the six rows below, and in `table.js` row for row.

## For the person / to them

**For them:** it answers the distance and the attention they chose — come closer
and it tightens to one circle, stop moving and it clears until the image is
sharp, walk past and it only acknowledges you.

**To them:** it charges stillness and closeness for its best state, so a body that
cannot hold still or cannot come close gets less of the piece, and it decides
someone has left the moment they turn their head.

## The signals

Each of us owns one, from the reading in `sense.js` to the rule in `table.js` to
the response in `piece.js`.

| Signal | Owner | 0 | 1 | Read from |
|---|---|---|---|---|
| `near` | FW | no face found, or the far wall | a face filling the frame | face height (forehead 10 to chin 152) over frame height, 0.05 → 0, 0.45 → 1 |
| `still` | JC | moving constantly | not shifted for a full second | nose travel over the last second against a ceiling of 6% of the frame |
| `facing` | DO | side-on | square to the screen | nose offset from the midpoint of the eye corners (33, 263), over half the eye span |
| `open` | BE | eyes closed | eyes wide | eyelid gap over eye width, both eyes averaged, 0.1 → 0, 0.35 → 1 |

## The table

Checked top to bottom, the first true row wins, so the rows that read a face come
before the rows that read only distance. Hold is how long a rule has to stay true
before the state changes.

| State | Rule | Hold | The piece does |
|---|---|---|---|
| nobody (all) | `near < 0.05` | 5 s | black, the pulse stops, one frame a second |
| turning-away (DO) | `facing < 0.35 && near > 0.4` | 2 s | the image softens, grain comes up, the hum widens out |
| widening (BE) | `open > 0.7 && near > 0.5` | 1.5 s | the ground brightens a step and the tone lifts |
| holding (JC) | `still > 0.75 && near > 0.5` | 3 s | one breath every two seconds, the grain clears |
| arriving (FW) | `near > 0.6` | 1.5 s | the ring contracts to one circle, the hum resolves |
| passing (FW) | `near >= 0.15 && near <= 0.5` | 1 s | one slow ring opens to the edge, the hum stays |

`nobody` is first, not last: its rule is specific, and the 5 s hold means a
dropped frame or a turned head never empties the room.

## Running it

A local server, not the Finder — `file://` cannot reach the camera.

```bash
python3 -m http.server 8000
# then http://localhost:8000/sensor-layer/
```

Click **Start the camera**. Keys: **D** the object `piece.js` reads, **B** the 52
named scores, **V** the camera in the corner, **M** mute. Before the camera
starts: **1–6** set the state in row order, the **mouse** sets `near` and
`still`, **shift + mouse** sets `facing` and `open`.

## The files

| File | Job |
|---|---|
| `table.js` | the State Table: the four signals, the six rows, the holds |
| `sense.js` | reads the camera, turns readings into the signals, applies the table, writes `window.sense` |
| `piece.js` | reads `window.sense` in its own frame loop and answers |
| `fake-sense.js` | the same object with no camera attached |
| `index.html` | loads them in that order |

The object, and nothing else, passes between them:

```js
window.sense = {
  state: 'holding',
  signals: { near: 0.72, still: 0.81, facing: 0.95, open: 0.30 },
  since: 184203.5,
};
```

## Break log

| Date | Commit | What broke | What we changed |
|---|---|---|---|
| 2026-10-19 | `6577ef9` | The piece opened in `turning-away` before the camera ever started. `fake-sense.js` set every signal to 0, and `facing: 0` makes `facing < 0.35` true. | Rest `facing` at 1 and `open` at 0.3 in the fake sensor, and put them on shift + mouse so all four are drivable. |
| 2026-10-19 | `6577ef9` | `turning-away` and `holding` looked the same when the ring was mid-size: the grain that is supposed to separate them was drawn at 9% alpha and read as a black screen. | Grain to 22% alpha, more dots, each 1.5 px. The two states now read apart with no label. |
| 2026-10-19 | `6577ef9` | Building the hum threw where no audio device exists, and the throw came out of the `keydown` handler, taking the number keys with it. | The audio build is wrapped: no audio, the piece runs silent and the keys still work. |

Thresholds that move go here too, with the reading that moved them.

## What stays in the browser

Nothing saves a frame or a landmark list. The model downloads once when you click
Start; after that the Network panel stays quiet. No `localStorage`, no uploads, no
camera image in the repo — the grain and the ring are drawn, never stored.
