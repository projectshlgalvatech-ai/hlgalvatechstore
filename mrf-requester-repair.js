/* =========================================================================
   MATERIAL REQUISITION FORM (MRF) — an internal department's request that
   the store issue specific items. Logged at Device 2 (the store), synced
   read-only to Device 1 and Device 3 under "Material Request". Recent (this
   week) entries show as a flat list; older entries live behind a
   date / week / month picker so the page doesn't fill up over time.
   ========================================================================= */
function mrfDateInRange(dateStr, mode, refDateStr){
  const d = new Date(dateStr);
  const ref = new Date(refDateStr);
  if(mode==='day'){ return dateStr===refDateStr; }
  if(mode==='week'){
    const start = new Date(ref); start.setDate(ref.getDate() - ref.getDay());
    const end = new Date(start); end.setDate(start.getDate()+6);
    return d>=start && d<=end;
  }
  if(mode==='month'){ return d.getFullYear()===ref.getFullYear() && d.getMonth()===ref.getMonth(); }
  return false;
}
function mrfStatusBadge(r){
  if(r.status==='rejected'){
    const label = r.kind==='stock-in' ? 'Rejected — not added to stock' : 'Rejected by requester';
    return `<span class="status-crit" title="${(r.rejectReason||'').replace(/"/g,'&quot;')}">${label}</span>`;
  }
  if(r.status==='needs-purchase') return '<span class="status-crit">Needs to be purchased</span>';
  if(r.status==='awaiting-purchase-approval'){
    return `<span class="status-low">Awaiting ${r.referredBy||'requester'}'s approval to purchase</span>`;
  }
  if(r.status==='awaiting-stock-approval'){
    if(r.approvalStatus==='awaiting') return `<span class="status-low">Received — awaiting ${r.referredBy||'requester'}'s approval</span>`;
    return '<span class="status-low">Received — awaiting approval</span>';
  }
  if(r.status==='stock-approved') return '<span class="status-ok">Approved — added to stock</span>';
  if(r.status==='pending'){
    if(r.approvalStatus==='awaiting') return '<span class="status-low">Awaiting requester approval</span>';
    return '<span class="status-low">Pending — awaiting issue</span>';
  }
  const issue = r.issueId ? DB.issues.find(i=>i.id===r.issueId) : null;
  if(!issue) return '<span class="status-ok">Issued</span>';
  return issueStatusBadge(issue);
}
// The Issue Material row action: hidden behind an approval gate whenever the
// request's "Referred by" text matched an admin-created account (approvalStatus
// 'awaiting'/'rejected') — that account has to Approve it first from their own
// dashboard. Requests with no matching account (approvalStatus 'auto', or older
// records saved before this feature existed) can be issued right away as before.
function mrfIssueActionCell(r){
  if(r.status!=='pending') return '—';
  if(r.approvalStatus==='awaiting') return '<span class="hint" style="display:inline">Awaiting approval</span>';
  if(r.approvalStatus==='rejected') return '<span class="status-crit">Rejected</span>';
  return `<button class="btn small" onclick="issuePendingMRF('${r.id}')">Issue Material</button>`;
}
function renderMRFTable(rows, showIssueAction){
  if(!rows.length) return `<div class="empty">No requests in this range.</div>`;
  return `<table><thead><tr><th>MRF No.</th><th>Date</th><th>Time</th><th>Material</th><th>Type</th><th>Size</th><th>Qty</th><th>Location</th><th>Purpose</th><th>Request by</th><th>Referred by</th><th>Approved by</th><th>SO</th><th>Status</th>${showIssueAction?'<th>Action</th>':''}</tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${r.mrfNo}</td><td>${r.date}</td><td>${timeBadge(r.date,r.time)}</td><td>${r.materialName}</td><td>${r.materialType||'—'}</td><td>${r.size||'—'}</td><td>${r.qty}</td><td>${r.location||'—'}</td><td>${r.purpose||'—'}</td><td>${r.requestBy||'—'}</td><td>${r.referredBy||'—'}</td><td>${r.approvedBy||'—'}</td><td>${r.soNumber||'—'}${r.crossSO?' <span class="status-low" title="'+(r.crossSOReason||'')+'">(cross-SO)</span>':''}</td>
  <td>${mrfStatusBadge(r)}</td>
  ${showIssueAction? `<td>${mrfIssueActionCell(r)}</td>` : ''}</tr>`).join('')}
  </tbody></table>`;
}
function renderMRFOlderSection(idPrefix){
  const open = !!panelCollapseUIState[idPrefix+'-older'];
  return `
    <div class="panel">
      <button type="button" class="panel-toggle" onclick="toggleCollapsePanel('${idPrefix}-older')">
        <span class="chev">${open?'▾':'▸'}</span> Older requests (before this week)
      </button>
      <div style="display:${open?'block':'none'}">
        <div class="row">
          <div class="field"><label>Pick a date</label><input type="date" id="${idPrefix}-date" value="${todayStr()}"></div>
          <div class="field" style="flex:0 0 auto;align-self:flex-end;display:flex;gap:8px">
            <button type="button" class="btn secondary small" id="${idPrefix}-day">Day</button>
            <button type="button" class="btn secondary small" id="${idPrefix}-week">Week</button>
            <button type="button" class="btn secondary small" id="${idPrefix}-month">Month</button>
          </div>
        </div>
        <div id="${idPrefix}-older-body"></div>
      </div>
    </div>`;
}
function wireMRFOlderSection(idPrefix, showIssueAction){
  const dateInput = document.getElementById(idPrefix+'-date');
  let mode = 'day';
  function paint(){
    const older = (DB.mrf||[]).filter(r=>!isThisWeek(r.date));
    const filtered = older.filter(r=>mrfDateInRange(r.date, mode, dateInput.value)).sort((a,b)=> new Date(b.date)-new Date(a.date));
    document.getElementById(idPrefix+'-older-body').innerHTML = renderMRFTable(filtered, showIssueAction);
  }
  ['day','week','month'].forEach(m=>{
    document.getElementById(idPrefix+'-'+m).addEventListener('click', ()=>{ mode=m; paint(); });
  });
  dateInput.addEventListener('change', paint);
  paint();
}

/* ---- shared helpers for the MRF form: gathering + validating field values,
   and actually moving stock/creating the issue record. Kept outside
   renderMRF2 so the same "issue" logic can be triggered either straight from
   the form (Issue Material button) or later from the pending-requests list
   (Issue Material row action) once a request has already been logged. ---- */
async function gatherMRFFormData(forIssue){
  const input = document.getElementById('mrf-material');
  const materialName = input.value.trim();
  if(!materialName){ toast('Enter a material name', true); return null; }
  const mat = (input.dataset.materialId && DB.materials.find(m=>m.id===input.dataset.materialId))
    || DB.materials.find(m=>m.name.toLowerCase()===materialName.toLowerCase());
  if(!mat){ toast('Select a valid, existing material from the list', true); return null; }

  const typeSelect = document.getElementById('mrf-type');
  let materialType = typeSelect.value;
  if(materialType==='__other__'){
    const typeOtherInput = document.getElementById('mrf-type-other');
    materialType = typeOtherInput.value.trim();
    if(!materialType){ toast('Type a material type, or pick one from the list', true); return null; }
    const known = allMaterialTypeOptions().some(t=>t.toLowerCase()===materialType.toLowerCase());
    if(!known){ DB.customMaterialTypes = DB.customMaterialTypes||[]; DB.customMaterialTypes.push(materialType); await saveKey('customMaterialTypes'); }
  }
  const size = readSizeValue('mrf-size');
  const qty = Number(document.getElementById('mrf-qty').value);
  if(!qty || qty<=0){ toast('Enter a valid quantity', true); return null; }
  const location = document.getElementById('mrf-location').value;
  if(forIssue && getStock(mat.id, location) < qty){ toast(`Only ${getStock(mat.id,location)} in stock at ${location}`, true); return null; }

  const soInput = document.getElementById('mrf-so');
  const soEntered = soInput.value.trim();
  if(forIssue){
    const soRecord = soEntered ? findSOByNumber(soEntered) : null;
    if(soRecord && soRecord.status==='completed'){
      toast(`SO ${soRecord.soNumber} is marked Complete — no further material can be issued for it. Only Device 3 can reopen it.`, true);
      return null;
    }
  }
  const matSO = (mat.soNumber||'').trim();
  const crossSO = !!(matSO && soEntered && soEntered.toLowerCase()!==matSO.toLowerCase());
  let crossSOReason = '';
  if(crossSO){
    crossSOReason = document.getElementById('mrf-so-reason').value.trim();
    if(!crossSOReason){ toast('Provide a reason for issuing against a different SO — it will show on Device 3', true); return null; }
  }
  let qtyNos = 0;
  qtyNos = Number(document.getElementById('mrf-qty-nos').value||0);

  return {
    mat, materialType, size, qty, qtyNos, location,
    requestBy: document.getElementById('mrf-reqby').value,
    referredBy: document.getElementById('mrf-refby').value,
    approvedBy: document.getElementById('mrf-appby').value,
    purpose: document.getElementById('mrf-purpose').value,
    soEntered, crossSO, crossSOReason
  };
}
// Moves the stock and creates the DB.issues record. If existingReq is passed
// (a pending DB.mrf entry), that request is flipped to 'issued' and linked to
// the new issue instead of creating a brand-new MRF record.
async function performMRFIssue(data, existingReq){
  const issue = { id:uid(), materialId:data.mat.id, materialName:data.mat.name, person:data.requestBy,
    purpose:data.purpose, approvedBy:data.approvedBy, qty:data.qty, qtyNos:data.qtyNos, location:data.location,
    date: todayStr(), time: nowTimeStr(), status:'issued',
    returnedGoodQty:0, damagedQty:0, consumedQty:0, returnDate:null,
    soNumber:data.soEntered, crossSO:data.crossSO, crossSOReason:data.crossSOReason };
  DB.issues.push(issue);
  addStock(data.mat.id, data.location, -data.qty);
  if(data.qtyNos>0){ addStockNos(data.mat.id, data.location, -data.qtyNos); }

  let soChanged = false;
  if(data.soEntered){ debitSOForIssue(data.soEntered, data.mat.id, data.qty); soChanged = true; }

  openCheckFor(data.mat.id);
  if(data.crossSO){
    openSOMismatchTicket({materialId:data.mat.id, materialName:data.mat.name, requestedSO:data.soEntered, materialSO:(data.mat.soNumber||''), reason:data.crossSOReason, person:issue.person, issueId:issue.id});
  }

  let req = existingReq;
  if(req){
    req.status = 'issued'; req.issueId = issue.id;
  } else {
    const mrfNo = 'MRF-' + String((DB.mrf||[]).length + 1).padStart(4,'0');
    req = { id: uid(), mrfNo, materialId: data.mat.id, materialName: data.mat.name, materialType: data.materialType, size: data.size,
      qty: data.qty, qtyNos: data.qtyNos, location: data.location, purpose: data.purpose,
      requestBy: data.requestBy, referredBy: data.referredBy, approvedBy: data.approvedBy,
      date: todayStr(), time: nowTimeStr(), status: 'issued',
      soNumber: data.soEntered, crossSO: data.crossSO, crossSOReason: data.crossSOReason, issueId: issue.id };
    DB.mrf = DB.mrf||[]; DB.mrf.push(req);
  }

  await saveKey('mrf'); await saveKey('issues'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('tickets');
  if(soChanged){ await saveKey('soList'); }
  return {issue, req};
}
// Fulfils a request that was previously logged via the "Submit Request" button —
// called from the "Issue Material" row action next to a pending MRF entry.
async function issuePendingMRF(mrfId){
  const req = (DB.mrf||[]).find(r=>r.id===mrfId);
  if(!req || req.status!=='pending'){ toast('Request not found, or already issued', true); return; }
  if(req.approvalStatus==='awaiting'){ toast(`Waiting for ${req.referredBy||'the requester'} to approve this from their own dashboard first`, true); return; }
  if(req.approvalStatus==='rejected'){ toast(`${req.referredBy||'The requester'} rejected this request`, true); return; }
  const mat = DB.materials.find(m=>m.id===req.materialId);
  if(!mat){ toast('That material no longer exists in the master list', true); return; }
  if(getStock(mat.id, req.location) < req.qty){ toast(`Only ${getStock(mat.id,req.location)} in stock at ${req.location} — can't issue ${req.qty}`, true); return; }
  const soRecord = req.soNumber ? findSOByNumber(req.soNumber) : null;
  if(soRecord && soRecord.status==='completed'){ toast(`SO ${soRecord.soNumber} is marked Complete — no further material can be issued for it.`, true); return; }
  if(!confirm(`Issue ${req.qty} ${mat.unit} of ${mat.name} to ${req.requestBy||'the requester'} now?`)) return;
  const data = { mat, materialType:req.materialType, size:req.size, qty:req.qty, qtyNos:req.qtyNos||0, location:req.location,
    requestBy:req.requestBy, referredBy:req.referredBy, approvedBy:req.approvedBy, purpose:req.purpose,
    soEntered:req.soNumber||'', crossSO:req.crossSO, crossSOReason:req.crossSOReason };
  await performMRFIssue(data, req);
  toast(`${req.mrfNo} — issued ${req.qty} ${mat.unit} of ${mat.name}`);
  render();
}
window.issuePendingMRF = issuePendingMRF;

