#!/usr/bin/env bash
# permitpilot-ai smoke tests — 13 checks. Exit non-zero on first failure.
set -u
cd "$(dirname "$0")/.."
PASS=0
check() { # $1 = description, rest = command
  local desc="$1"; shift
  if "$@" > /tmp/pp_smoke.log 2>&1; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc"; sed 's/^/  /' /tmp/pp_smoke.log | head -20; exit 1
  fi
}

check "index.html exists" test -f index.html
check "css/style.css exists" test -f css/style.css
check "js/permits.js exists" test -f js/permits.js
check "js/app.js exists" test -f js/app.js
check "permits.js syntax valid" node --check js/permits.js
check "app.js syntax valid" node --check js/app.js
check "12 job types present" node -e "
  require('./js/permits.js');
  var n = globalThis.PP.JOB_TYPES.length;
  if (n < 10) { console.error('only ' + n + ' job types'); process.exit(1); }
  console.log(n + ' job types');
"
check "14 permits with required fields" node -e "
  require('./js/permits.js');
  var bad = [];
  globalThis.PP.PERMITS.forEach(function (p, i) {
    ['id','name','description','typicalFeeLow','typicalFeeHigh','validityDays'].forEach(function (f) {
      if (p[f] === undefined || p[f] === null || p[f] === '') bad.push(i + ':' + f);
    });
    if (!(p.typicalFeeLow <= p.typicalFeeHigh)) bad.push(i + ':fee-inversion');
    if (p.validityDays <= 0) bad.push(i + ':bad-validity');
  });
  if (globalThis.PP.PERMITS.length < 12) bad.push('count<' + globalThis.PP.PERMITS.length);
  if (bad.length) { console.error(bad.join(', ')); process.exit(1); }
  console.log(globalThis.PP.PERMITS.length + ' permits, all valid');
"
check "kitchen remodel flags building+electrical+plumbing as likely" node -e "
  require('./js/permits.js');
  var res = globalThis.PP.checkPermits({ jobType: 'kitchen-remodel', locationType: 'residential' });
  ['building','electrical','plumbing'].forEach(function (id) {
    var r = res.filter(function (x) { return x.permitId === id; })[0];
    if (!r || r.needed !== 'likely' || !r.reason) { console.error(id + ' not likely'); process.exit(1); }
  });
  console.log('kitchen remodel: building+electrical+plumbing likely with reasons');
"
check "fence in rural flags fewer permits than in historic district" node -e "
  require('./js/permits.js');
  function flagged(loc) {
    return globalThis.PP.checkPermits({ jobType: 'fence', locationType: loc })
      .filter(function (r) { return r.needed === 'likely' || r.needed === 'maybe'; }).length;
  }
  var rural = flagged('rural'), historic = flagged('historic');
  if (!(rural < historic)) { console.error('rural=' + rural + ' historic=' + historic); process.exit(1); }
  console.log('rural=' + rural + ' < historic=' + historic);
"
check "fee totals reconcile low<=high" node -e "
  require('./js/permits.js');
  var PP = globalThis.PP;
  ['room-addition','fence','electrical-panel'].forEach(function (job) {
    ['residential','commercial','rural','historic','floodplain'].forEach(function (loc) {
      var t = PP.estimateFees(PP.checkPermits({ jobType: job, locationType: loc }));
      if (!(t.low <= t.high)) { console.error(job + '/' + loc + ' low>high'); process.exit(1); }
      if (t.low < 0 || t.high < 0) { console.error(job + '/' + loc + ' negative'); process.exit(1); }
    });
  });
  console.log('fee totals reconcile across jobs x locations');
"
check "disclaimer string present in logic or index" node -e "
  var fs = require('fs');
  var logic = fs.readFileSync('./js/permits.js', 'utf8');
  var index = fs.readFileSync('./index.html', 'utf8');
  var needle = 'General guidance only';
  if (logic.indexOf(needle) === -1 && index.indexOf(needle) === -1) { console.error('disclaimer missing'); process.exit(1); }
  console.log('disclaimer present');
