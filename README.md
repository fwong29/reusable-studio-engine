# Reusable Studio Engine

A minimal Canvas starter template I copy every time I begin a new build in this course — clean file structure, a docs ritual, and a tiny sketch that proves the engine runs.

## How to run locally

Just open `index.html` in a browser. If your browser blocks ES module imports over `file://`, serve it locally instead:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## How to deploy

Deployed via **GitHub Pages**: repo Settings → Pages → Deploy from branch `main`, folder `/ (root)`. Every push to `main` updates the live link.

## How I use this to start projects

1. Copy this repo and rename it.
2. Rewrite `/docs/SYSTEM_CHARTER.md` first — intent, constraints, tensions, taste vow — before touching code.
3. Update the template sketch's signal/parameter/behavior to match the new assignment.
4. Build the smallest working version, following `/docs/ROADMAP.md`.
5. Log direction changes in `/process/changelog.md` as I go, and use `/docs/PROMPTS.md` when I need Copilot's help.

## Links

- GitHub template repo: https://github.com/fwong29/reusable-studio-engine
- Live deployed engine: https://fwong29.github.io/reusable-studio-engine/
