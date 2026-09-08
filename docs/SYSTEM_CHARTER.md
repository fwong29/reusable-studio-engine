# System Charter

**Intent:** This system exists to make the boundary between signal and noise visible and touchable — one clear pulse the viewer can control, nothing more.

**Constraints (rules I will not break):**
1. One signal in, one parameter out — no hidden inputs.
2. No decoration that doesn't respond to input — every pixel earns its place.
3. Ship the smallest working version before adding anything.

**Tensions I want the work to hold:**
1. Order vs. drift — the pulse is precise, but it should feel alive, not mechanical.
2. Signal vs. noise — clarity should read instantly, even as the parameter pushes toward chaos.

**Taste vow:** I refuse to add glow, gradients, or particle effects to fake depth. If the idea isn't legible in flat black and white, it isn't done.

## Template sketch definition

- **Signal:** mouse X position
- **Parameter:** pulse frequency (tension)
- **Behavior:** a ring breathes — its radius oscillates faster as the mouse moves right, calm near the left edge
- **Readability test:** sweep the mouse left to right; the ring's breathing should visibly speed up within 5 seconds, unmistakably
