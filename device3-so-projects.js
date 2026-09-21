/* =========================================================================
   DEVICE 3 — MONITORING
   ========================================================================= */
function renderDash3(el){
  const totalValue = DB.materials.reduce((s,m)=> s + getStock(m.id)*(m.price||0), 0);
  const openTix = DB.tickets.filter(t=>t.status==='open').length;
  el.innerHTML = `
    <h2 class="section-title">Monitoring Dashboard</h2>
    <div class="section-sub">Combined real-time view of Device 1 (data management) and Device 2 (store).</div>
    <div class="cards">
      ${kpi('Materials', DB.materials.length, '', 'materials')}
      ${kpi('Total stock value', money(totalValue), '', 'stock')}
      ${kpi('Open tickets', openTix, openTix?'bad':'good', '#dash3-open-tickets')}
      ${kpi('Issued this week', DB.issues.filter(i=>isThisWeek(i.date)).length, '', '#dash3-recent-issues')}
      ${kpi('Gate entries this week', DB.gateEntries.filter(g=>isThisWeek(g.date)).length, '', '#dash3-recent-gate')}
      ${kpi('Damaged logged', DB.damaged.length, DB.damaged.length?'warn':'', 'reports')}
    </div>
    ${collapsePanelAnchored('dash3-open-tickets', 'Open tickets', renderTicketMini(), `${openTix}`)}
    ${scopedCollapsePanel('dash3-recent-gate', 'Recent gate entries (Device 1)', DB.gateEntries, 'date', renderGateTable, true)}
    ${scopedCollapsePanel('dash3-recent-issues', 'Recent issues (Device 2)', DB.issues, 'date', renderIssuesTable, true)}`;
}

function renderThresholds(el){
  el.innerHTML = `
    <h2 class="section-title">Low-Stock Thresholds</h2>
    <div class="section-sub">When total stock of a material falls to or below its threshold, a ticket opens on Device 2 and Device 3, with a daily repeat alert until Device 1 restocks it.</div>
    ${collapsePanel('thresholds-list', 'Thresholds', `<table><thead><tr><th>Material</th><th>Current stock</th><th>Threshold</th><th>Save</th></tr></thead><tbody>
    ${DB.materials.map(m=>`<tr><td>${m.name}</td><td>${getStock(m.id)}</td>
      <td><input type="number" min="0" style="width:90px" id="th-${m.id}" value="${DB.thresholds[m.id]??''}" placeholder="none"></td>
      <td><button class="btn small" onclick="saveThreshold('${m.id}')">Set</button></td></tr>`).join('') || `<tr><td colspan="4" class="empty">No materials yet.</td></tr>`}
    </tbody></table>`, `${DB.materials.length} material${DB.materials.length===1?'':'s'}`)}`;
}
async function saveThreshold(materialId){
  const v = document.getElementById('th-'+materialId).value;
  if(v===''){ delete DB.thresholds[materialId]; } else { DB.thresholds[materialId] = Number(v); }
  await saveKey('thresholds');
  openCheckFor(materialId);
  await saveKey('tickets');
  toast('Threshold saved');
  render();
}

