/* =========================================================================
   DEVICE 1 — DATA MANAGEMENT
   ========================================================================= */
function renderDash1(el){
  const totalMaterials = DB.materials.length;
  const gateThisWeek = DB.gateEntries.filter(g=>isThisWeek(g.date)).length;
  el.innerHTML = `
    <h2 class="section-title">Data Management Dashboard</h2>
    <div class="section-sub">Gate entry, material master, and supplier/customer records.</div>
    <div class="cards">
      ${kpi('Materials in system', totalMaterials, '', 'materials')}
      ${kpi('Gate entries this week', gateThisWeek, '', '#dash1-recent-gate')}
      ${kpi('Open tickets (needs restock)', DB.tickets.filter(t=>t.status==='open').length, 'bad', '#dash1-open-tickets')}
    </div>
    ${collapsePanelAnchored('dash1-open-tickets', 'Materials awaiting restock', renderTicketMini(), `${DB.tickets.filter(t=>t.status==='open').length}`)}
    ${scopedCollapsePanel('dash1-recent-gate', 'Recent gate entries', DB.gateEntries, 'date', renderGateTable, true)}`;
}
function renderTicketMini(){
  const open = DB.tickets.filter(t=>t.status==='open');
  if(!open.length) return `<div class="empty">No open tickets — all materials above threshold.</div>`;
  return `<table><thead><tr><th>Material</th><th>Type</th><th>Detail</th><th>Opened</th><th>Alerts</th></tr></thead><tbody>
    ${open.map(t=> t.type==='so-mismatch'
      ? `<tr><td>${t.materialName}</td><td class="status-crit">SO mismatch</td><td>Issued vs SO ${t.requestedSO||'—'} (tagged ${t.materialSO||'—'})</td><td>${t.createdDate}</td><td>${t.alertCount||1}</td></tr>`
      : t.type==='product-mismatch'
      ? `<tr><td>${t.materialName}</td><td class="status-crit">Product mismatch</td><td>Sr No. ${t.srNo||'—'} at ${t.site||'—'}</td><td>${t.createdDate}</td><td>${t.alertCount||1}</td></tr>`
      : `<tr><td>${t.materialName}</td><td class="status-low">Low stock</td><td>${getStock(t.materialId)} ≤ ${DB.thresholds[t.materialId]}</td><td>${t.createdDate}</td><td>${t.alertCount||1}</td></tr>`
    ).join('')}
  </tbody></table>`;
}

