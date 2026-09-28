#!/usr/bin/env bash
# permitpilot-ai e2e tests — 7 flows exercised through the real permit logic in Node.
set -u
cd "$(dirname "$0")/.."

node << 'EOF'
require('./js/permits.js');
var PP = globalThis.PP;
var failures = 0;
function flow(name, fn) {
  try { fn(); console.log('PASS: ' + name); }
  catch (e) { failures++; console.log('FAIL: ' + name + ' — ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function get(results, id) {
  return results.filter(function (r) { return r.permitId === id; })[0];
}
function iso(offsetDays) {
  var d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// 1. Room addition + residential: building permit likely, with a plain-language reason.
flow('room addition + residential flags building permit likely', function () {
  var res = PP.checkPermits({ jobType: 'room-addition', locationType: 'residential' });
  var b = get(res, 'building');
  assert(b && b.needed === 'likely', 'building permit should be likely');
  assert(b.reason && b.reason.length > 20, 'reason should be plain-language, got: ' + b.reason);
  assert(get(res, 'zoning').needed === 'likely', 'zoning should be likely for an addition');
});

// 2. Historic district adds an extra review permit on top of the base set.
flow('historic district adds preservation review', function () {
  var base = PP.checkPermits({ jobType: 'roof-replacement', locationType: 'residential' });
  var hist = PP.checkPermits({ jobType: 'roof-replacement', locationType: 'historic' });
  assert(get(base, 'historic').needed === 'unlikely', 'residential roof should not need historic review');
  var h = get(hist, 'historic');
  assert(h.needed === 'likely', 'historic district roof should need preservation review');
  assert(h.reason.length > 20, 'historic reason should be explanatory');
});

// 3. Document checklists are non-empty for the top permits.
flow('document checklists non-empty for top permits', function () {
  ['building', 'electrical', 'plumbing', 'zoning'].forEach(function (id) {
    var docs = PP.documentsFor(id);
    assert(Array.isArray(docs) && docs.length >= 3, id + ' checklist too short');
    docs.forEach(function (d) { assert(typeof d === 'string' && d.length > 3, id + ' has a bad doc entry'); });
  });
  assert(PP.documentsFor('no-such-permit').length === 0, 'unknown permit should return empty checklist');
  console.log('   (building checklist: ' + PP.documentsFor('building').length + ' documents)');
});

// 4. Status pipeline transitions not-started -> applied -> approved and sticks at approved.
flow('status pipeline transitions', function () {
  assert(PP.nextStatus('not-started') === 'applied', 'not-started -> applied');
  assert(PP.nextStatus('applied') === 'approved', 'applied -> approved');
  assert(PP.nextStatus('approved') === 'approved', 'approved should stick');
  assert(PP.nextStatus('bogus') === 'not-started', 'unknown should reset to not-started');
  assert(PP.STATUS_LABELS.applied === 'Applied', 'applied label wrong');
});

// 5. Expiry status flags expired / due-soon / ok correctly.
flow('expiry status flags expired/due-soon/ok', function () {
  assert(PP.expiryStatus(iso(-5)) === 'expired', '5 days ago should be expired');
  assert(PP.expiryStatus(iso(-1)) === 'expired', 'yesterday should be expired');
  assert(PP.expiryStatus(iso(0)) === 'due-soon', 'today should be due-soon');
  assert(PP.expiryStatus(iso(12)) === 'due-soon', '12 days out should be due-soon');
  assert(PP.expiryStatus(iso(30)) === 'due-soon', '30 days out should be due-soon');
  assert(PP.expiryStatus(iso(31)) === 'ok', '31 days out should be ok');
  assert(PP.expiryStatus(iso(200)) === 'ok', '200 days out should be ok');
  assert(PP.expiryStatus('') === 'ok', 'empty date should be ok');
  var t = PP.expiryText(iso(7));
  assert(/expires in 7 days/.test(t), 'expiry text should say "expires in 7 days", got: ' + t);
  var t2 = PP.expiryText(iso(-3));
  assert(/expired 3 days ago/.test(t2), 'expiry text should say "expired 3 days ago", got: ' + t2);
});

// 6. Fee estimate for a full room addition is positive and low <= high.
flow('fee estimate for room addition is positive and reconciles', function () {
  var res = PP.checkPermits({ jobType: 'room-addition', locationType: 'residential' });
  var est = PP.estimateFees(res);
  assert(est.count >= 3, 'addition should flag 3+ permits, got ' + est.count);
  assert(est.low > 0 && est.high > 0, 'fees should be positive');
  assert(est.low <= est.high, 'low must be <= high');
  console.log('   (room addition estimate: $' + est.low + ' - $' + est.high + ' across ' + est.count + ' permits)');
});

// 7. Rural fence is the light-permit case; commercial kitchen is the heavy-permit case.
flow('rural fence lighter than commercial kitchen', function () {
  function flagged(job, loc) {
    return PP.checkPermits({ jobType: job, locationType: loc })
      .filter(function (r) { return r.needed !== 'unlikely'; }).length;
  }
  var light = flagged('fence', 'rural');
  var heavy = flagged('kitchen-remodel', 'commercial');
  assert(light < heavy, 'rural fence (' + light + ') should flag fewer than commercial kitchen (' + heavy + ')');
  var est = PP.estimateFees(PP.checkPermits({ jobType: 'kitchen-remodel', locationType: 'commercial' }));
  assert(est.low <= est.high, 'commercial fee inversion');
});

if (failures) { console.log('E2E: ' + failures + ' flow(s) FAILED'); process.exit(1); }
console.log('E2E: 7/7 flows passed');
EOF
