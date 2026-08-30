/* ============================================================
   Nimbus - the core.

   A contained storm, drawn on a 2D canvas. Nothing here is a
   video or a sprite sheet: every arc is generated per frame.

   How it works
   ------------
   Everything lives on a unit sphere in 3D. Filaments and bolts
   are built as 3D polylines, then rotated around Y (the slow
   continuous spin) and X (a fixed tilt) and projected
   orthographically. A point's z tells us whether it is on the
   near or far side, which drives its brightness - so the core
   genuinely reads as rotating rather than as a flat swirl.

   Bolts are fractal: take two points on the sphere, displace
   the midpoint, recurse. Each generation halves the
   displacement, which is what gives lightning its
   self-similar kink.

   Glow is done with two strokes - a wide dim pass and a narrow
   bright one - under `lighter` compositing. That is far cheaper
   than shadowBlur and looks better.
   ============================================================ */

window.NimbusOrb = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* uniform point on the unit sphere */
  function onSphere() {
    var u = Math.random() * 2 - 1;
    var t = Math.random() * TAU;
    var s = Math.sqrt(1 - u * u);
    return [s * Math.cos(t), s * Math.sin(t), u];
  }

  function scaleTo(p, r) {
    var m = Math.hypot(p[0], p[1], p[2]) || 1;
    var k = r / m;
    p[0] *= k; p[1] *= k; p[2] *= k;
    return p;
  }

  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }

  /* ---------------------------------------------------------- bolts */
  /* Recursive midpoint displacement between two points, with each
     vertex pushed back onto a shell so the bolt stays inside the
     sphere instead of ballooning out of it. */
  function fracture(a, b, depth, amp, out) {
    if (depth <= 0) { out.push(b); return; }
    var m = [
      (a[0] + b[0]) / 2 + rand(-amp, amp),
      (a[1] + b[1]) / 2 + rand(-amp, amp),
      (a[2] + b[2]) / 2 + rand(-amp, amp)
    ];
    var shell = clamp((Math.hypot(a[0], a[1], a[2]) + Math.hypot(b[0], b[1], b[2])) / 2
                      + rand(-0.14, 0.10), 0.24, 0.99);
    scaleTo(m, shell);
    fracture(a, m, depth - 1, amp * 0.54, out);
    fracture(m, b, depth - 1, amp * 0.54, out);
  }

  function makeBolt(nearBias) {
    var a = onSphere();
    var b = onSphere();

    /* keep the two ends within a sensible arc of each other, or the
       bolt just cuts straight through the middle every time */
    var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (dot < -0.15) { b[0] = -b[0]; b[1] = -b[1]; b[2] = -b[2]; }

    /* most storms happen where you can see them */
    if (nearBias && a[2] + b[2] < 0) {
      a[2] = -a[2]; b[2] = -b[2];
    }

    scaleTo(a, rand(0.62, 0.99));
    scaleTo(b, rand(0.62, 0.99));

    var pts = [a];
    fracture(a, b, 4, rand(0.30, 0.52), pts);

    return {
      pts: pts,
      born: 0,
      life: rand(110, 290),
      width: rand(0.9, 2.3),
      hot: Math.random() < 0.34,          /* a few strike white-hot */
      branch: Math.random() < 0.42 ? makeBranch(pts) : null
    };
  }

  function makeBranch(pts) {
    var i = 2 + ((Math.random() * (pts.length - 4)) | 0);
    var a = pts[i].slice();
    var b = onSphere();
    scaleTo(b, rand(0.5, 0.98));
    var out = [a];
    fracture(a, b, 3, 0.30, out);
    return out;
  }

  /* ---------------------------------------------------------- filaments */
  /* Long-lived glowing strands. Same fractal, gentler, and they
     drift on their own axis so the interior never settles. */
  function makeFilament() {
    var a = onSphere(), b = onSphere();
    scaleTo(a, rand(0.45, 0.94));
    scaleTo(b, rand(0.45, 0.94));
    var pts = [a];
    fracture(a, b, 3, rand(0.22, 0.40), pts);
    return {
      pts: pts,
      spin: rand(-0.16, 0.16),
      phase: rand(0, TAU),
      pulse: rand(0.5, 1.5),
      life: rand(2600, 6200),
      born: 0,
      width: rand(0.6, 1.5)
    };
  }

  /* ---------------------------------------------------------- factory */
  function create(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var calm = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var W = 0, H = 0, dpr = 1;
    var cx = 0, cy = 0, R = 0;

    var spin = 0;
    var tilt = -0.30;
    var last = 0;
    var raf = null;
    var running = false;

    var bolts = [];
    var filaments = [];
    var motes = [];
    var spawnDebt = 0;

    /* live state, pushed in by app.js */
    var pal = { beam: [79, 124, 255], arc: [155, 195, 255], core: [226, 238, 255] };
    var intensity = 0.6;
    var boost = 0;

    for (var f = 0; f < 16; f++) filaments.push(makeFilament());
    for (var m = 0; m < 90; m++) {
      motes.push({
        p: scaleTo(onSphere(), rand(1.08, 2.5)),
        s: rand(0.5, 1.7),
        a: rand(0.12, 0.7),
        tw: rand(0.4, 2.2),
        ph: rand(0, TAU)
      });
    }

    /* ------------------------------------------------------ layout */
    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var narrow = W < 992;
      if (narrow) {
        cx = W * 0.5;
        cy = H * 0.37;
        R = Math.min(W * 0.40, H * 0.26);
      } else {
        cx = W * 0.39;
        cy = H * 0.5;
        R = Math.min(W * 0.23, H * 0.36);
      }
      R = Math.max(70, R);
    }

    /* ------------------------------------------------------ project */
    /* rotate around Y (spin), then X (fixed tilt), then drop z */
    var sinY = 0, cosY = 1, sinX = 0, cosX = 1;

    function refreshRotation() {
      sinY = Math.sin(spin); cosY = Math.cos(spin);
      sinX = Math.sin(tilt); cosX = Math.cos(tilt);
    }

    var px = 0, py = 0, pz = 0;

    function project(p, extraSpin) {
      var sy = sinY, cyy = cosY;
      if (extraSpin) { sy = Math.sin(spin + extraSpin); cyy = Math.cos(spin + extraSpin); }
      var x = p[0] * cyy + p[2] * sy;
      var z = -p[0] * sy + p[2] * cyy;
      var y = p[1];
      py = y * cosX - z * sinX;
      pz = y * sinX + z * cosX;
      px = x;
    }

    /* ------------------------------------------------------ strokes */
    function strokePath(pts, extraSpin) {
      var zsum = 0;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        project(pts[i], extraSpin);
        zsum += pz;
        var sx = cx + px * R;
        var sy2 = cy + py * R;
        if (i === 0) ctx.moveTo(sx, sy2); else ctx.lineTo(sx, sy2);
      }
      return zsum / pts.length;
    }

    /* depth: 1 on the near face, ~0.18 on the far side */
    function depthFade(z) { return 0.18 + 0.82 * clamp((z + 1) / 2, 0, 1); }

    /* ------------------------------------------------------ frame */
    function draw(dt, now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      refreshRotation();

      var power = clamp(intensity + boost, 0, 1.35);

      /* ---- outer atmosphere ---- */
      ctx.globalCompositeOperation = 'lighter';
      var halo = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 2.5);
      halo.addColorStop(0, rgba(pal.beam, 0.20 + power * 0.16));
      halo.addColorStop(0.35, rgba(pal.beam, 0.07 + power * 0.06));
      halo.addColorStop(1, rgba(pal.beam, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 2.6, cy - R * 2.6, R * 5.2, R * 5.2);

      /* ---- motes drifting around the core ---- */
      for (var i = 0; i < motes.length; i++) {
        var mo = motes[i];
        project(mo.p, 0);
        var tw = 0.55 + 0.45 * Math.sin(now * 0.001 * mo.tw + mo.ph);
        var a = mo.a * tw * depthFade(pz) * (0.4 + power * 0.6);
        ctx.fillStyle = rgba(pal.arc, a);
        ctx.fillRect(cx + px * R - mo.s / 2, cy + py * R - mo.s / 2, mo.s, mo.s);
      }

      /* ---- the sphere body: a dark shell so the plasma is contained ---- */
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();

      var body = ctx.createRadialGradient(
        cx - R * 0.22, cy - R * 0.26, R * 0.05, cx, cy, R);
      body.addColorStop(0, 'rgba(10,16,30,0.86)');
      body.addColorStop(0.62, 'rgba(5,8,17,0.94)');
      body.addColorStop(1, 'rgba(2,4,9,0.99)');
      ctx.fillStyle = body;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      /* ---- filaments ---- */
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (i = filaments.length - 1; i >= 0; i--) {
        var fl = filaments[i];
        fl.born += dt;
        if (fl.born > fl.life) { filaments[i] = makeFilament(); continue; }

        var age = fl.born / fl.life;
        var fade = Math.sin(age * Math.PI);               /* in and out */
        var beatY = 0.6 + 0.4 * Math.sin(now * 0.0016 * fl.pulse + fl.phase);
        var extra = fl.spin * (now * 0.0004);
        var z = strokePath(fl.pts, extra);
        var d = depthFade(z);
        var a = 0.30 * fade * beatY * d * (0.35 + power * 0.75);

        ctx.strokeStyle = rgba(pal.beam, a * 0.5);
        ctx.lineWidth = fl.width * 4.5;
        ctx.stroke();

        ctx.strokeStyle = rgba(pal.arc, a);
        ctx.lineWidth = fl.width;
        ctx.stroke();
      }

      /* ---- bolts ---- */
      for (i = bolts.length - 1; i >= 0; i--) {
        var b = bolts[i];
        b.born += dt;
        if (b.born > b.life) { bolts.splice(i, 1); continue; }

        /* sharp attack, longer decay - lightning does not fade in */
        var t = b.born / b.life;
        var env = t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 1.7);
        var flicker = 0.72 + 0.28 * Math.sin(b.born * 0.09 + b.width * 9);

        var zb = strokePath(b.pts, 0);
        var db = depthFade(zb);
        var ab = env * flicker * db * (0.5 + power * 0.6);
        var hotc = b.hot ? pal.core : pal.arc;

        ctx.strokeStyle = rgba(pal.beam, ab * 0.42);
        ctx.lineWidth = b.width * 7;
        ctx.stroke();

        ctx.strokeStyle = rgba(pal.arc, ab * 0.75);
        ctx.lineWidth = b.width * 2.6;
        ctx.stroke();

        ctx.strokeStyle = rgba(hotc, Math.min(1, ab * 1.15));
        ctx.lineWidth = b.width;
        ctx.stroke();

        if (b.branch) {
          strokePath(b.branch, 0);
          ctx.strokeStyle = rgba(pal.arc, ab * 0.5);
          ctx.lineWidth = b.width * 1.6;
          ctx.stroke();
          ctx.strokeStyle = rgba(hotc, ab * 0.75);
          ctx.lineWidth = b.width * 0.6;
          ctx.stroke();
        }
      }

      /* ---- the white-hot centre ---- */
      var pulse = 0.82 + 0.18 * Math.sin(now * 0.0034) + 0.1 * Math.sin(now * 0.011);
      var cr = R * (0.30 + power * 0.16) * pulse;
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      core.addColorStop(0, rgba(pal.core, 0.75 * (0.5 + power * 0.5)));
      core.addColorStop(0.28, rgba(pal.arc, 0.34 * (0.4 + power * 0.6)));
      core.addColorStop(1, rgba(pal.beam, 0));
      ctx.fillStyle = core;
      ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);

      /* ---- inner rim: light catching the inside of the shell ---- */
      var inner = ctx.createRadialGradient(cx, cy, R * 0.74, cx, cy, R);
      inner.addColorStop(0, rgba(pal.beam, 0));
      inner.addColorStop(1, rgba(pal.beam, 0.30 + power * 0.2));
      ctx.fillStyle = inner;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      ctx.restore();

      /* ---- outer rim line ---- */
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.strokeStyle = rgba(pal.arc, 0.34 + power * 0.24);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, R + 3, 0, TAU);
      ctx.strokeStyle = rgba(pal.beam, 0.16 + power * 0.14);
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
    }

    /* ------------------------------------------------------ loop */
    function tick(now) {
      raf = null;
      if (!last) last = now;
      var dt = Math.min(64, now - last);       /* clamp after a stall */
      last = now;

      spin += dt * 0.00016 * (0.6 + intensity * 0.8);

      /* spawn bolts at a rate set by how charged the core is */
      var rate = (0.9 + Math.pow(clamp(intensity + boost, 0, 1.4), 2) * 11) / 1000;
      spawnDebt += dt * rate;
      while (spawnDebt >= 1) {
        spawnDebt -= 1;
        if (bolts.length < 26) bolts.push(makeBolt(Math.random() < 0.78));
      }

      boost *= Math.pow(0.9, dt / 16.7);       /* scroll surge decays */

      draw(dt, now);
      if (running) raf = window.requestAnimationFrame(tick);
    }

    /* A single considered frame for people who asked for less
       motion: same core, same palette, just not alive. */
    function still() {
      bolts.length = 0;
      for (var i = 0; i < 7; i++) {
        var b = makeBolt(true);
        b.born = b.life * 0.22;
        bolts.push(b);
      }
      for (i = 0; i < filaments.length; i++) filaments[i].born = filaments[i].life * 0.5;
      draw(16, 1200);
    }

    return {
      resize: function () {
        resize();
        if (calm) still();
      },

      set: function (nextPal, nextIntensity) {
        pal = nextPal;
        intensity = nextIntensity;
        if (calm) still();
      },

      surge: function (amount) {
        if (calm) return;
        boost = Math.min(0.55, boost + amount);
      },

      start: function () {
        if (calm || running) return;
        running = true;
        last = 0;
        raf = window.requestAnimationFrame(tick);
      },

      stop: function () {
        running = false;
        if (raf !== null) { window.cancelAnimationFrame(raf); raf = null; }
      },

      isCalm: function () { return calm; }
    };
  }

  return { create: create };
})();
