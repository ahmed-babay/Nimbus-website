/* ============================================================
   Nimbus - the scroll engine.

   Scroll position drives one number, `u`, measured in beats.
   Everything else is derived from it:

     - the orb's palette (interpolated between adjacent beats)
     - plasma intensity: calm between beats, surging on each
     - --beam / --beam-2, so page accents drift with the core
     - each panel's arrival
     - the rail and the HUD

   Beat positions are measured, not assumed, so a panel whose
   copy runs taller than the viewport still lines up with its
   own moment in the score.

   IntersectionObserver handles one-shot content reveals.
   ============================================================ */

(function () {
  'use strict';

  var doc = document.documentElement;
  var BEATS = window.NIMBUS_BEATS || [];
  var LAST = BEATS.length - 1;
  if (LAST < 1) return;

  var calm = window.matchMedia &&
             window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- elements */
  var stack = document.getElementById('stack');
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('orb');
  var hud = document.getElementById('hud');
  var hudBeat = document.getElementById('hudBeat');
  var hudMeter = document.getElementById('hudMeter');
  var hudCharge = document.getElementById('hudCharge');
  var rail = document.getElementById('rail');

  if (!stack || !canvas) return;

  function toArray(list) { return Array.prototype.slice.call(list); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function r2(n) { return Math.round(n * 100) / 100; }

  var panels = toArray(document.querySelectorAll('.beat'));
  var railLinks = rail ? toArray(rail.querySelectorAll('a')) : [];

  /* ---------------------------------------------------------- the orb */
  var orb = window.NimbusOrb ? window.NimbusOrb.create(canvas) : null;

  /* ---------------------------------------------------------- measure */
  var anchors = [];
  var vh = 1;

  function measure() {
    vh = window.innerHeight || doc.clientHeight;
    var pageTop = window.pageYOffset || doc.scrollTop || 0;

    anchors.length = 0;
    for (var i = 0; i < panels.length; i++) {
      var r = panels[i].getBoundingClientRect();
      anchors.push(r.top + pageTop + r.height / 2 - vh / 2);
    }
    for (var j = 1; j < anchors.length; j++) {
      if (anchors[j] <= anchors[j - 1]) anchors[j] = anchors[j - 1] + 1;
    }
    if (orb) orb.resize();
  }

  /* where a scroll position sits along the score, in beats */
  function positionAt(y) {
    if (!anchors.length) return 0;
    if (y <= anchors[0]) return 0;
    if (y >= anchors[LAST]) return LAST;
    var i = 0;
    while (i < LAST && y > anchors[i + 1]) i++;
    var lo = anchors[i], hi = anchors[i + 1];
    return i + (y - lo) / Math.max(1, hi - lo);
  }

  /* ---------------------------------------------------------- update */
  var mix = { beam: [0, 0, 0], arc: [0, 0, 0], core: [0, 0, 0] };
  var current = -1;
  var lastY = 0;

  function blend(a, b, t, into) {
    into[0] = lerp(a[0], b[0], t);
    into[1] = lerp(a[1], b[1], t);
    into[2] = lerp(a[2], b[2], t);
  }

  function css(c) { return (c[0] | 0) + ' ' + (c[1] | 0) + ' ' + (c[2] | 0); }

  function update() {
    var y = window.pageYOffset || doc.scrollTop || 0;
    var u = positionAt(y);
    var p = u / LAST;

    /* -- palette: blend the two beats we sit between -- */
    var i = clamp(Math.floor(u), 0, LAST - 1);
    var t = smooth(u - i);
    var A = BEATS[i], B = BEATS[i + 1];

    blend(A.pal.beam, B.pal.beam, t, mix.beam);
    blend(A.pal.arc, B.pal.arc, t, mix.arc);
    blend(A.pal.core, B.pal.core, t, mix.core);

    doc.style.setProperty('--beam', css(mix.beam));
    doc.style.setProperty('--beam-2', css(mix.arc));

    /* -- intensity: quiet between beats, full charge on one -- */
    var near = Math.round(u);
    var off = Math.abs(u - near);
    var peak = Math.pow(clamp(1 - off * 2, 0, 1), 1.5);
    var charge = lerp(A.charge, B.charge, t);
    var intensity = charge * lerp(0.42, 1, peak);

    /* the core sits high and central on the opening and closing
       beats, and slides aside for the feature panels between */
    var aim = clamp(Math.min(u, LAST - u), 0, 1);
    if (orb) orb.set(mix, intensity, aim);

    /* -- scrolling hard whips the storm up -- */
    var dy = Math.abs(y - lastY);
    lastY = y;
    if (orb && dy > 4) orb.surge(Math.min(0.3, dy / 1100));

    /* -- panels arrive as they reach the middle of the screen -- */
    for (var n = 0; n < panels.length; n++) {
      var e = Math.max(0, 1 - Math.abs(n - u));
      panels[n].style.setProperty('--enter', r2(smooth(e)));
    }

    /* -- rail and HUD -- */
    if (near !== current) {
      current = near;
      for (var k = 0; k < railLinks.length; k++) {
        railLinks[k].classList.toggle('is-current', k === near);
      }
      if (hudBeat) hudBeat.textContent = BEATS[near].label.toUpperCase();
    }

    if (hudMeter) hudMeter.style.setProperty('--w', r2(p * 100) + '%');
    if (hudCharge) {
      hudCharge.textContent = ('00' + Math.round(intensity * 100)).slice(-3) + '%';
    }

    if (hud) hud.classList.toggle('is-on', p > 0.004);
    if (rail) rail.classList.toggle('is-on', p > 0.004);
  }

  /* ---------------------------------------------------------- ticking */
  var frame = null;

  function run() { frame = null; update(); }

  /* Re-request rather than skip: guarding with "only if nothing is
     pending" means one dropped frame leaves the flag set and every
     later scroll is ignored for good. */
  function request() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(run);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); request(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { measure(); request(); }, 150);
  });

  /* ---------------------------------------------------------- orb life */
  /* Run the core only while it is on screen, and never while the
     tab is in the background. */
  var stageVisible = true;

  function syncOrb() {
    if (!orb) return;
    if (stageVisible && !document.hidden) orb.start();
    else orb.stop();
  }

  if ('IntersectionObserver' in window && stage) {
    new IntersectionObserver(function (entries) {
      stageVisible = entries[0].isIntersecting;
      syncOrb();
    }, { threshold: 0 }).observe(stage);
  }

  document.addEventListener('visibilitychange', syncOrb);

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
  /* An anchor would put a panel's top at the viewport top, which
     only matches its beat when the panel is exactly one screen
     tall. Scroll to the measured anchor instead. */
  toArray(document.querySelectorAll('a[href^="#beat-"]')).forEach(function (link) {
    link.addEventListener('click', function (ev) {
      var id = link.getAttribute('href').slice(1);
      var n = -1;
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].id === id) { n = i; break; }
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
  lastY = window.pageYOffset || 0;
  update();
  syncOrb();

  window.addEventListener('load', function () { measure(); request(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); request(); });
  }
})();
