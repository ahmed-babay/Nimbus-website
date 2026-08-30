/* ============================================================
   Nimbus - the formation.

   A one-shot opening sequence: the core is assembled out of
   ambient light before the hero appears.

   distributed energy -> attraction -> vortex -> shell ->
   compression -> ignition -> the real orb takes over.

   How it works
   ------------
   One WebGL draw call: a single gl.POINTS buffer with a custom
   vertex shader. No positions are ever updated on the CPU - the
   whole flight path is a closed-form function of one uniform,
   uProgress, plus per-particle attributes (delay, strength,
   depth, variety, its own seat on the final shell). That is what
   keeps several thousand particles cheap.

   The path is computed in polar coordinates around the core.
   Interpolating radius and angle separately - with the angle
   given extra winding on the way in - is what produces flowing
   arcs rather than the dead radial spokes you get from lerping
   xy. Radius and angle use different easings, so particles
   overshoot and orbit before settling.

   Every particle reaches the shell at the same instant, whatever
   its delay, so the sphere assembles cleanly and then collapses.

   The shell radius is read from the live orb via
   NimbusOrb.current().metrics(), so the particles land on exactly
   the centre and radius the real core occupies.
   ============================================================ */

window.NimbusFormation = (function () {
  'use strict';

  var DURATION = 3000;     /* ms of particle sequence */
  var SHELL_AT = 0.86;     /* progress at which the shell is whole */

  /* ---------------------------------------------------------- shaders */
  var VERT = [
    'precision highp float;',

    'attribute vec2 aStart;',
    'attribute vec3 aShell;',
    'attribute vec3 aSeed;',
    'attribute vec4 aParam;',   /* x delay  y strength  z depth  w variety */
    'attribute vec3 aColor;',

    'uniform vec2  uRes;',
    'uniform vec2  uCenter;',
    'uniform float uRadius;',
    'uniform float uProgress;',
    'uniform float uTime;',
    'uniform float uDpr;',
    'uniform vec2  uMouse;',
    'uniform float uMouseOn;',

    'varying vec3  vColor;',
    'varying float vBright;',

    'const float PI  = 3.14159265;',
    'const float TAU = 6.28318531;',

    /* cheap divergence-free-ish flow: enough to read as suspended
       dust without paying for real simplex noise */
    'vec2 flow(vec2 p, float t, vec3 s) {',
    '  float a = sin(p.x * 0.0090 + t * 0.62 + s.x * TAU)',
    '          + sin(p.y * 0.0131 - t * 0.44 + s.y * TAU);',
    '  float b = cos(p.y * 0.0083 - t * 0.55 + s.z * TAU)',
    '          + cos(p.x * 0.0117 + t * 0.37 + s.x * 3.7);',
    '  return vec2(a, b);',
    '}',

    'void main() {',
    '  float delay   = mix(0.16, 0.34, aParam.x);',
    '  float depth   = aParam.z;',
    '  float variety = aParam.w;',

    /* every particle lands on the shell at the same moment */
    '  float span = max(0.0001, ' + SHELL_AT.toFixed(2) + ' - delay);',
    '  float t    = clamp((uProgress - delay) / span, 0.0, 1.0);',

    /* how far out it started, as a fraction of the screen */
    '  vec2  dStart = aStart - uCenter;',
    '  float far    = clamp(length(dStart) / (length(uRes) * 0.55), 0.0, 1.0);',

    /* distant particles hang back, then accelerate inward */
    '  float eR = pow(t, mix(0.95, 1.65, far) * mix(1.10, 0.86, aParam.y));',
    '  float eA = pow(t, mix(1.30, 0.88, depth));',

    /* --- start, plus ambient drift that dies off as it commits --- */
    '  vec2 drift = flow(aStart, uTime, aSeed) * mix(9.0, 27.0, depth);',
    '  vec2 p0    = aStart + drift * (1.0 - eR * 0.85);',

    '  vec2  d0 = p0 - uCenter;',
    '  float r0 = length(d0);',
    '  float a0 = atan(d0.y, d0.x);',

    /* --- its seat on the shell, turning with the core --- */
    '  float sp = uTime * 0.22;',
    '  vec3  sh = vec3(aShell.x * cos(sp) + aShell.z * sin(sp),',
    '                  aShell.y,',
    '                 -aShell.x * sin(sp) + aShell.z * cos(sp));',
    '  vec2  shellXY = sh.xy * uRadius;',
    '  float rEnd    = length(shellXY);',
    '  float aEnd    = atan(shellXY.y, shellXY.x);',

    /* --- angle: spiral in, landing exactly on the shell angle --- */
    '  float dA   = mod(aEnd - a0 + PI, TAU) - PI;',
    '  float band = sin(a0 * 3.0 + aSeed.y * 1.2);',
    '  float dir  = band >= 0.0 ? 1.0 : -1.0;',
    '  float turn = TAU * (0.26 + 0.50 * far + 0.18 * variety) * dir;',
    '  float ang  = a0 + (dA + turn) * eA;',

    /* --- radius: converge, some overshooting and orbiting --- */
    '  float over = sin(eR * PI) * uRadius * (variety - 0.5) * 0.85;',
    '  float rad  = mix(r0, rEnd, eR) + over;',

    /* --- final compression into the core --- */
    '  float col = smoothstep(' + SHELL_AT.toFixed(2) + ', 1.0, uProgress);',
    '  rad *= 1.0 - col * 0.93;',

    '  vec2 pos = uCenter + vec2(cos(ang), sin(ang)) * rad;',

    /* --- a light touch from the pointer, only while gathering --- */
    '  vec2  md  = pos - uMouse;',
    '  float mdl = length(md) + 0.0001;',
    '  float push = uMouseOn * (1.0 - eR) * (0.30 + depth * 0.70)',
    '             * 34.0 * exp(-mdl * mdl / 19000.0);',
    '  pos += (md / mdl) * push;',

    '  vec2 clip = (pos / uRes) * 2.0 - 1.0;',
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',

    '  float sz = mix(1.00, 3.30, variety) * (0.45 + depth * 1.25);',
    '  sz *= 1.0 + 1.20 * smoothstep(0.80, 0.98, uProgress);',
    '  sz *= 1.0 - col * 0.55;',
    '  gl_PointSize = max(1.0, sz * uDpr);',

    '  float tw = 0.78 + 0.22 * sin(uTime * mix(0.8, 2.4, variety) + aSeed.x * TAU);',
    '  vBright = (0.45 + depth * 1.05) * tw',
    '          * (0.50 + 0.80 * smoothstep(0.0, 0.55, t))',
    '          * (1.0 + 1.60 * smoothstep(0.86, 0.99, uProgress));',
    '  vColor  = aColor;',
    '}'
  ].join('\n');

  /* Soft round sprite with a tight hot centre. Overlapping these
     additively is what gives the bloom - no postprocessing pass. */
  var FRAG = [
    'precision mediump float;',
    'varying vec3  vColor;',
    'varying float vBright;',
    'uniform float uFade;',
    'void main() {',
    '  vec2  d = gl_PointCoord - 0.5;',
    '  float r = dot(d, d) * 4.0;',
    '  if (r > 1.0) discard;',
    '  float a    = 1.0 - r;',
    '  float glow = a * a * 0.55 + pow(a, 8.0) * 1.5;',
    '  gl_FragColor = vec4(vColor * glow * vBright * uFade, 1.0);',
    '}'
  ].join('\n');

  /* ---------------------------------------------------------- helpers */
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  /* ---------------------------------------------------------- field */
  /* Clustered, not uniform: a scatter of soft clouds plus a loose
     background sprinkle. Uniform random reads as confetti. */
  function build(n, W, H) {
    var start = new Float32Array(n * 2);
    var shell = new Float32Array(n * 3);
    var seed  = new Float32Array(n * 3);
    var param = new Float32Array(n * 4);
    var color = new Float32Array(n * 3);

    /* Tight, stretched clumps. Round clouds of even size average
       out into a starfield; anisotropic ones leave visible wisps. */
    var clouds = [];
    var m = Math.min(W, H);
    for (var c = 0; c < 17; c++) {
      var ang = Math.random() * Math.PI;
      clouds.push({
        x: (Math.random() * 1.26 - 0.13) * W,
        y: (Math.random() * 1.26 - 0.13) * H,
        a: (0.030 + Math.random() * 0.115) * m,
        b: (0.010 + Math.random() * 0.045) * m,
        c: Math.cos(ang),
        s: Math.sin(ang)
      });
    }

    /* the site's own opening palette: blue, cyan, violet, soft white */
    var hues = [
      [0.31, 0.49, 1.00], [0.31, 0.49, 1.00], [0.31, 0.49, 1.00],
      [0.13, 0.80, 0.93], [0.13, 0.80, 0.93],
      [0.55, 0.36, 0.96], [0.55, 0.36, 0.96],
      [0.86, 0.90, 1.00], [0.86, 0.90, 1.00]
    ];

    for (var i = 0; i < n; i++) {
      var x, y;
      if (Math.random() < 0.70) {
        var cl = clouds[(Math.random() * clouds.length) | 0];
        var gx = gauss() * cl.a, gy = gauss() * cl.b;
        x = cl.x + gx * cl.c - gy * cl.s;
        y = cl.y + gx * cl.s + gy * cl.c;
      } else {
        x = (Math.random() * 1.24 - 0.12) * W;
        y = (Math.random() * 1.24 - 0.12) * H;
      }
      start[i * 2]     = x;
      start[i * 2 + 1] = y;

      /* uniform point on the sphere: projected, this reads as a
         shell because the density piles up toward the limb */
      var u = Math.random() * 2 - 1;
      var th = Math.random() * Math.PI * 2;
      var s2 = Math.sqrt(1 - u * u);
      shell[i * 3]     = s2 * Math.cos(th);
      shell[i * 3 + 1] = s2 * Math.sin(th);
      shell[i * 3 + 2] = u;

      seed[i * 3]     = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();

      /* depth is biased toward the back, so most of the field is
         small and dim and only some of it comes forward */
      var depth = Math.pow(Math.random(), 1.15);

      param[i * 4]     = Math.random();          /* delay   */
      param[i * 4 + 1] = Math.random();          /* strength */
      param[i * 4 + 2] = depth;
      param[i * 4 + 3] = Math.random();          /* variety */

      var h = hues[(Math.random() * hues.length) | 0];
      var j = 0.82 + Math.random() * 0.30;       /* brightness jitter */
      color[i * 3]     = h[0] * j;
      color[i * 3 + 1] = h[1] * j;
      color[i * 3 + 2] = h[2] * j;
    }

    return { start: start, shell: shell, seed: seed, param: param, color: color };
  }

  /* ---------------------------------------------------------- run */
  function start() {
    var doc = document.documentElement;

    function release() { doc.classList.remove('is-intro'); }

    var calm = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) { release(); return; }

    var orb = window.NimbusOrb && window.NimbusOrb.current
            ? window.NimbusOrb.current() : null;
    if (!orb || !orb.metrics) { release(); return; }

    var canvas = document.createElement('canvas');
    canvas.className = 'formation';
    canvas.setAttribute('aria-hidden', 'true');

    var gl = null;
    try {
      var attrs = { alpha: true, antialias: false, depth: false,
                    premultipliedAlpha: true, powerPreference: 'high-performance' };
      gl = canvas.getContext('webgl', attrs) ||
           canvas.getContext('experimental-webgl', attrs);
    } catch (e) { gl = null; }
    if (!gl) { release(); return; }

    document.body.appendChild(canvas);

    /* ---- program ---- */
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    var prog = vs && fs ? gl.createProgram() : null;
    if (prog) {
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null;
    }
    if (!prog) { cleanup(); release(); return; }
    gl.useProgram(prog);

    /* ---- field ---- */
    var W = window.innerWidth, H = window.innerHeight;
    var narrow = W < 992 || (window.matchMedia &&
                 window.matchMedia('(pointer: coarse)').matches);
    var COUNT = narrow ? 4200 : 14000;
    var dprCap = narrow ? 1.5 : 2;

    var data = build(COUNT, W, H);
    var buffers = [];

    function attrib(name, arr, size) {
      var loc = gl.getAttribLocation(prog, name);
      if (loc < 0) return;
      var buf = gl.createBuffer();
      buffers.push(buf);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }

    attrib('aStart', data.start, 2);
    attrib('aShell', data.shell, 3);
    attrib('aSeed',  data.seed,  3);
    attrib('aParam', data.param, 4);
    attrib('aColor', data.color, 3);

    var U = {};
    ['uRes', 'uCenter', 'uRadius', 'uProgress', 'uTime',
     'uDpr', 'uMouse', 'uMouseOn', 'uFade'].forEach(function (k) {
      U[k] = gl.getUniformLocation(prog, k);
    });

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);          /* additive, premultiplied */
    gl.clearColor(0, 0, 0, 0);

    var dpr = 1;
    function size() {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uDpr, dpr);
    }
    size();
    window.addEventListener('resize', size);

    /* ---- pointer: optional, the sequence never depends on it ---- */
    var mx = -9999, my = -9999, mouseOn = 0;
    function onMove(e) { mx = e.clientX; my = e.clientY; mouseOn = 1; }
    if (!narrow) window.addEventListener('mousemove', onMove, { passive: true });

    /* ---- timeline ---- */
    var t0 = -1;   /* -1, not 0: a first timestamp of exactly 0 would
                      otherwise look unset and re-anchor every frame */
    var raf = null;
    var done = false;
    var ignited = false;
    var released = false;

    /* If rAF never runs - a backgrounded tab at load, say - the hero
       must not stay hidden. Finish regardless. */
    var failsafe = setTimeout(finish, DURATION + 1500);

    function frame(now) {
      raf = null;
      if (t0 < 0) t0 = now;
      var p = Math.min(1, (now - t0) / DURATION);

      var m = orb.metrics();

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uCenter, m.cx, m.cy);
      gl.uniform1f(U.uRadius, m.r);
      gl.uniform1f(U.uProgress, p);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform2f(U.uMouse, mx, my);
      gl.uniform1f(U.uMouseOn, mouseOn);
      /* hold full brightness through the shell, then hand over */
      gl.uniform1f(U.uFade, 1 - Math.pow(Math.max(0, (p - 0.90) / 0.10), 1.4));
      gl.drawArrays(gl.POINTS, 0, COUNT);

      /* the real core rises under the collapsing shell */
      if (!ignited && p >= 0.80) {
        ignited = true;
        doc.classList.add('is-igniting');
      }
      /* hero copy starts arriving on the site's own timing */
      if (!released && p >= 0.90) {
        released = true;
        release();
      }

      if (p < 1) raf = window.requestAnimationFrame(frame);
      else finish();
    }

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(failsafe);
      if (raf !== null) { window.cancelAnimationFrame(raf); raf = null; }
      release();
      doc.classList.add('is-igniting');
      canvas.classList.add('is-done');
      window.setTimeout(cleanup, 600);
    }

    function cleanup() {
      window.removeEventListener('resize', size);
      window.removeEventListener('mousemove', onMove);
      if (gl) {
        buffers.forEach(function (b) { gl.deleteBuffer(b); });
        if (prog) gl.deleteProgram(prog);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        gl = null;
      }
      doc.classList.remove('is-igniting');
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    raf = window.requestAnimationFrame(frame);
  }

  return { start: start };
})();

window.NimbusFormation.start();
