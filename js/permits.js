/* permitpilot-ai logic
 * Pure logic — no DOM access at load time. Loadable in the browser
 * (window/globalThis) and in Node (globalThis.PP).
 *
 * Exports on globalThis.PP:
 *   DISCLAIMER, JOB_TYPES, LOCATION_TYPES, PERMITS,
 *   checkPermits({jobType, locationType}),
 *   documentsFor(permitId), estimateFees(checkResults),
 *   daysUntil(dateStr), expiryStatus(expiryDateStr), expiryText(expiryDateStr),
 *   STATUS_STEPS, STATUS_LABELS, nextStatus(status), neededLabel(needed),
 *   filterPermits(results, query, needed), permitsToCSV(checkResults, permitStates),
 *   applyByDate(permitId, startDateISO), applyByDaysLeft(permitId, startDateISO),
 *   applyByText(permitId, startDateISO), approvalExpiry(approvedDateISO, validityDays),
 *   nextProjectAction(checkResults, permitStates),
 *   permitById(id), jobById(id), locationById(id)
 */
(function (g) {
  'use strict';
  g.PP = g.PP || {};
  var PP = g.PP;

  PP.DISCLAIMER = 'General guidance only — not legal advice. Permit rules vary by city/county. Always verify with your local building department.';

  var JOB_TYPES = [
    { id: 'kitchen-remodel',    name: 'Kitchen remodel' },
    { id: 'bathroom-remodel',   name: 'Bathroom remodel' },
    { id: 'room-addition',      name: 'Room addition' },
    { id: 'new-deck',           name: 'New deck' },
    { id: 'roof-replacement',   name: 'Roof replacement' },
    { id: 'electrical-panel',   name: 'Electrical panel upgrade' },
    { id: 'hvac-replacement',   name: 'HVAC replacement' },
    { id: 'basement-finish',    name: 'Basement finish' },
    { id: 'fence',              name: 'Fence' },
    { id: 'shed-garage',        name: 'Detached shed / garage' },
    { id: 'water-heater',       name: 'Water heater replacement' },
    { id: 'siding-windows',     name: 'Siding / window replacement' }
  ];

  var LOCATION_TYPES = [
    { id: 'residential', name: 'Residential',            desc: 'Standard home in a neighborhood' },
    { id: 'commercial',  name: 'Commercial',             desc: 'Business property' },
    { id: 'rural',       name: 'Rural / agricultural',   desc: 'Farm or acreage' },
    { id: 'historic',    name: 'Historic district',      desc: 'Designated historic area' },
    { id: 'floodplain',  name: 'Floodplain / wetland-adjacent', desc: 'Near water or inside a flood zone' }
  ];

  var PERMITS = [
    { id: 'building',       name: 'Building permit',
      description: 'Covers structural work: framing, additions, and changes to the building envelope.',
      typicalFeeLow: 150, typicalFeeHigh: 800, validityDays: 365, typicalReviewDays: 21 },
    { id: 'electrical',     name: 'Electrical permit',
      description: 'New circuits, panel work, rewiring — signed off by the electrical inspector.',
      typicalFeeLow: 50, typicalFeeHigh: 300, validityDays: 180, typicalReviewDays: 14 },
    { id: 'plumbing',       name: 'Plumbing permit',
      description: 'Moving or adding fixtures, drain/waste/vent changes, gas piping.',
      typicalFeeLow: 50, typicalFeeHigh: 300, validityDays: 180, typicalReviewDays: 14 },
    { id: 'mechanical',     name: 'Mechanical / HVAC permit',
      description: 'Furnace, AC, ductwork, and venting installations.',
      typicalFeeLow: 75, typicalFeeHigh: 350, validityDays: 180, typicalReviewDays: 14 },
    { id: 'roofing',        name: 'Roofing permit',
      description: 'Full roof replacement; many cities inspect decking and underlayment.',
      typicalFeeLow: 75, typicalFeeHigh: 250, validityDays: 180, typicalReviewDays: 10 },
    { id: 'zoning',         name: 'Zoning / land-use approval',
      description: 'Setbacks, height limits, lot coverage — sign-off from planning staff.',
      typicalFeeLow: 100, typicalFeeHigh: 500, validityDays: 365, typicalReviewDays: 30 },
    { id: 'fence',          name: 'Fence permit',
      description: 'Height, material, and placement rules; corner lots often have extra limits.',
      typicalFeeLow: 25, typicalFeeHigh: 150, validityDays: 180, typicalReviewDays: 14 },
    { id: 'grading',        name: 'Grading / erosion control permit',
      description: 'Required when you move significant dirt or change drainage patterns.',
      typicalFeeLow: 100, typicalFeeHigh: 600, validityDays: 365, typicalReviewDays: 21 },
    { id: 'floodplain-dev', name: 'Floodplain development permit',
      description: 'Elevation certificates and flood-proofing review for work in flood zones.',
      typicalFeeLow: 150, typicalFeeHigh: 750, validityDays: 365, typicalReviewDays: 30 },
    { id: 'historic',       name: 'Historic preservation review',
      description: 'Design review board approval for exterior changes in historic districts.',
      typicalFeeLow: 50, typicalFeeHigh: 400, validityDays: 365, typicalReviewDays: 45 },
    { id: 'occupancy',      name: 'Certificate of occupancy / change of use',
      description: 'Commercial spaces need sign-off that the space is safe for its use.',
      typicalFeeLow: 150, typicalFeeHigh: 900, validityDays: 365, typicalReviewDays: 21 },
    { id: 'demolition',     name: 'Demolition permit',
      description: 'Tear-downs and major removals; asbestos/lead surveys usually required.',
      typicalFeeLow: 75, typicalFeeHigh: 400, validityDays: 90, typicalReviewDays: 14 },
    { id: 'septic',         name: 'Septic / well permit',
      description: 'On-site wastewater and water systems, common outside city sewer service.',
      typicalFeeLow: 200, typicalFeeHigh: 800, validityDays: 365, typicalReviewDays: 30 },
    { id: 'right-of-way',   name: 'Right-of-way permit',
      description: 'Work in the public right-of-way: sidewalks, driveways, street crossings.',
      typicalFeeLow: 50, typicalFeeHigh: 200, validityDays: 180, typicalReviewDays: 14 },
  ];

  // Per-job default permit assessments: [permitId, needed, reason].
  var JOB_DEFAULTS = {
    'kitchen-remodel': [
      ['building', 'likely', 'Moving walls, fixtures, or changing the layout almost always triggers a building permit.'],
      ['electrical', 'likely', 'New circuits, outlets, and lighting changes need an electrical permit and inspection.'],
      ['plumbing', 'likely', 'Moving sinks, dishwashers, or gas lines needs a plumbing permit.'],
      ['mechanical', 'maybe', 'Needed if you move ductwork or re-route the range hood vent.']
    ],
    'bathroom-remodel': [
      ['building', 'likely', 'Tear-out to studs, new tile, or fixture relocation usually needs a building permit.'],
      ['plumbing', 'likely', 'Toilet, shower, and tub moves need a plumbing permit and pressure test.'],
      ['electrical', 'maybe', 'GFCI outlets and new lighting circuits need an electrical permit.']
    ],
    'room-addition': [
      ['building', 'likely', 'New conditioned square footage almost always needs a full building permit with structural plans.'],
      ['zoning', 'likely', 'Setbacks, height, and lot-coverage rules are checked for any addition.'],
      ['electrical', 'likely', 'New circuits for the added space need an electrical permit.'],
      ['plumbing', 'maybe', 'A plumbing permit if the addition includes a bathroom or wet bar.'],
      ['grading', 'maybe', 'If the addition changes drainage or requires excavation near a slope.'],
      ['right-of-way', 'maybe', 'If construction staging or a new driveway crosses the public right-of-way.']
    ],
    'new-deck': [
      ['building', 'likely', 'Attached decks, and any deck more than 30 inches off the ground, need a building permit in most cities.'],
      ['zoning', 'maybe', 'Setbacks from property lines are checked for decks.'],
      ['grading', 'maybe', 'If posts and footings disturb a slope or drainage path.']
    ],
    'roof-replacement': [
      ['roofing', 'likely', 'Most cities require a roofing permit for a full tear-off and replacement.'],
      ['building', 'maybe', 'If rotted decking or structural changes are found during tear-off.']
    ],
    'electrical-panel': [
      ['electrical', 'likely', 'Panel swaps must be permitted and inspected before the utility reconnects power.'],
      ['building', 'maybe', 'Some cities roll the panel upgrade into a minor building permit.']
    ],
    'hvac-replacement': [
      ['mechanical', 'likely', 'New furnace, AC, or heat pump equipment needs a mechanical permit.'],
      ['electrical', 'maybe', 'If new circuits or a sub-panel are run for the equipment.']
    ],
    'basement-finish': [
      ['building', 'likely', 'Framing, drywall, and egress windows need a building permit.'],
      ['electrical', 'likely', 'New circuits, outlets, and lighting throughout the finished space.'],
      ['plumbing', 'maybe', 'A plumbing permit if you add a bathroom or wet bar.']
    ],
    'fence': [
      ['fence', 'maybe', 'Many cities require a fence permit, especially over 6 feet tall or on a corner lot.'],
      ['zoning', 'maybe', 'Height and placement rules are checked against the zoning code.']
    ],
    'shed-garage': [
      ['building', 'likely', 'Detached structures above the local size threshold (often 120 sq ft) need a building permit.'],
      ['zoning', 'maybe', 'Setbacks from lot lines are enforced for outbuildings.'],
      ['electrical', 'maybe', 'If the structure is wired, an electrical permit is needed.']
    ],
    'water-heater': [
      ['plumbing', 'likely', 'Gas line, venting, and pressure-relief changes need a plumbing permit and inspection.'],
      ['mechanical', 'maybe', 'If venting routes change, a mechanical sign-off may be needed.']
    ],
    'siding-windows': [
      ['building', 'maybe', 'Window replacement often needs a permit (egress sizes are checked); siding usually only needs registration.']
    ]
  };

  // Location modifiers: {p: permitId, n: needed, r: reason, jobs: '*' or [jobIds]}.
  // A location rule overrides the job default when it applies.
  var LOCATION_RULES = {
    residential: [],
    historic: [
      { p: 'historic', n: 'likely',
        r: 'In a historic district, exterior changes need design review board approval before work starts.',
        jobs: ['roof-replacement', 'new-deck', 'siding-windows', 'room-addition', 'shed-garage', 'fence'] },
      { p: 'building', n: 'likely',
        r: 'Historic districts scrutinize exterior alterations — expect a stricter building permit review.',
        jobs: ['siding-windows'] },
      { p: 'fence', n: 'likely',
        r: 'Historic districts regulate fence style and height closely — a fence permit is likely.',
        jobs: ['fence'] }
    ],
    floodplain: [
      { p: 'floodplain-dev', n: 'likely',
        r: 'Any work in a floodplain needs an elevation certificate and flood-proofing review.',
        jobs: '*' },
      { p: 'grading', n: 'maybe',
        r: 'Floodplain areas watch grading closely to make sure water is not redirected onto neighbors.',
        jobs: '*' }
    ],
    rural: [
      { p: 'fence', n: 'unlikely',
        r: 'Agricultural land typically exempts farm fences from permits — confirm with the county.',
        jobs: ['fence'] },
      { p: 'zoning', n: 'unlikely',
        r: 'Rural counties are usually light on zoning for this kind of work — a quick call confirms it.',
        jobs: ['fence', 'new-deck', 'shed-garage'] },
      { p: 'septic', n: 'maybe',
        r: 'Rural lots often rely on septic — verify the system can handle the project.',
        jobs: '*' }
    ],
    commercial: [
      { p: 'occupancy', n: 'likely',
        r: 'Commercial work usually needs a certificate of occupancy or change-of-use sign-off.',
        jobs: '*' },
      { p: 'zoning', n: 'likely',
        r: 'Commercial sites get close zoning scrutiny for use, parking, and signage.',
        jobs: '*' },
      { p: 'building', n: 'likely',
        r: 'Commercial building permits require stamped drawings in most jurisdictions.',
        jobs: '*' }
    ]
  };

  var DOCUMENTS = {
    building: [
      'Site plan (property lines, setbacks, north arrow)',
      'Floor plans showing the work',
      'Structural drawings (if load-bearing walls change)',
      'Contractor license copy',
      'Contractor insurance certificate',
      'HOA approval letter (if applicable)'
    ],
    electrical: [
      'Load calculation',
      'Panel schedule / circuit list',
      'Electrician license copy',
      'Contractor insurance certificate'
    ],
    plumbing: [
      'Fixture schedule',
      'Plumber license copy',
      'Contractor insurance certificate',
      'Gas line diagram (if gas work is included)'
    ],
    mechanical: [
      'Equipment specifications (make/model)',
      'Manual J load calculation',
      'Contractor license copy'
    ],
    roofing: [
      'Shingle / product specification sheet',
      'Contractor license copy',
      'Contractor insurance certificate',
      'Tear-off disposal plan'
    ],
    zoning: [
      'Site plan with setback measurements',
      'Property survey (recent)',
      'HOA approval letter (if applicable)'
    ],
    fence: [
      'Site plan showing the fence line',
      'Material and height specification',
      'HOA approval letter (if applicable)',
      'Neighbor notification (some cities require it)'
    ],
    grading: [
      'Grading / erosion control plan',
      'Civil engineer stamp',
      'Drainage statement'
    ],
    'floodplain-dev': [
      'Elevation certificate',
      'Flood-proofing details',
      'Licensed engineer stamp'
    ],
    historic: [
      'Historic review application',
      'Photos of existing conditions',
      'Material samples / cut sheets',
      'Design narrative describing the changes'
    ],
    occupancy: [
      'Change-of-use narrative',
      'Fire sprinkler plans',
      'ADA compliance statement',
      'Parking plan'
    ],
    demolition: [
      'Asbestos / lead survey report',
      'Utility disconnect letters',
      'Debris disposal plan'
    ],
    septic: [
      'Soil / perc test report',
      'Septic system design',
      'Well log (if a well is on the property)'
    ],
    'right-of-way': [
      'Traffic control plan',
      'Sidewalk / driveway detail',
      'Bond or insurance for work in the ROW'
    ]
  };

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function permitById(id) { return findById(PERMITS, id); }
  function jobById(id) { return findById(JOB_TYPES, id); }
  function locationById(id) { return findById(LOCATION_TYPES, id); }

  function checkPermits(input) {
    var jobType = (input && input.jobType) || '';
    var locType = (input && input.locationType) || 'residential';
    var job = jobById(jobType);
    var loc = locationById(locType) || locationById('residential');

    var map = {}; // permitId -> {needed, reason}
    if (job && JOB_DEFAULTS[job.id]) {
      JOB_DEFAULTS[job.id].forEach(function (e) {
        map[e[0]] = { needed: e[1], reason: e[2] };
      });
    } else {
      PERMITS.forEach(function (p) {
        map[p.id] = { needed: 'maybe',
          reason: 'We could not match that job type — ask your building department about each of these.' };
      });
    }

    (LOCATION_RULES[loc.id] || []).forEach(function (rule) {
      if (rule.jobs !== '*' && rule.jobs.indexOf(jobType) === -1) return;
      map[rule.p] = { needed: rule.n, reason: rule.r };
    });

    return PERMITS.map(function (p) {
      var e = map[p.id];
      if (!e) {
        e = { needed: 'unlikely',
          reason: 'Unlikely to be needed for this project — confirm with your local building department.' };
      }
      return { permitId: p.id, needed: e.needed, reason: e.reason };
    });
  }

  function documentsFor(permitId) {
    return (DOCUMENTS[permitId] || []).slice();
  }

  function estimateFees(checkResults) {
    var low = 0, high = 0, count = 0;
    (checkResults || []).forEach(function (r) {
      if (r.needed === 'unlikely') return;
      var p = permitById(r.permitId);
      if (!p) return;
      low += p.typicalFeeLow;
      high += p.typicalFeeHigh;
      count++;
    });
    return { low: low, high: high, count: count };
  }

  // Whole days from today (local) to dateStr 'YYYY-MM-DD'. Negative = past. null = invalid.
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
    if (!m) return null;
    var target = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(target.getTime())) return null;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 86400000);
  }

  function expiryStatus(expiryDateStr) {
    var d = daysUntil(expiryDateStr);
    if (d === null) return 'ok';
    if (d < 0) return 'expired';
    if (d <= 30) return 'due-soon';
    return 'ok';
  }

  function expiryText(expiryDateStr) {
    var d = daysUntil(expiryDateStr);
    if (d === null) return '';
    if (d < 0) return 'expired ' + (-d) + (d === -1 ? ' day ago' : ' days ago');
    if (d === 0) return 'expires today';
    if (d === 1) return 'expires tomorrow';
    return 'expires in ' + d + ' days';
  }

  var STATUS_STEPS = ['not-started', 'applied', 'approved'];
  var STATUS_LABELS = { 'not-started': 'Not started', applied: 'Applied', approved: 'Approved' };

  function nextStatus(status) {
    var i = STATUS_STEPS.indexOf(status);
    if (i === -1) return 'not-started';
    return STATUS_STEPS[Math.min(i + 1, STATUS_STEPS.length - 1)];
  }

  function neededLabel(needed) {
    if (needed === 'likely') return 'Likely needed';
    if (needed === 'maybe') return 'Possibly needed';
    return 'Probably not';
  }

  // Filter check results by permit-name query and/or needed status.
  function filterPermits(results, query, needed) {
    var q = String(query || '').trim().toLowerCase();
    return (results || []).filter(function (r) {
      if (needed && r.needed !== needed) return false;
      if (q) {
        var def = permitById(r.permitId);
        var name = def ? def.name : r.permitId;
        if (name.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function csvCell(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Check results + per-permit state -> CSV for sharing with a contractor or the city.
  function permitsToCSV(checkResults, permitStates) {
    var rows = [['Permit', 'Assessment', 'Status', 'Fee low ($)', 'Fee high ($)', 'Expiry date']];
    (checkResults || []).forEach(function (r) {
      var def = permitById(r.permitId) || {};
      var st = (permitStates || {})[r.permitId] || {};
      rows.push([
        def.name || r.permitId,
        neededLabel(r.needed),
        STATUS_LABELS[st.status] || STATUS_LABELS['not-started'],
        st.feeLow === undefined ? '' : st.feeLow,
        st.feeHigh === undefined ? '' : st.feeHigh,
        st.expiryDate || ''
      ]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  }

  // Latest date to apply for a permit so it clears before the project start date,
  // based on the typical review time. Returns ISO or null.
  function applyByDate(permitId, startDateISO) {
    var def = permitById(permitId);
    if (!def || !startDateISO) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDateISO));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() - (def.typicalReviewDays || 14));
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // Days from today until the apply-by date (negative = the date has passed). null = unknown.
  function applyByDaysLeft(permitId, startDateISO) {
    var ab = applyByDate(permitId, startDateISO);
    return ab ? daysUntil(ab) : null;
  }

  function applyByText(permitId, startDateISO) {
    var d = applyByDaysLeft(permitId, startDateISO);
    if (d === null) return '';
    var ab = applyByDate(permitId, startDateISO);
    if (d < 0) return 'apply-by date passed ' + (-d) + (d === -1 ? ' day ago' : ' days ago');
    if (d === 0) return 'apply by today (' + ab + ')';
    return 'apply by ' + ab + ' (' + d + (d === 1 ? ' day left' : ' days left') + ')';
  }

  // Expected expiry when a permit is approved, from its validity period. Returns ISO or null.
  function approvalExpiry(approvedDateISO, validityDays) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(approvedDateISO || ''));
    var v = parseInt(validityDays, 10);
    if (!m || !(v > 0)) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + v);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // Plain-language next action for a project: what to do now.
  function nextProjectAction(checkResults, permitStates) {
    var rel = (checkResults || []).filter(function (r) { return r.needed !== 'unlikely'; });
    if (!rel.length) return 'Run the permit check to see what this project needs.';
    var states = permitStates || {};
    var notStarted = rel.filter(function (r) { return (states[r.permitId] || {}).status !== 'applied' && (states[r.permitId] || {}).status !== 'approved'; });
    if (notStarted.length) {
      var first = notStarted[0];
      var def = permitById(first.permitId);
      var docs = documentsFor(first.permitId);
      var st = states[first.permitId] || {};
      var done = docs.filter(function (dd, i) { return st.docs && st.docs[i]; }).length;
      return 'Next: apply for your ' + (def ? def.name : first.permitId) +
        ' — ' + (docs.length - done) + ' of ' + docs.length + ' supporting documents still to gather.';
    }
    var applied = rel.filter(function (r) { return (states[r.permitId] || {}).status === 'applied'; });
    if (applied.length) {
      var ad = permitById(applied[0].permitId);
      return 'Next: follow up on your applied ' + (ad ? ad.name : applied[0].permitId) +
        ' — check the building department\u2019s review status.';
    }
    return 'All ' + rel.length + ' relevant permits are approved — you\u2019re cleared to start work.';
  }

  PP.JOB_TYPES = JOB_TYPES;
  PP.LOCATION_TYPES = LOCATION_TYPES;
  PP.PERMITS = PERMITS;
  PP.checkPermits = checkPermits;
  PP.documentsFor = documentsFor;
  PP.estimateFees = estimateFees;
  PP.daysUntil = daysUntil;
  PP.expiryStatus = expiryStatus;
  PP.expiryText = expiryText;
  PP.STATUS_STEPS = STATUS_STEPS;
  PP.STATUS_LABELS = STATUS_LABELS;
  PP.nextStatus = nextStatus;
  PP.neededLabel = neededLabel;
  PP.filterPermits = filterPermits;
  PP.permitsToCSV = permitsToCSV;
  PP.applyByDate = applyByDate;
  PP.applyByDaysLeft = applyByDaysLeft;
  PP.applyByText = applyByText;
  PP.approvalExpiry = approvalExpiry;
  PP.nextProjectAction = nextProjectAction;
  PP.permitById = permitById;
  PP.jobById = jobById;
  PP.locationById = locationById;
})(typeof globalThis !== 'undefined' ? globalThis : this);
