/* ============================================================
   Nimbus - the instruments.

   Each builder returns { start, stop }. app.js runs only the
   instrument on the floor you are actually looking at, so
   nothing burns cycles behind a closed door.
   ============================================================ */

window.NimbusInstruments = (function () {
  'use strict';

  var CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:+-.';
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pad(s, n) {
    s = String(s).toUpperCase().slice(0, n);
    while (s.length < n) s += ' ';
    return s;
  }

  /* ---------------------------------------------------------- split-flap */
  function buildFlapBoard(host, rowsHost) {
    if (!rowsHost) return null;

    var DEPS = window.NIMBUS_DEPARTURES || [];
    var VISIBLE = 4;
    var W = { dest: 14, time: 5, stat: 7 };
    var rows = [];
    var pending = [];
    var churn = null;
    var cycle = null;
    var offset = 0;

    function makeCells(parent, n, extraClass) {
      var cells = [];
      for (var i = 0; i < n; i++) {
        var s = document.createElement('span');
        s.className = 'flap' + (extraClass ? ' ' + extraClass : '');
        s.textContent = ' ';
        parent.appendChild(s);
        cells.push(s);
      }
      return cells;
    }

    for (var r = 0; r < VISIBLE; r++) {
      var row = document.createElement('div');
      row.className = 'flaprow';

      var cDest = document.createElement('span'); cDest.className = 'flapcell';
      var cTime = document.createElement('span'); cTime.className = 'flapcell flapcell--r';
      var cStat = document.createElement('span'); cStat.className = 'flapcell flapcell--r';

      row.appendChild(cDest); row.appendChild(cTime); row.appendChild(cStat);
      rowsHost.appendChild(row);

      rows.push({
        dest: makeCells(cDest, W.dest),
        time: makeCells(cTime, W.time),
        stat: makeCells(cStat, W.stat)
      });
    }

    /* Queue one cell's worth of flips. Each cell walks the charset
       forward until it lands on its target, which is what gives a
       real board its ripple. */
    function queue(span, target, wait) {
      var cur = span.textContent || ' ';
      if (cur === target) return;
      var from = CHARS.indexOf(cur);
      var to = CHARS.indexOf(target);
      if (from < 0) from = 0;
      if (to < 0) { span.textContent = target; return; }
      pending.push({
        span: span,
        idx: from,
        remaining: (to - from + CHARS.length) % CHARS.length,
        wait: wait
      });
      span.classList.add('is-turning');
    }

    function tick() {
      var alive = false;
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i];
        if (p.remaining <= 0) continue;
        if (p.wait > 0) { p.wait--; alive = true; continue; }
        p.idx = (p.idx + 1) % CHARS.length;
        p.span.textContent = CHARS.charAt(p.idx);
        p.remaining--;
        if (p.remaining <= 0) p.span.classList.remove('is-turning');
        alive = true;
      }
      if (!alive) {
        clearInterval(churn);
        churn = null;
        pending.length = 0;
      }
    }

    function writeRow(r, dep) {
      var row = rows[r];
      var stagger = r * 2;
      var i;
      var dest = pad(dep.dest, W.dest);
      var time = pad(dep.time, W.time);
      var stat = pad(dep.status, W.stat);

      for (i = 0; i < W.dest; i++) queue(row.dest[i], dest.charAt(i), stagger + i);
      for (i = 0; i < W.time; i++) queue(row.time[i], time.charAt(i), stagger + W.dest + i);
      for (i = 0; i < W.stat; i++) {
        row.stat[i].classList.remove('flap--on', 'flap--late');
        row.stat[i].classList.add(dep.late ? 'flap--late' : 'flap--on');
        queue(row.stat[i], stat.charAt(i), stagger + W.dest + W.time + i);
      }

      if (!churn && pending.length) churn = setInterval(tick, 34);
    }

    function paintAll() {
      for (var r = 0; r < VISIBLE; r++) {
        writeRow(r, DEPS[(offset + r) % DEPS.length]);
      }
    }

    /* first paint without the flip, so the board is never blank */
    (function seed() {
      for (var r = 0; r < VISIBLE; r++) {
        var dep = DEPS[r % DEPS.length];
        var row = rows[r], i;
        var dest = pad(dep.dest, W.dest);
        var time = pad(dep.time, W.time);
        var stat = pad(dep.status, W.stat);
        for (i = 0; i < W.dest; i++) row.dest[i].textContent = dest.charAt(i);
        for (i = 0; i < W.time; i++) row.time[i].textContent = time.charAt(i);
        for (i = 0; i < W.stat; i++) {
          row.stat[i].textContent = stat.charAt(i);
          row.stat[i].classList.add(dep.late ? 'flap--late' : 'flap--on');
        }
      }
    })();

    return {
      start: function () {
        if (calm || cycle) return;
        cycle = setInterval(function () {
          offset = (offset + 1) % DEPS.length;
          paintAll();
        }, 4200);
      },
      stop: function () {
        clearInterval(cycle); cycle = null;
        clearInterval(churn); churn = null;
        pending.length = 0;
      }
    };
  }

  /* ---------------------------------------------------------- wire ticker */
  function buildTicker(run) {
    if (!run) return null;
    var items = window.NIMBUS_WIRE || [];

    function render() {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var span = document.createElement('span');
        var tag = document.createElement('em');
        tag.textContent = it.tag;
        span.appendChild(tag);

        if (it.value) {
          span.appendChild(document.createTextNode(it.label + ' ' + it.value));
          var b = document.createElement('b');
          if (!it.up) b.className = 'dn';
          b.textContent = it.move;
          span.appendChild(b);
        } else {
          span.appendChild(document.createTextNode(it.label));
        }
        frag.appendChild(span);
      }
      return frag;
    }

    /* two passes so the -50% translate loops without a seam */
    run.appendChild(render());
    run.appendChild(render());

    return {
      start: function () { run.style.animationPlayState = calm ? 'paused' : 'running'; },
      stop:  function () { run.style.animationPlayState = 'paused'; }
    };
  }

  /* ---------------------------------------------------------- weather dials */
  function buildDials(scope) {
    var needles = scope.querySelectorAll('[data-dial]');
    if (!needles.length) return null;
    var sets = window.NIMBUS_DIALS || {};
    var step = 0;
    var timer = null;

    function advance() {
      step++;
      for (var i = 0; i < needles.length; i++) {
        var key = needles[i].getAttribute('data-dial');
        var seq = sets[key];
        if (!seq || !seq.length) continue;
        needles[i].style.setProperty('--deg', seq[step % seq.length] + 'deg');
      }
    }

    return {
      start: function () {
        if (calm || timer) return;
        advance();
        timer = setInterval(advance, 3200);
      },
      stop: function () { clearInterval(timer); timer = null; }
    };
  }

  /* ---------------------------------------------------------- transcript */
  function buildTranscript(host) {
    if (!host) return null;
    var lines = window.NIMBUS_TRANSCRIPT || [];
    var timers = [];
    var running = false;

    var els = lines.map(function (l, i) {
      var line = document.createElement('span');
      line.className = 'transcript__line';
      var who = document.createElement('span');
      who.className = 'transcript__who' + (i % 2 ? ' transcript__who--b' : '');
      who.textContent = l.who + ' ';
      var body = document.createElement('span');
      line.appendChild(who);
      line.appendChild(body);
      host.appendChild(line);
      return { line: line, who: who, body: body };
    });

    var caret = document.createElement('span');
    caret.className = 'transcript__caret';

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function clearAll() {
      timers.forEach(clearTimeout);
      timers = [];
      els.forEach(function (e) {
        e.body.textContent = '';
        e.line.style.opacity = '0';
      });
    }

    function typeLine(n) {
      if (!running) return;
      if (n >= lines.length) {
        later(function () { clearAll(); if (running) typeLine(0); }, 2600);
        return;
      }
      var e = els[n];
      var text = lines[n].text;
      e.line.style.opacity = '1';
      e.body.appendChild(caret);

      var i = 0;
      (function next() {
        if (!running) return;
        if (i >= text.length) {
          later(function () { typeLine(n + 1); }, 620);
          return;
        }
        e.body.insertBefore(document.createTextNode(text.charAt(i)), caret);
        i++;
        later(next, 34 + Math.random() * 34);
      })();
    }

    /* static, fully-typed state when motion is dialled down */
    function paintStatic() {
      els.forEach(function (e, i) {
        e.body.textContent = lines[i].text;
        e.line.style.opacity = '1';
      });
    }

    if (calm) paintStatic();
    else els.forEach(function (e) { e.line.style.opacity = '0'; });

    return {
      start: function () {
        if (calm || running) return;
        running = true;
        clearAll();
        typeLine(0);
      },
      stop: function () {
        running = false;
        timers.forEach(clearTimeout);
        timers = [];
      }
    };
  }

  /* ---------------------------------------------------------- wiring */
  function init() {
    var map = {};

    function add(floor, inst) {
      if (!inst) return;
      (map[floor] || (map[floor] = [])).push(inst);
    }

    add('ops', buildFlapBoard(
      document.getElementById('flapboard'),
      document.getElementById('flaprows')
    ));

    var weather = document.querySelector('.diorama[data-floor="weather"]');
    if (weather) add('weather', buildDials(weather));

    add('wire', buildTicker(document.getElementById('tickerRun')));
    add('switchboard', buildTranscript(document.getElementById('transcript')));

    /* ticker starts paused so it is not scrolling off-screen */
    Object.keys(map).forEach(function (k) {
      map[k].forEach(function (i) { i.stop(); });
    });

    return {
      start: function (floor) {
        (map[floor] || []).forEach(function (i) { i.start(); });
      },
      stop: function (floor) {
        (map[floor] || []).forEach(function (i) { i.stop(); });
      },
      stopAll: function () {
        Object.keys(map).forEach(function (k) {
          map[k].forEach(function (i) { i.stop(); });
        });
      }
    };
  }

  return { init: init };
})();
