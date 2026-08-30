# Nimbus — website

The official site for [Nimbus](https://github.com/ahmed-babay/nimbus), a voice-activated
AI assistant for Windows.

It is a scrollytelling page built around a single object: a large AI orb, pinned on screen
for the whole scroll, with a contained storm of lightning raging inside it. Scrolling moves
through nine beats; each one shifts the orb's palette and the intensity of the plasma, and
the page's accent colour follows the core.

## Zero build

Plain HTML, CSS and JavaScript. No framework, no bundler, no npm install, no build step.
Open `index.html` in a browser and it runs.

```
index.html
assets/
  favicon.svg
  css/
    core.css      design tokens, reset, chrome, content, setup section
    stage.css     the pinned stage, backdrop layers, panels, reveals
  js/
    beats.js      the score: one entry per beat, with its palette
    orb.js        the core: procedural plasma on a 2D canvas
    app.js        the scroll engine
```

To preview locally, any static server will do:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Hosting on GitHub Pages

Designed to be served from a repository root with no build step, so Pages needs no
configuration beyond turning it on:

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**. Branch: `main`, folder: `/ (root)`. Save.

The site appears at `https://<user>.github.io/<repo>/` within a minute or so.

Everything that matters for Pages is already handled:

- **All paths are relative** (`assets/css/core.css`, not `/assets/css/core.css`), so the
  site works from a project subpath as well as from a user or custom domain.
- **`.nojekyll`** is committed, so GitHub serves the files as-is rather than running them
  through Jekyll.
- **No external requests.** System font stacks, inline SVG, a canvas drawn from scratch.
  No CDN, no webfonts, no analytics — nothing to break and nothing to rate-limit.
- **`.github/workflows/pages.yml`** is included if you would rather deploy through
  Actions. It is optional; the branch method above works on its own. If you use it, set
  Source to **GitHub Actions** instead.

For a custom domain, add a `CNAME` file at the root containing the domain, and point DNS
at GitHub.

## How the orb works

**Everything is generated per frame.** There is no video and no sprite sheet.

**It is genuinely 3D.** Filaments and bolts are built as polylines on a unit sphere, then
rotated around Y — the slow continuous spin — and around X for a fixed tilt, and projected
orthographically. Each point's `z` says whether it is on the near or the far side, which
drives its brightness, so the core reads as rotating rather than as a flat swirl.

**The lightning is fractal.** Take two points on the sphere, displace the midpoint, and
recurse; each generation halves the displacement. That self-similar kink is what makes a
polyline read as lightning instead of as a scribble. Bolts live 110–290 ms with a sharp
attack and a slower decay, because lightning does not fade in. Some throw a branch.

**Glow is two strokes, not a blur.** Each path is stroked wide and dim, then narrow and
bright, under `lighter` compositing. That is far cheaper than `shadowBlur` and looks
better.

**Scroll drives colour and violence.** `assets/js/beats.js` holds a palette and a baseline
`charge` per beat. `app.js` interpolates between adjacent beats, so the core drifts through
blue → cyan → violet → teal → amber → indigo → magenta → emerald → white-hot rather than
cutting. Intensity peaks when a beat is centred and drops to about 40% between them, so the
storm surges at each moment and calms in the gaps. Scrolling hard adds a decaying boost —
the core rages when you move fast.

**The accent colour is shared.** `app.js` writes the current beam colour into `--beam` and
`--beam-2` on the root element, so the rules, chips, links, HUD, buttons and the neural
graph in the backdrop all drift with the orb.

## The rest of the page

A faint engineering grid, a node-and-edge graph with charges running along a few of its
edges, corner reticle marks, and a vignette. The graph is real geometry, generated once
with a seeded poisson-ish distribution and nearest-neighbour edges, then inlined as static
SVG — so it costs nothing at runtime and is there without JavaScript.

Beat positions are **measured, not assumed**: `app.js` reads each panel's centre and derives
the scroll position where it should be on screen. A panel whose copy runs taller than the
viewport still lines up with its own moment in the score.

## Accessibility and robustness

- The whole page reads without JavaScript. Reveal animations are armed by a `.js` class set
  before first paint, so with scripting off all the copy is simply visible, and a CSS
  fallback orb stands in for the canvas.
- `prefers-reduced-motion: reduce` stops the animation loop entirely and draws one
  considered still frame of the core, in the right palette. Reveals and panel transitions
  are disabled too.
- The canvas is `aria-hidden`; nothing in it carries information the text does not.
- The orb only runs while it is actually on screen and the tab is in the foreground, via
  IntersectionObserver plus `visibilitychange`.
- Skip link, real headings, landmarks, and rail links that scroll to the measured anchor
  rather than jumping to a mismatched anchor position.

## Editing

Copy lives in `index.html`, one `<section class="beat">` per beat.

To add or reorder a beat: add an entry to `NIMBUS_BEATS` in `beats.js` (id, label, `charge`
and a three-colour palette), add a matching `<section class="beat" id="beat-<id>">`, and add
a rail link in the same order. The engine derives everything from the array length, so
nothing else needs changing.

To retune the storm, the knobs are all near the top of `orb.js`: bolt lifetime and width in
`makeBolt`, the spawn rate in `tick`, and the framing in `place`.
