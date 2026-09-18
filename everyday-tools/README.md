# Weight

A calculator with one number key. Entering a number takes that many taps — 7 is seven taps. Operators, `=`, `C`, and `⌫` register on the first press. It computes correctly; it just refuses to let a quantity arrive for free.

- Live: https://fwong29.github.io/reusable-studio-engine/everyday-tools/
- Repo: https://github.com/fwong29/reusable-studio-engine (this project lives in `everyday-tools/`)
- Intent: [TOOL_INTENT.md](TOOL_INTENT.md)
- Demo recording: [process/demo.mp4](process/demo.mp4)

## Back-end architecture

**What data does this tool need?**
Three values: the current tally (how many taps toward the number being entered), the committed expression (a list of numbers and operators), and a flag for whether the current tally has been touched since the last commit. Nothing else.

**Where is it stored?**
In three JavaScript variables in `main.js` (`currentTally`, `tokens`, `tallyTouched`). Browser memory only.

**Is it temporary or persistent?**
Temporary. A page reload erases everything. There is no localStorage, no cookie, no database.

**Does the system need memory between sessions?**
No — and it must not have any. The Tool Intent's Dignity Clause says the tool records nothing; the Refusal Clause says the friction never changes with use. Both are only true if the tool forgets. Statelessness is the design, not a shortcut.

**Does the system require AI inference?**
No. The rule is fixed and mechanical: one tap adds one to the tally. There is nothing to infer.

**How many API calls are realistically required?**
Zero. The page is three static files. The only network request is a Google Fonts stylesheet, and the page works without it.

**What happens if the API fails?**
There is no API to fail. There is one arithmetic edge — division by zero — and it's guarded: if it ever occurs, the display renders the word `Error` in the accent color, deliberately distinct from a blank or broken state. In practice the entry model makes it unreachable, since committing a number requires at least one tap, so a `0` divisor can't be entered; the guard stays as defensive code. Every reachable entry produces a valid result.

## Layers

| Layer | Where | What |
|---|---|---|
| Input | `index.html` buttons → `click` listeners in `main.js` | The tally key, four operators, `=`, `C`, `⌫` |
| Logic | `pressTally`, `pressOperator`, `pressEquals`, `pressClear`, `pressBackspace`, `evaluate` | Increment the tally; commit it as a number when an operator or `=` is pressed; evaluate with standard precedence |
| Output | `render` → `#display`, `#tallyCount`, `#tallyMarks` | The running expression, the current tally as a numeral, and one mark per tap |

The logic is in plain functions with no framework. Every state change goes through `render()`, so what the display shows is always exactly what the variables hold.

## Choice point

The tally key is the choice point. A normal keypad makes the decision for you — one tap, digit entered. Here the decision is spread across every tap: each one is a small, visible act of continuing. The tally marks under the numeral are the seam — they show exactly how far you've committed, so the key never looks broken while a number is still being built.

## Behavior integrity check

- **Does it interrupt where the intent claimed?** Yes — during the behavior, at the moment a quantity becomes a number. Nothing before (no priming), nothing after (no reflection screen, no summary).
- **Does it avoid shame, surveillance, or manipulation?** It stores nothing, knows nothing about what the number means, and never comments on it. The cost of entering 7 is identical for every person, every time.
- **Is it exploiting friction or designing it?** The friction is proportional to the number and to nothing else. It doesn't escalate, doesn't personalize, doesn't reward. It's the same rule on the first use and the thousandth.
- **Is it minimal?** One number key, four operators, three controls. The decimal point was removed because it doesn't fit a tally. Nothing else was added.

## Atmosphere (instrument + atmosphere phase)

Direction: **Speed Bump** — friction that reads as deliberate, never punitive.

- **Typography.** Space Mono for anything that is a value (the display, the tally numeral, the keys) — a metered, mechanical face that suits a machine that counts. Inter for the human-voice labels (nameplate, caption). The tally numeral is the largest thing on the interface at 44px; the nameplate is a quiet 12px with wide tracking. Hierarchy runs numeral → display → keys → labels.
- **Spatial rhythm.** One consistent 12px gutter across every gap. The tally sits alone in its own tall panel with real air around the numeral, so the number you're building is the calm center of the screen, not crowded by keys.
- **Color.** Warm bone/cream ground with a single terracotta accent. The accent means one thing only — *effort* — so it appears on the tally marks and the operator keys and nowhere else. `=` is near-black (a full stop), controls are quiet cream.
- **Motion + timing.** Motion is reserved for meaning; nothing animates idle. A tap: the new mark scales in and the numeral ticks, 220ms. A number committing on an operator: the panel and display settle, 500ms — the slowest beat, because it's the moment the quantity becomes real. A result arriving on `=`: 400ms. A clear: 300ms fade. All ease-out, and all disabled under `prefers-reduced-motion`.

Timings live as CSS custom properties (`--t-tap`, `--t-land`, `--t-result`, `--t-clear`) at the top of `style.css`, so the pacing is declared in one place rather than scattered.

## Running locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```