function ticketTypeLabel(t){
  return t.type==='so-mismatch' ? 'SO mismatch' : (t.type==='product-mismatch' ? 'Product mismatch' : t.type==='stale-challan' ? 'Stale challan' : t.type==='material-repair' ? 'Material repair' : 'Low stock');
}
function renderTickets(el){
  const openLow = DB.tickets.filter(t=>t.status==='open' && (t.type===undefined||t.type==='low-stock'));
  const openSO = DB.tickets.filter(t=>t.status==='open' && t.type==='so-mismatch');
  const openMismatch = DB.tickets.filter(t=>t.status==='open' && t.type==='product-mismatch');
  const openStale = DB.tickets.filter(t=>t.status==='open' && t.type==='stale-challan');
  const openRepair = DB.tickets.filter(t=>t.status==='open' && t.type==='material-repair');
  const resolved = DB.tickets.filter(t=>t.status==='resolved').slice().reverse();
  el.innerHTML = `
    <h2 class="section-title">Tickets</h2>
    <div class="section-sub">Low-stock tickets auto-generate when stock ≤ threshold and resolve only when Device 1 restocks. SO-mismatch tickets are raised when Device 2 issues material against a different SO than the one it's tagged with. Product-mismatch tickets are raised when Device 2 flags, while closing a site installation, that the material returned from site doesn't match what was issued. Stale-challan tickets are raised when an approved challan has gone ${STALE_CHALLAN_DAYS}+ days with no material added — Device 3 re-approves it here or from the alert banner. Material-repair tickets are raised the moment Device 2 sends material out for repair and stay open until it's marked back Repaired or Scrap. Mismatch, stale-challan, and material-repair tickets are resolved manually (or automatically on receipt) once actioned.</div>
    ${collapsePanel('tickets-open-lowstock', 'Open — Low stock', openLow.length? `<table><thead><tr><th>Material</th><th>Stock</th><th>Threshold</th><th>Opened</th><th>Daily alerts sent</th><th>Last alert</th></tr></thead><tbody>
    ${openLow.map(t=>`<tr><td>${t.materialName}</td><td class="status-low">${getStock(t.materialId)}</td><td>${DB.thresholds[t.materialId]}</td><td>${t.createdDate}</td><td>${t.alertCount||1}</td><td>${t.lastAlertDate}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No open low-stock tickets.</div>`, `${openLow.length}`)}
    ${collapsePanel('tickets-open-somismatch', 'Open — SO mismatch', openSO.length? `<table><thead><tr><th>Material</th><th>Issued vs SO</th><th>Tagged SO</th><th>Issued to</th><th>Reason</th><th>Opened</th><th></th></tr></thead><tbody>
    ${openSO.map(t=>`<tr><td>${t.materialName}</td><td class="status-crit">${t.requestedSO||'—'}</td><td>${t.materialSO||'—'}</td><td>${t.person||'—'}</td><td>${t.reason||'—'}</td><td>${t.createdDate}</td>
    <td><button class="btn small" onclick="resolveSOMismatch('${t.id}')">Resolve</button></td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No open SO-mismatch tickets.</div>`, `${openSO.length}`)}
    ${collapsePanel('tickets-open-productmismatch', 'Open — Product mismatch', openMismatch.length? `<table><thead><tr><th>Material</th><th>Site</th><th>Sr No.</th><th>Product Code</th><th>Note</th><th>Opened</th><th></th></tr></thead><tbody>
    ${openMismatch.map(t=>`<tr><td>${t.materialName}</td><td class="status-crit">${t.site||'—'}</td><td>${t.srNo||'—'}</td><td>${t.productCode||'—'}</td><td>${t.note||'—'}</td><td>${t.createdDate}</td>
    <td><button class="btn small" onclick="resolveProductMismatch('${t.id}')">Resolve</button></td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No open product-mismatch tickets.</div>`, `${openMismatch.length}`)}
    ${collapsePanel('tickets-open-stale', 'Open — Stale challans, no material added', openStale.length? `<table><thead><tr><th>Challan</th><th>Approved</th><th>Opened</th><th></th></tr></thead><tbody>
    ${openStale.map(t=>`<tr><td class="status-crit">${t.challanNo||'—'}</td><td>${t.approvedDate||'—'}</td><td>${t.createdDate}</td>
    <td>${DEVICE===3? `<button class="btn small" onclick="reapproveStaleChallan('${t.id}')">Re-approve</button>` : '<span class="status-low">Device 3 only</span>'}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No open stale-challan tickets.</div>`, `${openStale.length}`)}
    ${collapsePanel('tickets-open-repair', 'Open — Material out for repair', openRepair.length? `<table><thead><tr><th>Material</th><th>Vendor</th><th>Opened</th><th>Daily alerts sent</th></tr></thead><tbody>
    ${openRepair.map(t=>`<tr><td>${t.materialName}</td><td>${t.vendorName||'—'}</td><td>${t.createdDate}</td><td>${t.alertCount||1}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No open material-repair tickets.</div>`, `${openRepair.length}`)}
    ${collapsePanel('tickets-resolved', 'Resolved history', resolved.length? `<table><thead><tr><th>Material</th><th>Type</th><th>Opened</th><th>Resolved</th><th>Total alerts</th></tr></thead><tbody>
    ${resolved.map(t=>`<tr><td>${t.materialName||t.challanNo||'—'}</td><td>${ticketTypeLabel(t)}</td><td>${t.createdDate}</td><td>${t.resolvedDate}</td><td>${t.alertCount||1}</td></tr>`).join('')}
    </tbody></table>` : `<div class="empty">No resolved tickets yet.</div>`, `${resolved.length}`)}`;
}

/* =========================================================================
   SO / PROJECTS — BOM (SO -> Product -> Material) tracking
   ========================================================================= */
function soStatusBadge(s){ return s.status==='completed' ? '<span class="status-ok">Completed</span>' : '<span class="status-low">Open</span>'; }

// Day/Week/Month/Year scoping for the SO / Projects list, same pattern as gate
// entries/requests above — filters by each SO's created date. Defaults to "All"
// rather than "Today" since SOs are long-running projects, not one-off daily
// entries, so hiding older-but-still-open SOs by default would just get in the
// way. Kept outside DB so it resets on reload but survives the 4s auto-refresh poll.
let soScopeState = { scope:'all', customDate:null, customMonth:null, customYear:null, calendarOpen:false };
let soListUIState = { openGroups:{}, openItems:{} };
// Per-product collapse state within an open SO — same collapsed-by-default,
// click-to-expand pattern as the SO group/item levels above, just one level
// deeper. Keyed by product id (unique via uid()), so it's safe to share one
// flat object across every SO's products. Runtime-only, like the others.
let soProductUIState = {};
function toggleSOProduct(pid){ soProductUIState[pid] = !soProductUIState[pid]; render(); }
window.toggleSOProduct = toggleSOProduct;
function scopeSOList(rows){
  const scope = soScopeState.scope;
  const now = new Date();
  if(scope==='today') return rows.filter(s=>daysSinceToday(s.date)===0);
  if(scope==='week') return rows.filter(s=>{ const d=daysSinceToday(s.date); return d>=0 && d<=6; });
  if(scope==='month') return rows.filter(s=>{ if(!s.date) return false; const d=new Date(s.date+'T00:00:00'); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth(); });
  if(scope==='year') return rows.filter(s=>{ if(!s.date) return false; return new Date(s.date+'T00:00:00').getFullYear()===now.getFullYear(); });
  if(scope==='custom-day') return soScopeState.customDate ? rows.filter(s=>s.date===soScopeState.customDate) : [];
  if(scope==='custom-month'){
    if(!soScopeState.customMonth) return [];
    const [y,m] = soScopeState.customMonth.split('-').map(Number);
    return rows.filter(s=>{ if(!s.date) return false; const d=new Date(s.date+'T00:00:00'); return d.getFullYear()===y && (d.getMonth()+1)===m; });
  }
  if(scope==='custom-year'){
    if(!soScopeState.customYear) return [];
    return rows.filter(s=>{ if(!s.date) return false; return new Date(s.date+'T00:00:00').getFullYear()===Number(soScopeState.customYear); });
  }
  return rows; // 'all'
}
function soScopeHeading(){
  const s = soScopeState;
  if(s.scope==='today') return 'Today — '+formatDateNice(todayStr());
  if(s.scope==='week') return 'Last 6 Days';
  if(s.scope==='month') return 'This Month — '+new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  if(s.scope==='year') return 'This Year — '+new Date().getFullYear();
  if(s.scope==='custom-day') return s.customDate ? formatDateNice(s.customDate) : 'Pick a day from the calendar below';
  if(s.scope==='custom-month') return s.customMonth ? formatMonthNice(s.customMonth) : 'Pick a month from the calendar below';
  if(s.scope==='custom-year') return s.customYear ? ('Year '+s.customYear) : 'Pick a year from the calendar below';
  return 'All SOs / Projects';
}
function renderSOScopeControls(){
  const s = soScopeState;
  const inCalendar = ['custom-day','custom-month','custom-year'].includes(s.scope);
  return `<div class="entries-scope-row">
      <button type="button" class="scope-btn ${s.scope==='today'?'active':''}" onclick="setSOScope('today')">Today</button>
      <button type="button" class="scope-btn ${s.scope==='week'?'active':''}" onclick="setSOScope('week')">Last 6 Days</button>
      <button type="button" class="scope-btn ${s.scope==='month'?'active':''}" onclick="setSOScope('month')">This Month</button>
      <button type="button" class="scope-btn ${s.scope==='year'?'active':''}" onclick="setSOScope('year')">This Year</button>
      <button type="button" class="scope-btn ${s.scope==='all'?'active':''}" onclick="setSOScope('all')">All</button>
      <button type="button" class="scope-btn ${inCalendar?'active':''}" onclick="toggleSOScopeCalendar()">📅 Calendar (past day / month / year)</button>
    </div>
    <div class="entries-calendar-row" style="display:${s.calendarOpen?'flex':'none'}">
      <label>Pick a day
        <input type="date" value="${s.customDate||''}" max="${todayStr()}" onchange="pickSOScopeDay(this.value)">
      </label>
      <label>Pick a month/year
        <input type="month" value="${s.customMonth||''}" max="${todayStr().slice(0,7)}" onchange="pickSOScopeMonth(this.value)">
      </label>
      <label>Pick a year
        <input type="number" value="${s.customYear||''}" min="2000" max="${new Date().getFullYear()}" placeholder="${new Date().getFullYear()}" style="width:90px" onchange="pickSOScopeYear(this.value)">
      </label>
    </div>
    <div class="entries-heading">${soScopeHeading()}</div>`;
}
function setSOScope(scope){ soScopeState.scope = scope; soScopeState.calendarOpen = false; render(); }
function toggleSOScopeCalendar(){ soScopeState.calendarOpen = !soScopeState.calendarOpen; render(); }
function pickSOScopeDay(v){ if(!v) return; soScopeState.customDate = v; soScopeState.scope = 'custom-day'; soScopeState.calendarOpen = true; render(); }
function pickSOScopeMonth(v){ if(!v) return; soScopeState.customMonth = v; soScopeState.scope = 'custom-month'; soScopeState.calendarOpen = true; render(); }
function pickSOScopeYear(v){ if(!v) return; soScopeState.customYear = v; soScopeState.scope = 'custom-year'; soScopeState.calendarOpen = true; render(); }
function toggleSOGroup(gid){ soListUIState.openGroups[gid] = !soListUIState.openGroups[gid]; render(); }
function toggleSOItem(soId){ soListUIState.openItems[soId] = !soListUIState.openItems[soId]; render(); }
window.setSOScope = setSOScope;
window.toggleSOScopeCalendar = toggleSOScopeCalendar;
window.pickSOScopeDay = pickSOScopeDay;
window.pickSOScopeMonth = pickSOScopeMonth;
window.pickSOScopeYear = pickSOScopeYear;
window.toggleSOGroup = toggleSOGroup;
window.toggleSOItem = toggleSOItem;

function renderSOCommon(el, editable){
  el.innerHTML = `
    <h2 class="section-title">SO / Projects</h2>
    <div class="section-sub">${editable
      ? 'Define SO/PROJECT requirement.'
      : 'Read-only view of SO / product completion, synced from Device 1.'}</div>
    ${editable? `<div class="panel"><h3>New SO</h3>
      <form id="so-form" class="row">
        <div class="field"><label>SO Number</label><input required id="so-number" placeholder="SO-0221"></div>
        <div class="field"><label>Date</label><input required id="so-date" type="date" value="${todayStr()}"></div>
        <button class="btn" type="submit" style="align-self:flex-end">Create SO</button>
      </form></div>` : ''}
    <div id="so-list"></div>
    ${collapsePanel('so-excess-pool', 'Excess pool', `<div class="section-sub">Material received beyond what was needed for its allocated SO/product — available to apply to another SO's requirement instead of ordering more.</div>
      ${renderExcessPoolTable()}`)}`;
  paintSOList(editable);
  if(editable){
    document.getElementById('so-form').addEventListener('submit', async e=>{
      e.preventDefault();
      const num = document.getElementById('so-number').value.trim();
      if(DB.soList.some(s=>s.soNumber.toLowerCase()===num.toLowerCase())){ toast('An SO with that number already exists', true); return; }
      DB.soList.push({id:uid(), soNumber:num, date:document.getElementById('so-date').value, status:'open', completedDate:null, products:[], priority:false});
      await saveKey('soList'); toast(`SO ${num} created — add products to it below`);
      e.target.reset(); document.getElementById('so-date').value=todayStr(); render();
    });
  }
}
function renderSO1(el){ renderSOCommon(el, true); }
function renderSO2(el){ renderSOCommon(el, false); }
function renderSO3(el){ renderSOCommon(el, false); }

// Formats a quantity together with its unit (kg, Nos, mm, etc.) when the
// requirement row has one, e.g. fmtQty(100, r) -> "100 kg". Falls back to a
// bare number when no unit was ever recorded for that row.
function fmtQty(qty, r){ return `${qty}${r && r.qtyUnit ? ' '+r.qtyUnit : ''}`; }
// Unit picker for "Qty Needed" in SO/Projects. Reuses the same dropdown of
// units as the Size picker (SIZE_UNITS: mm, kg, Nos, etc. + "Other" free
// text) but wires it to the quantity instead of the size — Size in
// SO/Projects is now a plain value with no unit of its own.
function qtyUnitPickerHTML(prefix, selected){
  const sel = String(selected||'').trim();
  const inList = SIZE_UNITS.includes(sel);
  const showOther = !!sel && !inList;
  return `
    <div class="field"><label>Unit</label><select id="${prefix}-unit">
      <option value="" ${!sel?'selected':''}>—</option>
      ${SIZE_UNITS.map(u=>`<option value="${u}" ${(sel===u || (showOther && u==='Other'))?'selected':''}>${u}</option>`).join('')}
    </select></div>
    <div class="field" id="${prefix}-other-wrap" style="display:${showOther?'flex':'none'}"><label>Unit — specify</label><input id="${prefix}-other-unit" placeholder="e.g. sq.ft" value="${showOther?m_escape(sel):''}"></div>`;
}
// Same picker as above but as two bare <td> cells, for the compact per-row
// editing table (soEditFormHTML) instead of the flex "field" form layout.
function qtyUnitPickerCellsHTML(prefix, selected){
  const sel = String(selected||'').trim();
  const inList = SIZE_UNITS.includes(sel);
  const showOther = !!sel && !inList;
  return `
    <td><select id="${prefix}-unit" style="width:90px">
      <option value="" ${!sel?'selected':''}>—</option>
      ${SIZE_UNITS.map(u=>`<option value="${u}" ${(sel===u || (showOther && u==='Other'))?'selected':''}>${u}</option>`).join('')}
    </select></td>
    <td id="${prefix}-other-wrap" style="display:${showOther?'table-cell':'none'}"><input id="${prefix}-other-unit" placeholder="specify" style="width:90px" value="${showOther?m_escape(sel):''}"></td>`;
}
function wireQtyUnitPicker(prefix){
  const unitSel = document.getElementById(prefix+'-unit');
  const otherWrap = document.getElementById(prefix+'-other-wrap');
  if(!unitSel || !otherWrap) return;
  const shownDisplay = otherWrap.tagName==='TD' ? 'table-cell' : 'flex';
  unitSel.addEventListener('change', ()=>{ otherWrap.style.display = unitSel.value==='Other' ? shownDisplay : 'none'; });
}
function readQtyUnitValue(prefix){
  const unitSel = document.getElementById(prefix+'-unit');
  let unit = unitSel ? unitSel.value : '';
  if(unit==='Other'){ unit = (document.getElementById(prefix+'-other-unit')?.value||'').trim(); }
  return unit || '';
}
// Products whose material list is currently open in the Excel-style bulk
// editor (Device 1 only) — runtime-only, like soEditing/soProductUIState.
// Keyed by product id, since that's unique across every SO.
let productMatGridEditing = new Set();
function toggleProductMatGrid(pid){
  if(!actingAsDevice1()){ toast('Only Device 1 can edit material details', true); return; }
  if(productMatGridEditing.has(pid)) productMatGridEditing.delete(pid);
  else productMatGridEditing.add(pid);
  soProductUIState[pid] = true; // make sure the product is expanded so the editor is visible
  render();
}
window.toggleProductMatGrid = toggleProductMatGrid;

function productBlockHTML(so, p, editable){
  const canEdit = editable && so.status!=='completed';
  const pOpen = !!soProductUIState[p.id];
  const gridOpen = editable && productMatGridEditing.has(p.id);
  return `
  <div style="border:1px solid var(--line);border-radius:3px;margin:10px 0;background:var(--bg-sunk)">
    <button type="button" class="ent-item-toggle" style="padding:9px 10px" onclick="toggleSOProduct('${p.id}')">
      <span class="chev">${pOpen?'▾':'▸'}</span>
      <span class="name"><b>${p.name}</b> ${p.status==='completed'?'<span class="status-ok">Completed</span>':'<span class="status-low">Open</span>'}</span>
      <span class="ent-item-date">${p.materials.length} material${p.materials.length===1?'':'s'}</span>
    </button>
    <div style="display:${pOpen?'block':'none'};padding:0 12px 10px 12px">
    ${editable && p.materials.length? `<div class="row" style="margin:8px 0 0 0;gap:8px">
      <button type="button" class="btn small secondary" onclick="toggleProductMatGrid('${p.id}')" title="Edit every material's own details (name, size, grade, price, stock, etc.) in one spreadsheet-style grid instead of one at a time">${gridOpen? 'Close material editor' : 'Edit materials'}</button>
    </div>` : ''}
    ${gridOpen ? productMaterialsGridHTML(so, p) : `
    ${p.materials.length? `<table style="margin-top:8px"><thead><tr><th>Material</th><th>Size</th><th>Grade</th><th>Needed</th><th>Received</th><th>Remaining</th>${editable?'<th></th>':''}</tr></thead><tbody>
      ${p.materials.map(r=>{
        const remaining = Math.max(0, r.qtyNeeded-r.qtyFulfilled);
        const excessAvail = DB.excessPool[r.materialId]||0;
        const canApply = Math.min(remaining, excessAvail);
        const mat = materialById(r.materialId);
        const otherAvail = so.priority ? otherSOAvailable(so.id, r.materialId) : 0;
        const canPull = Math.min(remaining, otherAvail);
        return `<tr><td>${r.materialName}</td><td>${mat && mat.size ? mat.size : '—'}</td><td>${mat && mat.grade ? mat.grade : '—'}</td><td>${fmtQty(r.qtyNeeded, r)}</td><td>${fmtQty(r.qtyFulfilled, r)}</td>
        <td class="${remaining>0?'status-low':'status-ok'}">${fmtQty(remaining, r)}</td>
        ${editable? `<td>${canApply>0? `<button class="btn small secondary" onclick="useExcess('${so.id}','${p.id}','${r.materialId}', ${canApply})">Apply excess (${canApply})</button>` : ''}
        ${canPull>0? `<button class="btn small secondary" onclick="pullFromOtherSO('${so.id}','${p.id}','${r.materialId}', ${canPull})" title="Reassign already-received stock from a non-priority SO to this priority SO">Pull from other SO (${canPull})</button>` : ''}
        ${canEdit? `<button class="btn small danger" onclick="removeSOMaterial('${so.id}','${p.id}','${r.id}')">Remove</button>`:''}</td>`:''}</tr>`;
      }).join('')}
    </tbody></table>` : `<div class="empty">No materials listed for this product yet.</div>`}
    ${canEdit? `<form class="row add-material-form" data-so="${so.id}" data-product="${p.id}" style="margin-top:8px">
      <div class="field" style="position:relative"><input required class="new-mat-name" placeholder="Material name" autocomplete="off"><div class="autolist new-mat-list"></div><div class="hint new-mat-hint"></div></div>
      <div class="field"><input required type="number" min="1" step="any" class="new-mat-qty" placeholder="Qty needed"></div>
      ${qtyUnitPickerHTML('nm-unit-'+p.id)}
      <div class="new-mat-fields" style="display:contents">
        <div class="field"><input class="new-mat-size" placeholder="Size / Dimension (optional)"></div>
        <div class="field"><input class="new-mat-grade" placeholder="Grade / Quality (optional)"></div>
        <div class="field"><label style="display:block">Category</label>${soCategorySelectHTML('nm-cat-'+p.id)}</div>
        <div class="field new-mat-cat-other-wrap" id="nm-cat-other-wrap-${p.id}" style="display:none"><input id="nm-cat-other-${p.id}" class="new-mat-cat-other" placeholder="Specify category"></div>
      </div>
      <div class="field existing-mat-summary" style="display:none;flex:1 1 100%"></div>
      <button class="btn small secondary" type="submit">+ Add material</button>
    </form>
    <div class="row" style="margin-top:6px;gap:8px;align-items:center">
      <span class="hint">Adding several materials to this product? Skip the form above:</span>
      <button type="button" class="btn small secondary" onclick="downloadSOMaterialImportTemplate()">Download Excel template</button>
      <input type="file" id="so-mat-import-${so.id}-${p.id}" accept=".xlsx,.xls" style="display:none" onchange="bulkImportSOMaterialsFromExcel(this,'${so.id}','${p.id}')">
      <button type="button" class="btn small secondary" onclick="document.getElementById('so-mat-import-${so.id}-${p.id}').click()">Upload Excel file</button>
    </div>` : (editable && so.status==='completed' ? `<div class="hint">SO marked Complete by Device 3 — no new material can be added. Device 3 must mark it Incomplete first.</div>` : '')}
    `}
    </div>
  </div>`;
}

/* =========================================================================
   EXCEL-STYLE MATERIAL GRID — Device 1 only. Lets every material inside one
   product be edited at once (all the same fields as the single-material Edit
   modal: name, type, category, code, size, grade, rack, price, unit, PO/SO,
   stock) with arrow-key cell-to-cell navigation, instead of opening the Edit
   modal once per material. Saving writes through applyMaterialEditFields()
   (device1-materials.js) — the same shared material record every other
   screen reads, so a change here shows up everywhere that material is used,
   exactly like the old per-material Edit button did.
   ========================================================================= */
function matGridRackListId(pid){ return 'mg-rack-list-'+pid; }
function matGridPOListId(pid){ return 'mg-po-list-'+pid; }
function matGridSOListId(pid){ return 'mg-so-list-'+pid; }

function productMaterialsGridHTML(so, p){
  const rows = p.materials.map((r, ri)=>{
    const mat = materialById(r.materialId);
    const lid = r.id;
    if(!mat){
      // The material this line points to no longer exists in the Materials
      // list (deleted or merged after being added to this SO). Show it
      // plainly instead of silently vanishing the row — the product's
      // material count includes it either way, so hiding it just makes
      // materials look like they "disappeared".
      return `<tr><td colspan="13" class="hint" style="padding:8px">⚠ "${m_escape(r.materialName||'This material')}" no longer exists in the Materials list, so its details can't be edited here. Remove it from this product and re-add it if it should still be tracked.</td></tr>`;
    }
    const knownType = allMaterialTypeOptions().some(t=>t.toLowerCase()===mat.type.toLowerCase());
    return `<tr>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="0" id="mg-${lid}-name" value="${m_escape(mat.name)}" style="width:130px"></td>
      <td><select class="mg-cell" data-gr="${ri}" data-gc="1" id="mg-${lid}-type" onchange="matGridTypeChanged('${lid}')">${allMaterialTypeOptions().map(t=>`<option ${knownType && t.toLowerCase()===mat.type.toLowerCase()?'selected':''}>${t}</option>`).join('')}<option value="__other__" ${!knownType?'selected':''}>Other…</option></select>
        <input id="mg-${lid}-type-other" placeholder="specify type" value="${knownType?'':m_escape(mat.type)}" style="width:100px;margin-top:4px;display:${knownType?'none':'block'}"></td>
      <td><select class="mg-cell" data-gr="${ri}" data-gc="2" id="mg-${lid}-cat">${DB.categories.map(c=>`<option ${c===mat.category?'selected':''}>${c}</option>`).join('')}</select></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="3" id="mg-${lid}-code" value="${m_escape(mat.productCode||'')}" style="width:90px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="4" id="mg-${lid}-size" value="${m_escape(mat.size||'')}" style="width:90px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="5" id="mg-${lid}-grade" value="${m_escape(mat.grade||'')}" style="width:90px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="6" id="mg-${lid}-rack" list="${matGridRackListId(p.id)}" value="${m_escape(mat.rack||'')}" style="width:100px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="7" id="mg-${lid}-price" type="number" min="0" step="0.01" value="${mat.price||0}" style="width:80px"></td>
      <td><select class="mg-cell" data-gr="${ri}" data-gc="8" id="mg-${lid}-unit">${UNITS.map(u=>`<option ${u===mat.unit?'selected':''}>${u}</option>`).join('')}</select></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="9" id="mg-${lid}-po" list="${matGridPOListId(p.id)}" value="${m_escape(mat.poNumber||'')}" style="width:100px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="10" id="mg-${lid}-so" list="${matGridSOListId(p.id)}" value="${m_escape(mat.soNumber||'')}" style="width:100px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="11" type="number" min="0" step="any" id="mg-${lid}-stock" value="${getStock(mat.id)}" style="width:80px"></td>
      <td><input class="mg-cell" data-gr="${ri}" data-gc="12" type="number" min="0" step="1" id="mg-${lid}-stocknos" value="${getStockNos(mat.id)}" style="width:80px"></td>
    </tr>`;
  }).join('');
  return `<div id="matgrid-${p.id}">
    <div style="overflow-x:auto;margin-top:8px">
      <table style="min-width:1350px">
        <thead><tr><th>Name</th><th>Type</th><th>Category</th><th>Code</th><th>Size</th><th>Grade</th><th>Rack</th><th>Price</th><th>Unit</th><th>PO No.</th><th>SO No.</th><th>Stock</th><th>Nos.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <datalist id="${matGridRackListId(p.id)}">${DB.locations.map(l=>`<option value="${m_escape(l)}">`).join('')}</datalist>
    <datalist id="${matGridPOListId(p.id)}">${allPONumbers().map(x=>`<option value="${m_escape(x)}">`).join('')}</datalist>
    <datalist id="${matGridSOListId(p.id)}">${allSONumbers().map(x=>`<option value="${m_escape(x)}">`).join('')}</datalist>
    <div class="hint" style="margin-top:6px">Use the arrow keys to hop between fields, like a spreadsheet. Saving here updates each material's shared record — it'll show the new details everywhere else it's used too.</div>
    <div class="row" style="margin-top:8px;gap:8px">
      <button type="button" class="btn small" onclick="saveProductMatGrid('${so.id}','${p.id}')">Save all</button>
      <button type="button" class="btn small secondary" onclick="toggleProductMatGrid('${p.id}')">Cancel / Close</button>
    </div>
  </div>`;
}
function matGridTypeChanged(lid){
  const sel = document.getElementById('mg-'+lid+'-type');
  const otherInput = document.getElementById('mg-'+lid+'-type-other');
  if(sel && otherInput) otherInput.style.display = sel.value==='__other__' ? 'block' : 'none';
}
window.matGridTypeChanged = matGridTypeChanged;

// Generic Excel-style arrow-key navigation for any grid of cells carrying
// data-gr (row) / data-gc (col) attributes. Up/Down always move a row —
// there's nothing for them to do inside a single-line field or a closed
// dropdown anyway. Left/Right move a column too, except in a plain text
// field where the caret isn't already at that edge — there, the arrow key
// is left alone so normal in-text cursor movement still works.
function wireExcelGridNav(containerEl){
  if(!containerEl) return;
  const cells = Array.from(containerEl.querySelectorAll('.mg-cell'));
  const byPos = {};
  cells.forEach(c=>{ byPos[c.dataset.gr+'_'+c.dataset.gc] = c; });
  cells.forEach(c=>{
    c.addEventListener('keydown', (e)=>{
      const r = Number(c.dataset.gr), co = Number(c.dataset.gc);
      const isTextLike = c.tagName==='INPUT' && (c.type==='text' || c.type==='');
      let dr=0, dc=0;
      if(e.key==='ArrowUp') dr=-1;
      else if(e.key==='ArrowDown') dr=1;
      else if(e.key==='ArrowLeft'){ if(isTextLike && c.selectionStart>0) return; dc=-1; }
      else if(e.key==='ArrowRight'){ if(isTextLike && c.selectionEnd<c.value.length) return; dc=1; }
      else return;
      const target = byPos[(r+dr)+'_'+(co+dc)];
      if(target){ e.preventDefault(); target.focus(); if(typeof target.select==='function') target.select(); }
    });
  });
}

async function saveProductMatGrid(soId, pid){
  const so = findSO(soId); if(!so) return;
  const p = so.products.find(x=>x.id===pid); if(!p) return;
  const drafts = [];
  for(const r of p.materials){
    if(!materialById(r.materialId)) continue; // orphaned line — nothing was rendered for it, nothing to save
    const lid = r.id;
    const val = (suffix)=>{ const el = document.getElementById(`mg-${lid}-${suffix}`); return el ? el.value : ''; };
    const name = val('name').trim();
    if(!name){ toast(`Material name cannot be empty (row for ${r.materialName})`, true); return; }
    let type = val('type');
    if(type==='__other__'){
      type = val('type-other').trim();
      if(!type){ toast(`Type a material type for "${name}", or pick one from the list`, true); return; }
    }
    drafts.push({
      materialId: r.materialId, name, type,
      category: val('cat'), productCode: val('code'), size: val('size'), grade: val('grade'),
      rack: val('rack'), price: val('price'), unit: val('unit'), poNumber: val('po'), soNumber: val('so'),
      newStock: val('stock'), newStockNos: val('stocknos'),
    });
  }
  for(const d of drafts){
    const ok = await applyMaterialEditFields(d.materialId, d, {silent:true, skipRender:true});
    if(!ok) return; // applyMaterialEditFields already showed the specific error
  }
  toast(`Materials updated for "${p.name}"`);
  productMatGridEditing.delete(pid);
  render();
}
window.saveProductMatGrid = saveProductMatGrid;
// "Add material to multiple products" — lets Device 1 add one material (existing or
// brand-new) to several/all of an SO's products in a single submit, instead of
// repeating the per-product form once for each of the (often 10+) product names.
// New materials typed here are created and attached in the same step (see the
// submit handler in paintSOList) — no detour through Materials and no re-entry.
function bulkAddMaterialFormHTML(so){
  const openProducts = so.products.filter(p=>p.status!=='completed');
  if(so.products.length<2) return ''; // not worth it with a single product — the per-product form below covers that
  return `
  <div style="border:1px dashed var(--line);border-radius:3px;padding:10px 12px;margin:10px 0;background:var(--bg-sunk)">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
      <b>Add material to multiple products</b>
      <span class="hint">Same material + qty applied to every product you check — one entry instead of ${so.products.length}.</span>
    </div>
    <form class="row bulk-material-form" data-so="${so.id}" style="margin-top:8px">
      <div class="field" style="position:relative"><input required class="bulk-mat-name" placeholder="Material name" autocomplete="off"><div class="autolist bulk-mat-list"></div><div class="hint bulk-mat-hint"></div></div>
      <div class="field"><input required type="number" min="1" step="any" class="bulk-mat-qty" placeholder="Qty needed (each)"></div>
      ${qtyUnitPickerHTML('bulk-unit-'+so.id)}
      <div class="bulk-mat-fields" style="display:contents">
        <div class="field"><input class="bulk-mat-size" placeholder="Size / Dimension (optional)"></div>
        <div class="field"><input class="bulk-mat-grade" placeholder="Grade / Quality (optional)"></div>
        <div class="field"><label style="display:block">Category</label>${soCategorySelectHTML('bulk-cat-'+so.id)}</div>
        <div class="field bulk-mat-cat-other-wrap" id="bulk-cat-other-wrap-${so.id}" style="display:none"><input id="bulk-cat-other-${so.id}" class="bulk-mat-cat-other" placeholder="Specify category"></div>
      </div>
      <div class="field bulk-existing-mat-summary" style="display:none;flex:1 1 100%"></div>
      <div class="field" style="flex:1 1 100%">
        <label style="display:block">Apply to products</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px 16px;align-items:center">
          <label style="font-weight:600"><input type="checkbox" class="bulk-mat-select-all"> Select all (${openProducts.length})</label>
          ${so.products.map(p=>`<label${p.status==='completed'?' title="Completed — no new material can be added" style="opacity:.55"':''}><input type="checkbox" class="bulk-mat-product-check" value="${p.id}" ${p.status==='completed'?'disabled':''}> ${p.name}${p.status==='completed'?' (completed)':''}</label>`).join('')}
        </div>
      </div>
      <button class="btn small secondary" type="submit">+ Add to selected products</button>
    </form>
  </div>`;
}
// Which SOs are currently open in "Edit details" mode (Device 1 only) — runtime-only,
// not persisted; lets the user edit existing SO number/date/product names/quantities
// in place, then choose to save or keep editing via a confirm prompt.
const soEditing = new Set();
function soEditFormHTML(so){
  // Whether new products/materials can be attached while this SO is open in
  // "Edit details" mode — same gating as the normal (non-edit-details) view:
  // blocked only once Device 3 has marked the SO Complete, unlocked again the
  // moment Device 3 marks it Incomplete.
  const canAddHere = so.status!=='completed';
  return `
  <div style="border:1px solid var(--line);border-radius:3px;padding:10px 12px;margin:10px 0;background:var(--bg-sunk)">
    <div class="row">
      <div class="field"><label>SO Number</label><input id="soedit-number-${so.id}" value="${so.soNumber}"></div>
      <div class="field"><label>Date</label><input id="soedit-date-${so.id}" type="date" value="${so.date}"></div>
    </div>
    ${so.products.map(p=>`
      <div style="border-top:1px solid var(--line);padding-top:8px;margin-top:8px">
        <div class="field"><label>Product name</label><input id="soedit-pname-${so.id}-${p.id}" value="${p.name}"></div>
        ${p.materials.length? `<table style="margin-top:8px"><thead><tr><th>Material</th><th>Qty needed</th><th colspan="2">Unit</th></tr></thead><tbody>
          ${p.materials.map(r=>`<tr><td>${r.materialName}</td><td><input type="number" min="1" step="any" id="soedit-qty-${so.id}-${p.id}-${r.id}" value="${r.qtyNeeded}" style="width:100px"></td>${qtyUnitPickerCellsHTML('soedit-unit-'+so.id+'-'+p.id+'-'+r.id, r.qtyUnit)}</tr>`).join('')}
        </tbody></table>` : `<div class="empty">No materials listed for this product yet.</div>`}
        ${canAddHere? `<form class="row add-material-form" data-so="${so.id}" data-product="${p.id}" style="margin-top:8px">
          <div class="field" style="position:relative"><input required class="new-mat-name" placeholder="Material name" autocomplete="off"><div class="autolist new-mat-list"></div><div class="hint new-mat-hint"></div></div>
          <div class="field"><input required type="number" min="1" step="any" class="new-mat-qty" placeholder="Qty needed"></div>
          ${qtyUnitPickerHTML('nm-unit-'+p.id)}
          <div class="new-mat-fields" style="display:contents">
            <div class="field"><input class="new-mat-size" placeholder="Size / Dimension (optional)"></div>
            <div class="field"><input class="new-mat-grade" placeholder="Grade / Quality (optional)"></div>
            <div class="field"><label style="display:block">Category</label>${soCategorySelectHTML('nm-cat-'+p.id)}</div>
            <div class="field new-mat-cat-other-wrap" id="nm-cat-other-wrap-${p.id}" style="display:none"><input id="nm-cat-other-${p.id}" class="new-mat-cat-other" placeholder="Specify category"></div>
          </div>
          <div class="field existing-mat-summary" style="display:none;flex:1 1 100%"></div>
          <button class="btn small secondary" type="submit">+ Add material</button>
        </form>` : ''}
      </div>`).join('')}
    ${canAddHere? `<div style="border-top:1px solid var(--line);padding-top:10px;margin-top:10px">
      <form class="row add-product-form" data-so="${so.id}">
        <div class="field"><input required placeholder="Product name, e.g. Pen" class="new-product-name"></div>
        <button class="btn small secondary" type="submit">+ Add product</button>
      </form>
    </div>` : ''}
    <div class="row" style="margin-top:10px">
      <button type="button" class="btn small" onclick="saveSOEdit('${so.id}')">Save</button>
      <button type="button" class="btn small secondary" onclick="cancelSOEdit('${so.id}')">Cancel</button>
    </div>
  </div>`;
}
function startSOEdit(soId){
  if(!actingAsDevice1()){ toast('Only Device 1 can edit SO details', true); return; }
  soEditing.add(soId);
  soListUIState.openItems[soId] = true;
  render();
}
function cancelSOEdit(soId){
  soEditing.delete(soId);
  render();
}
async function saveSOEdit(soId){
  const so = findSO(soId); if(!so) return;
  const newNumber = (document.getElementById('soedit-number-'+soId).value||'').trim();
  if(!newNumber){ toast('SO Number cannot be blank', true); return; }
  if(DB.soList.some(s=>s.id!==soId && s.soNumber.toLowerCase()===newNumber.toLowerCase())){
    toast('Another SO already uses that number', true); return;
  }
  const newDate = document.getElementById('soedit-date-'+soId).value;
  const productDrafts = [];
  for(const p of so.products){
    const nameEl = document.getElementById('soedit-pname-'+soId+'-'+p.id);
    const pname = (nameEl.value||'').trim();
    if(!pname){ toast('Product name cannot be blank', true); return; }
    const matDrafts = [];
    for(const r of p.materials){
      const qtyEl = document.getElementById('soedit-qty-'+soId+'-'+p.id+'-'+r.id);
      const qty = Number(qtyEl.value);
      if(!qty || qty<=0){ toast(`Enter a valid quantity for ${r.materialName}`, true); return; }
      const unit = readQtyUnitValue('soedit-unit-'+soId+'-'+p.id+'-'+r.id);
      matDrafts.push({r, qty, unit});
    }
    productDrafts.push({p, pname, matDrafts});
  }

  // As requested: ask whether to commit the edit now, or keep editing without saving yet.
  const doSave = confirm(`Save changes to SO ${newNumber}?\n\nOK = Save file\nCancel = Continue editing`);
  if(!doSave) return; // dialog dismissed — stay in edit mode, nothing is committed

  so.soNumber = newNumber;
  so.date = newDate;
  productDrafts.forEach(({p, pname, matDrafts})=>{
    p.name = pname;
    matDrafts.forEach(({r, qty, unit})=>{ r.qtyNeeded = qty; r.qtyUnit = unit; });
  });
  checkSOCompletion(so);
  await saveKey('soList');
  soEditing.delete(soId);
  toast(`SO ${so.soNumber} updated and saved`);
  render();
}
window.startSOEdit = startSOEdit;
window.cancelSOEdit = cancelSOEdit;
window.saveSOEdit = saveSOEdit;

function paintSOList(editable){
  const wrap = document.getElementById('so-list');
  if(!DB.soList.length){ wrap.innerHTML = `<div class="panel"><div class="empty">No SOs yet.</div></div>`; return; }
  const scoped = scopeSOList(DB.soList.slice().reverse());
  const groups = { 'Open': [], 'Completed': [] };
  scoped.forEach(so=>{ groups[so.status==='completed'?'Completed':'Open'].push(so); });
  const groupNames = Object.keys(groups).filter(g=>groups[g].length);

  wrap.innerHTML = `
    <div class="panel entries-panel">
      ${renderSOScopeControls()}
      <div class="entries-list">
        ${groupNames.length ? groupNames.map(label=>{
          const items = groups[label];
          const gid = safeId('so-'+label);
          const gOpen = !!soListUIState.openGroups[gid];
          return `<div class="ent-group">
            <button type="button" class="ent-group-toggle" onclick="toggleSOGroup('${gid}')">
              <span class="chev">${gOpen?'▾':'▸'}</span> ${label} (${items.length})
            </button>
            <div class="ent-group-body" style="display:${gOpen?'block':'none'}">
              ${items.map(so=>{
                const iOpen = !!soListUIState.openItems[so.id];
                return `<div class="ent-item">
                  <button type="button" class="ent-item-toggle" onclick="toggleSOItem('${so.id}')">
                    <span class="chev">${iOpen?'▾':'▸'}</span>
                    <span class="name">SO ${so.soNumber} — ${soStatusBadge(so)} ${so.priority? '<span class="status-crit">★ Priority</span>' : ''}</span>
                    <span class="ent-item-date">created ${so.date}${so.completedDate? ' · completed '+so.completedDate:''}</span>
                  </button>
                  <div class="ent-item-body" style="display:${iOpen?'block':'none'}">
                    ${so.status==='completed'? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                      <button type="button" class="btn small secondary" onclick="printSOSlip('${so.id}')">View / Print</button>
                      <button type="button" class="btn small secondary" onclick="downloadSOExcel('${so.id}')">Download Excel</button>
                    </div>` : ''}
                    ${(editable || DEVICE===3) ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                      ${editable && !soEditing.has(so.id)? `
                        <button type="button" class="btn small secondary" onclick="toggleSOPriority('${so.id}')">${so.priority? 'Un-prioritise' : 'Set Priority'}</button>
                        <button type="button" class="btn small secondary" onclick="startSOEdit('${so.id}')">Edit details</button>
                      ` : ''}
                      ${DEVICE===3? `<button type="button" class="btn small ${so.status==='completed'?'secondary':''}" onclick="toggleSOManualStatus('${so.id}')">${so.status==='completed'? 'Mark Incomplete' : 'Mark Complete'}</button>` : ''}
                    </div>` : ''}
                    ${soEditing.has(so.id) ? soEditFormHTML(so) : `
                    ${editable && so.status!=='completed'? bulkAddMaterialFormHTML(so) : ''}
                    ${so.products.length? so.products.map(p=>productBlockHTML(so,p,editable)).join('') : `<div class="empty">No products added yet.</div>`}
                    ${editable && so.status!=='completed'? `<form class="row add-product-form" data-so="${so.id}" style="margin-top:8px">
                      <div class="field"><input required placeholder="Product name, e.g. Pen" class="new-product-name"></div>
                      <button class="btn small secondary" type="submit">+ Add product</button>
                    </form>` : ''}`}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('') : `<div class="empty">No SOs for this period.</div>`}
      </div>
    </div>`;

  // Track the exact material picked per input (not just its name) so that materials
  // sharing a name (different size/grade variants) aren't resolved ambiguously.
  const pickedByInput = new Map();
  const showNewMatFields = (inp, show)=>{
    const form = inp.closest('.add-material-form'); if(!form) return;
    const fieldsWrap = form.querySelector('.new-mat-fields');
    const summary = form.querySelector('.existing-mat-summary');
    if(fieldsWrap) fieldsWrap.style.display = show ? 'contents' : 'none';
    if(summary) summary.style.display = show ? 'none' : '';
  };
  const applyExistingMatPick = (inp, m, hintEl)=>{
    pickedByInput.set(inp, m); inp.value = m.name;
    if(hintEl) hintEl.textContent = '';
    // Existing material picked — its size/grade/category are already fixed,
    // so hide the "create new variant" fields and show them as a read-only
    // summary instead of asking the user to re-type details already on file.
    showNewMatFields(inp, false);
    const form = inp.closest('.add-material-form');
    const summary = form && form.querySelector('.existing-mat-summary');
    if(summary){
      summary.innerHTML = `<span class="hint">Using existing material — Type: ${m.type} · Category: ${m.category}${m.size?' · Size: '+m_escape(m.size):''}${m.grade?' · Grade: '+m_escape(m.grade):''}${m.rack?' · Rack: '+m_escape(m.rack):''}. Just enter the Qty needed.</span>`;
    }
  };
  wrap.querySelectorAll('.new-mat-name').forEach(inp=>{
    const listEl = inp.parentElement.querySelector('.new-mat-list');
    const hintEl = inp.parentElement.querySelector('.new-mat-hint');
    attachAutocomplete(inp, listEl, ()=>DB.materials, (m)=>applyExistingMatPick(inp, m, hintEl),
      (m)=>`${m.type} · ${m.category}${m.size?' · '+m.size:''}${m.grade?' · '+m.grade:''}`);
    inp.addEventListener('input', ()=>{
      if(inp.value !== (pickedByInput.get(inp)||{}).name){
        pickedByInput.delete(inp);
        const matches = DB.materials.filter(m=>m.name.toLowerCase()===inp.value.trim().toLowerCase());
        if(matches.length===1){
          // Typed the exact name of a single, unambiguous existing material —
          // treat it the same as picking it from the dropdown.
          applyExistingMatPick(inp, matches[0], hintEl);
        } else {
          showNewMatFields(inp, true);
          if(hintEl) hintEl.textContent = matches.length>1 ? `${matches.length} variants of this name — pick one from the list below.` : '';
        }
      }
    });
  });
  wrap.querySelectorAll('.add-material-form').forEach(f=>{
    const pid = f.dataset.product;
    wireQtyUnitPicker('nm-unit-'+pid);
    const catSel = document.getElementById('nm-cat-'+pid);
    const catOtherWrap = document.getElementById('nm-cat-other-wrap-'+pid);
    if(catSel && catOtherWrap){ catSel.addEventListener('change', ()=>{ catOtherWrap.style.display = catSel.value==='Other' ? 'flex' : 'none'; }); }
  });
  // Per-row Unit dropdowns in the SO edit table (soEditFormHTML) — each existing
  // material requirement gets its own picker, wired the same way as the "add
  // material" ones above.
  wrap.querySelectorAll('select[id^="soedit-unit-"]').forEach(sel=>{
    wireQtyUnitPicker(sel.id.replace(/-unit$/,''));
  });
  // Arrow-key cell navigation for any Excel-style material grid currently open.
  productMatGridEditing.forEach(pid=>{
    wireExcelGridNav(document.getElementById('matgrid-'+pid));
  });

  // Bulk "add material to multiple products" form — same autocomplete/new-material-detection
  // behavior as the per-product form above, just scoped to its own field classes so it doesn't
  // interfere with the per-product forms sitting alongside it.
  const showBulkNewFields = (form, show)=>{
    const fieldsWrap = form.querySelector('.bulk-mat-fields');
    const summary = form.querySelector('.bulk-existing-mat-summary');
    if(fieldsWrap) fieldsWrap.style.display = show ? 'contents' : 'none';
    if(summary) summary.style.display = show ? 'none' : '';
  };
  const applyBulkExistingPick = (inp, m, hintEl, form)=>{
    pickedByInput.set(inp, m); inp.value = m.name;
    if(hintEl) hintEl.textContent = '';
    showBulkNewFields(form, false);
    const summary = form.querySelector('.bulk-existing-mat-summary');
    if(summary){
      summary.innerHTML = `<span class="hint">Using existing material — Type: ${m.type} · Category: ${m.category}${m.size?' · Size: '+m_escape(m.size):''}${m.grade?' · Grade: '+m_escape(m.grade):''}${m.rack?' · Rack: '+m_escape(m.rack):''}. Just enter the Qty needed and pick products below.</span>`;
    }
  };
  wrap.querySelectorAll('.bulk-material-form').forEach(f=>{
    const soId = f.dataset.so;
    wireQtyUnitPicker('bulk-unit-'+soId);
    const catSel = document.getElementById('bulk-cat-'+soId);
    const catOtherWrap = document.getElementById('bulk-cat-other-wrap-'+soId);
    if(catSel && catOtherWrap){ catSel.addEventListener('change', ()=>{ catOtherWrap.style.display = catSel.value==='Other' ? 'flex' : 'none'; }); }
    const selectAll = f.querySelector('.bulk-mat-select-all');
    const productChecks = ()=>Array.from(f.querySelectorAll('.bulk-mat-product-check'));
    if(selectAll){
      selectAll.addEventListener('change', ()=>{ productChecks().forEach(c=>{ if(!c.disabled) c.checked = selectAll.checked; }); });
    }
    const inp = f.querySelector('.bulk-mat-name');
    const listEl = f.querySelector('.bulk-mat-list');
    const hintEl = f.querySelector('.bulk-mat-hint');
    attachAutocomplete(inp, listEl, ()=>DB.materials, (m)=>applyBulkExistingPick(inp, m, hintEl, f),
      (m)=>`${m.type} · ${m.category}${m.size?' · '+m.size:''}${m.grade?' · '+m.grade:''}`);
    inp.addEventListener('input', ()=>{
      if(inp.value !== (pickedByInput.get(inp)||{}).name){
        pickedByInput.delete(inp);
        const matches = DB.materials.filter(m=>m.name.toLowerCase()===inp.value.trim().toLowerCase());
        if(matches.length===1){
          applyBulkExistingPick(inp, matches[0], hintEl, f);
        } else {
          showBulkNewFields(f, true);
          if(hintEl) hintEl.textContent = matches.length>1 ? `${matches.length} variants of this name — pick one from the list below.` : '';
        }
      }
    });
  });

  if(editable){
    wrap.querySelectorAll('.add-product-form').forEach(f=>{
      f.addEventListener('submit', async e=>{
        e.preventDefault();
        const so = findSO(f.dataset.so);
        const name = f.querySelector('.new-product-name').value.trim();
        if(!name || !so) return;
        so.products.push({id:uid(), name, status:'open', materials:[]});
        await saveKey('soList'); toast(`Product "${name}" added to SO ${so.soNumber}`); render();
      });
    });
    wrap.querySelectorAll('.add-material-form').forEach(f=>{
      f.addEventListener('submit', async e=>{
        e.preventDefault();
        const so = findSO(f.dataset.so); if(!so) return;
        if(so.status==='completed'){ toast(`SO ${so.soNumber} is marked Complete by Device 3 — no new material can be added.`, true); return; }
        const product = so.products.find(p=>p.id===f.dataset.product); if(!product) return;
        const pid = f.dataset.product;
        const nameInput = f.querySelector('.new-mat-name');
        const qtyInput = f.querySelector('.new-mat-qty');
        const unitVal = readQtyUnitValue('nm-unit-'+pid);
        let mat = pickedByInput.get(nameInput);
        if(!mat){
          const matches = DB.materials.filter(m=>m.name.toLowerCase()===nameInput.value.trim().toLowerCase());
          if(matches.length>1){ toast('That name matches several variants (size/grade) — pick the exact one from the dropdown', true); return; }
          mat = matches[0];
        }
        const qty = Number(qtyInput.value);
        if(!qty || qty<=0){ toast('Enter a quantity needed', true); return; }
        if(!mat){
          // No existing variant matched by name alone — try to create a new one from the
          // Size / Grade / Category fields on this form, instead of forcing a detour to Materials.
          const name = nameInput.value.trim();
          if(!name){ toast('Enter a material name', true); return; }
          const size = (f.querySelector('.new-mat-size')?.value||'').trim();
          const grade = (f.querySelector('.new-mat-grade').value||'').trim();
          const catSel = document.getElementById('nm-cat-'+pid);
          let category = catSel ? catSel.value : 'Other';
          let categoryIsOther = category==='Other';
          if(categoryIsOther){
            const otherVal = (document.getElementById('nm-cat-other-'+pid)?.value||'').trim();
            if(otherVal) category = otherVal;
          }
          const draft = { name, type: category, typeIsOther: categoryIsOther, category: DB.categories[0]||'General', size, grade, price:0, unit: unitVal || 'pcs', rack:'', trackNos:true };
          const created = await createMaterialFromDraft(draft);
          if(created==='duplicate'){ toast(`That exact material "${name}" already exists — pick it from the list instead.`, true); return; }
          if(!created){ toast(`Could not create "${name}" — pick an existing material from the list, or fill in a Category.`, true); return; }
          mat = created;
          toast(`New material variant "${mat.name}"${size?' ('+size+')':''} created`, false);
        }
        if(product.materials.some(r=>r.materialId===mat.id)){ toast(`${mat.name} is already listed for this product — remove it first to change the quantity`, true); return; }
        product.materials.push({id:uid(), materialId:mat.id, materialName:mat.name, qtyNeeded:qty, qtyUnit:unitVal, qtyFulfilled:0});
        checkSOCompletion(so);
        await saveKey('soList'); await saveKey('materials'); toast(`${mat.name} added to ${product.name}`); render();
      });
    });
    wrap.querySelectorAll('.bulk-material-form').forEach(f=>{
      f.addEventListener('submit', async e=>{
        e.preventDefault();
        const soId = f.dataset.so;
        const so = findSO(soId); if(!so) return;
        if(so.status==='completed'){ toast(`SO ${so.soNumber} is marked Complete by Device 3 — no new material can be added.`, true); return; }
        const checkedIds = Array.from(f.querySelectorAll('.bulk-mat-product-check')).filter(c=>c.checked && !c.disabled).map(c=>c.value);
        if(!checkedIds.length){ toast('Select at least one product to add this material to', true); return; }
        const nameInput = f.querySelector('.bulk-mat-name');
        const qtyInput = f.querySelector('.bulk-mat-qty');
        const unitVal = readQtyUnitValue('bulk-unit-'+soId);
        const qty = Number(qtyInput.value);
        if(!qty || qty<=0){ toast('Enter a quantity needed', true); return; }
        let mat = pickedByInput.get(nameInput);
        if(!mat){
          const matches = DB.materials.filter(m=>m.name.toLowerCase()===nameInput.value.trim().toLowerCase());
          if(matches.length>1){ toast('That name matches several variants (size/grade) — pick the exact one from the dropdown', true); return; }
          mat = matches[0];
        }
        if(!mat){
          // Brand-new material — create it right here from the Size/Grade/Category fields on
          // this form and use it immediately below. No detour to Materials, no re-typing it.
          const name = nameInput.value.trim();
          if(!name){ toast('Enter a material name', true); return; }
          const size = (f.querySelector('.bulk-mat-size')?.value||'').trim();
          const grade = (f.querySelector('.bulk-mat-grade').value||'').trim();
          const catSel = document.getElementById('bulk-cat-'+soId);
          let category = catSel ? catSel.value : 'Other';
          let categoryIsOther = category==='Other';
          if(categoryIsOther){
            const otherVal = (document.getElementById('bulk-cat-other-'+soId)?.value||'').trim();
            if(otherVal) category = otherVal;
          }
          const draft = { name, type: category, typeIsOther: categoryIsOther, category: DB.categories[0]||'General', size, grade, price:0, unit: unitVal || 'pcs', rack:'', trackNos:true };
          const created = await createMaterialFromDraft(draft);
          if(created==='duplicate'){ toast(`That exact material "${name}" already exists — pick it from the list instead.`, true); return; }
          if(!created){ toast(`Could not create "${name}" — pick an existing material from the list, or fill in a Category.`, true); return; }
          mat = created;
        }
        let addedCount = 0; const skipped = [];
        checkedIds.forEach(pid=>{
          const product = so.products.find(p=>p.id===pid); if(!product) return;
          if(product.materials.some(r=>r.materialId===mat.id)){ skipped.push(product.name); return; }
          product.materials.push({id:uid(), materialId:mat.id, materialName:mat.name, qtyNeeded:qty, qtyUnit:unitVal, qtyFulfilled:0});
          addedCount++;
        });
        checkSOCompletion(so);
        await saveKey('soList'); await saveKey('materials');
        if(addedCount){
          toast(`${mat.name} added to ${addedCount} product${addedCount>1?'s':''}${skipped.length? ' (already listed, skipped: '+skipped.join(', ')+')':''}`);
        } else {
          toast(`${mat.name} was already listed on every product you selected`, true);
        }
        render();
      });
    });
  }
}
async function toggleSOPriority(soId){
  const so = findSO(soId); if(!so) return;
  so.priority = !so.priority;
  await saveKey('soList');
  toast(so.priority? `SO ${so.soNumber} marked Priority — it can now pull received stock from other SOs` : `SO ${so.soNumber} priority removed`);
  render();
}
// Device 3 only: manually mark an SO complete (blocks further material issue/gate entry/
// add-material for it) or reopen it. Only Device 3 has the button that calls this, and it's
// re-checked here as a safety net.
async function toggleSOManualStatus(soId){
  if(DEVICE!==3){ toast('Only Device 3 can change an SO\'s completion status', true); return; }
  const so = findSO(soId); if(!so) return;
  if(so.status==='completed'){
    so.status='open'; so.completedDate=null;
    await saveKey('soList');
    toast(`SO ${so.soNumber} marked Incomplete — Device 1 can add material and gate entries for it again`);
  } else {
    so.status='completed'; so.completedDate=todayStr();
    await saveKey('soList');
    toast(`SO ${so.soNumber} marked Complete — no further material can be issued for it`);
  }
  render();
}
window.toggleSOPriority = toggleSOPriority;
window.toggleSOManualStatus = toggleSOManualStatus;

/* ---------------- Completed SO — view/print and Excel download ----------------
   Same "open a printable window" pattern as the gate/issue/site slips elsewhere
   in the app, plus a matching .xlsx export using the ExcelJS library already
   loaded for the other Excel features. Available once an SO is Completed. */
function soCompletionSummaryRows(so){
  const rows = [];
  so.products.forEach(p=>{
    if(!p.materials.length){ rows.push({product:p.name, material:'—', size:'—', grade:'—', needed:'—', received:'—', remaining:'—'}); return; }
    p.materials.forEach(r=>{
      const mat = materialById(r.materialId);
      const remaining = Math.max(0, r.qtyNeeded-r.qtyFulfilled);
      rows.push({
        product: p.name, material: r.materialName,
        size: mat && mat.size ? mat.size : '—', grade: mat && mat.grade ? mat.grade : '—',
        needed: fmtQty(r.qtyNeeded, r), received: fmtQty(r.qtyFulfilled, r), remaining: fmtQty(remaining, r)
      });
    });
  });
  return rows;
}
function soPrintViewHTML(so){
  const rows = soCompletionSummaryRows(so);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SO ${so.soNumber} — Summary</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1c262d;}
  h1{font-size:19px;border-bottom:3px solid #4a6c8c;padding-bottom:10px;letter-spacing:.5px;}
  h1 small{display:block;font-size:11px;letter-spacing:2px;color:#4d6a83;text-transform:uppercase;font-weight:normal;margin-top:4px;}
  .meta{margin:14px 0;font-size:13px;}
  .meta span{margin-right:24px;}
  table{width:100%;border-collapse:collapse;margin-top:10px;}
  td,th{border:1px solid #9fb4c4;padding:7px 9px;text-align:left;font-size:12.5px;}
  th{background:#e3e8ea;}
  @media print{ body{padding:10mm;} }
</style></head><body>
  <h1>HL GALVATECH<small>SO / Project Summary</small></h1>
  <div class="meta">
    <span><b>SO Number:</b> ${so.soNumber}</span>
    <span><b>Created:</b> ${so.date}</span>
    <span><b>Completed:</b> ${so.completedDate||'—'}</span>
  </div>
  <table>
    <thead><tr><th>Product</th><th>Material</th><th>Size</th><th>Grade</th><th>Needed</th><th>Received</th><th>Remaining</th></tr></thead>
    <tbody>
      ${rows.map(r=>`<tr><td>${r.product}</td><td>${r.material}</td><td>${r.size}</td><td>${r.grade}</td><td>${r.needed}</td><td>${r.received}</td><td>${r.remaining}</td></tr>`).join('')}
    </tbody>
  </table>
</body></html>`;
}
function printSOSlip(soId){
  const so = findSO(soId); if(!so){ toast('SO not found', true); return; }
  const html = soPrintViewHTML(so);
  const w = window.open('', '_blank', 'width=900,height=900');
  if(w){
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
  } else {
    toast('Pop-up blocked — allow pop-ups to view/print', true);
  }
}
window.printSOSlip = printSOSlip;
async function downloadSOExcel(soId){
  const so = findSO(soId); if(!so){ toast('SO not found', true); return; }
  if(typeof ExcelJS==='undefined'){ toast('Could not build file — check your internet connection', true); return; }
  const rows = soCompletionSummaryRows(so);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HL Galvatech'; wb.created = new Date();
  const sheet = wb.addWorksheet('SO Summary');
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = xlSafeCell(`SO ${so.soNumber} — Summary`);
  sheet.getCell('A1').font = {bold:true, size:14};
  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = `Created: ${so.date}    Completed: ${so.completedDate||'—'}`;
  sheet.addRow([]);
  const headerRow = sheet.addRow(['Product','Material','Size','Grade','Qty Needed','Qty Received','Remaining']);
  headerRow.font = {bold:true};
  rows.forEach(r=>sheet.addRow([r.product, r.material, r.size, r.grade, r.needed, r.received, r.remaining].map(xlSafeCell)));
  sheet.columns.forEach(c=>c.width=20);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `SO_${so.soNumber.replace(/[^a-z0-9]/gi,'_')}_Summary.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
window.downloadSOExcel = downloadSOExcel;

function renderExcessPoolTable(){
  const entries = Object.keys(DB.excessPool).filter(id=>DB.excessPool[id]>0);
  if(!entries.length) return `<div class="empty">No excess stock currently banked.</div>`;
  return `<table><thead><tr><th>Material</th><th>Size</th><th>Grade</th><th>Excess qty</th></tr></thead><tbody>
  ${entries.map(id=>{ const m=materialById(id); return `<tr><td>${m?m.name:'Unknown'}</td><td>${m&&m.size?m.size:'—'}</td><td>${m&&m.grade?m.grade:'—'}</td><td>${DB.excessPool[id]}</td></tr>`; }).join('')}
  </tbody></table>`;
}
async function removeSOMaterial(soId,pid,reqId){
  const so=findSO(soId); if(!so) return;
  const p=so.products.find(x=>x.id===pid); if(!p) return;
  p.materials = p.materials.filter(r=>r.id!==reqId);
  checkSOCompletion(so);
  await saveKey('soList'); toast('Material requirement removed'); render();
}
async function useExcess(soId,pid,materialId,qty){
  const ok = applyExcessToRequirement(soId,pid,materialId,qty);
  if(!ok){ toast('No excess available to apply', true); return; }
  await saveKey('soList'); await saveKey('excessPool');
  toast('Applied from excess pool'); render();
}
async function pullFromOtherSOUI(soId,pid,materialId,qty){
  const ok = pullFromOtherSO(soId,pid,materialId,qty);
  if(!ok){ toast('Nothing available to pull from other SOs', true); return; }
  await saveKey('soList');
  toast('Material reassigned from other SO to this priority SO'); render();
}
window.removeSOMaterial = removeSOMaterial;
window.useExcess = useExcess;
window.pullFromOtherSO = pullFromOtherSOUI;

/* ---------------- account settings dropdown (header) ---------------- */
function toggleAccountSettings(){
  const panel = document.getElementById('account-settings-panel');
  if(panel) panel.classList.toggle('open');
}
function closeAccountSettings(){
  const panel = document.getElementById('account-settings-panel');
  if(panel) panel.classList.remove('open');
}
document.addEventListener('click', (e)=>{
  const wrap = document.getElementById('account-settings-wrap');
  if(wrap && !wrap.contains(e.target)) closeAccountSettings();
});
window.toggleAccountSettings = toggleAccountSettings;
window.closeAccountSettings = closeAccountSettings;

/* expose functions used inline */
window.selectDevice = selectDevice;
window.selectRequesterAccount = selectRequesterAccount;
window.logoutDevice = logoutDevice;
window.doReturn = doReturn;
window.saveThreshold = saveThreshold;
window.openAdminLogin = openAdminLogin;
window.handleLogoClick = handleLogoClick;
window.toggleAlertsPanel = toggleAlertsPanel;
window.toggleAlertGroup = toggleAlertGroup;
window.toggleAlertItem = toggleAlertItem;
window.resolveSOMismatch = resolveSOMismatch;
window.resolveProductMismatch = resolveProductMismatch;

/* ---------------- unified login form wiring ----------------
   The Login ID + Password fields double as the entry point for two hidden
   panels — no separate buttons on screen, no keystroke listener running
   in the background, just the login form that's already sitting there:
     • blank Login ID + the real admin password (CONFIG.adminPassword) → straight into the Admin Panel
     • blank Login ID + password "adminbackend"                        → Backend Sync Settings
   Using the real form instead of an invisible "type it anywhere" gesture
   means there's an actual place to type it, and neither ever fires by
   accident during a genuine login (a real login always has a Login ID
   filled in). The admin-password check is case-sensitive (it's compared
   against the actual stored password, the same as openAdminLogin() used
   to check), so there's no extra "type the password twice" step — typing
   it once, with Login ID left blank, is the whole login. The backend
   trigger word is still matched case-insensitively since it isn't a real
   password, just a fixed phrase. The "adminbackend" trigger has nothing to
   check a password against yet on a fresh, unconfigured copy of the file
   (that's the whole point of the panel), so it opens straight away — keep
   the phrase to yourself if you don't want the crew poking at it. */
(function wireLoginForm(){
  const form = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');
  if(!form) return;
  const BACKEND_TRIGGER = 'adminbackend';
  form.addEventListener('submit', e=>{
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const pRaw = document.getElementById('login-password').value;
    const pLower = pRaw.trim().toLowerCase();
    if(!u.trim() && pLower === BACKEND_TRIGGER){
      if(errEl) errEl.textContent = '';
      form.reset();
      openHiddenBackendPanel();
      return;
    }
    if(!u.trim() && pRaw.trim() && pRaw.trim() === String(CONFIG.adminPassword)){
      if(errEl) errEl.textContent = '';
      form.reset();
      openAdminPanel();
      return;
    }
    const ok = attemptUnifiedLogin(document.getElementById('login-username').value, document.getElementById('login-password').value);
    if(!ok){
      if(errEl) errEl.textContent = 'Incorrect login ID or password';
    } else {
      if(errEl) errEl.textContent = '';
      form.reset();
    }
  });
})();

/* load admin config (device names/passwords, requester accounts, homepage link)
   as soon as the login screen is up, so credentials are enforced immediately */
loadConfig().then(()=>{
  applyConfigToRoleScreen();
  restoreSession(); // re-enter whatever screen was active before a refresh, instead of forcing a re-login
});
const __zoomWrapEl = document.getElementById('zoom-wrap');
if(__zoomWrapEl) window.__zoomWrapObserver.observe(__zoomWrapEl, {childList:true, subtree:true});