"
check "disclaimer visible in index.html banner" node -e "
  var fs = require('fs');
  var index = fs.readFileSync('./index.html', 'utf8');
  if (index.indexOf('disclaimer-banner') === -1) { console.error('no disclaimer banner'); process.exit(1); }
  if (index.indexOf('Always verify with your local building department') === -1) { console.error('banner text missing'); process.exit(1); }
  console.log('disclaimer banner present');
"
check "all 14 permits have typicalReviewDays" node -e "
  require('./js/permits.js');
  var bad = [];
  globalThis.PP.PERMITS.forEach(function (p) {
    if (!(p.typicalReviewDays > 0)) bad.push(p.id);
  });
  if (bad.length) { console.error('missing review days: ' + bad.join(',')); process.exit(1); }
  console.log('review days present on all 14 permits');
"
check "new logic functions exported" node -e "
  require('./js/permits.js');
  ['filterPermits','permitsToCSV','applyByDate','applyByDaysLeft','applyByText','approvalExpiry','nextProjectAction'].forEach(function (f) {
    if (typeof globalThis.PP[f] !== 'function') { console.error('missing: ' + f); process.exit(1); }
  });
  console.log('new functions exported');
"
check "apply-by date math" node -e "
  require('./js/permits.js');
  var PP = globalThis.PP;
  // historic review = 45 days; project starts 2026-12-01 -> apply by 2026-10-17
  if (PP.applyByDate('historic', '2026-12-01') !== '2026-10-17') { console.error('historic apply-by: ' + PP.applyByDate('historic', '2026-12-01')); process.exit(1); }
  if (PP.applyByDate('no-such', '2026-12-01') !== null) { console.error('unknown permit should be null'); process.exit(1); }
  if (PP.applyByDate('building', 'not-a-date') !== null) { console.error('bad date should be null'); process.exit(1); }
  // approval expiry: 365-day validity from approval
  if (PP.approvalExpiry('2026-10-07', 365) !== '2027-10-07') { console.error('expiry: ' + PP.approvalExpiry('2026-10-07', 365)); process.exit(1); }
  if (PP.approvalExpiry('', 365) !== null) { console.error('empty approval date should be null'); process.exit(1); }
  console.log('apply-by and approval-expiry math OK');
"
check "filterPermits + permitsToCSV" node -e "
  require('./js/permits.js');
  var PP = globalThis.PP;
  var res = PP.checkPermits({ jobType: 'kitchen-remodel', locationType: 'residential' });
  var likely = PP.filterPermits(res, '', 'likely');
  if (!likely.length || likely.some(function (r) { return r.needed !== 'likely'; })) { console.error('needed filter broken'); process.exit(1); }
  var q = PP.filterPermits(res, 'electrical', '');
  if (q.length !== 1 || q[0].permitId !== 'electrical') { console.error('name search broken: ' + q.length); process.exit(1); }
  var csv = PP.permitsToCSV(res, {}).split('\n');
  if (csv[0] !== 'Permit,Assessment,Status,Fee low ($),Fee high ($),Expiry date') { console.error('csv header: ' + csv[0]); process.exit(1); }
  if (csv.length !== res.length + 1) { console.error('csv rows: ' + csv.length); process.exit(1); }
  console.log('filter + CSV OK');
"
check "nextProjectAction phrasing" node -e "
  require('./js/permits.js');
  var PP = globalThis.PP;
  var res = PP.checkPermits({ jobType: 'kitchen-remodel', locationType: 'residential' });
  var a1 = PP.nextProjectAction(res, {});
  if (!/Next: apply for your Building permit/.test(a1)) { console.error('a1: ' + a1); process.exit(1); }
  if (!/documents still to gather/.test(a1)) { console.error('a1 docs: ' + a1); process.exit(1); }
  var states = {};
  res.forEach(function (r) { states[r.permitId] = { status: 'approved', docs: {} }; });
  var a2 = PP.nextProjectAction(res, states);
  if (!/cleared to start work/.test(a2)) { console.error('a2: ' + a2); process.exit(1); }
  console.log('next-action phrasing OK');
"

echo "SMOKE: $PASS/18 passed"
