# Prompts

This file controls how I talk to Copilot. I don't ask it for ideas — I ask it for specific technical help inside the constraints already set in `SYSTEM_CHARTER.md`.

## Context block

Paste this at the top of a Copilot session before asking for anything:

```
I'm working in reusable-studio-engine, a Canvas template with this structure:
- index.html / style.css / main.js at the root (main.js just wires modules together)
- /src/canvas/setupCanvas.js — HiDPI canvas setup
- /src/canvas/loop.js — the requestAnimationFrame loop
- /src/input/input.js — captures one input signal
- /src/utils/math.js — small math helpers (clamp, mapRange)

Constraints: no external libraries, pure Canvas, one signal driving one parameter driving one visible behavior. Keep functions small and in the right file — don't collapse everything into main.js.
```

## Reusable prompt templates

**1. Canvas draw loop**
> "Inside `/src/canvas/loop.js`, write a `requestAnimationFrame` loop that draws [shape] at the canvas center. [parameter] should be driven by [input value], mapped with `mapRange` from `/src/utils/math.js`. Don't add any styling beyond stroke color and line width."

**2. Input mapping**
> "Inside `/src/input/input.js`, capture [signal] (e.g. mouse position, click/hold, scroll) on [target element] and expose it as a plain state object other modules can read. No event system, no library — just a mutable object updated on the event."

**3. Debugging**
> "Here's the function from [file] and the behavior I expected vs. what's happening: [expected] / [actual]. Don't rewrite the whole function — tell me the smallest change that fixes it and why the current code produces the bug."

## Rule

Every AI response is followed by my own explanation, in plain language, of what changed and why. No paste-dumps — if I can't explain it, it doesn't go in the repo.
