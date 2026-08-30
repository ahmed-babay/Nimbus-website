/* ============================================================
   Nimbus - the ascent engine.

   One scroll position drives everything:
     - the SVG viewBox (the camera climbing the tower)
     - cloud-deck parallax
     - which floor's windows are lit
     - which diorama is on screen, and how far into it
     - fog between floors
     - the copy cards' arrival
     - the altimeter and the floor rail

   IntersectionObserver handles one-shot content reveals.
   ============================================================ */

(function () {
  'use strict';

  var doc = document.documentElement;
  var FLOORS = window.NIMBUS_FLOORS || [];
  var BANDS = window.NIMBUS_BANDS || [];
  var WORLD = window.NIMBUS_WORLD || { ground: 6100, beacon: 276, metres: 412 };
  var LAST = FLOORS.length - 1;

  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- elements */
  var ascent = document.getElementById('ascent');
  var stage = document.getElementById('stage');
  var camera = document.getElementById('camera');
  var cutaway = document.getElementById('cutaway');
  var dioramaHost = document.getElementById('dioramas');
  var plateNo = document.getElementById('plateNo');
  var plateName = document.getElementById('plateName');
  var altimeter = document.getElementById('altimeter');
  var altVal = document.getElementById('altVal');
  var altBar = document.getElementById('altBar');
  var rail = document.getElementById('rail');

  if (!ascent || !camera) return;

  var bandEls = toArray(camera.querySelectorAll('.band'));
  var dioramas = toArray(document.querySelectorAll('.diorama'));
  var beats = toArray(document.querySelectorAll('.beat'));
  var railLinks = rail ? toArray(rail.querySelectorAll('a')) : [];

  /* windows grouped by the floor they belong to */
  var windowsByFloor = {};
  toArray(camera.querySelectorAll('.win')).forEach(function (w) {
    var f = w.getAttribute('data-win');
    (windowsByFloor[f] || (windowsByFloor[f] = [])).push(w);
  });


  var instruments = window.NimbusInstruments ? window.NimbusInstruments.init() : null;

  /* ---------------------------------------------------------- helpers */
  function toArray(list) { return Array.prototype.slice.call(list); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ---------------------------------------------------------- day / night */
  var toggle = document.getElementById('skyToggle');

  function applySky(mode) {
    doc.setAttribute('data-sky', mode);
    if (toggle) toggle.setAttribute('aria-pressed', mode === 'night' ? 'true' : 'false');
    try { localStorage.setItem('nimbus-sky', mode); } catch (e) {}
  }

  applySky(doc.getAttribute('data-sky') === 'night' ? 'night' : 'day');

  if (toggle) {
    toggle.addEventListener('click', function () {
      applySky(doc.getAttribute('data-sky') === 'night' ? 'day' : 'night');
    });
  }

  /* ---------------------------------------------------------- measure */
  var top = 0, span = 1, vh = 1;

  function measure() {
    vh = window.innerHeight || doc.clientHeight;
    var rect = ascent.getBoundingClientRect();
    top = rect.top + (window.pageYOffset || doc.scrollTop || 0);
    span = Math.max(1, ascent.offsetHeight - vh);
  }

  /* ---------------------------------------------------------- pointer */
  var wantRx = 0, wantRy = 0, haveRx = 0, haveRy = 0, settled = true;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (fine && !calm && stage) {
    stage.addEventListener('mousemove', function (e) {
      var nx = (e.clientX / window.innerWidth) * 2 - 1;
      var ny = (e.clientY / window.innerHeight) * 2 - 1;
      wantRy = clamp(nx, -1, 1) * 6;
      wantRx = clamp(-ny, -1, 1) * 4;
      settled = false;
      request();
    }, { passive: true });

    stage.addEventListener('mouseleave', function () {
      wantRx = 0; wantRy = 0; settled = false; request();
    });
  }

  /* ---------------------------------------------------------- the update */
  var activeFloor = null;

  function update() {
    var y = window.pageYOffset || doc.scrollTop || 0;
    var p = clamp((y - top) / span, 0, 1);
    var u = p * LAST;                       /* position in floor units */

    /* -- camera: interpolate the viewBox between two stops -- */
    var i = clamp(Math.floor(u), 0, LAST - 1);
    var t = smooth(u - i);
    var a = FLOORS[i].cam;
    var b = FLOORS[i + 1].cam;

    var cx = lerp(a.x, b.x, t);
    var cy = lerp(a.y, b.y, t);
    var cw = lerp(a.w, b.w, t);
    var ch = lerp(a.h, b.h, t);

    camera.setAttribute('viewBox',
      r2(cx) + ' ' + r2(cy) + ' ' + r2(cw) + ' ' + r2(ch));

    /* -- cloud decks lag or outrun the camera -- */
    for (var k = 0; k < bandEls.length; k++) {
      var cfg = BANDS[k];
      if (!cfg) continue;
      bandEls[k].setAttribute('transform',
        'translate(0 ' + r2((cy - cfg.ref) * cfg.par) + ')');
    }

    /* -- nearest floor, and how far off it we are -- */
    var idx = Math.round(u);
    var off = u - idx;                      /* -0.5 .. 0.5 */
    var dist = Math.abs(off);
    var floor = FLOORS[idx];

    /* -- fog peaks exactly between two floors -- */
    var fog = calm ? 0 : 0.9 * Math.pow(dist * 2, 1.5);
    stage.style.setProperty('--fog', r2(fog));

    /* -- the cutaway fades in once we are inside the tower -- */
    var seg = 1 / LAST;
    var opIn = smooth(clamp((p - seg * 0.30) / (seg * 0.5), 0, 1));
    var opOut = 1 - smooth(clamp((p - (1 - seg * 0.80)) / (seg * 0.5), 0, 1));
    var frameOp = Math.min(opIn, opOut);

    cutaway.style.setProperty('--frame-op', r2(frameOp));
    cutaway.style.setProperty('--frame-scale', r2(0.96 + frameOp * 0.04));

    /* -- scrolling pushes the camera through the diorama -- */
    if (dioramaHost) {
      dioramaHost.style.setProperty('--dolly', r2(off * 170));
    }

    /* -- swap rooms, light windows, relabel the plate -- */
    if (floor && floor.id !== activeFloor) {
      var prev = activeFloor;
      activeFloor = floor.id;

      dioramas.forEach(function (d) {
        d.classList.toggle('is-active', d.getAttribute('data-floor') === activeFloor);
      });

      Object.keys(windowsByFloor).forEach(function (f) {
        var lit = f === activeFloor;
        windowsByFloor[f].forEach(function (w) { w.classList.toggle('is-lit', lit); });
      });

      if (plateNo) plateNo.textContent = floor.no || '—';
      if (plateName) plateName.textContent = floor.name;

      if (instruments) {
        if (prev) instruments.stop(prev);
        instruments.start(activeFloor);
      }

      railLinks.forEach(function (link, n) {
        link.classList.toggle('is-current', !!FLOORS[n + 1] && FLOORS[n + 1].id === activeFloor);
      });
    }

    /* -- copy cards arrive as they reach the middle of the screen -- */
    for (var n = 0; n < beats.length; n++) {
      var bi = +beats[n].getAttribute('data-beat');
      var e = Math.max(0, 1 - Math.abs(bi - u));
      beats[n].style.setProperty('--enter', r2(smooth(e)));
    }

    /* -- altimeter reads straight off the camera height -- */
    var centre = cy + ch / 2;
    var metres = Math.max(0, Math.round(
      (WORLD.ground - centre) / (WORLD.ground - WORLD.beacon) * WORLD.metres
    ));
    if (altVal) altVal.textContent = metres < 100 ? ('00' + metres).slice(-3) : metres;
    if (altBar) altBar.style.setProperty('--h', r2(p * 100) + '%');

    if (altimeter) altimeter.classList.toggle('is-on', p > 0.015 && p < 0.995);
    if (rail) rail.classList.toggle('is-on', p > 0.05 && p < 0.95);

    /* -- pointer parallax, eased toward the target -- */
    if (!settled && dioramaHost) {
      haveRx += (wantRx - haveRx) * 0.09;
      haveRy += (wantRy - haveRy) * 0.09;
      dioramaHost.style.setProperty('--rx', r2(haveRx) + 'deg');
      dioramaHost.style.setProperty('--ry', r2(haveRy) + 'deg');
      if (Math.abs(wantRx - haveRx) < 0.02 && Math.abs(wantRy - haveRy) < 0.02) {
        settled = true;
      }
    }
  }

  /* ---------------------------------------------------------- ticking */
  var frame = null;

  function run() {
    frame = null;
    update();
    if (!settled) request();
  }

  function request() {
    if (frame === null) frame = window.requestAnimationFrame(run);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); request(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { measure(); request(); }, 120);
  });

  /* pause instruments while the tab is in the background */
  document.addEventListener('visibilitychange', function () {
    if (!instruments) return;
    if (document.hidden) instruments.stopAll();
    else if (activeFloor) instruments.start(activeFloor);
  });

  /* ---------------------------------------------------------- reveals */
  var revealables = toArray(document.querySelectorAll('.reveal'));

  if ('IntersectionObserver' in window && !calm) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------------------------------------------------------- go */
  measure();
  update();

  /* re-measure once fonts and layout have settled */
  window.addEventListener('load', function () { measure(); request(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); request(); });
  }
})();
