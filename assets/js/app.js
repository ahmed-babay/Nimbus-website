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
  /* One anchor per beat: the scroll position at which that beat sits
     dead centre in the viewport, which is where its camera stop
     belongs. Measured rather than assumed, because a beat whose copy
     is taller than the viewport grows past 100vh and would otherwise
     drift out of step with the camera. */
  var anchors = [];
  var vh = 1;

  function measure() {
    vh = window.innerHeight || doc.clientHeight;
    var pageTop = window.pageYOffset || doc.scrollTop || 0;

    anchors.length = 0;
    for (var i = 0; i < beats.length; i++) {
      var r = beats[i].getBoundingClientRect();
      anchors.push(r.top + pageTop + r.height / 2 - vh / 2);
    }
    /* must be strictly increasing for the search below */
    for (var j = 1; j < anchors.length; j++) {
      if (anchors[j] <= anchors[j - 1]) anchors[j] = anchors[j - 1] + 1;
    }
  }

  /* where along the flight plan a given scroll position sits, in
     floor units: 0 at the first beat, LAST at the last */
  function positionAt(y) {
    if (!anchors.length) return 0;
    if (y <= anchors[0]) return 0;
    if (y >= anchors[LAST]) return LAST;
    var i = 0;
    while (i < LAST && y > anchors[i + 1]) i++;
    var lo = anchors[i], hi = anchors[i + 1];
    return i + (y - lo) / Math.max(1, hi - lo);
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
    var u = positionAt(y);                  /* position in floor units */
    var p = LAST ? u / LAST : 0;

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

  /* ---------------------------------------------------------- jump links */
  /* Anchor navigation would put a beat's top at the viewport top,
     which only matches the camera stop when the beat is exactly one
     screen tall. Scroll to the measured anchor instead. */
  toArray(document.querySelectorAll('a[href^="#beat-"]')).forEach(function (link) {
    link.addEventListener('click', function (ev) {
      var id = link.getAttribute('href').slice(1);
      var n = -1;
      for (var i = 0; i < beats.length; i++) {
        if (beats[i].id === id) { n = i; break; }
      }
      if (n < 0) return;
      ev.preventDefault();
      measure();
      window.scrollTo({
        top: Math.max(0, anchors[n]),
        behavior: calm ? 'auto' : 'smooth'
      });
    });
  });

  /* ---------------------------------------------------------- go */
  measure();
  update();

  /* re-measure once fonts and layout have settled */
  window.addEventListener('load', function () { measure(); request(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); request(); });
  }
})();
