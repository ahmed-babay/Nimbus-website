/* ============================================================
   Nimbus - the flight plan.

   One entry per scroll beat. `cam` is the SVG viewBox the
   camera settles on for that beat; app.js interpolates
   between consecutive entries as you scroll.

   World coordinates: x 0-1200, ground at y 6100, beacon at
   y 276. Smaller y means higher up.
   ============================================================ */

window.NIMBUS_WORLD = {
  ground: 6100,
  beacon: 276,
  metres: 412        /* the beacon, in storey-metres, for the altimeter */
};

window.NIMBUS_FLOORS = [
  {
    id: 'hero', no: '', name: 'Approach',
    cam: { x: -246, y: 5250, w: 1692, h: 1100 }
  },
  {
    id: 'radio', no: '01', name: 'Radio room',
    cam: { x: -30, y: 5297, w: 1240, h: 806 }
  },
  {
    id: 'ops', no: '02', name: 'Ops deck',
    cam: { x: 20, y: 4603, w: 1160, h: 754 }
  },
  {
    id: 'weather', no: '03', name: 'Weather deck',
    cam: { x: -24, y: 3860, w: 1230, h: 800 }
  },
  {
    id: 'wire', no: '04', name: 'Wire room',
    cam: { x: 16, y: 3166, w: 1150, h: 748 }
  },
  {
    id: 'archive', no: '05', name: 'The archive',
    cam: { x: -20, y: 2424, w: 1220, h: 793 }
  },
  {
    id: 'switchboard', no: '06', name: 'Switchboard',
    cam: { x: 24, y: 1730, w: 1140, h: 741 }
  },
  {
    id: 'signal', no: '07', name: 'Signal room',
    cam: { x: -16, y: 990, w: 1200, h: 780 }
  },
  {
    id: 'summit', no: '', name: 'The beacon',
    cam: { x: -154, y: 220, w: 1508, h: 980 }
  }
];

/* Cloud decks, in the order they appear in the SVG.
   `par` is how much of the camera move each deck shares:
   higher means it lags further behind, so it reads as more
   distant. Negative means it outruns the camera - those are
   the wisps that whip past the lens.
   `ref` is the camera altitude at which the deck sits in its
   authored place, so each deck stays put around its own
   altitude instead of being dragged the length of the tower. */
window.NIMBUS_BANDS = [
  { par:  0.40, ref: 700  },
  { par:  0.32, ref: 1900 },
  { par:  0.26, ref: 3300 },
  { par:  0.18, ref: 4600 },
  { par: -0.20, ref: 5400 }
];

/* ---------------------------------------------------------- instruments */

window.NIMBUS_DEPARTURES = [
  { dest: 'FRANKFURT HBF', time: '08:42', status: '+4',      late: true  },
  { dest: 'HEIDELBERG',    time: '08:51', status: 'ON TIME', late: false },
  { dest: 'MAINZ HBF',     time: '09:03', status: '+11',     late: true  },
  { dest: 'ASCHAFFENBURG', time: '09:17', status: 'ON TIME', late: false },
  { dest: 'WIESBADEN HBF', time: '09:26', status: '+2',      late: true  },
  { dest: 'LUISENPLATZ',   time: '09:34', status: 'ON TIME', late: false },
  { dest: 'MANNHEIM HBF',  time: '09:48', status: '+6',      late: true  },
  { dest: 'WORMS',         time: '09:55', status: 'ON TIME', late: false }
];

window.NIMBUS_WIRE = [
  { tag: 'MKT', label: 'NVDA',    value: '174.20', move: '+1.8%', up: true  },
  { tag: 'WIRE', label: 'Transit operator opens real-time feed to third parties' },
  { tag: 'MKT', label: 'BTC',     value: '62,410', move: '-0.4%', up: false },
  { tag: 'WIRE', label: 'WebGPU inference lands in another desktop runtime' },
  { tag: 'MKT', label: 'EURUSD',  value: '1.0842', move: '+0.1%', up: true  },
  { tag: 'REPO', label: 'trending: on-device speech recognition, 4.2k stars today' },
  { tag: 'MKT', label: 'ETH',     value: '2,486',  move: '+2.2%', up: true  },
  { tag: 'WIRE', label: 'Storm front expected over the region after 21:00' },
  { tag: 'MKT', label: 'AAPL',    value: '229.51', move: '-0.7%', up: false },
  { tag: 'TV',  label: '20:15 — feature film, two hours, subtitles available' }
];

window.NIMBUS_TRANSCRIPT = [
  { who: 'SPEAKER 1', text: 'so the migration lands Thursday morning' },
  { who: 'SPEAKER 2', text: 'can we push the review to Friday?' },
  { who: 'SPEAKER 1', text: 'works for me — I will send the notes' },
  { who: 'NIMBUS',    text: 'action item logged: review, Friday' }
];

/* Dial readings the weather deck cycles through.
   deg is needle angle, -60 to +60 across the face. */
window.NIMBUS_DIALS = {
  temp: [-46, -18, 12, 34, -4, 22, -32],
  hum:  [28, -12, 40, 6, -30, 18, 44]
};
