# Nimbus — website

The official site for [Nimbus](https://github.com/ahmed-babay/nimbus), a voice-activated
overlay assistant for Windows.

It is a scrollytelling page: a control tower rising through the clouds. Scrolling climbs
the tower, and each floor is a 3D parallax diorama standing in for one real Nimbus
feature — radio room for voice input, ops deck for transit and maps, weather deck,
wire room, archive, switchboard, signal room.

## Zero build

Plain HTML, CSS and JavaScript. No framework, no bundler, no npm install, no build step.
Open `index.html` in a browser and it runs.

```
index.html
assets/
  favicon.svg
  css/
    core.css        design tokens (day/night), reset, page chrome
    scene.css       the pinned stage, tower SVG, cutaway frame, fog, 3D layers
    rooms.css       diorama interiors and instrument animations
  js/
    floors.js       camera keyframes, cloud parallax config, instrument data
    instruments.js  split-flap board, wire ticker, dials, live transcript
    app.js          the scroll engine
```

To preview locally, any static server will do:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Hosting on GitHub Pages

The site is designed to be served from a repository root with no build step, so Pages
needs no configuration beyond turning it on:

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**. Branch: `main`, folder: `/ (root)`. Save.

The site appears at `https://<user>.github.io/<repo>/` within a minute or so.

Everything that matters for Pages is already handled:

- **All paths are relative** (`assets/css/core.css`, not `/assets/css/core.css`), so the
  site works from a project subpath as well as from a user or custom domain.
- **`.nojekyll`** is committed, so GitHub serves the files as-is rather than running them
  through Jekyll.
- **No external requests.** System font stacks, inline SVG, no CDN, no analytics, no
  webfonts. Nothing to break and nothing to rate-limit.
- **`.github/workflows/pages.yml`** is included if you would rather deploy through
  Actions. It is optional — the branch method above works on its own. If you use it,
  set Source to **GitHub Actions** instead.

For a custom domain, add a `CNAME` file at the root containing the domain, and point
DNS at GitHub.

## How the scene works

**The camera is an SVG viewBox.** The tower lives in one tall SVG world (1200 × 6400
units, ground at y 6100, beacon at y 276). `assets/js/floors.js` holds one viewBox per
scroll beat; `app.js` interpolates between consecutive stops with a smoothstep ease and
writes the result to the `viewBox` attribute every frame. There is no video and no frame
sequence — the climb is genuinely vector, so it stays sharp at any size and any speed.

**Floors are CSS 3D dioramas.** Each is a `perspective: 1000px` container holding flat
SVG layers at different `translateZ` depths. Every layer is counter-scaled by
`(1000 − z) / 1000` so depth reads as parallax rather than as things being bigger or
smaller. Pointer movement tilts the whole box; scroll position pushes the camera through
it via `--dolly`.

**Fog covers the seams.** `--fog` peaks at exactly the halfway point between two floors,
driving a `backdrop-filter` blur over the pinned scene. The room swap happens at that
peak, so you fly through cloud rather than watching a cut. The copy cards use the same
idea in reverse: each card's backdrop blur eases off as it settles into the middle of
the screen, which matters most on mobile where the text sits directly on top of the scene.

**Day and night are custom properties.** `[data-sky="day"]` is a clear sky;
`[data-sky="night"]` is a storm with a lit beacon, rain, lightning and a rotating light
sweep. Everything — page chrome, tower, cloud decks, room interiors — re-skins from that
one attribute. The initial choice comes from `localStorage`, then `prefers-color-scheme`,
then the clock.

## Accessibility

- The whole page reads without JavaScript: reveal animations are armed by a `.js` class
  set before first paint, so with scripting off all the copy is simply visible.
- `prefers-reduced-motion: reduce` stops every looping animation, the pointer parallax
  and the fog, and leaves the instruments in a sensible static state.
- The scene is `aria-hidden`; nothing in it carries information the text does not.
- Skip link, real headings, a real `<button>` for the sky toggle with `aria-pressed`.

## Editing

Copy lives in `index.html`, one `<section class="beat">` per floor.

To reorder or add a floor: add an entry to `NIMBUS_FLOORS` in `floors.js` (with the
viewBox the camera should settle on), add a matching `<figure class="diorama">`, a
`<section class="beat">` with the next `data-beat` index, and a rail link. The engine
derives the beat count from the array, so nothing else needs changing.

Instrument content — departure board rows, the wire ticker, the transcript, the dial
readings — is all data at the bottom of `floors.js`.
