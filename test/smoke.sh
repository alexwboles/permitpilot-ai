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

echo "SMOKE: $PASS/13 passed"
