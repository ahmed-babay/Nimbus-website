/* ============================================================
   Nimbus - the score.

   One entry per scroll beat. `pal` is the orb's palette for
   that beat; app.js interpolates between consecutive entries
   as you scroll, so the core drifts through the spectrum
   rather than cutting between colours.

     beam  the dominant colour: outer glow, rim, page accents
     arc   the lightning itself
     core  the white-hot centre
     dark  0 by default; 1 paints a dark mass over the plasma, so
           the core reads black with the storm raging around it

   `charge` is the baseline plasma intensity for the beat, before
   the per-beat surge and the scroll-velocity boost are added.
   ============================================================ */

window.NIMBUS_BEATS = [
  {
    id: 'open', no: '', label: 'Core',
    charge: 0.62,
    /* the opening core is white - it takes on colour as you scroll */
    pal: { beam: [242, 247, 255], arc: [252, 253, 255], core: [255, 255, 255] }
  },
  {
    id: 'voice', no: '01', label: 'Voice',
    charge: 0.58,
    pal: { beam: [34, 205, 238], arc: [130, 240, 252], core: [226, 253, 255] }
  },
  {
    id: 'intent', no: '02', label: 'Intent',
    charge: 0.60,
    pal: { beam: [139, 92, 246], arc: [198, 162, 255], core: [240, 232, 255] }
  },
  {
    id: 'signals', no: '03', label: 'Signals',
    charge: 0.56,
    pal: { beam: [45, 212, 191], arc: [134, 246, 226], core: [226, 255, 250] }
  },
  {
    id: 'wire', no: '04', label: 'Wire',
    charge: 0.80,
    pal: { beam: [245, 158, 11], arc: [255, 206, 122], core: [255, 246, 222] }
  },
  {
    id: 'recall', no: '05', label: 'Recall',
    charge: 0.55,
    pal: { beam: [99, 102, 241], arc: [167, 170, 255], core: [233, 235, 255] }
  },
  {
    id: 'room', no: '06', label: 'Room',
    charge: 0.66,
    pal: { beam: [217, 70, 239], arc: [246, 162, 255], core: [255, 236, 255] }
  },
  {
    id: 'local', no: '07', label: 'Local',
    charge: 0.52,
    pal: { beam: [16, 217, 160], arc: [124, 250, 208], core: [226, 255, 246] }
  },
  {
    id: 'close', no: '', label: 'Ignition',
    charge: 1.00,
    dark: 1,
    pal: { beam: [104, 124, 168], arc: [188, 208, 244], core: [230, 240, 255] }
  }
];
