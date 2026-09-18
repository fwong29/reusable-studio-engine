# Changelog

Short notes on direction changes — what changed and why.

- 2026-09-08: Scaffolded the engine structure and docs system before writing any Canvas code, per the charter's "creative agency first" constraint.
- 2026-09-08: Chose mouse X → pulse frequency → breathing ring as the template sketch. One signal, one parameter, one behavior, so the readability test stays a 5-second glance.
- 2026-09-10: Enabled GitHub Pages (branch `main`, root folder). Engine is live at https://fwong29.github.io/reusable-studio-engine/.
- 2026-09-14: Added `everyday-tools/`, the "Everyday Tools" module project — a calculator where entering a number costs as many presses as its own value. Tool Intent Statement in `everyday-tools/TOOL_INTENT.md`.
- 2026-09-16: Sketched the Interface Ritual (ritual map, Speed Bump / Companion / Instrument Panel directions, signature interaction, reflection) for the calculator. Exports and submission PDF in `everyday-tools/process/`.
- 2026-09-18: Tool Build (mechanics) — wrote `everyday-tools/README.md` with back-end architecture notes, recorded the core loop (`process/demo.mp4`), fixed the intent statement to match the one-key build.
- 2026-09-18: Tool Build (instrument + atmosphere) — refined the Speed Bump direction: reserved motion (tap/land/result/clear timings as CSS vars, reduced-motion aware), bolder tally seam, consistent 12px rhythm, accent reserved for effort. Spec frames + submission PDF in `everyday-tools/process/`.