function allSONumbers(){
  const set = new Set();
  DB.gateEntries.forEach(g=>{ if(g.soNumber) set.add(g.soNumber); });
  DB.materials.forEach(m=>{ if(m.soNumber) set.add(m.soNumber); });
  DB.issues.forEach(i=>{ if(i.soNumber) set.add(i.soNumber); });
  (DB.soList||[]).forEach(s=>{ if(s.soNumber) set.add(s.soNumber); });
  return [...set];
}
function allPONumbers(){
  const set = new Set();
  DB.gateEntries.forEach(g=>{ if(g.poNumber) set.add(g.poNumber); });
  DB.materials.forEach(m=>{ if(m.poNumber) set.add(m.poNumber); });
  return [...set];
}
function allSupplierSuggestions(){
  // Contacts entered under Customers & Suppliers, PLUS any supplier name that
  // was ever typed straight into a gate entry — so hints still work even if
  // someone never formally added the supplier as a contact.
  const seen = new Set();
  const out = [];
  DB.contacts.forEach(c=>{
    const k = c.name.toLowerCase();
    if(!seen.has(k)){ seen.add(k); out.push({name:c.name, type:c.type, category:c.category}); }
  });
  DB.gateEntries.forEach(g=>{
    if(!g.supplier) return;
    const k = g.supplier.toLowerCase();
    if(!seen.has(k)){ seen.add(k); out.push({name:g.supplier, type:'Supplier'}); }
  });
  return out;
}
function gateMaterialRowHTML(rowId){
  // Excel-style single row: Material / Type / Category / Size / Grade / Qty / Nos. /
  // Product / Value are all editable cells, always visible — no hidden panels to hunt
  // through. Type/Category/Size/Grade auto-fill from the master list and lock (grey,
  // read-only) the moment an existing material is picked; they unlock for typing the
  // instant the name doesn't match anything, so a brand-new material can be specced
  // right here. A quiet sub-row appears only for the extra details (price/unit/rack/
  // piece-count) a genuinely new material needs before it can be added to stock.
  return `
  <tr class="g-row" data-row-id="${rowId}">
    <td><div class="field" style="margin:0;min-width:0;position:relative">
      <input required class="g-material" placeholder="Start typing…" autocomplete="off">
      <div class="autolist g-material-list"></div>
    </div></td>
    <td><input class="g-type" list="gm-type-list-${rowId}" placeholder="Type" autocomplete="off">
      <datalist id="gm-type-list-${rowId}">${allMaterialTypeOptions().map(t=>`<option value="${t}">`).join('')}</datalist>
    </td>
    <td><input class="g-cat" list="gm-cat-list-${rowId}" placeholder="Category" autocomplete="off">
      <datalist id="gm-cat-list-${rowId}">${DB.categories.map(c=>`<option value="${c}">`).join('')}</datalist>
    </td>
    <td><input class="g-mat-size" placeholder="e.g. 10 mm"></td>
    <td><input class="g-mat-grade" placeholder="e.g. Grade A"></td>
    <td><input required class="g-qty" type="number" min="1" step="any"></td>
    <td><select class="g-qty-unit">${DB.sizeOptions.map(u=>`<option>${u}</option>`).join('')}<option value="__other__">Others…</option></select>
      <input class="g-qty-unit-other" placeholder="e.g. sq.ft" style="display:none;margin-top:4px">
    </td>
    <td><input class="g-qty-nos" type="number" min="0" step="1" placeholder="—"></td>
    <td><select class="g-product" disabled><option value="">—</option></select></td>
    <td><input class="g-value" type="number" min="0" step="0.01" placeholder="optional"></td>
    <td><button type="button" class="btn danger small g-row-remove" style="display:none" title="Remove this line">✕</button></td>
  </tr>
  <tr class="g-row-hint-row" data-row-id="${rowId}"><td colspan="11"><div class="hint g-material-hint"></div></td></tr>
  <tr class="g-new-mat-row" data-row-id="${rowId}" style="display:none"><td colspan="11">
    <div class="new-mat-inline">
      <span class="status-low">New material — not in the master list yet. It'll be added with these details:</span>
      <label>Price/unit<input class="g-new-price" type="number" min="0" step="0.01"></label>
      <label>Sales unit<select class="g-new-unit">${UNITS.map(u=>`<option>${u}</option>`).join('')}</select></label>
      <label>Rack/Location<input class="g-new-rack" placeholder="e.g. Rack A-3"></label>
    </div>
  </td></tr>`;
}
// Creates a new material from a gate-entry row's draft fields (used when the typed
// material name doesn't match anything in the master list). Mirrors the validation/
// dedupe logic of the Materials master form so a material entered this way is exactly
// as precise as one entered under Materials. Returns the new material object, the
// string 'duplicate' if an identical one already exists, or null if Type was missing.
async function createMaterialFromDraft(draft){
  let type = draft.type;
  if(!type) return null;
  if(draft.typeIsOther){
    const known = allMaterialTypeOptions().some(t=>t.toLowerCase()===type.toLowerCase());
    if(!known){ DB.customMaterialTypes = DB.customMaterialTypes||[]; DB.customMaterialTypes.push(type); await saveKey('customMaterialTypes'); }
  }
  if(DB.materials.find(m=>m.name.toLowerCase()===draft.name.toLowerCase() && m.type===type
      && (m.size||'').toLowerCase()===draft.size.toLowerCase() && (m.grade||'').toLowerCase()===draft.grade.toLowerCase())){
    return 'duplicate';
  }
  const mat = {
    id: uid(), name: draft.name, type, category: draft.category, rack: draft.rack,
    size: draft.size, grade: draft.grade, price: draft.price||0, unit: draft.unit,
    poNumber:'', soNumber:'', dateAdded: todayStr(), trackNos: draft.trackNos
  };
  DB.materials.push(mat);
  await saveKey('materials');
  return mat;
}
function gateRequestStatusBadge(r){
  if(r.status==='pending') return '<span class="status-low">Awaiting Device 2 approval</span>';
  if(r.status==='approved') return '<span class="status-ok">Approved — add materials</span>';
  if(r.status==='rejected') return '<span class="status-crit">Rejected</span>';
  if(r.status==='completed') return '<span class="status-ok">Completed</span>';
  if(r.status==='cancelled') return '<span class="status-low">Closed — no materials</span>';
  return r.status;
}
function gateRequestStatusLabel(r){
  const map = {pending:'Pending — Awaiting Device 2 Approval', approved:'Approved', rejected:'Rejected', completed:'Completed', cancelled:'Cancelled — No Materials'};
  return map[r.status] || r.status;
}
// Day/Week/Month/Year scoping for the "Gate entry requests" list — same pattern as
// the "All gate entries" scope controls above, kept outside DB so it resets on
// reload but survives the 4s auto-refresh poll.
let gateRequestsScopeState = { scope:'today', customDate:null, customMonth:null, customYear:null, calendarOpen:false };
let gateRequestsUIState = { openGroups:{}, openItems:{} };
function scopeGateRequests(rows){
  const scope = gateRequestsScopeState.scope;
  const now = new Date();
  if(scope==='today') return rows.filter(r=>daysSinceToday(r.date)===0);
  if(scope==='week') return rows.filter(r=>{ const d=daysSinceToday(r.date); return d>=0 && d<=6; });
  if(scope==='month') return rows.filter(r=>{ if(!r.date) return false; const d=new Date(r.date+'T00:00:00'); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth(); });
  if(scope==='year') return rows.filter(r=>{ if(!r.date) return false; return new Date(r.date+'T00:00:00').getFullYear()===now.getFullYear(); });
  if(scope==='custom-day') return gateRequestsScopeState.customDate ? rows.filter(r=>r.date===gateRequestsScopeState.customDate) : [];
  if(scope==='custom-month'){
    if(!gateRequestsScopeState.customMonth) return [];
    const [y,m] = gateRequestsScopeState.customMonth.split('-').map(Number);
    return rows.filter(r=>{ if(!r.date) return false; const d=new Date(r.date+'T00:00:00'); return d.getFullYear()===y && (d.getMonth()+1)===m; });
  }
  if(scope==='custom-year'){
    if(!gateRequestsScopeState.customYear) return [];
    return rows.filter(r=>{ if(!r.date) return false; return new Date(r.date+'T00:00:00').getFullYear()===Number(gateRequestsScopeState.customYear); });
  }
  return rows; // 'all'
}
function gateRequestsScopeHeading(){
  const s = gateRequestsScopeState;
  if(s.scope==='today') return 'Today — '+formatDateNice(todayStr());
  if(s.scope==='week') return 'Last 6 Days';
  if(s.scope==='month') return 'This Month — '+new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  if(s.scope==='year') return 'This Year — '+new Date().getFullYear();
  if(s.scope==='custom-day') return s.customDate ? formatDateNice(s.customDate) : 'Pick a day from the calendar below';
  if(s.scope==='custom-month') return s.customMonth ? formatMonthNice(s.customMonth) : 'Pick a month from the calendar below';
  if(s.scope==='custom-year') return s.customYear ? ('Year '+s.customYear) : 'Pick a year from the calendar below';
  return 'All gate entry requests';
}
function renderGateRequestsScopeControls(){
  const s = gateRequestsScopeState;
  const inCalendar = ['custom-day','custom-month','custom-year'].includes(s.scope);
  return `<div class="entries-scope-row">
      <button type="button" class="scope-btn ${s.scope==='today'?'active':''}" onclick="setGateRequestsScope('today')">Today</button>
      <button type="button" class="scope-btn ${s.scope==='week'?'active':''}" onclick="setGateRequestsScope('week')">Last 6 Days</button>
      <button type="button" class="scope-btn ${s.scope==='month'?'active':''}" onclick="setGateRequestsScope('month')">This Month</button>
      <button type="button" class="scope-btn ${s.scope==='year'?'active':''}" onclick="setGateRequestsScope('year')">This Year</button>
      <button type="button" class="scope-btn ${s.scope==='all'?'active':''}" onclick="setGateRequestsScope('all')">All</button>
      <button type="button" class="scope-btn ${inCalendar?'active':''}" onclick="toggleGateRequestsCalendar()">📅 Calendar (past day / month / year)</button>
    </div>
    <div class="entries-calendar-row" style="display:${s.calendarOpen?'flex':'none'}">
      <label>Pick a day
        <input type="date" value="${s.customDate||''}" max="${todayStr()}" onchange="pickGateRequestsDay(this.value)">
      </label>
      <label>Pick a month/year
        <input type="month" value="${s.customMonth||''}" max="${todayStr().slice(0,7)}" onchange="pickGateRequestsMonth(this.value)">
      </label>
      <label>Pick a year
        <input type="number" value="${s.customYear||''}" min="2000" max="${new Date().getFullYear()}" placeholder="${new Date().getFullYear()}" style="width:90px" onchange="pickGateRequestsYear(this.value)">
      </label>
    </div>
    <div class="entries-heading">${gateRequestsScopeHeading()}</div>`;
}
function setGateRequestsScope(scope){ gateRequestsScopeState.scope = scope; gateRequestsScopeState.calendarOpen = false; render(); }
function toggleGateRequestsCalendar(){ gateRequestsScopeState.calendarOpen = !gateRequestsScopeState.calendarOpen; render(); }
function pickGateRequestsDay(v){ if(!v) return; gateRequestsScopeState.customDate = v; gateRequestsScopeState.scope = 'custom-day'; gateRequestsScopeState.calendarOpen = true; render(); }
function pickGateRequestsMonth(v){ if(!v) return; gateRequestsScopeState.customMonth = v; gateRequestsScopeState.scope = 'custom-month'; gateRequestsScopeState.calendarOpen = true; render(); }
function pickGateRequestsYear(v){ if(!v) return; gateRequestsScopeState.customYear = v; gateRequestsScopeState.scope = 'custom-year'; gateRequestsScopeState.calendarOpen = true; render(); }
function toggleGateRequestGroup(gid){ gateRequestsUIState.openGroups[gid] = !gateRequestsUIState.openGroups[gid]; render(); }
function toggleGateRequestItem(id){ gateRequestsUIState.openItems[id] = !gateRequestsUIState.openItems[id]; render(); }
window.setGateRequestsScope = setGateRequestsScope;
window.toggleGateRequestsCalendar = toggleGateRequestsCalendar;
window.pickGateRequestsDay = pickGateRequestsDay;
window.pickGateRequestsMonth = pickGateRequestsMonth;
window.pickGateRequestsYear = pickGateRequestsYear;
window.toggleGateRequestGroup = toggleGateRequestGroup;
window.toggleGateRequestItem = toggleGateRequestItem;
function renderGateRequestHistoryPanel(){
  const all = (DB.gateRequests||[]).slice().reverse();
  if(!all.length) return '';
  const reqs = scopeGateRequests(all);
  const groups = {};
  reqs.forEach(r=>{ const label = gateRequestStatusLabel(r); (groups[label] = groups[label]||[]).push(r); });
  const groupNames = Object.keys(groups);
  return `<div class="panel">
    <h3>Gate entry requests</h3>
    <div class="section-sub" style="margin-top:-6px">Every challan sent to Device 2 for approval, grouped by status — collapsed by default. Click a request to view its details.</div>
    ${renderGateRequestsScopeControls()}
    <div class="entries-list">
      ${groupNames.length ? groupNames.map(label=>{
        const items = groups[label];
        const gid = safeId('greq-'+label);
        const gOpen = !!gateRequestsUIState.openGroups[gid];
        return `<div class="ent-group">
          <button type="button" class="ent-group-toggle" onclick="toggleGateRequestGroup('${gid}')">
            <span class="chev">${gOpen?'▾':'▸'}</span> ${label} (${items.length})
          </button>
          <div class="ent-group-body" style="display:${gOpen?'block':'none'}">
            ${items.map(r=>{
              const iOpen = !!gateRequestsUIState.openItems[r.id];
              return `<div class="ent-item">
                <button type="button" class="ent-item-toggle" onclick="toggleGateRequestItem('${r.id}')">
                  <span class="chev">${iOpen?'▾':'▸'}</span> <span class="name">Challan ${r.challanNo}</span>
                  <span class="ent-item-date">${r.date||'—'}</span>
                </button>
                <div class="ent-item-body" style="display:${iOpen?'block':'none'}">
                  PO Number: ${r.poNumber||'—'}<br>Vehicle No.: ${r.vehicleNo||'—'}<br>Supplier: ${r.supplier||'—'}<br>SO / Use: ${r.forFactoryUse?'Factory use':(r.soNumber||'—')}<br>Status: ${gateRequestStatusBadge(r)}<br>Note: ${r.status==='rejected'? (r.rejectReason||'—') : (r.status==='cancelled'? 'Closed by Device 1 — no materials added' : '—')}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('') : `<div class="empty">No gate entry requests for this period.</div>`}
    </div>
  </div>`;
}

// GRN main view — Device 1 can always submit a new challan for approval (multiple
// requests can be "in flight" awaiting Device 2 at once), and separately has one
// "Materials on this challan" panel per request Device 2 has already approved.
function renderGate(el){
  const approvedReqs = (DB.gateRequests||[]).filter(r=>r.status==='approved');
  // If the challan that was expanded got saved/rejected/vanished elsewhere, drop the
  // stale reference instead of pointing an accordion at a panel that no longer renders.
  if(expandedChallanId && !approvedReqs.some(r=>r.id===expandedChallanId)) expandedChallanId = null;
  el.innerHTML = `
    <h2 class="section-title">GRN</h2>
    <div class="section-sub">${hasD1Grant() ? 'Make a new gate entry — no separate Device 2 approval needed while acting as Device 1.' : "Submit a new challan for Device 2's approval — you can keep adding new gate entries while others are still awaiting approval."}</div>
    ${renderGateNewFormPanel()}
    ${approvedReqs.length ? `<div class="section-sub" style="margin-top:-6px">Materials on this challan — click one to open it, add its materials, and save. Only one opens at a time so the list stays easy to scan. A challan approved ${STALE_CHALLAN_DAYS}+ days ago with nothing added yet locks and needs Device 3 (Monitoring) to re-approve it.</div>` : ''}
    ${approvedReqs.map(req=>renderGateMaterialsPanel(req)).join('')}
    ${renderGateRequestHistoryPanel()}
    <h2 class="section-title" style="font-size:19px;margin-top:22px">All gate entries</h2>
    <div class="section-sub">Grouped by challan/bill, collapsed by default — click a challan to open it and view its materials and file. Use the buttons below to scope the list by day, week, month or year.</div>
    ${renderGateEntriesScopeControls()}
    ${renderGateEntriesGrouped(scopeGateEntries(DB.gateEntries.slice().reverse()))}`;

  wireGateNewForm();
  approvedReqs.forEach(req=>{ if(req.id===expandedChallanId && !isChallanStale(req)) wireGateMaterialsForm(req); });
}
function renderGateNewFormPanel(){
  const skipApproval = hasD1Grant();
  return `<div class="panel">
      <h3>New gate entry</h3>
      <form id="gate-request-form">
        <div class="row">
          <div class="field"><label>Challan / Bill No.</label><input required id="g-challan" placeholder="CH-2026-0134"></div>
          <div class="field"><label>Date</label><input required id="g-date" type="date" value="${todayStr()}"></div>
          <div class="field"><label>Vehicle No.</label><input required id="g-vehicle" placeholder="MH-12-AB-1234"></div>
        </div>
        <div class="row">
          <div class="field">
            <label>Upload challan file</label>
            <input type="file" id="g-file" accept="image/*,application/pdf" capture="environment">
            <div class="hint" id="g-file-hint">.</div>
          </div>
        </div>
        <div class="row">
          <div class="field" style="position:relative">
            <label>Supplier</label>
            <input id="g-supplier" placeholder="Start typing…" autocomplete="off">
            <div class="autolist" id="g-supplier-list"></div>
          </div>
          <div class="field" style="position:relative">
            <label>PO Number</label>
            <input required id="g-po" placeholder="PO-0098" autocomplete="off">
            <div class="autolist" id="g-po-list"></div>
          </div>
          <div class="field" style="position:relative">
            <label>SO Number</label>
            <input id="g-so" placeholder="SO-0221 — leave blank if for internal factory use" autocomplete="off">
            <div class="autolist" id="g-so-list"></div>
            <div class="hint">.</div>
          </div>
        </div>
        <button class="btn" type="submit">${skipApproval ? 'Make Entry' : 'Send for Device 2 approval'}</button>
      </form>
    </div>`;
}
function wireGateNewForm(){
  attachAutocomplete(document.getElementById('g-supplier'), document.getElementById('g-supplier-list'),
    allSupplierSuggestions, (c)=>{ document.getElementById('g-supplier').value = c.name; }, (c)=>c.type + (c.category? ' · '+c.category : ''));
  attachAutocomplete(document.getElementById('g-po'), document.getElementById('g-po-list'),
    ()=>allPONumbers().map(p=>({name:p})), (p)=>{ document.getElementById('g-po').value = p.name; });
  attachAutocomplete(document.getElementById('g-so'), document.getElementById('g-so-list'),
    ()=>allSONumbers().map(s=>({name:s})), (s)=>{ document.getElementById('g-so').value = s.name; });

  document.getElementById('gate-request-form').addEventListener('submit', async (e)=>{
    e.preventDefault();

    const challanNo = document.getElementById('g-challan').value.trim();
    const poNumber = document.getElementById('g-po').value.trim();
    const vehicleNo = document.getElementById('g-vehicle').value.trim();
    if(!challanNo){ toast('Challan / Bill No. is required to enter material', true); document.getElementById('g-challan').focus(); return; }
    if(!poNumber){ toast('PO Number is required to enter material', true); document.getElementById('g-po').focus(); return; }
    if(!vehicleNo){ toast('Vehicle No. is required to enter material', true); document.getElementById('g-vehicle').focus(); return; }
    // A rejected or cancelled challan never actually received material, so its number
    // can be reused for a fresh submission. A completed one DID receive material and
    // is closed for good — its number can never be resubmitted, even to add more.
    const priorChallan = (DB.gateRequests||[]).find(r=> r.challanNo.toLowerCase()===challanNo.toLowerCase() && r.status!=='rejected' && r.status!=='cancelled');
    if(priorChallan){
      toast(priorChallan.status==='completed'
        ? `Challan ${challanNo} was already completed and closed — it can't be reused. Use a new challan number for any additional material.`
        : `Challan ${challanNo} already has a request in progress`, true);
      return;
    }

    const soVal = document.getElementById('g-so').value.trim();
    let forFactoryUse = false;
    if(!soVal){
      forFactoryUse = confirm('No SO number entered.\n\nIs this material for internal (factory) use?\n\nOK = Yes — enter it as factory use\nCancel = No — I\'ll enter the SO number');
      if(!forFactoryUse){ toast('SO Number is required unless this material is for internal factory use', true); document.getElementById('g-so').focus(); return; }
    }
    const so = findSOByNumber(soVal);
    if(so && so.status==='completed'){
      toast(`SO ${so.soNumber} is marked Complete by Device 3 — no new gate entry can be made for it until Device 3 marks it Incomplete again.`, true);
      return;
    }

    const fileInput = document.getElementById('g-file');
    const file = fileInput.files && fileInput.files[0];
    let challanFileId = null, challanFileName = null;
    // With Firebase Storage configured, files go there (limit ~15MB — far
    // above what a phone photo/PDF challan needs) and only a small URL
    // record is written to Firestore. Without Storage (local-fallback mode)
    // the file has to be embedded as base64 straight into the same
    // size-limited key/value store, so the old, tighter ~3.3MB cap still
    // applies in that case.
    const fileSizeLimit = firebaseStorage ? 15*1024*1024 : 3.3*1024*1024;
    if(file){
      if(file.size > fileSizeLimit){
        toast(`That photo is too large to attach (over ~${firebaseStorage?'15MB':'3.3MB'}) — the gate entry will still save, just without the photo. Try a smaller/lower-res photo.`, true);
      } else
      try{
        let fileType = file.type;
        if(!fileType){
          const ext = (file.name||'').split('.').pop().toLowerCase();
          const guess = {jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', heic:'image/heic', pdf:'application/pdf'}[ext];
          if(guess) fileType = guess;
        }
        challanFileId = uid();
        let fileRecord;
        const uploaded = await uploadFileToStorage(file, `challan-files/${challanFileId}-${file.name}`);
        if(uploaded){
          fileRecord = {name:file.name, type:fileType, url:uploaded.url, storagePath:uploaded.path};
        } else {
          // No Storage configured — fall back to embedding the file inline (old behaviour).
          let dataUrl = await new Promise((resolve,reject)=>{
            const reader = new FileReader();
            reader.onload = ()=>resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          if(fileType) dataUrl = dataUrl.replace(/^data:[^;]*;/, `data:${fileType};`);
          fileRecord = {name:file.name, type:fileType, dataUrl};
        }
        const saved = await Persist.set('challan-file:'+challanFileId, JSON.stringify(fileRecord), true);
        if(!saved){ throw new Error('storage write returned no result'); }
        challanFileName = file.name;
      }catch(err){
        console.error('challan file upload failed', err);
        challanFileId = null; challanFileName = null;
        toast('Could not attach the challan file — entry saved without it', true);
      }
    }

    // Device 2 acting as Device 1 (an active access grant) would just be approving
    // its own request — skip the pending/approval step and open the challan straight
    // away, but log it clearly so Device 3 can see it was self-entered under the grant.
    const actingAsDevice1 = hasD1Grant();
    const req = {
      id: uid(), challanNo, date: document.getElementById('g-date').value, time: nowTimeStr(),
      supplier: document.getElementById('g-supplier').value, vehicleNo,
      poNumber, soNumber: soVal, forFactoryUse, challanFileId, challanFileName,
      status: actingAsDevice1 ? 'approved' : 'pending',
      requestedDate: todayStr(), requestedTime: nowTimeStr(),
      loggedByDevice: DEVICE
    };
    if(actingAsDevice1){
      req.approvedDate = todayStr(); req.approvedTime = nowTimeStr();
      req.approvedBy = 'Device 2 (acting as Device 1 — no separate approval needed)';
      grantLog('gate-entry', `Challan ${challanNo} entered by Device 2 acting as Device 1 — no separate approval step`);
      await saveKey('deviceAccessGrant');
    }
    DB.gateRequests = DB.gateRequests || [];
    DB.gateRequests.push(req);
    await saveKey('gateRequests');
    toast(actingAsDevice1
      ? `Challan ${challanNo} entered — no separate approval needed while acting as Device 1`
      : `Gate entry request sent to Device 2 for approval — challan ${challanNo}`);
    TAB = 'gate';
    buildNav();
    render();
  });
}
function renderGateMaterialsPanel(req){
  const isOpen = expandedChallanId === req.id;
  const stale = isChallanStale(req);
  const head = `<div class="challan-accordion-head" onclick="toggleChallanPanel('${req.id}')">
      <div class="challan-accordion-title">
        <span class="chevron${isOpen?' open':''}">▸</span>
        <strong>${req.challanNo}</strong>
        ${stale ? `<span class="status-low" style="font-size:11.5px">⏳ AWAITING RE-APPROVAL</span>` : `<span class="status-ok" style="font-size:11.5px">Approved</span>`}
      </div>
      <div class="challan-accordion-meta">${req.date} · ${req.supplier||'—'} · Vehicle ${req.vehicleNo||'—'} · PO ${req.poNumber||'—'}</div>
    </div>`;
  if(!isOpen){
    return `<div class="panel challan-accordion">${head}</div>`;
  }
  if(stale){
    return `<div class="panel challan-accordion open">
    ${head}
    <table style="margin:14px 0 12px"><tbody>
      <tr><th>Date</th><td>${req.date}</td><th>Vehicle No.</th><td>${req.vehicleNo}</td></tr>
      <tr><th>Supplier</th><td>${req.supplier||'—'}</td><th>PO Number</th><td>${req.poNumber}</td></tr>
      <tr><th>SO Number</th><td>${req.forFactoryUse? 'Factory use' : (req.soNumber||'—')}</td><th>Challan file</th><td>${req.challanFileId? `<button class="btn small secondary" onclick="viewChallanFile('${req.challanFileId}')">View</button>` : '—'}</td></tr>
    </tbody></table>
    <div class="empty" style="text-align:left">
      This challan was approved on <b>${req.approvedDate||req.date}</b> and no material has been added, ${STALE_CHALLAN_DAYS}+ days later — it's locked from further entry and flagged to Device 3 (Monitoring) under Alerts.
      ${DEVICE===3 ? `<br><br><button class="btn small" onclick="reapproveStaleChallanByReqId('${req.id}')">Re-approve — unlock for materials</button>` : ''}
    </div>
  </div>`;
  }
  return `<div class="panel challan-accordion open">
    ${head}
    <table style="margin:14px 0 12px"><tbody>
      <tr><th>Date</th><td>${req.date}</td><th>Vehicle No.</th><td>${req.vehicleNo}</td></tr>
      <tr><th>Supplier</th><td>${req.supplier||'—'}</td><th>PO Number</th><td>${req.poNumber}</td></tr>
      <tr><th>SO Number</th><td>${req.forFactoryUse? 'Factory use' : (req.soNumber||'—')}</td><th>Challan file</th><td>${req.challanFileId? `<button class="btn small secondary" onclick="viewChallanFile('${req.challanFileId}')">View</button>` : '—'}</td></tr>
    </tbody></table>
    <form id="gate-form-${req.id}">
      <div class="row">
        <div class="field"><label>Location</label><select id="g-location-${req.id}">${DB.locations.map(l=>`<option>${l}</option>`).join('')}</select></div>
      </div>
      <div class="excel-wrap">
        <table class="excel-table">
          <thead><tr>
            <th style="width:16%">Material</th>
            <th style="width:9%">Type</th>
            <th style="width:9%">Category</th>
            <th style="width:8%">Dimensions</th>
            <th style="width:8%">Grade</th>
            <th style="width:7%">Qty</th>
            <th style="width:9%">Size</th>
            <th style="width:7%">Nos.</th>
            <th style="width:10%">Product</th>
            <th style="width:9%">Value ₹</th>
            <th style="width:4%"></th>
          </tr></thead>
          <tbody id="g-material-rows-${req.id}"></tbody>
        </table>
      </div>
      <button class="btn secondary" type="button" id="g-add-row-${req.id}" style="margin:10px 0 14px">+ Add another material</button>
      <br>
      <button class="btn" type="submit" id="g-save-btn-${req.id}" title="Saves any materials added above, then closes this challan. If nothing was added, it just closes the challan with no materials.">Save &amp; Close</button>
    </form>
  </div>`;
}
function wireGateMaterialsForm(req){
  const rowsWrap = document.getElementById('g-material-rows-'+req.id);
  function refreshProductOptionsForAllRows(){
    const so = findSOByNumber(req.soNumber);
    [...rowsWrap.querySelectorAll('tr.g-row')].forEach(rowEl=>{
      const select = rowEl.querySelector('.g-product');
      const prevVal = select.value;
      if(so && so.products.length){
        select.disabled = false;
        select.innerHTML = '<option value="">— General restock —</option>' +
          so.products.map(p=>`<option value="${p.id}" ${p.id===prevVal?'selected':''}>${p.name}${p.status==='completed'?' (completed)':''}</option>`).join('');
        select.title = `SO ${so.soNumber} — pick which product this material line fulfils, so it counts against that product's material list.`;
      } else if(so){
        select.disabled = false;
        select.innerHTML = '<option value="">— General restock —</option>';
        select.title = `SO ${so.soNumber} has no products defined yet — add them under SO / Projects.`;
      } else {
        select.disabled = true;
        select.innerHTML = '<option value="">—</option>';
        select.title = '';
      }
    });
  }
  function updateRemoveButtons(){
    const rows = [...rowsWrap.querySelectorAll('tr.g-row')];
    rows.forEach(r=>{ r.querySelector('.g-row-remove').style.display = rows.length>1 ? 'inline-block' : 'none'; });
  }
  function wireRow(rowEl, rowId){
    let pickedMaterial = null;
    const input = rowEl.querySelector('.g-material');
    const listEl = rowEl.querySelector('.g-material-list');
    const hintRowEl = rowsWrap.querySelector(`tr.g-row-hint-row[data-row-id="${rowId}"]`);
    const hintEl = hintRowEl.querySelector('.g-material-hint');
    const newMatRowEl = rowsWrap.querySelector(`tr.g-new-mat-row[data-row-id="${rowId}"]`);
    const typeInput = rowEl.querySelector('.g-type');
    const catInput = rowEl.querySelector('.g-cat');
    const sizeInput = rowEl.querySelector('.g-mat-size');
    const gradeInput = rowEl.querySelector('.g-mat-grade');
    const qtyNosInput = rowEl.querySelector('.g-qty-nos');
    const qtyUnitSelect = rowEl.querySelector('.g-qty-unit');
    const qtyUnitOtherInput = rowEl.querySelector('.g-qty-unit-other');
    const removeBtn = rowEl.querySelector('.g-row-remove');
    const priceInput = newMatRowEl.querySelector('.g-new-price');
    const unitSelect = newMatRowEl.querySelector('.g-new-unit');
    const rackInput = newMatRowEl.querySelector('.g-new-rack');

    // Locks Type/Category/Dimensions/Grade to the matched material's own specs (so they're
    // always visible instead of hidden behind a hint) and unlocks them the moment the
    // typed name stops matching anything, so a new material's specs can be entered
    // right in the row.
    function setSpecFields(locked, m){
      [typeInput,catInput,sizeInput,gradeInput].forEach(el=>{ el.readOnly = locked; });
      rowEl.classList.toggle('g-spec-locked', locked);
      if(m){ typeInput.value = m.type||''; catInput.value = m.category||''; sizeInput.value = m.size||''; gradeInput.value = m.grade||''; }
    }
    function showNewMatFields(show){
      newMatRowEl.style.display = show ? 'table-row' : 'none';
      if(!show){ priceInput.value=''; rackInput.value=''; }
    }
    // "Size" (unit) picker for the Qty on this line — e.g. inch/mm/foot/kg/gm, or a
    // one-off value typed under "Others…" which is remembered in DB.sizeOptions so it
    // shows up as a normal option on every row from now on.
    qtyUnitSelect.addEventListener('change', ()=>{
      qtyUnitOtherInput.style.display = qtyUnitSelect.value==='__other__' ? 'block' : 'none';
    });
    rowEl.__getQtyUnit = ()=>{
      if(qtyUnitSelect.value!=='__other__') return qtyUnitSelect.value;
      return qtyUnitOtherInput.value.trim();
    };

    attachAutocomplete(input, listEl, ()=>DB.materials, (m)=>{
      pickedMaterial = m; input.value = m.name;
      setSpecFields(true, m);
      hintEl.innerHTML = `${!actingAsDevice1()? money(m.price)+' / '+m.unit : m.unit}${m.rack? ' · Rack: '+m.rack : ''}`;
      showNewMatFields(false);
    }, (m)=> `${m.productCode?'Code: '+m.productCode+' · ':''}${m.type} · ${m.category}${m.size?' · '+m.size:''}${m.grade?' · '+m.grade:''}`);
    input.addEventListener('input', ()=>{
      if(input.value!==(pickedMaterial&&pickedMaterial.name)){
        pickedMaterial=null; hintEl.textContent='';
        const matches = DB.materials.filter(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
        if(matches.length===1){
          setSpecFields(true, matches[0]); showNewMatFields(false);
        } else if(matches.length>1){
          setSpecFields(false, null); showNewMatFields(false);
          hintEl.innerHTML = `<span class="status-low">${matches.length} variants of this name — pick one from the list below.</span>`;
        } else {
          setSpecFields(false, null); typeInput.value=''; catInput.value=''; sizeInput.value=''; gradeInput.value='';
          showNewMatFields(!!input.value.trim());
        }
      }
    });
    removeBtn.addEventListener('click', ()=>{
      rowsWrap.querySelectorAll(`[data-row-id="${rowId}"]`).forEach(tr=>tr.remove());
      updateRemoveButtons();
    });
    rowEl.__getMaterial = ()=>{
      if(pickedMaterial) return pickedMaterial;
      const matches = DB.materials.filter(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
      return matches.length===1 ? matches[0] : (matches.length>1 ? 'ambiguous' : null);
    };
    rowEl.__getNewMaterialDraft = ()=>{
      const name = input.value.trim();
      if(!name) return null;
      const type = typeInput.value.trim();
      const typeIsOther = !!type && !allMaterialTypeOptions().some(t=>t.toLowerCase()===type.toLowerCase());
      return {
        name, type, typeIsOther, category: catInput.value.trim() || (DB.categories[0]||'General'),
        size: sizeInput.value.trim(), grade: gradeInput.value.trim(),
        price: Number(priceInput.value||0), unit: unitSelect.value,
        rack: rackInput.value.trim(), trackNos: true
      };
    };
  }
  function addRow(){
    const rowId = uid();
    const tmp = document.createElement('tbody');
    tmp.innerHTML = gateMaterialRowHTML(rowId);
    const rowEl = tmp.querySelector('tr.g-row');
    [...tmp.children].forEach(tr=> rowsWrap.appendChild(tr));
    wireRow(rowEl, rowId);
    updateRemoveButtons();
    refreshProductOptionsForAllRows();
  }
  addRow();
  document.getElementById('g-add-row-'+req.id).addEventListener('click', addRow);

  const form = document.getElementById('gate-form-'+req.id);
  const saveBtn = document.getElementById('g-save-btn-'+req.id);
  let submitting = false;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(submitting) return; // guards against double-clicks/double-submits firing this twice
    // Once Device 2's approval has been used to save this entry, the challan is done —
    // block any further submit on this same request so materials can't keep being
    // piled onto an already-completed challan with no limit.
    // IMPORTANT: don't trust the `req` object captured when this panel was opened —
    // the background 4s poll replaces DB.gateRequests (with brand new object
    // instances) on every tick regardless of whether this panel is open, so `req`
    // can silently go stale while the person is still filling in the form. Always
    // resolve the live record by id before reading or writing its status, or a
    // successful save can end up writing "completed" onto an orphaned copy while
    // the actual saved record still shows "approved" — leaving the challan stuck
    // open even though the materials genuinely saved.
    if(req.status!=='approved'){ toast('This challan has already been saved.', true); return; }
    // Defense in depth: staleness could have flipped mid-session (poll fired while
    // this panel sat open past the re-approval window) — re-check against the live
    // record, not just the UI having rendered a form for it originally.
    { const freshCheck = (DB.gateRequests||[]).find(x=>x.id===req.id);
      if(freshCheck && isChallanStale(freshCheck)){
        toast(`Challan ${req.challanNo} needs Device 3 re-approval before more material can be added (approved ${STALE_CHALLAN_DAYS}+ days ago with nothing added yet).`, true);
        expandedChallanId = null; TAB='gate'; buildNav(); render();
        return;
      }
    }

    function fail(msg){ toast(msg, true); submitting = false; saveBtn.disabled = false; }

    const so = findSOByNumber(req.soNumber);
    if(so && so.status==='completed'){
      return fail(`SO ${so.soNumber} is marked Complete by Device 3 — no new gate entry can be made for it until Device 3 marks it Incomplete again.`);
    }
    submitting = true;
    saveBtn.disabled = true;
    try{

    const rows = [...rowsWrap.querySelectorAll('tr.g-row')];
    const lines = [];
    for(const r of rows){
      const raw = r.querySelector('.g-material').value.trim();
      if(!raw) continue;
      let mat = r.__getMaterial();
      if(mat==='ambiguous'){ return fail(`"${raw}" matches several variants (different size/grade) — pick the exact one from the dropdown.`); }
      let newlyCreated = false;
      if(!mat){
        const draft = r.__getNewMaterialDraft();
        if(!draft || !draft.type){ return fail(`"${raw}" isn't a known material — fill in its Type (and other details) in that row to add it, or pick an existing one from the list.`); }
        const created = await createMaterialFromDraft(draft);
        if(created==='duplicate'){ return fail(`That exact material "${raw}" already exists — pick it from the list instead of retyping its details.`); }
        if(!created){ return fail(`Could not add "${raw}" as a new material — check the Type field.`); }
        mat = created; newlyCreated = true;
      }
      const qty = Number(r.querySelector('.g-qty').value);
      if(!qty || qty<=0){ return fail(`Enter a quantity received for ${mat.name}`); }
      const qtyNos = Number(r.querySelector('.g-qty-nos').value||0);
      const qtyUnit = r.__getQtyUnit();
      if(qtyUnit && !DB.sizeOptions.some(u=>u.toLowerCase()===qtyUnit.toLowerCase())){
        DB.sizeOptions.push(qtyUnit);
        await saveKey('sizeOptions');
      }
      const valueInput = r.querySelector('.g-value');
      let value;
      if(valueInput.value!==''){ value = Number(valueInput.value); }
      const productSelect = r.querySelector('.g-product');
      const productId = (so && productSelect.value) ? productSelect.value : '';
      lines.push({mat, qty, qtyNos, qtyUnit, value, productId, newlyCreated});
    }
    // Nothing was actually filled in on any row — treat "Save & Close" the same as
    // the old dedicated "Close request — no materials" button used to: close the
    // challan out with nothing added, after the same confirmation.
    if(!lines.length){
      submitting = false; saveBtn.disabled = false;
      await closeGateRequest(req.id);
      return;
    }

    const header = {
      challanNo: req.challanNo, date: req.date, time: nowTimeStr(),
      // date is kept as the challan's own filing date for backward compat, but the
      // material may genuinely be entered days later — approvedDate/materialAddedDate
      // let displays show both so monitoring never mistakes a late entry for a
      // back-dated one. materialAddedDate is "today" — the real day this line was saved.
      approvedDate: req.approvedDate || req.date, materialAddedDate: todayStr(),
      supplier: req.supplier, vehicleNo: req.vehicleNo,
      poNumber: req.poNumber, soNumber: req.soNumber, forFactoryUse: req.forFactoryUse,
      location: document.getElementById('g-location-'+req.id).value,
      loggedByDevice: req.loggedByDevice || DEVICE
    };
    const challanFileId = req.challanFileId, challanFileName = req.challanFileName;

    let soChanged = false;
    let excessBanked = 0;
    const excessDetails = [];
    let newMatCount = 0;
    let mrfLinked = false;
    const heldForApproval = [];
    lines.forEach(({mat, qty, qtyNos, qtyUnit, value, productId, newlyCreated})=>{
      if(newlyCreated) newMatCount++;
      const entry = Object.assign({ id: uid(), materialId: mat.id, materialName: mat.name, qty }, header);
      if(qtyNos>0) entry.qtyNos = qtyNos;
      // qtyUnit/qtyDisplay are purely a display label ("300kg") built from this line's
      // own Qty + Size (unit) pick — qty itself always stays the plain number so stock
      // math, thresholds and SO fulfilment keep working exactly as before.
      if(qtyUnit){ entry.qtyUnit = qtyUnit; entry.qtyDisplay = `${qty}${qtyUnit}`; }
      if(value!==undefined) entry.value = value;
      if(challanFileId){ entry.challanFileId = challanFileId; entry.challanFileName = challanFileName; }

      const pr = (DB.mrf||[]).find(r=>r.status==='needs-purchase' && r.materialName.toLowerCase()===mat.name.toLowerCase());
      if(pr){
        const acc = findAccountByName(pr.referredBy);
        pr.materialId = mat.id; pr.qty = qty; pr.qtyNos = qtyNos; pr.location = header.location;
        pr.productId = (so && productId) ? productId : null;
        pr.soNumber = pr.soNumber || req.soNumber;
        pr.purchasedDate = todayStr();
        mrfLinked = true;
        if(acc){
          pr.status = 'awaiting-stock-approval'; pr.requestAccountId = acc.id; pr.approvalStatus = 'awaiting';
          entry.pendingApproval = true; entry.mrfRequestId = pr.id;
          heldForApproval.push(`${mat.name} (${acc.name})`);
          DB.gateEntries.push(entry);
          return;
        }
        pr.status = 'stock-approved'; pr.approvalStatus = 'auto';
      }

      if(so && productId){
        const product = so.products.find(p=>p.id===productId);
        entry.soId = so.id; entry.productId = productId; entry.productName = product? product.name : '';
        const excess = applyReceiptToRequirement(so.id, productId, mat.id, qty);
        if(excess>0){ excessBanked += excess; excessDetails.push({mat, excess}); }
        soChanged = true;
      }
      DB.gateEntries.push(entry);
      addStock(mat.id, header.location, qty);
      if(qtyNos>0){ addStockNos(mat.id, header.location, qtyNos); }
      resolveCheckFor(mat.id);
    });
    await saveKey('gateEntries'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('tickets');
    if(soChanged){ await saveKey('soList'); await saveKey('excessPool'); }
    if(mrfLinked){ await saveKey('mrf'); }

    // Re-resolve the live record by id right before writing the status — several
    // awaited saves have happened above, each one a window where the background
    // poll could have swapped out DB.gateRequests with a fresh (still-"approved")
    // copy from the server. Mutating that fresh copy is what actually persists;
    // mutating the original `req` reference from when the panel opened would
    // silently be a no-op on an orphaned object. See note above for why.
    const liveReq = (DB.gateRequests||[]).find(x=>x.id===req.id);
    if(!liveReq){
      throw new Error(`Challan ${req.challanNo||req.id} vanished from gateRequests before it could be marked completed — it may have been closed or edited elsewhere.`);
    }
    liveReq.status = 'completed'; liveReq.completedDate = todayStr();
    await saveKey('gateRequests');
    if(header.loggedByDevice===2){
      grantLog('gate-entry-saved', `${lines.length} material line(s) saved on challan ${header.challanNo||'—'} by Device 2 acting as Device 1`);
      await saveKey('deviceAccessGrant');
    }

    const excessNote = excessDetails.length
      ? ' · Excess banked: ' + excessDetails.map(({mat,excess})=>`${mat.name}${mat.size?' ('+mat.size+(mat.grade?', '+mat.grade:'')+')':''} +${excess}`).join(', ')
      : '';
    const newMatNote = newMatCount ? ` · ${newMatCount} new material(s) added to master list` : '';
    const factoryNote = req.forFactoryUse ? ' · Marked for internal factory use' : '';
    const heldNote = heldForApproval.length ? ' · Awaiting approval before entering stock: ' + heldForApproval.join(', ') : '';
    toast(`Gate entry saved — ${lines.length} material line(s) on challan ${header.challanNo||'—'}` + excessNote + newMatNote + factoryNote + heldNote);
    // Close this challan out — it's completed now, so the accordion panel (and its
    // form) disappears on the next render instead of staying open for more additions.
    expandedChallanId = null;
    TAB = 'gate';
    buildNav();
    render();
    }catch(err){
      // Without this, any unexpected error above (bad material data, a storage
      // hiccup, etc.) would silently leave the button disabled and the challan
      // stuck on "Approved" forever, with no clue why — which is exactly the
      // "already saved but still open to edit" symptom this fixes.
      console.error('gate materials save failed', err);
      fail('Something went wrong while saving this challan, so nothing was closed — please try again. If this keeps happening, check the browser console (F12) for the error and share it.');
    }
  });
}
// Groups a list of gate-entry rows by challan/bill number, in one panel per
// challan, so materials received on the same challan stay together instead of
// interleaving with other challans' materials in one flat chronological list.
// Entries with no challan number at all each get their own single-row group
// (nothing to "mix" there since there's no shared challan to group them under).
// Day/Week/Month/Year scoping for the "All gate entries" list below — same pattern
// as the All Entries hub, kept outside DB so it resets on reload but survives the
// 4s auto-refresh poll.
let gateEntriesScopeState = { scope:'today', customDate:null, customMonth:null, customYear:null, calendarOpen:false };
// Scoped by the date the material was actually ADDED (materialAddedDate), not the
// challan's own filing date — otherwise a challan approved 10 days ago and only
// materialized today would never show up under "Today", which is exactly the kind
// of confusion this whole date split was meant to fix. Falls back to the old
// `date` field for entries saved before materialAddedDate existed.
function scopeGateEntries(rows){
  const scope = gateEntriesScopeState.scope;
  const now = new Date();
  const ad = g=> g.materialAddedDate || g.date;
  if(scope==='today') return rows.filter(g=>daysSinceToday(ad(g))===0);
  if(scope==='week') return rows.filter(g=>{ const d=daysSinceToday(ad(g)); return d>=0 && d<=6; });
  if(scope==='month') return rows.filter(g=>{ if(!ad(g)) return false; const d=new Date(ad(g)+'T00:00:00'); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth(); });
  if(scope==='year') return rows.filter(g=>{ if(!ad(g)) return false; return new Date(ad(g)+'T00:00:00').getFullYear()===now.getFullYear(); });
  if(scope==='custom-day') return gateEntriesScopeState.customDate ? rows.filter(g=>ad(g)===gateEntriesScopeState.customDate) : [];
  if(scope==='custom-month'){
    if(!gateEntriesScopeState.customMonth) return [];
    const [y,m] = gateEntriesScopeState.customMonth.split('-').map(Number);
    return rows.filter(g=>{ if(!ad(g)) return false; const d=new Date(ad(g)+'T00:00:00'); return d.getFullYear()===y && (d.getMonth()+1)===m; });
  }
  if(scope==='custom-year'){
    if(!gateEntriesScopeState.customYear) return [];
    return rows.filter(g=>{ if(!ad(g)) return false; return new Date(ad(g)+'T00:00:00').getFullYear()===Number(gateEntriesScopeState.customYear); });
  }
  return rows; // 'all'
}
function gateEntriesScopeHeading(){
  const s = gateEntriesScopeState;
  if(s.scope==='today') return 'Today — '+formatDateNice(todayStr());
  if(s.scope==='week') return 'Last 6 Days';
  if(s.scope==='month') return 'This Month — '+new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  if(s.scope==='year') return 'This Year — '+new Date().getFullYear();
  if(s.scope==='custom-day') return s.customDate ? formatDateNice(s.customDate) : 'Pick a day from the calendar below';
  if(s.scope==='custom-month') return s.customMonth ? formatMonthNice(s.customMonth) : 'Pick a month from the calendar below';
  if(s.scope==='custom-year') return s.customYear ? ('Year '+s.customYear) : 'Pick a year from the calendar below';
  return 'All gate entries';
}
function renderGateEntriesScopeControls(){
  const s = gateEntriesScopeState;
  const inCalendar = ['custom-day','custom-month','custom-year'].includes(s.scope);
  return `<div class="entries-scope-row">
      <button type="button" class="scope-btn ${s.scope==='today'?'active':''}" onclick="setGateEntriesScope('today')">Today</button>
      <button type="button" class="scope-btn ${s.scope==='week'?'active':''}" onclick="setGateEntriesScope('week')">Last 6 Days</button>
      <button type="button" class="scope-btn ${s.scope==='month'?'active':''}" onclick="setGateEntriesScope('month')">This Month</button>
      <button type="button" class="scope-btn ${s.scope==='year'?'active':''}" onclick="setGateEntriesScope('year')">This Year</button>
      <button type="button" class="scope-btn ${s.scope==='all'?'active':''}" onclick="setGateEntriesScope('all')">All</button>
      <button type="button" class="scope-btn ${inCalendar?'active':''}" onclick="toggleGateEntriesCalendar()">📅 Calendar (past day / month / year)</button>
    </div>
    <div class="entries-calendar-row" id="gate-entries-calendar-row" style="display:${s.calendarOpen?'flex':'none'}">
      <label>Pick a day
        <input type="date" value="${s.customDate||''}" max="${todayStr()}" onchange="pickGateEntriesDay(this.value)">
      </label>
      <label>Pick a month/year
        <input type="month" value="${s.customMonth||''}" max="${todayStr().slice(0,7)}" onchange="pickGateEntriesMonth(this.value)">
      </label>
      <label>Pick a year
        <input type="number" value="${s.customYear||''}" min="2000" max="${new Date().getFullYear()}" placeholder="${new Date().getFullYear()}" style="width:90px" onchange="pickGateEntriesYear(this.value)">
      </label>
    </div>
    <div class="entries-heading">${gateEntriesScopeHeading()}</div>`;
}
function setGateEntriesScope(scope){ gateEntriesScopeState.scope = scope; gateEntriesScopeState.calendarOpen = false; render(); }
function toggleGateEntriesCalendar(){ gateEntriesScopeState.calendarOpen = !gateEntriesScopeState.calendarOpen; render(); }
function pickGateEntriesDay(v){ if(!v) return; gateEntriesScopeState.customDate = v; gateEntriesScopeState.scope = 'custom-day'; gateEntriesScopeState.calendarOpen = true; render(); }
function pickGateEntriesMonth(v){ if(!v) return; gateEntriesScopeState.customMonth = v; gateEntriesScopeState.scope = 'custom-month'; gateEntriesScopeState.calendarOpen = true; render(); }
function pickGateEntriesYear(v){ if(!v) return; gateEntriesScopeState.customYear = v; gateEntriesScopeState.scope = 'custom-year'; gateEntriesScopeState.calendarOpen = true; render(); }
window.setGateEntriesScope = setGateEntriesScope;
window.toggleGateEntriesCalendar = toggleGateEntriesCalendar;
window.pickGateEntriesDay = pickGateEntriesDay;
window.pickGateEntriesMonth = pickGateEntriesMonth;
window.pickGateEntriesYear = pickGateEntriesYear;
// A gate entry's own "date" is the challan's filing date — but the material can
// genuinely be added days (or weeks) later, once the challan is approved. Showing
// only the old challan date then reads as a back-dated entry to Monitoring. This
// shows both when they differ, and just the one date when they're the same day.
function gateEntryDateLabel(entry){
  const added = entry.materialAddedDate || entry.date;
  const approved = entry.approvedDate || entry.date;
  if(approved && added && approved!==added) return `Approved ${approved} / Added ${added}`;
  return added || '—';
}
function renderGateEntriesGrouped(rows){
  if(!rows.length) return `<div class="empty">No gate entries yet.</div>`;
  const groups = [];
  const byKey = new Map();
  rows.forEach(g=>{
    const key = g.challanNo ? g.challanNo.trim().toLowerCase() : ('__none__'+g.id);
    let grp = byKey.get(key);
    if(!grp){ grp = {key, challanNo:g.challanNo, rows:[]}; byKey.set(key, grp); groups.push(grp); }
    grp.rows.push(g);
  });
  return groups.map(grp=>{
    const first = grp.rows[0];
    const label = grp.challanNo ? `Challan ${grp.challanNo}` : 'No challan number';
    const gid = safeId(grp.key);
    const isOpen = !!gateEntriesGroupUIState[gid];
    return `<div class="ent-group">
      <button type="button" class="ent-group-toggle" onclick="toggleGateEntryGroup('${gid}')">
        <span class="chev">${isOpen?'▾':'▸'}</span> ${label}
        <span class="ent-group-meta">${gateEntryDateLabel(first)} · ${first.supplier||'—'} · Vehicle ${first.vehicleNo||'—'} · PO ${first.poNumber||'—'} · ${grp.rows.length} material line${grp.rows.length>1?'s':''}${first.loggedByDevice===2? ' · <span class="status-low">via Device 2 (acting as Device 1)</span>' : ''}</span>
      </button>
      <div class="ent-group-body" style="display:${isOpen?'block':'none'}">
        ${renderGateTable(grp.rows)}
      </div>
    </div>`;
  }).join('');
}
// Which challan groups are expanded in the "All gate entries" list on Device 1 — an
// object keyed by a safe id per challan, so several can be open at once (unlike the
// single-open expandedChallanId accordion above, which is for still-in-progress
// approved requests). Kept outside DB, like the other UI-state objects, so it
// resets to fully collapsed on reload but survives the 4s auto-refresh poll.
let gateEntriesGroupUIState = {};
function toggleGateEntryGroup(gid){ gateEntriesGroupUIState[gid] = !gateEntriesGroupUIState[gid]; render(); }
window.toggleGateEntryGroup = toggleGateEntryGroup;
function renderGateTable(rows){
  if(!rows.length) return `<div class="empty">No gate entries yet.</div>`;
  return `<table><thead><tr><th>Date</th><th>Time</th><th>Challan/Bill</th><th>Material</th><th>Qty</th><th>Supplier</th><th>PO</th><th>Vehicle</th><th>SO / Use</th><th>Product</th><th>Location</th><th>Challan file</th><th>Slip</th></tr></thead><tbody>
  ${rows.map(g=>`<tr><td>${gateEntryDateLabel(g)}</td><td>${timeBadge(g.materialAddedDate||g.date,g.time)}</td><td>${g.challanNo||'—'}</td><td>${g.materialName}</td><td>${g.qtyDisplay||g.qty}${g.qtyNos?' · '+g.qtyNos+' Nos.':''}</td><td>${g.supplier||'—'}</td><td>${g.poNumber||'—'}</td><td>${g.vehicleNo||'—'}</td><td>${g.forFactoryUse? '<span class="status-low">Factory use</span>' : (g.soNumber||'—')}</td><td>${g.productName||'—'}</td><td>${g.location||'—'}</td>
  <td>${g.challanFileId? `<button class="btn small secondary" onclick="viewChallanFile('${g.challanFileId}')">View</button>` : '—'}</td>
  <td><button class="btn small secondary" onclick="printGateSlip('${g.id}')">Print / Save</button></td></tr>`).join('')}
  </tbody></table>`;
}
function gateSlipHTML(entry){
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Material Entry Slip — ${entry.materialName}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1c262d;}
  h1{font-size:19px;border-bottom:3px solid #4a6c8c;padding-bottom:10px;letter-spacing:.5px;}
  h1 small{display:block;font-size:11px;letter-spacing:2px;color:#4d6a83;text-transform:uppercase;font-weight:normal;margin-top:4px;}
  table{width:100%;border-collapse:collapse;margin-top:18px;}
  td,th{border:1px solid #9fb4c4;padding:9px 10px;text-align:left;font-size:13px;}
  th{background:#e3e8ea;width:26%;}
  .sig{margin-top:60px;display:flex;justify-content:space-between;}
  .sig div{width:42%;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12px;color:#333;}
  @media print{ body{padding:10mm;} }
</style></head><body>
  <h1>HL GALVATECH<small>Material Entry / Gate Slip</small></h1>
  <table>
   <tr><th>Date</th><td>${gateEntryDateLabel(entry)}</td><th>Time</th><td>${entry.time||'—'}</td></tr>
   <tr><th>Slip ref.</th><td colspan="3">${entry.id}</td></tr>
   <tr><th>Challan / Bill No.</th><td>${entry.challanNo||'—'}</td><th>Vehicle No.</th><td>${entry.vehicleNo||'—'}</td></tr>
   <tr><th>Material</th><td>${entry.materialName}</td><th>Quantity</th><td>${entry.qtyDisplay||entry.qty}${entry.qtyNos?' ('+entry.qtyNos+' Nos.)':''}</td></tr>
   <tr><th>Supplier</th><td>${entry.supplier||'—'}</td><th>Location</th><td>${entry.location||'—'}</td></tr>
   <tr><th>PO Number</th><td>${entry.poNumber||'—'}</td><th>SO Number</th><td>${entry.forFactoryUse? 'Internal factory use' : (entry.soNumber||'—')}</td></tr>
  </table>
  <div class="sig"><div>Received by (Store)</div><div>Gate / Security</div></div>
</body></html>`;
}
function printGateSlip(entryId){
  const entry = DB.gateEntries.find(g=>g.id===entryId);
  if(!entry){ toast('Gate entry not found', true); return; }
  const html = gateSlipHTML(entry);
  const w = window.open('', '_blank', 'width=650,height=820');
  if(w){
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
  } else {
    toast('Pop-up blocked — allow pop-ups to print, saving a copy instead', true);
  }
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `entry-slip-${(entry.materialName||'item').replace(/[^a-z0-9]/gi,'_')}-${entry.date}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
window.printGateSlip = printGateSlip;
async function viewChallanFile(fileId){
  try{
    const res = await Persist.get('challan-file:'+fileId, true);
    if(!res || res.value===undefined){ toast('Challan file not found', true); return; }
    const record = JSON.parse(res.value);
    const {name, type} = record;
    // New records (Firebase Storage configured) carry `url`; older records
    // saved before Storage was set up (or saved in local-fallback mode)
    // carry the file embedded directly as `dataUrl`. Handle both.
    const src = record.url || record.dataUrl;
    // Some mobile browsers report an empty/generic MIME type for camera-captured photos,
    // so don't rely on `type` alone — also sniff the source itself.
    const isImage = (type && type.startsWith('image/')) || /^data:image\//i.test(src||'') || /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(src||'');
    if(isImage){
      showModal(`<h3>Challan — ${name||'photo'}</h3><img src="${src}" style="max-width:100%;border:1px solid var(--line);border-radius:3px">
      <div class="modal-actions"><button class="btn secondary" type="button" onclick="closeModal()">Close</button>
      <a class="btn" href="${src}" download="${name||'challan'}" target="_blank" rel="noopener">Download</a></div>`);
    } else {
      // Navigating a freshly opened window straight to a (often multi-MB) data: URI/remote
      // file is what was causing blank pages on several mobile browsers. Converting to a
      // Blob object URL first opens/prints reliably instead.
      try{
        const blob = await (await fetch(src)).blob();
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, '_blank');
        if(!w){ const a=document.createElement('a'); a.href=blobUrl; a.download=name||'challan'; a.click(); }
        setTimeout(()=>URL.revokeObjectURL(blobUrl), 60000);
      }catch(convErr){
        console.error('blob conversion failed, falling back to direct link', convErr);
        const a=document.createElement('a'); a.href=src; a.target='_blank'; a.download=name||'challan'; a.click();
      }
    }
  }catch(e){ console.error(e); toast('Could not open challan file', true); }
}
window.viewChallanFile = viewChallanFile;

function renderMaterials1(el){
  const showPrice = !actingAsDevice1();
  el.innerHTML = `
    <h2 class="section-title">Materials</h2>
    <div class="section-sub">Define the material already existing in store.</div>
    <div class="panel">
      <h3>New material</h3>
      <form id="mat-form">
        <div class="row">
          <div class="field" style="position:relative">
            <label>Material name</label>
            <input required id="m-name" placeholder="e.g. Pencil, MS Sheet 2mm…" autocomplete="off">
            <div class="autolist" id="m-name-list"></div>
            <div class="hint" id="m-name-hint"></div>
          </div>
          <div class="field">
            <label>Type</label>
            ${materialTypeSelectHTML('m-type')}
          </div>
          <div class="field" id="m-type-other-wrap" style="display:none;position:relative">
            <label>Other — type</label>
            <input id="m-type-other" placeholder="e.g. Rubber, Wood…" autocomplete="off">
            <div class="autolist" id="m-type-other-list"></div>
          </div>
          <div class="field"><label>Category</label><select id="m-cat">${DB.categories.map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Product Code</label><input id="m-code" placeholder="e.g. A0001 — optional"></div>
        </div>
        <div class="row">
          ${sizePickerHTML('m-size','Size')}
        </div>
        <div class="row">
          <div class="field"><label>Grade / Quality</label><input id="m-grade" placeholder="e.g. Grade A, IS 2062"></div>
          <div class="field"><label>Price / unit</label><input required id="m-price" type="number" min="0" step="0.01"></div>
          <div class="field"><label>Sales unit</label><select id="m-unit">${UNITS.map(u=>`<option>${u}</option>`).join('')}</select></div>
        </div>
        <div class="row">
          <div class="field" style="position:relative"><label>PO Number (reference)</label><input id="m-po" placeholder="Optional" autocomplete="off"><div class="autolist" id="m-po-list"></div></div>
          <div class="field" style="position:relative"><label>SO Number (reference)</label><input id="m-so" placeholder="Optional" autocomplete="off"><div class="autolist" id="m-so-list"></div></div>
          <div class="field"><label>Opening stock</label><input id="m-open" type="number" min="0" value="0"></div>
        </div>
        <div class="row">
          <div class="field">
            <label>Rack / Location</label>
            <input id="m-rack" placeholder="e.g. Rack A-3, Bin 12" list="rack-suggestions" autocomplete="off">
            <datalist id="rack-suggestions">${DB.locations.map(l=>`<option value="${l}">`).join('')}</datalist>
          </div>
          <div class="field">
            <label>Opening stock (Nos.)</label><input id="m-open-nos" type="number" min="0" value="0">
          </div>
        </div>
        <button class="btn" type="submit">Save material</button>
      </form>
    </div>
    <div class="panel">
      <h3>Import materials from Excel</h3>
      <div class="section-sub">By default this adds new materials from the sheet to the list below — existing materials are left untouched. Turn on "Replace entire list" to instead make the sheet the complete list: any material currently on file that isn't in the sheet is deleted (with its stock and threshold records). You'll get a summary to confirm before anything is removed.</div>
      <input type="file" id="mat-import-file" accept=".xlsx,.xls" style="display:none" onchange="bulkImportMaterialsFromExcel(this)">
      <button type="button" class="btn secondary" onclick="document.getElementById('mat-import-file').click()">Upload Excel file</button>
      <button type="button" class="btn secondary" onclick="downloadMaterialImportTemplate()">Download template</button>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;font-weight:600">
        <input type="checkbox" id="mat-import-replace-all" style="width:auto"> Replace entire materials list — remove any material not in this file
      </label>
    </div>
    <div class="panel">
      <h3>Bulk update materials from Excel</h3>
      <div class="section-sub">For materials already on file that need any field changed (Type, Category, Rack/Location, Size, Grade, Price, Unit, PO/SO Number, or Stock) — download the template (pre-filled with every material's current values), change whatever needs changing, and upload it back. Only the cells you actually change are applied; everything else is left as-is. Don't edit the Product Code or Material Name columns — they're used to match each row back to the right material.</div>
      <input type="file" id="mat-bulkupdate-import-file" accept=".xlsx,.xls" style="display:none" onchange="bulkUpdateMaterialsFromExcel(this)">
      <button type="button" class="btn secondary" onclick="document.getElementById('mat-bulkupdate-import-file').click()">Upload Excel file</button>
      <button type="button" class="btn secondary" onclick="downloadMaterialBulkUpdateTemplate()">Download template</button>
    </div>
    ${collapsePanel('materials1-list', 'Material list', renderMaterialsListSearchBar() + renderMaterialsTable(materialsListSearch, true), `${DB.materials.length} material${DB.materials.length===1?'':'s'}`)}`;

  if(panelCollapseUIState['materials1-list']){
    const listSearchInput = document.getElementById('mat-list-search');
    if(listSearchInput){
      attachAutocomplete(listSearchInput, document.getElementById('mat-list-search-list'), ()=>DB.materials, (m)=>{
        listSearchInput.value = m.name;
        searchMaterialsList();
      }, (m)=>`${m.productCode?'Code: '+m.productCode+' · ':''}${m.type} · ${m.category}${m.size?' · '+m.size:''}${m.grade?' · '+m.grade:''}`);
    }
    wireMaterialsListRowEdits();
  }

  const input = document.getElementById('m-name');
  attachAutocomplete(input, document.getElementById('m-name-list'), ()=>DB.materials, (m)=>{
    input.value = m.name;
    renderNameHint();
  }, (m)=>`${m.productCode?'Code: '+m.productCode+' · ':''}${m.type} · ${m.category}${m.size?' · '+m.size:''}${m.grade?' · '+m.grade:''}`);
  function renderNameHint(){
    const name = input.value.trim().toLowerCase();
    const variants = name ? DB.materials.filter(m=>m.name.toLowerCase()===name) : [];
    const hint = document.getElementById('m-name-hint');
    if(!variants.length){ hint.innerHTML=''; return; }
    hint.innerHTML = `<span class="status-low">${variants.length} existing variant${variants.length>1?'s':''} of "${input.value.trim()}"</span> — `
      + variants.map(m=>`${m.type}${m.size?', '+m.size:''}${m.grade?', '+m.grade:''}`).join(' · ')
      + `. To restock one of these, use Gate Entry instead — otherwise fill in a different size/grade below and save as a new variant.`;
  }
  input.addEventListener('input', renderNameHint);

  const typeSelect = document.getElementById('m-type');
  const typeOtherWrap = document.getElementById('m-type-other-wrap');
  const typeOtherInput = document.getElementById('m-type-other');
  typeSelect.addEventListener('change', ()=>{ typeOtherWrap.style.display = typeSelect.value==='__other__' ? 'flex' : 'none'; });
  attachAutocomplete(typeOtherInput, document.getElementById('m-type-other-list'), ()=>(DB.customMaterialTypes||[]).map(t=>({name:t})), (o)=>{ typeOtherInput.value = o.name; });

  wireSizePicker('m-size');
  attachAutocomplete(document.getElementById('m-po'), document.getElementById('m-po-list'), ()=>allPONumbers().map(p=>({name:p})), (p)=>{ document.getElementById('m-po').value = p.name; });
  attachAutocomplete(document.getElementById('m-so'), document.getElementById('m-so-list'), ()=>allSONumbers().map(s=>({name:s})), (s)=>{ document.getElementById('m-so').value = s.name; });

  document.getElementById('mat-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('m-name').value.trim();
    const size = readSizeValue('m-size');
    const grade = document.getElementById('m-grade').value.trim();
    let type = typeSelect.value;
    if(type==='__other__'){
      type = typeOtherInput.value.trim();
      if(!type){ toast('Type a material type, or pick one from the list', true); return; }
      const known = allMaterialTypeOptions().some(t=>t.toLowerCase()===type.toLowerCase());
      if(!known){ DB.customMaterialTypes = DB.customMaterialTypes||[]; DB.customMaterialTypes.push(type); await saveKey('customMaterialTypes'); }
    }
    // Same name is fine (e.g. several "Bend" entries) — only block an exact repeat of
    // name + type + size + grade, which would just be a duplicate of one existing entry.
    if(DB.materials.find(m=>m.name.toLowerCase()===name.toLowerCase() && m.type===type
        && (m.size||'').toLowerCase()===size.toLowerCase() && (m.grade||'').toLowerCase()===grade.toLowerCase())){
      toast('That exact material (same name, type, size and grade) already exists — restock it via Gate Entry instead.', true); return;
    }
    const productCode = document.getElementById('m-code').value.trim();
    if(productCode && DB.materials.some(m=>(m.productCode||'').toLowerCase()===productCode.toLowerCase())){
      toast(`Product Code "${productCode}" is already used by another material — codes must be unique to track items reliably.`, true); return;
    }
    const mat = {
      id: uid(), name, type, category: document.getElementById('m-cat').value,
      rack: document.getElementById('m-rack').value.trim(),
      size, grade, price: Number(document.getElementById('m-price').value||0),
      unit: document.getElementById('m-unit').value, poNumber: document.getElementById('m-po').value,
      soNumber: document.getElementById('m-so').value, dateAdded: todayStr(), trackNos: true, productCode
    };
    DB.materials.push(mat);
    const opening = Number(document.getElementById('m-open').value||0);
    if(opening>0){ addStock(mat.id, DB.locations[0], opening); }
    const openingNos = Number(document.getElementById('m-open-nos').value||0);
    if(openingNos>0){ addStockNos(mat.id, DB.locations[0], openingNos); }
    await saveKey('materials'); await saveKey('stock'); await saveKey('stockNos');
    toast(`Material "${mat.name}" added`);
    e.target.reset(); typeOtherWrap.style.display='none'; render();
  });
}
/* ---------------- Materials list: keyword search + full-detail edit / delete.
   Kept as a plain variable (not in DB) so it resets on reload, same as the
   other UI-state search bars in the app (e.g. loc-inv-kw for the Transfer
   Stock location search). ---------------- */
let materialsListSearch = '';
function renderMaterialsListSearchBar(){
  return `<div class="row" style="align-items:flex-end; gap:8px; margin-bottom:10px">
    <div class="field" style="flex:0 0 240px; position:relative">
      <label>Search materials</label>
      <input id="mat-list-search" type="text" placeholder="Type a material name…" value="${m_escape(materialsListSearch)}" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();searchMaterialsList();}">
      <div class="autolist" id="mat-list-search-list"></div>
    </div>
    <button type="button" class="btn small" onclick="searchMaterialsList()" title="Search materials">🔍 Search</button>
    ${materialsListSearch ? `<button type="button" class="btn small secondary" onclick="clearMaterialsListSearch()">Clear</button>` : ''}
  </div>`;
}
function searchMaterialsList(){
  const input = document.getElementById('mat-list-search');
  materialsListSearch = input ? input.value.trim() : '';
  panelCollapseUIState['materials1-list'] = true; // keep the panel open so the result is visible
  render();
}
function clearMaterialsListSearch(){
  materialsListSearch = '';
  panelCollapseUIState['materials1-list'] = true;
  render();
}
window.searchMaterialsList = searchMaterialsList;
window.clearMaterialsListSearch = clearMaterialsListSearch;

function renderMaterialsTable(keyword, editable){
  const kw = (keyword||'').trim().toLowerCase();
  const mats = kw ? DB.materials.filter(m=>m.name.toLowerCase().includes(kw)) : DB.materials;
  if(!DB.materials.length) return `<div class="empty">No materials yet.</div>`;
  if(!mats.length) return `<div class="empty">No material matches "${m_escape(keyword)}".</div>`;
  const showPrice = !actingAsDevice1();
  return `<table><thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Category</th><th>Rack</th><th>Size</th><th>Grade</th>${showPrice?'<th>Price</th>':''}<th>Unit</th><th>Stock</th><th>Nos.</th><th>PO</th><th>SO</th>${editable?'<th></th>':''}</tr></thead><tbody>
  ${mats.map(m=>{
    const actionsCell = !editable ? '' : `<td><button class="btn small secondary" type="button" onclick="editMaterialModal('${m.id}')">Edit</button> <button class="btn small danger" type="button" onclick="deleteMaterialConfirm('${m.id}')">Delete</button></td>`;
    return `<tr><td>${m.name}</td><td>${m.productCode?`<span class="mono">${m.productCode}</span>`:'—'}</td><td>${typeTag(m.type)}</td><td>${m.category}</td><td>${m.rack||'—'}</td><td>${m.size||'—'}</td><td>${m.grade||'—'}</td>${showPrice?`<td>${money(m.price)}</td>`:''}<td>${m.unit}</td><td>${getStock(m.id)}</td><td>${getStockNos(m.id)}</td><td>${m.poNumber||'—'}</td><td>${m.soNumber||'—'}</td>${actionsCell}</tr>`;
  }).join('')}
  </tbody></table>`;
}
function wireMaterialsListRowEdits(){ /* no-op — editing now happens in editMaterialModal */ }

/* ---------------- Full-detail material edit modal — every field the
   material master carries (name, type, category, rack, size, grade, price,
   unit, PO/SO refs, piece-count tracking) plus its current Stock and Stock
   (Nos.) totals. Stock/Nos are whole-material totals across every location,
   so on save we apply the difference (new − old) as a single adjustment at
   whichever location already holds this material's stock (or the first
   location if it has none yet) — for moving specific quantities between
   named locations, Transfer Stock is still the right tool. ---------------- */
function editMaterialModal(id){
  const m = DB.materials.find(x=>x.id===id);
  if(!m) return;
  const stockTotal = getStock(m.id);
  const stockNosTotal = getStockNos(m.id);
  const knownType = allMaterialTypeOptions().some(t=>t.toLowerCase()===m.type.toLowerCase());
  showModal(`
    <h3>Edit material</h3>
    <form id="mat-edit-form">
      <div class="row">
        <div class="field"><label>Material name</label><input required id="me-name" value="${m_escape(m.name)}"></div>
        <div class="field"><label>Type</label>
          <select id="me-type">${allMaterialTypeOptions().map(t=>`<option ${knownType && t.toLowerCase()===m.type.toLowerCase()?'selected':''}>${t}</option>`).join('')}<option value="__other__" ${!knownType?'selected':''}>Other…</option></select>
        </div>
        <div class="field" id="me-type-other-wrap" style="display:${knownType?'none':'flex'}"><label>Other — type</label><input id="me-type-other" value="${knownType?'':m_escape(m.type)}"></div>
        <div class="field"><label>Category</label><select id="me-cat">${DB.categories.map(c=>`<option ${c===m.category?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Product Code</label><input id="me-code" value="${m_escape(m.productCode||'')}" placeholder="e.g. A0001 — optional"></div>
      </div>
      <div class="row">
        <div class="field"><label>Size / Dimension</label><input id="me-size" value="${m_escape(m.size||'')}"></div>
        <div class="field"><label>Grade / Quality</label><input id="me-grade" value="${m_escape(m.grade||'')}"></div>
        <div class="field"><label>Rack / Location</label><input id="me-rack" value="${m_escape(m.rack||'')}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Price / unit</label><input id="me-price" type="number" min="0" step="0.01" value="${m.price||0}"></div>
        <div class="field"><label>Sales unit</label><select id="me-unit">${UNITS.map(u=>`<option ${u===m.unit?'selected':''}>${u}</option>`).join('')}</select></div>
        <div class="field"><label>PO Number (reference)</label><input id="me-po" value="${m_escape(m.poNumber||'')}"></div>
        <div class="field"><label>SO Number (reference)</label><input id="me-so" value="${m_escape(m.soNumber||'')}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Stock</label><input id="me-stock" type="number" min="0" step="any" value="${stockTotal}"></div>
        <div class="field"><label>Stock (Nos.)</label><input id="me-stocknos" type="number" min="0" step="1" value="${stockNosTotal}"></div>
      </div>
      <div class="hint" style="margin:4px 0 10px">Changing Stock / Stock (Nos.) here adjusts the total at ${m_escape(materialPrimaryStockLocation(m.id))} — for moving quantities between specific locations, use Transfer Stock instead.</div>
      <div class="modal-actions">
        <button class="btn secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn" type="submit">Save changes</button>
      </div>
    </form>
  `, {wide:true});

  const typeSelect = document.getElementById('me-type');
  const typeOtherWrap = document.getElementById('me-type-other-wrap');
  typeSelect.addEventListener('change', ()=>{ typeOtherWrap.style.display = typeSelect.value==='__other__' ? 'flex' : 'none'; });
  document.getElementById('mat-edit-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    await saveEditMaterial(id);
  });
}
window.editMaterialModal = editMaterialModal;
function materialPrimaryStockLocation(materialId){
  const withStock = DB.locations.find(l=>getStock(materialId,l)>0);
  return withStock || DB.locations[0];
}
/* ---------------- Shared "apply a material edit" core ----------------
   Extracted from the old saveEditMaterial() so the exact same validation,
   stock-delta, and name-cascade logic can be reused by both:
     - the single-material Edit modal above (me-* fields), and
     - the per-product Excel-style material grid in device3-so-projects.js
       (mg-{lineId}-* fields), which can save several materials in one go.
   Caller resolves the "Other" type text box itself (the id differs between
   the modal and the grid) and passes the final `type` string in already.
   opts.silent suppresses the "<name> updated" toast (grid shows its own
   summary toast instead); opts.skipRender skips closeModal()/render() (grid
   re-renders once after the whole batch instead of once per row). ---------------- */
async function applyMaterialEditFields(id, f, opts){
  opts = opts || {};
  const mat = DB.materials.find(m=>m.id===id);
  if(!mat) return false;
  const name = (f.name||'').trim();
  if(!name){ toast('Material name cannot be empty', true); return false; }
  const type = f.type;
  const known = allMaterialTypeOptions().some(t=>t.toLowerCase()===type.toLowerCase());
  if(!known){ DB.customMaterialTypes = DB.customMaterialTypes||[]; DB.customMaterialTypes.push(type); await saveKey('customMaterialTypes'); }

  const category = f.category;
  const rack = (f.rack||'').trim();
  const size = (f.size||'').trim();
  const grade = (f.grade||'').trim();
  const price = Number(f.price||0);
  const unit = f.unit;
  const poNumber = (f.poNumber||'').trim();
  const soNumber = (f.soNumber||'').trim();
  const productCode = (f.productCode||'').trim();
  const newStock = Number(f.newStock||0);
  const newStockNos = Number(f.newStockNos||0);

  if(DB.materials.find(m=>m.id!==id && m.name.toLowerCase()===name.toLowerCase() && m.type===type
      && (m.size||'').toLowerCase()===size.toLowerCase() && (m.grade||'').toLowerCase()===grade.toLowerCase())){
    toast(`A material with that exact name, type, size and grade already exists (${name})`, true); return false;
  }
  if(productCode && DB.materials.some(m=>m.id!==id && (m.productCode||'').toLowerCase()===productCode.toLowerCase())){
    toast(`Product Code "${productCode}" is already used by another material — codes must be unique to track items reliably.`, true); return false;
  }

  const oldName = mat.name;
  const oldStock = getStock(mat.id);
  const oldStockNos = getStockNos(mat.id);
  const loc = materialPrimaryStockLocation(mat.id);

  Object.assign(mat, {name, type, category, rack, size, grade, price, unit, poNumber, soNumber, trackNos: true, productCode});

  const stockDelta = newStock - oldStock;
  if(stockDelta!==0) addStock(mat.id, loc, stockDelta);
  const nosDelta = newStockNos - oldStockNos;
  if(nosDelta!==0) addStockNos(mat.id, loc, nosDelta);

  const touchedKeys = new Set(['materials','stock','stockNos']);
  if(name!==oldName){
    // Cascade the rename into every historical record that stores this
    // material's name as text, same approach as renameCategory/renameLocation
    // — so past gate entries, issues, reports etc. still show the current name.
    const cascades = [
      ['gateEntries', r=>r.materialId===id], ['issues', r=>r.materialId===id],
      ['damaged', r=>r.materialId===id], ['factoryUse', r=>r.materialId===id],
      ['mrf', r=>r.materialId===id], ['transfers', r=>r.materialId===id],
      ['materialRepair', r=>r.materialId===id], ['tickets', r=>r.materialId===id],
    ];
    cascades.forEach(([key, match])=>{
      (DB[key]||[]).forEach(r=>{ if(match(r) && r.materialName!==undefined){ r.materialName = name; touchedKeys.add(key); } });
    });
    (DB.siteInstallMaterial||[]).forEach(entry=>{
      (entry.materials||[]).forEach(line=>{ if(line.materialId===id){ line.materialName = name; touchedKeys.add('siteInstallMaterial'); } });
    });
    (DB.soList||[]).forEach(so=>{
      (so.products||[]).forEach(p=>{
        (p.materials||[]).forEach(line=>{ if(line.materialId===id){ line.materialName = name; touchedKeys.add('soList'); } });
      });
    });
  }
  for(const key of touchedKeys) await saveKey(key);
  if(!opts.silent) toast(`"${name}" updated`);
  if(!opts.skipRender){ closeModal(); render(); }
  return true;
}
window.applyMaterialEditFields = applyMaterialEditFields;

async function saveEditMaterial(id){
  const name = document.getElementById('me-name').value.trim();
  if(!name){ toast('Material name cannot be empty', true); return; }
  let type = document.getElementById('me-type').value;
  if(type==='__other__'){
    type = document.getElementById('me-type-other').value.trim();
    if(!type){ toast('Type a material type, or pick one from the list', true); return; }
  }
  await applyMaterialEditFields(id, {
    name, type,
    category: document.getElementById('me-cat').value,
    rack: document.getElementById('me-rack').value,
    size: document.getElementById('me-size').value,
    grade: document.getElementById('me-grade').value,
    price: document.getElementById('me-price').value,
    unit: document.getElementById('me-unit').value,
    poNumber: document.getElementById('me-po').value,
    soNumber: document.getElementById('me-so').value,
    productCode: document.getElementById('me-code').value,
    newStock: document.getElementById('me-stock').value,
    newStockNos: document.getElementById('me-stocknos').value,
  }, {});
}
window.saveEditMaterial = saveEditMaterial;
async function deleteMaterialConfirm(id){
  const mat = DB.materials.find(m=>m.id===id);
  if(!mat) return;
  const totalStock = getStock(mat.id);
  const totalNos = getStockNos(mat.id);
  if(totalStock>0 || totalNos>0){
    toast(`Can't delete "${mat.name}" — it still has stock (${totalStock} / ${totalNos} Nos.). Issue, transfer, or write it off first.`, true);
    return;
  }
  if(!confirm(`Delete material "${mat.name}"? This cannot be undone.`)) return;
  DB.materials = DB.materials.filter(m=>m.id!==id);
  Object.keys(DB.stock).forEach(k=>{ if(k.startsWith(id+'|')) delete DB.stock[k]; });
  Object.keys(DB.stockNos||{}).forEach(k=>{ if(k.startsWith(id+'|')) delete DB.stockNos[k]; });
  delete DB.thresholds[id];
  await saveKey('materials'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('thresholds');
  toast(`Deleted "${mat.name}"`);
  render();
}
window.deleteMaterialConfirm = deleteMaterialConfirm;

function renderMaterials3(el){
  el.innerHTML = `<h2 class="section-title">Materials</h2><div class="section-sub">Master list synced from Device 1.</div>
  ${collapsePanel('materials3-list', 'Material list', renderMaterialsTable(), `${DB.materials.length} material${DB.materials.length===1?'':'s'}`)}`;
}

function allContactCategoryOptions(){
  // Fixed base list + any custom values previously typed under "Other", deduped.
  const seen = new Set(CONTACT_CATEGORIES.map(c=>c.toLowerCase()));
  const extra = (DB.contactCategories||[]).filter(c=>{
    const k=c.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true;
  });
  return [...CONTACT_CATEGORIES, ...extra];
}
function allMaterialTypeOptions(){
  // Fixed base types (minus the literal "Other" entry, which is always appended
  // separately as the trailing "Other…" picker option) + any custom values
  // previously typed under "Other", deduped.
  const base = MATERIAL_TYPES.filter(t=>t!=='Other');
  const seen = new Set(base.map(t=>t.toLowerCase()));
  const extra = (DB.customMaterialTypes||[]).filter(t=>{
    const k=t.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true;
  });
  return [...base, ...extra];
}
function materialTypeSelectHTML(id){
  return `<select id="${id}">${allMaterialTypeOptions().map(t=>`<option>${t}</option>`).join('')}<option value="__other__">Other…</option></select>`;
}