/* ---- requester-account approve/reject — called only from that account's own
   "My Requests" dashboard (renderRequesterDash). Handles two kinds of request:
   the original "issue" flow (approve lets the store issue the material) and
   the newer "stock-in" flow (approve actually adds a gate-entered material to
   stock; the material was held out of stock specifically pending this). ---- */
async function approveMRFRequest(mrfId){
  const req = (DB.mrf||[]).find(r=>r.id===mrfId);
  if(!req || req.approvalStatus!=='awaiting') return;
  const acc = CONFIG.requesterAccounts.find(a=>a.id===req.requestAccountId) || CURRENT_ACCOUNT;
  if(req.kind==='stock-in'){
    if(!req.materialId){
      // Phase 1: the material doesn't exist in the stock list yet — approving
      // here just clears it to go to Device 1 as a purchase request. Nothing
      // physically moves until Device 1 gate-enters it and this same account
      // approves again (Phase 2, below).
      req.status = 'needs-purchase';
      req.approvalStatus = 'approved';
      req.approvedBy = acc.name;
      await saveKey('mrf');
      toast(`${req.mrfNo} approved — sent to Device 1 to purchase ${req.materialName}`);
      render();
      return;
    }
    // Phase 2: Device 1 has already gate-entered the material — approving now
    // actually releases it into stock.
    addStock(req.materialId, req.location, req.qty);
    const mat = DB.materials.find(m=>m.id===req.materialId);
    if(mat && req.qtyNos){ addStockNos(req.materialId, req.location, req.qtyNos); }
    let soChanged = false;
    const so = req.soNumber ? findSOByNumber(req.soNumber) : null;
    if(so && req.productId){ applyReceiptToRequirement(so.id, req.productId, req.materialId, req.qty); soChanged = true; }
    resolveCheckFor(req.materialId);
    req.status = 'stock-approved'; req.approvalStatus = 'approved';
    req.approvedBy = acc.name;
    await saveKey('mrf'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('tickets');
    if(soChanged){ await saveKey('soList'); await saveKey('excessPool'); }
    toast(`${req.mrfNo} approved — ${req.qty} ${req.materialName} added to stock at ${req.location}`);
    render();
    return;
  }
  req.approvalStatus = 'approved';
  req.approvedBy = acc.name;
  await saveKey('mrf');
  toast(`${req.mrfNo} approved — the store can now issue it`);
  render();
}
async function rejectMRFRequest(mrfId){
  const req = (DB.mrf||[]).find(r=>r.id===mrfId);
  if(!req || req.approvalStatus!=='awaiting') return;
  const reason = prompt(`Reason for rejecting ${req.qty} ${req.materialName} (mandatory):`, '');
  if(reason===null) return; // cancelled — leave the request awaiting
  const trimmed = reason.trim();
  if(!trimmed){ toast('A remark is required to reject a request', true); return; }
  req.approvalStatus = 'rejected';
  req.status = 'rejected';
  req.rejectReason = trimmed;
  await saveKey('mrf');
  toast(req.kind==='stock-in'
    ? `${req.mrfNo} rejected — ${req.materialName} will not be added to stock`
    : `${req.mrfNo} rejected`, true);
  render();
}
window.approveMRFRequest = approveMRFRequest;
window.rejectMRFRequest = rejectMRFRequest;

/* =========================================================================
   REQUESTER ACCOUNT — "My Requests"
   The only screen an admin-created account can see: MRF requests logged on
   Device 2 whose "Referred by" text matched this account's Name. New requests
   land in "Awaiting your approval"; Approve lets the store issue the material,
   Reject blocks it. Everything else about the app is invisible to this login.
   ========================================================================= */
function renderRequesterDash(el){
  const acc = CURRENT_ACCOUNT;
  if(!acc){ el.innerHTML = `<div class="empty">No account loaded — please log in again.</div>`; return; }
  const mine = (DB.mrf||[]).filter(r=>r.requestAccountId===acc.id);
  const awaiting = mine.filter(r=>r.approvalStatus==='awaiting').slice().reverse();
  const history = mine.filter(r=>r.approvalStatus==='approved' || r.approvalStatus==='rejected').slice().reverse();
  // Material sent for repair with this account's name on "Referred by" — read-only
  // awareness (no approval step, unlike MRF above): matched the same way, by
  // requestAccountId set at save time when the typed name matched this account.
  const myRepairs = (DB.materialRepair||[]).filter(r=>r.requestAccountId===acc.id);
  const repairsOut = myRepairs.filter(r=>r.status==='out').slice().reverse();
  const repairsHistory = myRepairs.filter(r=>r.status!=='out').slice().reverse();
  el.innerHTML = `
    <h2 class="section-title">My Requests</h2>
    <div class="section-sub">Material requests logged at the store under your name, "${acc.name}". Approve to let the store issue it, to send a new material to Device 1 for purchase, or to release a purchased/received material into stock — or reject it with a reason.</div>
    ${collapsePanel('reqdash-awaiting', 'Awaiting your approval', awaiting.length ? `<table><thead><tr><th>MRF No.</th><th>Date</th><th>Type</th><th>Material</th><th>Size</th><th>Qty</th><th>Purpose</th><th>SO</th><th>Action</th></tr></thead><tbody>
      ${awaiting.map(r=>`<tr><td>${r.mrfNo}</td><td>${r.date}</td><td>${r.kind==='stock-in'? (r.materialId? '<span class="status-low">Received — add to stock</span>' : '<span class="status-low">New material — send for purchase</span>') :'Issue'}</td><td>${r.materialName}</td><td>${r.size||'—'}</td><td>${r.qty}</td><td>${r.purpose||'—'}</td><td>${r.soNumber||'—'}</td>
      <td><button class="btn small" onclick="approveMRFRequest('${r.id}')">Approve</button> <button class="btn small secondary" onclick="rejectMRFRequest('${r.id}')">Reject</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Nothing waiting on you right now.</div>`, `${awaiting.length}`)}
    ${collapsePanel('reqdash-history', 'History', history.length ? `<table><thead><tr><th>MRF No.</th><th>Date</th><th>Material</th><th>Qty</th><th>Status</th><th>Your remark</th></tr></thead><tbody>
      ${history.map(r=>`<tr><td>${r.mrfNo}</td><td>${r.date}</td><td>${r.materialName}</td><td>${r.qty}</td><td>${r.approvalStatus==='approved'? mrfStatusBadge(r) : '<span class="status-crit">Rejected by you</span>'}</td><td>${r.rejectReason||'—'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">No history yet.</div>`, `${history.length}`)}
    ${collapsePanel('reqdash-repairsout', 'Material out for repair, referred by you', `${repairsOut.length ? `<table><thead><tr><th>Material</th><th>Serial code</th><th>Qty</th><th>Vendor</th><th>Issue date</th><th>Days out</th></tr></thead><tbody>
      ${repairsOut.map(r=>`<tr><td>${r.materialName}</td><td>${r.serialCode?`<span class="mono">${r.serialCode}</span>`:'—'}</td><td>${r.qty}</td><td>${r.vendorName||'—'}</td><td>${r.issueDate||'—'}</td><td class="status-low">${daysSinceToday(r.issueDate)}d</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Nothing currently out for repair under your name.</div>`}`, `${repairsOut.length}`)}
    ${collapsePanel('reqdash-repairshistory', 'Repair history, referred by you', repairsHistory.length ? `<table><thead><tr><th>Material</th><th>Serial code</th><th>Qty</th><th>Vendor</th><th>Outcome</th><th>Received back</th></tr></thead><tbody>
      ${repairsHistory.map(r=>`<tr><td>${r.materialName}</td><td>${r.serialCode?`<span class="mono">${r.serialCode}</span>`:'—'}</td><td>${r.qty}</td><td>${r.vendorName||'—'}</td><td>${r.status==='repaired'? '<span class="status-ok">Repaired</span>' : '<span class="status-crit">Scrap</span>'}</td><td>${r.returnedDate?`${r.returnedDate}${r.returnedTime?', '+r.returnedTime:''}`:'—'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">No repair history under your name yet.</div>`, `${repairsHistory.length}`)}`;
}

function renderMRF2(el){
  const pending = (DB.mrf||[]).filter(r=>r.status==='pending').slice().reverse();
  el.innerHTML = `
    <h2 class="section-title">Material Requisition (MRF)</h2>
    <div class="section-sub">Log a request from an internal department, or issue material directly
    .</div>
    <div class="panel">
      <h3>New requisition</h3>
      <form id="mrf-form">
        <div class="row">
          <div class="field" style="position:relative">
            <label>Material</label>
            <input required id="mrf-material" placeholder="Start typing…" autocomplete="off">
            <div class="autolist" id="mrf-material-list"></div>
            <div class="hint" id="mrf-material-hint"></div>
          </div>
          <div class="field"><label>Material type</label>${materialTypeSelectHTML('mrf-type')}</div>
          <div class="field" id="mrf-type-other-wrap" style="display:none;position:relative">
            <label>Other — type</label>
            <input id="mrf-type-other" placeholder="e.g. Rubber, Wood…" autocomplete="off">
            <div class="autolist" id="mrf-type-other-list"></div>
          </div>
        </div>
        <div class="row">
          ${sizePickerHTML('mrf-size','Size')}
        </div>
        <div class="row">
          <div class="field"><label>Quantity</label><input required id="mrf-qty" type="number" min="1" step="any"></div>
          <div class="field"><label>Location</label><select id="mrf-location">${DB.locations.map(l=>`<option>${l}</option>`).join('')}</select></div>
        </div>
        <div class="row" id="mrf-nos-row" style="display:none">
          <div class="field"><label>Quantity (Nos. — physical piece count)</label><input id="mrf-qty-nos" type="number" min="0" step="1"></div>
        </div>
        <div class="row">
          <div class="field"><label>Request by / Issued to</label><input required id="mrf-reqby" placeholder="Requesting department / person"></div>
          <div class="field" style="position:relative">
            <label>Referred by</label>
            <input required id="mrf-refby" placeholder="Type the approver's account name" autocomplete="off">
            <div class="autolist" id="mrf-refby-list"></div>
            <div class="hint" id="mrf-refby-hint"></div>
          </div>
          <div class="field"><label>Request approved by</label><input required id="mrf-appby" placeholder="Auto-fills once the account above approves"></div>
        </div>
        <div class="row">
          <div class="field"><label>Purpose</label><input required id="mrf-purpose" placeholder="e.g. Line maintenance"></div>
        </div>
        <div class="row">
          <div class="field">
            <label>SO Number </label>
            <input id="mrf-so" placeholder="SO-0221 — leave blank if not tied to an SO">
            <div class="hint" id="mrf-so-hint"></div>
          </div>
        </div>
        <div class="row" id="mrf-so-reason-row" style="display:none">
          <div class="field">
            <label>Reason for issuing against a different SO</label>
            <textarea id="mrf-so-reason" placeholder="Explain why this is allocated to a different SO — shown on Device 3"></textarea>
          </div>
        </div>
        <div class="row">
          <div class="field" style="flex:0 0 auto">
            <button class="btn secondary" type="button" id="mrf-btn-request">Request</button>
            <span class="hint" style="display:inline">Sends the request to Gate Entry .</span>
          </div>
        </div>
        <div class="row">
          <div class="field" style="flex:0 0 auto">
            <button class="btn" type="button" id="mrf-btn-issue">Issue Material</button>
            <span class="hint" style="display:inline">Issues the material right now — deducts stock immediately.</span>
          </div>
        </div>
      </form>
    </div>
    ${collapsePanel('mrf2-pending', 'Pending requests — awaiting issue', renderMRFTable(pending, true), `${pending.length}`)}
    ${collapsePanel('mrf2-week', "This week's requests", renderMRFTable((DB.mrf||[]).filter(r=>isThisWeek(r.date)).slice().reverse(), true))}
    ${renderMRFOlderSection('mrf2')}
    ${collapsePanel('mrf2-issuelog', 'Issue log', renderIssuesTable(DB.issues.slice().reverse()))}`;

  const input = document.getElementById('mrf-material');
  const nosRow = document.getElementById('mrf-nos-row');
  const soInput = document.getElementById('mrf-so');
  const soHint = document.getElementById('mrf-so-hint');
  const soReasonRow = document.getElementById('mrf-so-reason-row');
  const soReasonInput = document.getElementById('mrf-so-reason');

  function checkSOMismatch(){
    const mat = (input.dataset.materialId && DB.materials.find(m=>m.id===input.dataset.materialId))
      || DB.materials.find(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
    const matSO = (mat && mat.soNumber || '').trim();
    const entered = soInput.value.trim();
    const mismatch = matSO && entered && entered.toLowerCase() !== matSO.toLowerCase();
    soReasonRow.style.display = mismatch ? 'flex' : 'none';
    if(!mismatch) soReasonInput.value='';
    return mismatch;
  }

  attachAutocomplete(input, document.getElementById('mrf-material-list'), ()=>DB.materials, (m)=>{
    input.dataset.materialId = m.id; input.value=m.name;
    document.getElementById('mrf-material-hint').textContent = `In stock: ${getStock(m.id)} ${m.unit}${m.rack? ' · Rack: '+m.rack : ''}`;
    nosRow.style.display = 'flex';
    if(m.soNumber){ soHint.textContent = `This material is tagged to SO ${m.soNumber}. Enter that SO, or a different one with a reason.`; soInput.value = m.soNumber; }
    else { soHint.textContent = 'This material has no SO tagged — enter the SO it is being issued for, if any.'; }
    checkSOMismatch();
  }, (m)=>`${m.type} · ${m.category} · stock ${getStock(m.id)}`);
  input.addEventListener('input', ()=>{
    const exact = DB.materials.find(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
    if(!exact || exact.id!==input.dataset.materialId){
      delete input.dataset.materialId;
      document.getElementById('mrf-material-hint').textContent=''; soHint.textContent='';
      nosRow.style.display = 'flex';
    }
    checkSOMismatch();
  });
  soInput.addEventListener('input', checkSOMismatch);

  const refbyInput = document.getElementById('mrf-refby');
  const refbyHint = document.getElementById('mrf-refby-hint');
  function checkReferredByAccount(){
    const acc = findAccountByName(refbyInput.value);
    refbyHint.textContent = refbyInput.value.trim()
      ? (acc ? `Will be sent to "${acc.name}"'s dashboard for approval.` : `No account named "${refbyInput.value.trim()}" — this request will not need approval.`)
      : '';
  }
  attachAutocomplete(refbyInput, document.getElementById('mrf-refby-list'), ()=>(CONFIG.requesterAccounts||[]).map(a=>({name:a.name})), (o)=>{ refbyInput.value = o.name; checkReferredByAccount(); }, ()=>'Account — will be routed for approval');
  refbyInput.addEventListener('input', checkReferredByAccount);

  const typeSelect = document.getElementById('mrf-type');
  const typeOtherWrap = document.getElementById('mrf-type-other-wrap');
  const typeOtherInput = document.getElementById('mrf-type-other');
  typeSelect.addEventListener('change', ()=>{ typeOtherWrap.style.display = typeSelect.value==='__other__' ? 'flex' : 'none'; });
  attachAutocomplete(typeOtherInput, document.getElementById('mrf-type-other-list'), ()=>(DB.customMaterialTypes||[]).map(t=>({name:t})), (o)=>{ typeOtherInput.value = o.name; });
  wireSizePicker('mrf-size');
  wireMRFOlderSection('mrf2', true);
  enableGridNav(document.getElementById('mrf-form'));

  function resetMRFForm(){
    document.getElementById('mrf-form').reset();
    delete input.dataset.materialId;
    typeOtherWrap.style.display='none'; nosRow.style.display='none'; soReasonRow.style.display='none';
    soHint.textContent=''; document.getElementById('mrf-material-hint').textContent='';
  }

  document.getElementById('mrf-btn-request').addEventListener('click', async ()=>{
    const materialName = input.value.trim();
    if(!materialName){ toast('Enter a material name', true); return; }
    const existingMat = (input.dataset.materialId && DB.materials.find(m=>m.id===input.dataset.materialId))
      || DB.materials.find(m=>m.name.toLowerCase()===materialName.toLowerCase());

    if(!existingMat){
      // Material isn't in the stock / inventory list at all — offer to raise a
      // purchase request for Device 1 instead of just blocking the request.
      const goPurchase = confirm(`"${materialName}" is not in the stock / inventory list.\n\nMove this request for purchase?\n\nOK = raise a purchase request (goes to your "Referred by" account for approval first, then to Device 1)\nCancel = cancel this request`);
      if(!goPurchase){ toast('Request cancelled', true); return; }
      const qty = Number(document.getElementById('mrf-qty').value);
      if(!qty || qty<=0){ toast('Enter a valid quantity', true); return; }
      let materialType = typeSelect.value;
      if(materialType==='__other__'){
        materialType = typeOtherInput.value.trim();
        if(!materialType){ toast('Type a material type, or pick one from the list', true); return; }
        const known = allMaterialTypeOptions().some(t=>t.toLowerCase()===materialType.toLowerCase());
        if(!known){ DB.customMaterialTypes = DB.customMaterialTypes||[]; DB.customMaterialTypes.push(materialType); await saveKey('customMaterialTypes'); }
      }
      const mrfNo = 'MRF-' + String((DB.mrf||[]).length + 1).padStart(4,'0');
      const referredBy = document.getElementById('mrf-refby').value;
      const acc = findAccountByName(referredBy);
      const req = {
        id: uid(), mrfNo, materialId: null, materialName, materialType, size: readSizeValue('mrf-size'),
        qty, qtyNos: 0, location: document.getElementById('mrf-location').value, purpose: document.getElementById('mrf-purpose').value,
        requestBy: document.getElementById('mrf-reqby').value, referredBy,
        approvedBy: document.getElementById('mrf-appby').value,
        date: todayStr(), time: nowTimeStr(),
        status: acc ? 'awaiting-purchase-approval' : 'needs-purchase',
        kind: 'stock-in',
        soNumber: soInput.value.trim(), crossSO:false, crossSOReason:'', issueId: null, productId: null,
        requestAccountId: acc ? acc.id : null,
        approvalStatus: acc ? 'awaiting' : 'auto'
      };
      DB.mrf = DB.mrf||[]; DB.mrf.push(req);
      await saveKey('mrf');
      toast(acc
        ? `"${materialName}" isn't in stock — ${mrfNo} sent to ${acc.name}'s dashboard for approval before it goes to Device 1 for purchase.`
        : `"${materialName}" isn't in stock — purchase request ${mrfNo} sent to Device 1 (needs to be purchased).`);
      resetMRFForm();
      render();
      return;
    }

    const data = await gatherMRFFormData(false);
    if(!data) return;
    const mrfNo = 'MRF-' + String((DB.mrf||[]).length + 1).padStart(4,'0');
    const acc = findAccountByName(data.referredBy);
    const req = {
      id: uid(), mrfNo, materialId: data.mat.id, materialName: data.mat.name, materialType: data.materialType, size: data.size,
      qty: data.qty, qtyNos: data.qtyNos, location: data.location, purpose: data.purpose,
      requestBy: data.requestBy, referredBy: data.referredBy, approvedBy: data.approvedBy,
      date: todayStr(), time: nowTimeStr(), status: 'pending',
      soNumber: data.soEntered, crossSO: data.crossSO, crossSOReason: data.crossSOReason, issueId: null,
      requestAccountId: acc ? acc.id : null,
      approvalStatus: acc ? 'awaiting' : 'auto'
    };
    DB.mrf = DB.mrf||[]; DB.mrf.push(req);
    await saveKey('mrf');
    toast(acc ? `${mrfNo} — sent to ${acc.name}'s dashboard for approval` : `${mrfNo} — request sent to Gate Entry & Monitoring, awaiting issue`);
    resetMRFForm();
    render();
  });

  document.getElementById('mrf-btn-issue').addEventListener('click', async ()=>{
    const data = await gatherMRFFormData(true);
    if(!data) return;
    await performMRFIssue(data, null);
    toast(`Issued ${data.qty} ${data.mat.unit} of ${data.mat.name} to ${data.requestBy}` + (data.crossSO? ' — flagged: different SO' : ''), data.crossSO);
    resetMRFForm();
    render();
  });
}
function renderMRFReadOnly(el, title){
  el.innerHTML = `
    <h2 class="section-title">${title}</h2>
    <div class="section-sub">Material requisitions — and the issues they cover — logged at Device 2 (the store), synced here read-only. Pending requests appear here as soon as Device 2 submits them.</div>
    ${collapsePanel('mrfro-week', "This week's requests", renderMRFTable((DB.mrf||[]).filter(r=>isThisWeek(r.date)).slice().reverse()))}
    ${renderMRFOlderSection('mrfro')}
    ${collapsePanel('mrfro-issuelog', 'Issue log', renderIssuesTable(DB.issues.slice().reverse()))}`;
  wireMRFOlderSection('mrfro');
}
function renderMRF1(el){ renderMRFReadOnly(el, 'Material Request'); }
function renderMRF3(el){ renderMRFReadOnly(el, 'Material Request'); }

/* =========================================================================
   MATERIAL REPAIR — material sent out to a vendor for repair.
   Logged only on Device 2 (Store), which also receives it back (Repaired or
   Scrap). Device 1 & Device 3 see the same list read-only; the matched
   "Referred by" requester account sees their own under My Requests. A daily
   alert (ticket engine) stays open on the banner/Tickets tab for the entire
   time an item's status is 'out'.
/* ---------------- material repair: serial-code lookup ----------------
   A Serial Code identifies one physical item, so once it's been used for a
   material it should always mean that same material — even across separate
   repair entries/history, not just while something is currently out. */
let materialRepairSubmitting = false; // guards the submit handler below against double-submits
function findSerialOwner(serialCode){
  const v = (serialCode||'').trim().toLowerCase();
  if(!v) return null;
  const rec = (DB.materialRepair||[]).find(r=>(r.serialCode||'').trim().toLowerCase()===v);
  if(!rec) return null;
  return { materialId: rec.materialId, materialName: rec.materialName };
}
function knownSerialCodes(){
  const seen = new Map();
  (DB.materialRepair||[]).forEach(r=>{
    const code = (r.serialCode||'').trim();
    if(!code) return;
    const key = code.toLowerCase();
    if(!seen.has(key)) seen.set(key, { name: code, materialId: r.materialId, materialName: r.materialName });
  });
  return Array.from(seen.values());
}

// One repair "entry" can now carry several materials — each still saved as its
// own DB.materialRepair record (so each can be marked Repaired/Scrap on its own
// schedule), but tagged with a shared groupId and, per material, an optional
// Serial Code so it's clear exactly which physical item went out. "+ Add
// material" appends another row; Vendor/Issue date/Referred by are shared
// across every row in the entry.
function mrMaterialRow(){
  return `<div class="mr-row-item">
      <div class="row" style="align-items:flex-start">
        <div class="field" style="position:relative;flex:2 1 0">
          <label>Material</label>
          <input required class="mr-material" placeholder="Start typing…" autocomplete="off">
          <div class="autolist mr-material-list"></div>
          <div class="hint mr-material-hint"></div>
        </div>
        <div class="field" style="flex:1 1 0"><label>Size / Dimension</label><input class="mr-size" placeholder="e.g. 10 mm"></div>
        <div class="field" style="flex:0.6 1 0"><label>Quantity</label><input required class="mr-qty" type="number" min="1" step="any"></div>
        <div class="field" style="flex:1 1 0"><label>Location</label><select class="mr-location">${DB.locations.map(l=>`<option>${l}</option>`).join('')}</select></div>
        <div class="field" style="position:relative;flex:1.2 1 0">
          <label>Serial code</label>
          <input class="mr-serial" placeholder="e.g. SR-0231 — optional" autocomplete="off">
          <div class="autolist mr-serial-list"></div>
          <div class="hint mr-serial-hint"></div>
        </div>
        <div class="field" style="flex:0 0 auto"><label style="visibility:hidden;display:block">Remove</label><button type="button" class="btn small secondary mr-remove-row">Remove</button></div>
      </div>
      <div class="row mr-nos-row" style="display:none">
        <div class="field"><label>Quantity (Nos. — physical piece count)</label><input class="mr-qty-nos" type="number" min="0" step="1"></div>
      </div>
    </div>`;
}
function renderMaterialRepairForm(){
  return `<div class="panel">
      <h3>Send material for repair</h3>
      <form id="mr-form">
        <div id="mr-rows">${mrMaterialRow()}</div>
        <button class="btn small secondary" type="button" id="mr-add-row" style="margin:4px 0 16px">+ Add material</button>
        <div class="row">
          <div class="field"><label>Vendor name</label><input required id="mr-vendor" placeholder="Repair vendor"></div>
          <div class="field"><label>Issue date</label><input required id="mr-issuedate" type="date" value="${todayStr()}"></div>
          <div class="field" style="position:relative">
            <label>Referred by</label>
            <input id="mr-refby" placeholder="Account name — optional" autocomplete="off">
            <div class="autolist" id="mr-refby-list"></div>
            <div class="hint" id="mr-refby-hint"></div>
          </div>
        </div>
        <div class="row">
          <div class="field" style="flex:0 0 auto">
            <button class="btn" type="submit" id="mr-save-btn">Save — send for repair</button>
            <span class="hint" style="display:inline">Deducts each row's quantity from stock right away — it's physically off-site until it comes back.</span>
          </div>
        </div>
      </form>
    </div>`;
}
function wireMaterialRepairForm(){
  const form = document.getElementById('mr-form');
  if(!form) return;
  const rowsWrap = document.getElementById('mr-rows');

  function wireRow(rowEl){
    const input = rowEl.querySelector('.mr-material');
    const listEl = rowEl.querySelector('.mr-material-list');
    const hintEl = rowEl.querySelector('.mr-material-hint');
    const nosRow = rowEl.querySelector('.mr-nos-row');
    const sizeInput = rowEl.querySelector('.mr-size');
    const qtyInput = rowEl.querySelector('.mr-qty');
    const serialInput = rowEl.querySelector('.mr-serial');
    const serialListEl = rowEl.querySelector('.mr-serial-list');
    const serialHint = rowEl.querySelector('.mr-serial-hint');

    function checkSerialField(){
      const v = serialInput.value.trim();
      if(!v){ serialHint.textContent=''; serialHint.classList.remove('hint-error'); return; }
      const owner = findSerialOwner(v);
      if(!owner){ serialHint.textContent=''; serialHint.classList.remove('hint-error'); return; }
      if(input.dataset.materialId && owner.materialId !== input.dataset.materialId){
        serialHint.textContent = `Already used for ${owner.materialName} — a serial code can't be reused for a different material.`;
        serialHint.classList.add('hint-error');
      } else if(!input.dataset.materialId){
        // Serial recognized but no material picked yet — recognize it for them.
        const mat = DB.materials.find(m=>m.id===owner.materialId);
        if(mat){
          input.value = mat.name; input.dataset.materialId = mat.id;
          hintEl.textContent = `In stock: ${getStock(mat.id)} ${mat.unit}${mat.rack? ' · Rack: '+mat.rack : ''}`;
          nosRow.style.display = 'flex';
          if(!sizeInput.value.trim() && mat.size) sizeInput.value = mat.size;
        }
        serialHint.textContent = `Recognized — matches ${owner.materialName}.`;
        serialHint.classList.remove('hint-error');
      } else {
        serialHint.textContent = `Matches ${owner.materialName}.`;
        serialHint.classList.remove('hint-error');
      }
    }
    // Auto-fills the Serial code field from the matched material's base
    // Product Code (set in the Materials master) + this row's current
    // Quantity — e.g. Product Code "A0001" on "Grinder" with Qty 3 becomes
    // "grA0001-1, grA0001-2, grA0001-3", so identical-name items sent
    // together can still be told apart. Materials with no Product Code on
    // file are left alone so the field stays free text, exactly as before.
    function autofillSerialFromMaterial(){
      if(input.dataset.materialId){
        const mat = DB.materials.find(m=>m.id===input.dataset.materialId);
        const codes = materialSerialCodesList(mat, qtyInput.value);
        if(codes.length) serialInput.value = codes.join(', ');
      }
      checkSerialField();
    }
    qtyInput.addEventListener('input', autofillSerialFromMaterial);
    attachAutocomplete(serialInput, serialListEl, knownSerialCodes, (o)=>{
      serialInput.value = o.name;
      checkSerialField();
    }, (o)=>o.materialName);
    serialInput.addEventListener('input', checkSerialField);

    attachAutocomplete(input, listEl, ()=>DB.materials, (m)=>{
      input.dataset.materialId = m.id; input.value = m.name;
      hintEl.textContent = `In stock: ${getStock(m.id)} ${m.unit}${m.rack? ' · Rack: '+m.rack : ''}`;
      nosRow.style.display = 'flex';
      if(!sizeInput.value.trim() && m.size) sizeInput.value = m.size;
      autofillSerialFromMaterial();
    }, (m)=>`${m.productCode?'Code: '+m.productCode+' · ':''}${m.type} · ${m.category} · stock ${getStock(m.id)}`);
    input.addEventListener('input', ()=>{
      const exact = DB.materials.find(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
      if(!exact || exact.id!==input.dataset.materialId){
        delete input.dataset.materialId;
        hintEl.textContent='';
        nosRow.style.display = 'flex';
      }
      checkSerialField();
    });
    rowEl.querySelector('.mr-remove-row').addEventListener('click', ()=>{
      if(rowsWrap.querySelectorAll('.mr-row-item').length<=1) return;
      rowEl.remove();
      updateRemoveButtons();
    });
  }
  function updateRemoveButtons(){
    const rows = rowsWrap.querySelectorAll('.mr-row-item');
    rows.forEach(r=>{ r.querySelector('.mr-remove-row').style.display = rows.length>1 ? '' : 'none'; });
  }
  rowsWrap.querySelectorAll('.mr-row-item').forEach(wireRow);
  updateRemoveButtons();

  document.getElementById('mr-add-row').addEventListener('click', ()=>{
    const holder = document.createElement('div');
    holder.innerHTML = mrMaterialRow();
    const rowEl = holder.firstElementChild;
    rowsWrap.appendChild(rowEl);
    wireRow(rowEl);
    updateRemoveButtons();
    rowEl.querySelector('.mr-material').focus();
  });

  const refbyInput = document.getElementById('mr-refby');
  const refbyHint = document.getElementById('mr-refby-hint');
  function checkReferredByAccount(){
    const acc = findAccountByName(refbyInput.value);
    refbyHint.textContent = refbyInput.value.trim()
      ? (acc ? `Will show under "${acc.name}"'s My Requests.` : `No account named "${refbyInput.value.trim()}" — fine, this is just a label, no approval needed.`)
      : '';
  }
  attachAutocomplete(refbyInput, document.getElementById('mr-refby-list'), ()=>(CONFIG.requesterAccounts||[]).map(a=>({name:a.name})), (o)=>{ refbyInput.value = o.name; checkReferredByAccount(); }, ()=>'Account');
  refbyInput.addEventListener('input', checkReferredByAccount);
  enableGridNav(form);

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(materialRepairSubmitting) return;
    const saveBtn = document.getElementById('mr-save-btn');

    const vendorName = document.getElementById('mr-vendor').value.trim();
    if(!vendorName){ toast('Enter the vendor name', true); return; }
    const issueDate = document.getElementById('mr-issuedate').value;
    if(!issueDate){ toast('Enter the issue date', true); return; }
    const referredByRaw = document.getElementById('mr-refby').value.trim();
    const acc = referredByRaw ? findAccountByName(referredByRaw) : null;

    // Validate every material row and collect it, summing requested qty per
    // material+location first so two rows of the same material can't each
    // pass the stock check while together over-drawing it.
    const rowEls = Array.from(rowsWrap.querySelectorAll('.mr-row-item'));
    const items = [];
    const requestedTotals = {};
    for(let i=0;i<rowEls.length;i++){
      const rowEl = rowEls[i];
      const input = rowEl.querySelector('.mr-material');
      const mat = (input.dataset.materialId && DB.materials.find(m=>m.id===input.dataset.materialId))
        || DB.materials.find(m=>m.name.trim().toLowerCase()===input.value.trim().toLowerCase());
      if(!mat){ toast(`Row ${i+1}: "${input.value.trim()}" isn't a known material — pick one from the list.`, true); return; }
      const qty = Number(rowEl.querySelector('.mr-qty').value||0);
      if(!qty || qty<=0){ toast(`Row ${i+1}: enter a quantity to send for repair`, true); return; }
      const location = rowEl.querySelector('.mr-location').value;
      const serialCode = rowEl.querySelector('.mr-serial').value.trim();
      if(serialCode){
        const owner = findSerialOwner(serialCode);
        if(owner && owner.materialId !== mat.id){
          toast(`Row ${i+1}: serial code "${serialCode}" is already assigned to ${owner.materialName} — it can't be reused for ${mat.name}.`, true);
          return;
        }
        const dupInSubmission = items.find(it=>it.serialCode && it.serialCode.toLowerCase()===serialCode.toLowerCase() && it.mat.id!==mat.id);
        if(dupInSubmission){
          toast(`Row ${i+1}: serial code "${serialCode}" is already used above for ${dupInSubmission.mat.name} in this entry.`, true);
          return;
        }
      }
      let qtyNos = 0;
      qtyNos = Number(rowEl.querySelector('.mr-qty-nos').value||0);
      const size = rowEl.querySelector('.mr-size').value.trim();
      requestedTotals[mat.id+'|'+location] = (requestedTotals[mat.id+'|'+location]||0) + qty;
      items.push({mat, qty, qtyNos, location, serialCode, size});
    }
    for(const key in requestedTotals){
      const [materialId, location] = key.split('|');
      const mat = DB.materials.find(m=>m.id===materialId);
      const available = getStock(materialId, location);
      if(requestedTotals[key] > available){
        toast(`Only ${available} ${mat?mat.unit:''} of ${mat?mat.name:'material'} in stock at ${location} — can't send ${requestedTotals[key]} for repair.`, true);
        return;
      }
    }
    for(const it of items){
      if(it.qtyNos>0){
        const availableNos = getStockNos(it.mat.id, it.location);
        if(it.qtyNos > availableNos){ toast(`Only ${availableNos} Nos. of ${it.mat.name} in stock at ${it.location}.`, true); return; }
      }
    }

    materialRepairSubmitting = true;
    saveBtn.disabled = true;
    try{
      const groupId = uid();
      DB.materialRepair = DB.materialRepair||[];
      items.forEach(it=>{
        const rep = {
          id: uid(), groupId, materialId: it.mat.id, materialName: it.mat.name, size: it.size||'', qty: it.qty, qtyNos: it.qtyNos, location: it.location,
          serialCode: it.serialCode, vendorName, issueDate, referredBy: referredByRaw, requestAccountId: acc? acc.id : null,
          date: todayStr(), time: nowTimeStr(), status:'out',
          returnedDate:null, returnedTime:null, loggedByDevice: DEVICE
        };
        DB.materialRepair.push(rep);
        addStock(it.mat.id, it.location, -it.qty);
        if(it.qtyNos>0){ addStockNos(it.mat.id, it.location, -it.qtyNos); }
        openMaterialRepairTicket(rep);
      });
      await saveKey('materialRepair'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('tickets');
      toast(items.length>1 ? `${items.length} materials sent to ${vendorName} for repair` : `${items[0].qty} ${items[0].mat.unit} ${items[0].mat.name} sent to ${vendorName} for repair`);
      render();
    }catch(err){
      console.error('material repair save failed', err);
      fail('Something went wrong while saving this — nothing was sent for repair. Please try again.');
    }
    function fail(msg){ toast(msg, true); }
    materialRepairSubmitting = false;
    saveBtn.disabled = false;
  });
}
// Shared by both closing actions — re-fetches the live record by id (same
// staleness protection as the gate-materials fix: the 4s poll can replace
// DB.materialRepair with fresh objects at any point, so a closure-captured
// record could silently be a no-op) and does the shared bookkeeping.
async function closeMaterialRepair(repairId, outcome){
  if(DEVICE!==2){ toast('Only Device 2 (Store) can mark a repair item received.', true); return; }
  const rep = (DB.materialRepair||[]).find(x=>x.id===repairId);
  if(!rep){ toast('That repair record no longer exists.', true); return; }
  if(rep.status!=='out'){ toast('This item has already been closed.', true); return; }
  try{
    rep.status = outcome; // 'repaired' or 'scrap'
    rep.returnedDate = todayStr(); rep.returnedTime = nowTimeStr();
    if(outcome==='repaired'){
      addStock(rep.materialId, rep.location, rep.qty);
      if(rep.qtyNos>0){ addStockNos(rep.materialId, rep.location, rep.qtyNos); }
    } else {
      DB.damaged = DB.damaged||[];
      DB.damaged.push({id:uid(), materialId: rep.materialId, materialName: rep.materialName, qty: rep.qty,
        date: todayStr(), location: rep.location, note: `Scrapped after repair at ${rep.vendorName||'vendor'} (sent ${rep.issueDate}${rep.serialCode?', serial '+rep.serialCode:''})`});
    }
    resolveMaterialRepairTicket(rep.id);
    await saveKey('materialRepair'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('damaged'); await saveKey('tickets');
    toast(`${rep.materialName} marked ${outcome==='repaired'?'Repaired — back in stock':'Scrap'}`);
    render();
  }catch(err){
    console.error('material repair close failed', err);
    toast('Something went wrong closing this out — please try again.', true);
  }
}
window.closeMaterialRepair = closeMaterialRepair;

function renderMaterialRepair(el){
  const canEdit = DEVICE===2;
  const rows = (DB.materialRepair||[]).slice().reverse();
  const out = rows.filter(r=>r.status==='out');
  const history = rows.filter(r=>r.status!=='out');
  el.innerHTML = `
    <h2 class="section-title">Material Repair</h2>
    <div class="section-sub">Material sent out to a vendor for repair. ${canEdit ? "Log it below when it leaves, then mark it Repaired or Scrap the moment it's back — that's what stops the daily alert." : 'Logged at Device 2 (the store), synced here read-only.'} A daily alert stays open on the Alerts banner and the Tickets tab for as long as any item below is still out.</div>
    ${canEdit ? renderMaterialRepairForm() : ''}
    ${collapsePanel('mr-out', 'Out for repair', out.length? `<table><thead><tr><th>Material</th><th>Size</th><th>Serial code</th><th>Qty</th><th>Vendor</th><th>Location</th><th>Issue date</th><th>Logged</th><th>Referred by</th><th>Days out</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
    ${out.map(r=>`<tr><td>${r.materialName}</td><td>${r.size||'—'}</td><td>${r.serialCode?`<span class="mono">${r.serialCode}</span>`:'—'}</td><td>${r.qty}${r.qtyNos?' ('+r.qtyNos+' Nos.)':''}</td><td>${r.vendorName||'—'}</td><td>${r.location||'—'}</td><td>${r.issueDate||'—'}</td><td>${r.date}${r.time?', '+r.time:''}</td><td>${r.referredBy||'—'}</td><td class="status-low">${daysSinceToday(r.issueDate)}d</td>
    ${canEdit? `<td style="white-space:nowrap"><button class="btn small" onclick="closeMaterialRepair('${r.id}','repaired')">Mark Repaired</button> <button class="btn small secondary" onclick="closeMaterialRepair('${r.id}','scrap')">Mark Scrap</button></td>` : ''}</tr>`).join('')}
    </tbody></table>` : `<div class="empty">Nothing currently out for repair.</div>`, `${out.length}`)}
    ${collapsePanel('mr-history', 'Repair history', history.length? `<table><thead><tr><th>Material</th><th>Size</th><th>Serial code</th><th>Qty</th><th>Vendor</th><th>Location</th><th>Issue date</th><th>Referred by</th><th>Outcome</th><th>Received back</th></tr></thead><tbody>
    ${history.map(r=>`<tr><td>${r.materialName}</td><td>${r.size||'—'}</td><td>${r.serialCode?`<span class="mono">${r.serialCode}</span>`:'—'}</td><td>${r.qty}${r.qtyNos?' ('+r.qtyNos+' Nos.)':''}</td><td>${r.vendorName||'—'}</td><td>${r.location||'—'}</td><td>${r.issueDate||'—'}</td><td>${r.referredBy||'—'}</td><td>${r.status==='repaired'? '<span class="status-ok">Repaired</span>' : '<span class="status-crit">Scrap</span>'}</td><td>${r.returnedDate?`${r.returnedDate}${r.returnedTime?', '+r.returnedTime:''}`:'—'}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No repair history yet.</div>`, `${history.length}`)}`;
  if(canEdit) wireMaterialRepairForm();
}

