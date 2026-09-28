/* permitpilot-ai UI wiring. Requires js/permits.js (globalThis.PP).
 * All state lives in localStorage under 'permitpilot_v1'.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return; // tests load permits.js in Node only
  var PP = window.PP;
  var LS_KEY = 'permitpilot_v1';

  function $(id) { return document.getElementById(id); }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      s.projects = s.projects || [];
      return s;
    } catch (e) {
      return { projects: [] };
    }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* storage full/blocked */ }
  }
  var store = load();

  function activeProject() {
    for (var i = 0; i < store.projects.length; i++) {
      if (store.projects[i].id === store.activeId) return store.projects[i];
    }
    return null;
  }

  function newProjectShell(name) {
    return {
      id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      name: name || 'Untitled project',
      jobType: PP.JOB_TYPES[0].id,
      locationType: PP.LOCATION_TYPES[0].id,
      description: '',
      createdAt: new Date().toISOString().slice(0, 10),
      checked: false,
      permits: {},   // permitId -> state
      coverNote: ''
    };
  }

  function ensurePermitState(project, permitId, needed, reason) {
    var st = project.permits[permitId] || {};
    var def = PP.permitById(permitId) || {};
    st.needed = needed;
    st.reason = reason;
    st.status = st.status || 'not-started';
    st.docs = st.docs || {};
    if (st.feeLow === undefined) st.feeLow = def.typicalFeeLow || 0;
    if (st.feeHigh === undefined) st.feeHigh = def.typicalFeeHigh || 0;
    st.appliedDate = st.appliedDate || '';
    st.approvedDate = st.approvedDate || '';
    st.expiryDate = st.expiryDate || '';
    project.permits[permitId] = st;
    return st;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- project bar ----------
  function renderProjectBar() {
    var sel = $('projectSelect');
    sel.innerHTML = '';
    store.projects.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = store.activeId || '';
    var proj = activeProject();
    $('projectName').value = proj ? proj.name : '';
    $('deleteProject').disabled = !proj;
  }

  function renderForm() {
    var proj = activeProject();
    var jt = $('jobType'), lt = $('locationType');
    if (!jt.options.length) {
      PP.JOB_TYPES.forEach(function (j) {
        var o = document.createElement('option'); o.value = j.id; o.textContent = j.name; jt.appendChild(o);
      });
      PP.LOCATION_TYPES.forEach(function (l) {
        var o = document.createElement('option'); o.value = l.id; o.textContent = l.name + ' — ' + l.desc; lt.appendChild(o);
      });
    }
    if (!proj) {
      $('detailsSection').style.opacity = '.5';
      return;
    }
    $('detailsSection').style.opacity = '1';
    jt.value = proj.jobType;
    lt.value = proj.locationType;
    $('projectDesc').value = proj.description || '';
  }

  // ---------- results ----------
  function relevantPermits(proj) {
    var out = [];
    PP.PERMITS.forEach(function (p) {
      var st = proj.permits[p.id];
      if (st && st.needed !== 'unlikely') out.push({ def: p, st: st });
    });
    return out;
  }

  function renderAlerts(proj) {
    var box = $('alerts');
    box.innerHTML = '';
    relevantPermits(proj).forEach(function (r) {
      var status = PP.expiryStatus(r.st.expiryDate);
      if (!r.st.expiryDate || status === 'ok') return;
      var div = document.createElement('div');
      div.className = 'alert ' + status;
      div.textContent = (status === 'expired' ? '🔴 ' : '🟡 ') + r.def.name + ' ' + PP.expiryText(r.st.expiryDate) + '.';
      box.appendChild(div);
    });
  }

  function renderProgress(proj) {
    var rel = relevantPermits(proj);
    var approved = rel.filter(function (r) { return r.st.status === 'approved'; }).length;
    var pct = rel.length ? Math.round(approved / rel.length * 100) : 0;
    $('progressBar').style.width = pct + '%';
    $('progressLabel').textContent = rel.length
      ? approved + ' of ' + rel.length + ' relevant permits approved (' + pct + '%)'
      : 'No relevant permits yet — run "Check permits" above.';
  }

  function pipelineHtml(st) {
    var idx = PP.STATUS_STEPS.indexOf(st.status);
    var html = '<div class="pipeline">';
    PP.STATUS_STEPS.forEach(function (s, i) {
      var cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      var date = s === 'applied' ? st.appliedDate : (s === 'approved' ? st.approvedDate : '');
      html += (i ? '<span class="step-arrow">→</span>' : '') +
        '<span class="step ' + cls + '"><span class="dot"></span>' + PP.STATUS_LABELS[s] +
        (date ? ' <small>' + esc(date) + '</small>' : '') + '</span>';
    });
    return html + '</div>';
  }

  function renderPermits(proj) {
    var list = $('permitList');
    list.innerHTML = '';
    var results = PP.checkPermits({ jobType: proj.jobType, locationType: proj.locationType });
    results.forEach(function (res) {
      var def = PP.permitById(res.permitId);
      var st = ensurePermitState(proj, res.permitId, res.needed, res.reason);
      var card = document.createElement('div');
      card.className = 'permit ' + res.needed;
      card.dataset.permit = res.permitId;

      var expStatus = PP.expiryStatus(st.expiryDate);
      var expFlag = st.expiryDate
        ? ' <span class="expiry-flag ' + expStatus + '">' + esc(PP.expiryText(st.expiryDate)) + '</span>'
        : '';

      var head = '<div class="permit-head"><h3>' + esc(def.name) + '</h3>' +
        '<span class="badge ' + res.needed + '">' + PP.neededLabel(res.needed) + '</span></div>' +
        '<p class="muted" style="margin:4px 0">' + esc(def.description) + '</p>' +
        '<p class="permit-reason">' + esc(res.reason) + '</p>' +
        '<div class="permit-meta"><span>Typical fee: ' + money(def.typicalFeeLow) + '–' + money(def.typicalFeeHigh) + '</span>' +
        '<span>Valid ~' + def.validityDays + ' days once issued</span>' + expFlag + '</div>';

      var pipeline = pipelineHtml(st) +
        '<div class="row" style="margin-top:8px">' +
        '<button type="button" class="ghost small" data-act="applied">Mark applied</button>' +
        '<button type="button" class="ghost small" data-act="approved">Mark approved</button>' +
        '<button type="button" class="ghost small" data-act="reset">Reset status</button></div>';

      var docs = PP.documentsFor(res.permitId);
      var docsHtml = '<details class="docs"><summary>📎 Document checklist (<span data-docsdone>' +
        docsDoneCount(st, docs) + '</span>/' + docs.length + ')</summary><ul>' +
        docs.map(function (d, i) {
          var done = !!st.docs[i];
          return '<li class="' + (done ? 'done' : '') + '"><label style="font-weight:400;display:block;cursor:pointer">' +
            '<input type="checkbox" data-doc="' + i + '"' + (done ? ' checked' : '') + '><span>' + esc(d) + '</span></label></li>';
        }).join('') + '</ul></details>';

      var fees = '<div class="fee-inputs"><label>Fee low ($) <input type="number" min="0" data-fee="feeLow" value="' + Number(st.feeLow) + '"></label>' +
        '<label>Fee high ($) <input type="number" min="0" data-fee="feeHigh" value="' + Number(st.feeHigh) + '"></label></div>';

      var expiry = '<label style="margin-top:8px;font-size:.86rem">Permit expiry date <span class="hint">Set the date your permit expires — the dashboard flags it.</span>' +
        '<input type="date" data-expiry value="' + esc(st.expiryDate) + '"></label>';

      card.innerHTML = head + pipeline + docsHtml + fees + expiry;
      list.appendChild(card);
    });
    renderAlerts(proj);
    renderProgress(proj);
    renderFees(proj);
  }

  function docsDoneCount(st, docs) {
    var n = 0;
    docs.forEach(function (d, i) { if (st.docs[i]) n++; });
    return n;
  }

  function renderFees(proj) {
    var low = 0, high = 0, count = 0;
    relevantPermits(proj).forEach(function (r) {
      low += Number(r.st.feeLow) || 0;
      high += Number(r.st.feeHigh) || 0;
      count++;
    });
    $('feeTotal').textContent = count ? money(low) + ' – ' + money(high) : '—';
    $('feeCount').textContent = count ? 'across ' + count + ' relevant permit' + (count === 1 ? '' : 's') : '';
  }

  function renderResults() {
    var proj = activeProject();
    $('resultsSection').style.display = proj && proj.checked ? 'block' : 'none';
    if (proj && proj.checked) {
      renderPermits(proj);
      $('coverNote').value = proj.coverNote || '';
    }
  }

  function rerender() {
    renderProjectBar();
    renderForm();
    renderResults();
  }

  // ---------- events ----------
  $('newProject').addEventListener('click', function () {
    var p = newProjectShell('');
    store.projects.push(p);
    store.activeId = p.id;
    save();
    rerender();
    $('projectName').focus();
    flash('projectMsg', 'New project created.');
  });

  $('saveProject').addEventListener('click', function () {
    var proj = activeProject();
    if (!proj) return;
    var name = $('projectName').value.trim();
    proj.name = name || 'Untitled project';
    save();
    renderProjectBar();
    flash('projectMsg', 'Saved.');
  });

  $('projectName').addEventListener('input', function () {
    var proj = activeProject();
    if (!proj) return;
    proj.name = $('projectName').value;
    save();
    var sel = $('projectSelect');
    var opt = sel.querySelector('option[value="' + proj.id + '"]');
    if (opt) opt.textContent = proj.name;
  });

  $('projectSelect').addEventListener('change', function (e) {
    store.activeId = e.target.value || null;
    save();
    rerender();
  });

  $('deleteProject').addEventListener('click', function () {
    var proj = activeProject();
    if (!proj) return;
    if (!confirm('Delete "' + proj.name + '"? This cannot be undone.')) return;
    store.projects = store.projects.filter(function (p) { return p.id !== proj.id; });
    store.activeId = store.projects.length ? store.projects[0].id : null;
    save();
    rerender();
  });

  $('jobType').addEventListener('change', function (e) {
    var proj = activeProject();
    if (!proj) return;
    proj.jobType = e.target.value;
    proj.checked = false; // re-check to refresh guidance
    save();
    renderResults();
  });
  $('locationType').addEventListener('change', function (e) {
    var proj = activeProject();
    if (!proj) return;
    proj.locationType = e.target.value;
    proj.checked = false;
    save();
    renderResults();
  });
  $('projectDesc').addEventListener('input', function (e) {
    var proj = activeProject();
    if (!proj) return;
    proj.description = e.target.value;
    save();
  });

  $('checkPermits').addEventListener('click', function () {
    var proj = activeProject();
    if (!proj) { flash('checkMsg', 'Create a project first.'); return; }
    proj.checked = true;
    save();
    renderResults();
    var rel = relevantPermits(proj).length;
    flash('checkMsg', 'Found ' + rel + ' relevant permit' + (rel === 1 ? '' : 's') + '.');
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Delegated events inside the permit list
  $('permitList').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var proj = activeProject();
    if (!proj) return;
    var card = btn.closest('.permit');
    var st = proj.permits[card.dataset.permit];
    if (!st) return;
    var act = btn.getAttribute('data-act');
    if (act === 'reset') {
      st.status = 'not-started'; st.appliedDate = ''; st.approvedDate = '';
    } else if (act === 'applied') {
      st.status = 'applied';
      if (!st.appliedDate) st.appliedDate = todayStr();
    } else if (act === 'approved') {
      st.status = 'approved';
      if (!st.appliedDate) st.appliedDate = todayStr();
      if (!st.approvedDate) st.approvedDate = todayStr();
    }
    save();
    renderPermits(proj);
  });

  $('permitList').addEventListener('change', function (e) {
    var proj = activeProject();
    if (!proj) return;
    var card = e.target.closest('.permit');
    if (!card) return;
    var st = proj.permits[card.dataset.permit];
    if (!st) return;
    if (e.target.hasAttribute('data-doc')) {
      st.docs[e.target.getAttribute('data-doc')] = e.target.checked;
      var li = e.target.closest('li');
      if (li) li.classList.toggle('done', e.target.checked);
      var docs = PP.documentsFor(card.dataset.permit);
      var span = card.querySelector('[data-docsdone]');
      if (span) span.textContent = docsDoneCount(st, docs);
    } else if (e.target.hasAttribute('data-fee')) {
      st[e.target.getAttribute('data-fee')] = Math.max(0, Number(e.target.value) || 0);
      renderFees(proj);
    } else if (e.target.hasAttribute('data-expiry')) {
      st.expiryDate = e.target.value;
      renderAlerts(proj);
      renderPermits(proj);
    }
    save();
  });

  // ---------- cover note (optional OpenAI) ----------
  function draftNoteLocal(proj) {
    var job = PP.jobById(proj.jobType);
    var loc = PP.locationById(proj.locationType);
    var rel = relevantPermits(proj);
    var lines = [
      'Permit application cover note',
      'Project: ' + proj.name,
      'Job type: ' + (job ? job.name : proj.jobType),
      'Location: ' + (loc ? loc.name : proj.locationType),
      proj.description ? 'Description: ' + proj.description : '',
      '',
      'Permits I believe this project needs:',
    ];
    rel.forEach(function (r) {
      lines.push(' - ' + r.def.name + ' (' + PP.neededLabel(r.st.needed).toLowerCase() + '): ' + r.st.reason);
    });
    lines.push('', 'I have attached the supporting documents listed in the application checklist.',
      'Please let me know if any additional information is required.',
      '', 'Thank you,', '(your name / company)');
    return lines.filter(function (l, i) { return l !== '' || i === 0; }).join('\n');
  }

  $('draftNote').addEventListener('click', function () {
    var proj = activeProject();
    if (!proj || !proj.checked) { flash('noteMsg', 'Run "Check permits" first.'); return; }
    var key = (store.openaiKey || '').trim();
    if (!key) {
      proj.coverNote = draftNoteLocal(proj);
      save();
      $('coverNote').value = proj.coverNote;
      flash('noteMsg', 'Drafted locally. Add an OpenAI key in Settings for an AI-polished version.');
      return;
    }
    flash('noteMsg', 'Asking your AI to polish the note…');
    var prompt = 'Write a concise, professional cover note (under 250 words) for a building permit application. ' +
      'Project: ' + proj.name + '. Job: ' + (PP.jobById(proj.jobType) || {}).name + '. ' +
      'Location type: ' + (PP.locationById(proj.locationType) || {}).name + '. ' +
      'Description: ' + (proj.description || 'not provided') + '. ' +
      'Permits believed needed: ' + relevantPermits(proj).map(function (r) { return r.def.name; }).join(', ') + '. ' +
      'End with a placeholder for the applicant signature. Plain text, no markdown headings.';
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 600 })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var text = (((data.choices || [])[0] || {}).message || {}).content || '';
      if (!text.trim()) throw new Error('empty reply');
      proj.coverNote = text.trim();
      save();
      $('coverNote').value = proj.coverNote;
      flash('noteMsg', 'Polished by AI. Edit freely before sending.');
    }).catch(function (err) {
      proj.coverNote = draftNoteLocal(proj);
      save();
      $('coverNote').value = proj.coverNote;
      flash('noteMsg', 'AI unavailable (' + err.message + ') — drafted locally instead.');
    });
  });

  $('copyNote').addEventListener('click', function () {
    var ta = $('coverNote');
    ta.select();
    try { document.execCommand('copy'); flash('noteMsg', 'Copied.'); }
    catch (e) { flash('noteMsg', 'Copy failed — select the text manually.'); }
  });

  $('coverNote').addEventListener('input', function (e) {
    var proj = activeProject();
    if (!proj) return;
    proj.coverNote = e.target.value;
    save();
  });

  // ---------- settings ----------
  $('saveKey').addEventListener('click', function () {
    store.openaiKey = $('openaiKey').value.trim();
    save();
    $('openaiKey').value = '';
    flash('keyMsg', store.openaiKey ? 'Key saved in this browser.' : 'Key cleared.');
  });
  $('clearKey').addEventListener('click', function () {
    store.openaiKey = '';
    save();
    $('openaiKey').value = '';
    flash('keyMsg', 'Key removed.');
  });

  // ---------- sample project ----------
  $('sampleProject').addEventListener('click', function () {
    var p = newProjectShell('Maple St. kitchen remodel');
    p.jobType = 'kitchen-remodel';
    p.locationType = 'residential';
    p.description = 'Tear out the kitchen to the studs, move the sink to the island, add recessed lighting and a gas range.';
    p.checked = true;
    var results = PP.checkPermits({ jobType: p.jobType, locationType: p.locationType });
    results.forEach(function (res) {
      var st = ensurePermitState(p, res.permitId, res.needed, res.reason);
      if (res.needed === 'unlikely') return;
      if (res.permitId === 'building') { st.status = 'applied'; st.appliedDate = addDays(todayStr(), -12); st.expiryDate = addDays(todayStr(), 353); st.docs = { 0: true, 1: true, 3: true }; }
      if (res.permitId === 'electrical') { st.status = 'approved'; st.appliedDate = addDays(todayStr(), -20); st.approvedDate = addDays(todayStr(), -6); st.expiryDate = addDays(todayStr(), 160); st.docs = { 0: true, 1: true, 2: true, 3: true }; }
      if (res.permitId === 'plumbing') { st.status = 'not-started'; st.expiryDate = addDays(todayStr(), 21); }
    });
    p.coverNote = '';
    store.projects.push(p);
    store.activeId = p.id;
    save();
    rerender();
    flash('projectMsg', 'Sample project loaded — try the checklist and pipeline.');
  });

  function addDays(dateStr, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function flash(id, msg) {
    var el = $(id);
    el.textContent = msg;
    setTimeout(function () { el.textContent = ''; }, 4000);
  }

  // Open all document checklists when printing so they appear on paper.
  if ('onbeforeprint' in window) {
    window.onbeforeprint = function () {
      document.querySelectorAll('details.docs').forEach(function (d) { d.open = true; });
    };
  }

  rerender();
})();
