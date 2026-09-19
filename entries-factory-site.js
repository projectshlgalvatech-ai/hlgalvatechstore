/* =========================================================================
   ALL ENTRIES — a single searchable, collapsible log of every entry logged
   anywhere in the system (gate entries, issues, damaged/returns, factory
   use, material requests), available from every device. Collapsed by
   default down to just the entry's name/summary line — click a name to
   reveal its full details. Scoped to Today / Last 6 Days / This Month, or
   any past day/month picked from the calendar inputs, plus a header search
   box (top-left) that jumps straight to a matching entry from anywhere.
   ========================================================================= */
let entriesUIState = { scope:'today', customDate:null, customMonth:null, calendarOpen:false, openGroups:{}, openItems:{}, searchTerm:'' };

function collectAllEntries(){
  const list = [];
  const forReq = DEVICE==='req';
  const acc = CURRENT_ACCOUNT;
  if(!forReq){
    DB.gateEntries.forEach(g=>{
      const materialName = m_escape(g.materialName||''), challanNo = m_escape(g.challanNo||''),
        supplier = m_escape(g.supplier||''), poNumber = m_escape(g.poNumber||''),
        vehicleNo = m_escape(g.vehicleNo||''), soNumber = m_escape(g.soNumber||''),
        qtyDisplay = m_escape(String(g.qtyDisplay||g.qty||''));
      list.push({
        uid:'gate-'+g.id, source:'Gate Entries (Received)',
        date:g.date, time:g.time,
        name:`${materialName} — ${qtyDisplay}${g.qtyNos?'/'+g.qtyNos+' Nos.':''} received`,
        search:[materialName,challanNo,supplier,poNumber,vehicleNo,soNumber].filter(Boolean).join(' '),
        detail:`Challan/Bill: ${challanNo||'—'}<br>Supplier: ${supplier||'—'}<br>PO Number: ${poNumber||'—'}<br>Vehicle No.: ${vehicleNo||'—'}<br>SO Number: ${soNumber||'—'}<br>Qty: ${qtyDisplay}${g.qtyNos?' ('+g.qtyNos+' Nos.)':''}${g.forFactoryUse?'<br><i>Logged for internal factory use</i>':''}`
      });
    });
    DB.issues.forEach(i=>{
      const materialName = m_escape(i.materialName||''), person = m_escape(i.person||''),
        purpose = m_escape(i.purpose||''), approvedBy = m_escape(i.approvedBy||''),
        soNumber = m_escape(i.soNumber||''), location = m_escape(i.location||''),
        status = m_escape(i.status||'');
      list.push({
        uid:'issue-'+i.id, source:'Material Issued',
        date:i.date, time:i.time,
        name:`${materialName} — ${i.qty}${i.qtyNos?'/'+i.qtyNos+' Nos.':''} issued to ${person||'—'}`,
        search:[materialName,person,purpose,approvedBy,soNumber,location].filter(Boolean).join(' '),
        detail:`Issued to: ${person||'—'}<br>Purpose: ${purpose||'—'}<br>Approved by: ${approvedBy||'—'}<br>Location: ${location||'—'}<br>SO Number: ${soNumber||'—'}<br>Status: ${status||'—'}<br>Qty issued: ${i.qty}${i.qtyNos?' ('+i.qtyNos+' Nos.)':''}`
          + (i.returnedGoodQty?`<br>Returned good: ${i.returnedGoodQty}`:'')
          + (i.damagedQty?`<br>Damaged: ${i.damagedQty}`:'')
          + (i.consumedQty?`<br>Consumed: ${i.consumedQty}`:'')
      });
    });
    DB.damaged.forEach(d=>{
      const materialName = m_escape(d.materialName||''), note = m_escape(d.note||''), location = m_escape(d.location||'');
      list.push({
        uid:'dmg-'+d.id, source:'Damaged / Returned Stock',
        date:d.date, time:'',
        name:`${materialName} — ${d.qty} damaged`,
        search:[materialName,note,location].filter(Boolean).join(' '),
        detail:`Qty: ${d.qty}<br>Location: ${location||'—'}<br>Note: ${note||'—'}`
      });
    });
    DB.factoryUse.forEach(f=>{
      const materialName = m_escape(f.materialName||''), purpose = m_escape(f.purpose||''), location = m_escape(f.location||'');
      list.push({
        uid:'fac-'+f.id, source:'Factory Use',
        date:f.date, time:f.time,
        name:`${materialName} — ${f.qty}${f.qtyNos?'/'+f.qtyNos+' Nos.':''} used`,
        search:[materialName,purpose,location].filter(Boolean).join(' '),
        detail:`Purpose: ${purpose||'—'}<br>Location: ${location||'—'}<br>Qty: ${f.qty}${f.qtyNos?' ('+f.qtyNos+' Nos.)':''}`
      });
    });
  }
  (DB.mrf||[]).forEach(m=>{
    if(forReq && (!acc || m.requestAccountId!==acc.id)) return;
    const materialName = m_escape(m.materialName||''), requestBy = m_escape(m.requestBy||''),
      referredBy = m_escape(m.referredBy||''), approvedBy = m_escape(m.approvedBy||''),
      mrfNo = m_escape(m.mrfNo||''), status = m_escape(m.status||'');
    list.push({
      uid:'mrf-'+m.id, source:'Material Requests (MRF)',
      date:m.date, time:m.time,
      name:`${materialName} — ${m.qty} requested by ${requestBy||'—'}`,
      search:[materialName,requestBy,referredBy,approvedBy,mrfNo].filter(Boolean).join(' '),
      detail:`MRF No.: ${mrfNo||'—'}<br>Requested by: ${requestBy||'—'}<br>Referred by: ${referredBy||'—'}<br>Approved by: ${approvedBy||'—'}<br>Status: ${status||'—'}<br>Qty: ${m.qty}`
    });
  });
  (DB.materialRepair||[]).forEach(r=>{
    if(forReq && (!acc || r.requestAccountId!==acc.id)) return;
    const materialName = m_escape(r.materialName||''), vendorName = m_escape(r.vendorName||''),
      serialCode = m_escape(r.serialCode||''), referredBy = m_escape(r.referredBy||'');
    list.push({
      uid:'repair-'+r.id, source:'Material Repair',
      date:r.issueDate, time:'',
      name:`${materialName} — ${r.qty} sent to ${vendorName||'vendor'} for repair`,
      search:[materialName,vendorName,serialCode,referredBy].filter(Boolean).join(' '),
      detail:`Vendor: ${vendorName||'—'}<br>Serial code: ${serialCode||'—'}<br>Referred by: ${referredBy||'—'}<br>Status: ${r.status==='out'?'Out for repair':(r.status==='repaired'?'Repaired':'Scrap')}${r.returnedDate?`<br>Received back: ${r.returnedDate}${r.returnedTime?', '+r.returnedTime:''}`:''}`
    });
  });
  list.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.time||'').localeCompare(a.time||''));
  return list;
}

function daysSinceToday(dateStr){
  if(!dateStr) return Infinity;
  const d = new Date(dateStr+'T00:00:00');
  const t = new Date(todayStr()+'T00:00:00');
  return Math.round((t-d)/86400000);
}
function formatDateNice(dateStr){
  if(!dateStr) return '';
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
}
function formatMonthNice(monthStr){
  if(!monthStr) return '';
  const [y,m] = monthStr.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-IN', {month:'long', year:'numeric'});
}

function renderEntriesHub(el){
  const all = collectAllEntries();
  const scope = entriesUIState.scope;
  let scoped = all;
  let heading = 'Today';

  if(scope==='today'){
    scoped = all.filter(e=>daysSinceToday(e.date)===0);
    heading = 'Today — '+formatDateNice(todayStr());
  } else if(scope==='week'){
    scoped = all.filter(e=>{ const d=daysSinceToday(e.date); return d>=0 && d<=6; });
    heading = 'Last 6 Days';
  } else if(scope==='month'){
    const now = new Date();
    scoped = all.filter(e=>{ if(!e.date) return false; const d=new Date(e.date+'T00:00:00'); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth(); });
    heading = 'This Month — '+now.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  } else if(scope==='custom-day'){
    scoped = entriesUIState.customDate ? all.filter(e=>e.date===entriesUIState.customDate) : [];
    heading = entriesUIState.customDate ? formatDateNice(entriesUIState.customDate) : 'Pick a day from the calendar below';
  } else if(scope==='custom-month'){
    if(entriesUIState.customMonth){
      const [y,m] = entriesUIState.customMonth.split('-').map(Number);
      scoped = all.filter(e=>{ if(!e.date) return false; const d=new Date(e.date+'T00:00:00'); return d.getFullYear()===y && (d.getMonth()+1)===m; });
      heading = formatMonthNice(entriesUIState.customMonth);
    } else { scoped = []; heading = 'Pick a month from the calendar below'; }
  } else if(scope==='search'){
    const q = (entriesUIState.searchTerm||'').trim().toLowerCase();
    scoped = q ? all.filter(e=> e.name.toLowerCase().includes(q) || (e.search||'').toLowerCase().includes(q)) : all;
    heading = q ? `Search results for "${m_escape(entriesUIState.searchTerm)}"` : 'All entries';
  }

  const groups = {};
  scoped.forEach(e=>{ (groups[e.source] = groups[e.source]||[]).push(e); });
  const groupNames = Object.keys(groups);

  el.innerHTML = `
    <h2 class="section-title">${DEVICE==='req' ? 'My Entries' : 'All Entries'}</h2>
    <div class="panel entries-panel">
      <div class="entries-scope-row">
        <button type="button" class="scope-btn ${scope==='today'?'active':''}" onclick="setEntriesScope('today')">Today</button>
        <button type="button" class="scope-btn ${scope==='week'?'active':''}" onclick="setEntriesScope('week')">Last 6 Days</button>
        <button type="button" class="scope-btn ${scope==='month'?'active':''}" onclick="setEntriesScope('month')">This Month</button>
        <button type="button" class="scope-btn ${(scope==='custom-day'||scope==='custom-month')?'active':''}" onclick="toggleEntriesCalendar()">📅 Calendar (past month / year)</button>
      </div>
      <div class="entries-calendar-row" id="entries-calendar-row" style="display:${entriesUIState.calendarOpen?'flex':'none'}">
        <label>Pick a day
          <input type="date" id="entries-date-pick" value="${entriesUIState.customDate||''}" max="${todayStr()}" onchange="pickEntriesDay(this.value)">
        </label>
        <label>Pick a month/year
          <input type="month" id="entries-month-pick" value="${entriesUIState.customMonth||''}" max="${todayStr().slice(0,7)}" onchange="pickEntriesMonth(this.value)">
        </label>
      </div>
      <div class="entries-heading">${heading} · ${scoped.length} entr${scoped.length===1?'y':'ies'}</div>
      <div class="entries-list">
        ${groupNames.length ? groupNames.map(src=>{
          const items = groups[src];
          const gid = safeId(src);
          const gOpen = scope==='search' ? true : !!entriesUIState.openGroups[gid];
          return `<div class="ent-group">
            <button type="button" class="ent-group-toggle" onclick="toggleEntryGroup('${gid}')">
              <span class="chev">${gOpen?'▾':'▸'}</span> ${src} (${items.length})
            </button>
            <div class="ent-group-body" style="display:${gOpen?'block':'none'}">
              ${items.map(it=>{
                const iOpen = !!entriesUIState.openItems[it.uid];
                return `<div class="ent-item" id="entry-${it.uid}">
                  <button type="button" class="ent-item-toggle" onclick="toggleEntryItem('${it.uid}')">
                    <span class="chev">${iOpen?'▾':'▸'}</span> <span class="name">${it.name}</span>
                    <span class="ent-item-date">${it.date||'—'}${it.time?' · '+it.time:''}</span>
                  </button>
                  <div class="ent-item-body" style="display:${iOpen?'block':'none'}">${it.detail}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('') : `<div class="empty">No entries for this period.</div>`}
      </div>
    </div>`;
}
function setEntriesScope(scope){ entriesUIState.scope = scope; entriesUIState.calendarOpen = false; render(); }
function toggleEntriesCalendar(){ entriesUIState.calendarOpen = !entriesUIState.calendarOpen; render(); }
function pickEntriesDay(v){ if(!v) return; entriesUIState.customDate = v; entriesUIState.scope = 'custom-day'; entriesUIState.calendarOpen = true; render(); }
function pickEntriesMonth(v){ if(!v) return; entriesUIState.customMonth = v; entriesUIState.scope = 'custom-month'; entriesUIState.calendarOpen = true; render(); }
function toggleEntryGroup(gid){ entriesUIState.openGroups[gid] = !entriesUIState.openGroups[gid]; render(); }
function toggleEntryItem(uid){ entriesUIState.openItems[uid] = !entriesUIState.openItems[uid]; render(); }
window.setEntriesScope = setEntriesScope;
window.toggleEntriesCalendar = toggleEntriesCalendar;
window.pickEntriesDay = pickEntriesDay;
window.pickEntriesMonth = pickEntriesMonth;
window.toggleEntryGroup = toggleEntryGroup;
window.toggleEntryItem = toggleEntryItem;

/* ---------------- header search (top-left) — find any entry by name without
   navigating through day/week/month, jumps straight to it inside All Entries ---------------- */
function headerSearchLive(){
  const input = document.getElementById('header-search-input');
  const box = document.getElementById('header-search-results');
  if(!input || !box) return;
  const q = input.value.trim().toLowerCase();
  if(!q){ box.style.display='none'; box.innerHTML=''; return; }
  const matches = collectAllEntries().filter(e=> e.name.toLowerCase().includes(q) || (e.search||'').toLowerCase().includes(q)).slice(0,8);
  if(!matches.length){
    box.innerHTML = `<div class="hsr-empty">No matching entries</div>`;
  } else {
    box.innerHTML = matches.map(m=>`<div class="hsr-item" onclick="jumpToEntry('${m.uid}')">
      <span class="hsr-src">${m.source}</span>
      <div class="hsr-name-row"><span>${m.name}</span><span class="hsr-date">${m.date||''}</span></div>
    </div>`).join('');
  }
  box.style.display='block';
}
function performHeaderSearch(){
  const input = document.getElementById('header-search-input');
  if(!input) return;
  const q = input.value.trim();
  if(!q || DEVICE===null) return;
  entriesUIState.scope = 'search';
  entriesUIState.searchTerm = q;
  TAB = 'entries';
  buildNav(); render();
  const box = document.getElementById('header-search-results'); if(box) box.style.display='none';
}
function jumpToEntry(uid){
  if(DEVICE===null) return;
  const found = collectAllEntries().find(e=>e.uid===uid);
  entriesUIState.scope = 'search';
  entriesUIState.searchTerm = found ? found.name : '';
  entriesUIState.openItems[uid] = true;
  TAB = 'entries';
  buildNav(); render();
  const box = document.getElementById('header-search-results'); if(box) box.style.display='none';
  const input = document.getElementById('header-search-input'); if(input) input.value='';
  setTimeout(()=>{ const item = document.getElementById('entry-'+uid); if(item) item.scrollIntoView({behavior:'smooth', block:'center'}); }, 60);
}
window.headerSearchLive = headerSearchLive;
window.performHeaderSearch = performHeaderSearch;
window.jumpToEntry = jumpToEntry;
document.addEventListener('click', (e)=>{
  const wrap = document.getElementById('header-search');
  const box = document.getElementById('header-search-results');
  if(box && wrap && !wrap.contains(e.target)){ box.style.display='none'; }
});

/* =========================================================================
   FACTORY USE — internal/factory-own consumption (refreshments, cleaning
   agents, etc.) that isn't tied to an external SO or a named person the way
   a normal Issue is. Logged at Device 1 (entry level), visible read-only on
   Device 2 and Device 3.
   ========================================================================= */
function renderFactoryTable(rows){
  if(!rows.length) return `<div class="empty">No factory-use entries logged.</div>`;
  return `<table><thead><tr><th>Date</th><th>Time</th><th>Material</th><th>Qty</th><th>Purpose</th><th>Location</th></tr></thead><tbody>
  ${rows.map(f=>`<tr><td>${f.date}</td><td>${timeBadge(f.date,f.time)}</td><td>${m_escape(f.materialName)}</td><td>${f.qty}${f.qtyNos?' ('+f.qtyNos+' Nos.)':''}</td><td>${m_escape(f.purpose)||'—'}</td><td>${m_escape(f.location)||'—'}</td></tr>`).join('')}
  </tbody></table>`;
}
function renderFactoryReceivedTable(){
  const rows = DB.gateEntries.filter(g=>g.forFactoryUse).slice().reverse();
  if(!rows.length) return `<div class="empty">No material received for internal factory use yet.</div>`;
  return `<table><thead><tr><th>Date</th><th>Time</th><th>Challan/Bill</th><th>Material</th><th>Qty</th><th>Supplier</th><th>PO</th><th>Vehicle</th><th>Location</th></tr></thead><tbody>
  ${rows.map(g=>`<tr><td>${g.date}</td><td>${timeBadge(g.date,g.time)}</td><td>${m_escape(g.challanNo)||'—'}</td><td>${m_escape(g.materialName)}</td><td>${g.qty}</td><td>${m_escape(g.supplier)||'—'}</td><td>${m_escape(g.poNumber)||'—'}</td><td>${m_escape(g.vehicleNo)||'—'}</td><td>${m_escape(g.location)||'—'}</td></tr>`).join('')}
  </tbody></table>`;
}
function renderFactory1(el){
  el.innerHTML = `
    <h2 class="section-title">Factory Use</h2>
    ${collapsePanel('fu1-received', 'Received for internal factory use (no SO — via Gate Entry)', renderFactoryReceivedTable())}
    <div class="panel">
      <h3>New factory-use entry</h3>
      <form id="fu-form">
        <div class="row">
          <div class="field" style="position:relative">
            <label>Material</label>
            <input required id="fu-material" placeholder="Start typing…" autocomplete="off">
            <div class="autolist" id="fu-material-list"></div>
            <div class="hint" id="fu-material-hint"></div>
          </div>
          <div class="field"><label>Quantity</label><input required id="fu-qty" type="number" min="1" step="any"></div>
          <div class="field"><label>Location</label><select id="fu-location">${DB.locations.map(l=>`<option>${l}</option>`).join('')}</select></div>
        </div>
        <div class="row" id="fu-nos-row" style="display:none">
          <div class="field"><label>Quantity (Nos. — physical piece count)</label><input id="fu-qty-nos" type="number" min="0" step="1"></div>
        </div>
        <div class="row">
          <div class="field"><label>Purpose</label><input required id="fu-purpose" placeholder="e.g. Refreshments, cleaning agents, canteen…"></div>
        </div>
        <button class="btn" type="submit">Log factory use</button>
      </form>
    </div>
    ${collapsePanel('fu1-all', 'All factory-use entries', renderFactoryTable(DB.factoryUse.slice().reverse()), `${DB.factoryUse.length} entr${DB.factoryUse.length===1?'y':'ies'}`)}`;

  let picked = null;
  const input = document.getElementById('fu-material');
  const nosRow = document.getElementById('fu-nos-row');
  attachAutocomplete(input, document.getElementById('fu-material-list'), ()=>DB.materials, (m)=>{
    picked = m; input.value = m.name;
    document.getElementById('fu-material-hint').textContent = `In stock: ${getStock(m.id)} ${m.unit}${m.rack? ' · Rack: '+m.rack : ''}`;
    nosRow.style.display = 'flex';
  }, (m)=>`stock ${getStock(m.id)}`);
  input.addEventListener('input', ()=>{
    if(input.value!==(picked&&picked.name)){
      picked=null; document.getElementById('fu-material-hint').textContent='';
      const exact = DB.materials.find(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
      nosRow.style.display = 'flex';
    }
  });

  document.getElementById('fu-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const mat = picked || DB.materials.find(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
    if(!mat){ toast('Select a valid material from the list', true); return; }
    const qty = Number(document.getElementById('fu-qty').value);
    const location = document.getElementById('fu-location').value;
    if(getStock(mat.id, location) < qty){ toast(`Only ${getStock(mat.id,location)} in stock at ${location}`, true); return; }
    let qtyNos = 0;
    qtyNos = Number(document.getElementById('fu-qty-nos').value||0);
    const entry = { id:uid(), materialId:mat.id, materialName:mat.name, qty, qtyNos, purpose:document.getElementById('fu-purpose').value, date: todayStr(), time: nowTimeStr(), location };
    DB.factoryUse.push(entry);
    addStock(mat.id, location, -qty);
    if(qtyNos>0){ addStockNos(mat.id, location, -qtyNos); }
    openCheckFor(mat.id);
    await saveKey('factoryUse'); await saveKey('stock'); await saveKey('stockNos'); await saveKey('tickets');
    toast(`Logged ${qty} ${mat.unit} of ${mat.name} for factory use`);
    e.target.reset(); nosRow.style.display='none';
    render();
  });
}
function renderFactory2(el){
  el.innerHTML = `<h2 class="section-title">Factory Use</h2>
  ${collapsePanel('fu2-received', 'Received for internal factory use (no SO — via Gate Entry)', renderFactoryReceivedTable())}
  ${collapsePanel('fu2-all', 'All factory-use entries', renderFactoryTable(DB.factoryUse.slice().reverse()), `${DB.factoryUse.length} entr${DB.factoryUse.length===1?'y':'ies'}`)}`;
}
function renderFactory3(el){
  el.innerHTML = `<h2 class="section-title">Factory Use</h2>
  ${collapsePanel('fu3-received', 'Received for internal factory use (no SO — via Gate Entry)', renderFactoryReceivedTable())}
  ${collapsePanel('fu3-all', 'All factory-use entries', renderFactoryTable(DB.factoryUse.slice().reverse()), `${DB.factoryUse.length} entr${DB.factoryUse.length===1?'y':'ies'}`)}`;
}

/* =========================================================================
   SITE INSTALLATION MATERIAL — material sent out to / installed at an
   external site. One entry (header: Site, Issued On, Vendor Name, Location)
   can club several material lines together (Product Code, Material Name,
   Qty, Material Health) via "+ Add Material" — like a challan with several
   material lines. Entered only on Device 2 (Store); Device 3 (Monitoring)
   gets the same list read-only, each with a Print/View button for a
   printable reference slip. Included in the Admin Panel's "Save entries"
   Excel export (one row per material line).

   Stock: any line whose Material Name matches a real stock item deducts
   that qty from stock the moment the entry is saved. When the installation
   is finished, "Close Installation / Return Material" lets Device 2 record
   how much of each material actually came back and in what condition —
   Good adds it back into stock, Damaged is logged to the Damaged/Scrap log
   instead. Whatever isn't marked returned is treated as used up at site.
   ========================================================================= */
function siteMaterialHealthBadge(h){
  const cls = h==='Damaged' ? 'status-crit' : (h==='Needs Replacement'||h==='Under Repair' ? 'status-low' : 'status-ok');
  return `<span class="${cls}">${h||'—'}</span>`;
}
function siteInstallStatusBadge(entry){
  return entry.status==='closed' ? '<span class="status-ok">Closed</span>' : '<span class="status-low">Open</span>';
}
// In-memory draft for the "new entry" form — several material lines can be
// built up client-side before one Save writes the whole header+lines record.
// Kept outside DB (like other UI-state objects) so it resets on reload but
// survives the 4s auto-refresh poll while being filled in.
let simDraft = null;
// Whether the "Material Health" field is shown on each material row. Off by default —
// stock going OUT to a site is assumed new/Good, so this stays hidden until the user
// explicitly needs to flag that what's being sent out isn't in new condition (e.g.
// re-sending something that came back from another site). Kept outside simDraft (like
// other UI-state) so it resets to hidden on reload, but persists across re-renders
// while filling the form.
let simHealthUIState = false;
function toggleSimHealthField(){ simHealthUIState = !simHealthUIState; render(); }
window.toggleSimHealthField = toggleSimHealthField;
function simResetDraft(){
  simDraft = {
    site:'', issuedOn: todayStr(), vendorName:'', location:(DB.locations&&DB.locations[0])||'',
    materials: [{productCode:'', materialName:'', materialId:null, qty:'', qtyUnit:'', size:'', grade:'', materialHealth:'Good'}]
  };
}
function simAddMaterialRow(){ simDraft.materials.push({productCode:'', materialName:'', materialId:null, qty:'', qtyUnit:'', size:'', grade:'', materialHealth:'Good'}); render(); }
function simRemoveMaterialRow(idx){
  if(simDraft.materials.length<=1){ toast('At least one material line is required', true); return; }
  simDraft.materials.splice(idx,1); render();
}
window.simAddMaterialRow = simAddMaterialRow;
window.simRemoveMaterialRow = simRemoveMaterialRow;
// Auto-fills a material line's Product Code from the matched material's base
// Product Code (set in the Materials master) + the line's current Qty — e.g.
// Product Code "A0001" on "Grinder" with Qty 3 becomes "grA0001-1, grA0001-2,
// grA0001-3" so identical-name items sent together can still be told apart.
// Materials with no Product Code on file are left alone so the field stays
// free text, exactly as before.
function simRecalcProductCode(i){
  const m = simDraft.materials[i];
  if(!m || !m.materialId) return;
  const mat = materialById(m.materialId);
  const codes = materialSerialCodesList(mat, m.qty);
  if(!codes.length) return;
  m.productCode = codes.join(', ');
  const input = document.getElementById(`sim-mat-code-${i}`);
  if(input) input.value = m.productCode;
}
window.simRecalcProductCode = simRecalcProductCode;
// Unit picker for the Qty field on a site-installation material line — wired and
// interlocked with Qty the same way SO/Projects' "Qty Needed" unit picker works:
// reuses the SIZE_UNITS dropdown (mm, kg, Nos, etc.), reveals a free-text box only
// when "Other" is picked, and writes straight into simDraft (like every other field
// on this row) so the choice survives a re-render (adding/removing a row, importing
// from Excel) instead of being read only once at submit time.
function renderSimQtyUnitField(m, i){
  const sel = String(m.qtyUnit||'').trim();
  const showOther = !!sel && !SIZE_UNITS.includes(sel);
  return `
    <div class="field" style="flex:0.6 1 0">
      <label>Qty Unit</label>
      <select id="sim-mat-qtyunit-${i}" onchange="simOnQtyUnitChange(${i}, this.value)">
        <option value="" ${!sel?'selected':''}>—</option>
        ${SIZE_UNITS.map(u=>`<option value="${u}" ${(sel===u || (showOther && u==='Other'))?'selected':''}>${u}</option>`).join('')}
      </select>
    </div>
    <div class="field" id="sim-mat-qtyunit-other-wrap-${i}" style="flex:0.6 1 0;display:${showOther?'flex':'none'}">
      <label>Unit — specify</label>
      <input id="sim-mat-qtyunit-other-${i}" placeholder="e.g. sq.ft" value="${showOther?m_escape(sel):''}" oninput="simDraft.materials[${i}].qtyUnit=this.value">
    </div>`;
}
function simOnQtyUnitChange(i, val){
  const otherWrap = document.getElementById(`sim-mat-qtyunit-other-wrap-${i}`);
  if(val==='Other'){
    if(otherWrap) otherWrap.style.display = 'flex';
    const otherInput = document.getElementById(`sim-mat-qtyunit-other-${i}`);
    simDraft.materials[i].qtyUnit = (otherInput && otherInput.value || '').trim();
  } else {
    if(otherWrap) otherWrap.style.display = 'none';
    simDraft.materials[i].qtyUnit = val;
  }
}
window.simOnQtyUnitChange = simOnQtyUnitChange;
function renderSimMaterialRow(m, i){
  const stockHint = m.materialId ? `In stock: ${getStock(m.materialId)} ${materialById(m.materialId)?.unit||''}` : '';
  return `<div class="row sim-material-row" style="align-items:flex-start">
    <div class="field" style="position:relative;flex:2 1 0">
      <label>Material Name</label>
      <input class="sim-mat-input" data-idx="${i}" value="${m_escape(m.materialName)}" placeholder="Start typing…" autocomplete="off"
        oninput="simDraft.materials[${i}].materialName=this.value; simDraft.materials[${i}].materialId=null;">
      <div class="autolist" id="sim-mat-list-${i}"></div>
      <div class="hint" id="sim-mat-hint-${i}">${stockHint}</div>
    </div>
    <div class="field" style="flex:1 1 0"><label>Product Code</label><input id="sim-mat-code-${i}" value="${m_escape(m.productCode)}" placeholder="e.g. PC-1042" oninput="simDraft.materials[${i}].productCode=this.value"></div>
    <div class="field" style="flex:1 1 0"><label>Size / Dimension</label><input id="sim-mat-size-${i}" value="${m_escape(m.size||'')}" placeholder="e.g. 10 mm" oninput="simDraft.materials[${i}].size=this.value"></div>
    <div class="field" style="flex:1 1 0"><label>Grade / Quality</label><input id="sim-mat-grade-${i}" value="${m_escape(m.grade||'')}" placeholder="e.g. Grade A" oninput="simDraft.materials[${i}].grade=this.value"></div>
    <div class="field" style="flex:0.6 1 0"><label>Qty</label><input type="number" min="0" step="any" value="${m.qty}" oninput="simDraft.materials[${i}].qty=this.value; simRecalcProductCode(${i});"></div>
    ${renderSimQtyUnitField(m, i)}
    ${simHealthUIState ? `<div class="field" style="flex:1 1 0"><label>Material Health</label>
      <select onchange="simDraft.materials[${i}].materialHealth=this.value">
        ${['Good','Fair','Damaged','Under Repair','Needs Replacement'].map(h=>`<option ${h===m.materialHealth?'selected':''}>${h}</option>`).join('')}
      </select>
    </div>` : ''}
    <div class="field" style="flex:0 0 auto">
      <label style="visibility:hidden;display:block">Remove</label>
      <button type="button" class="btn small secondary" onclick="simRemoveMaterialRow(${i})" title="Remove this material line">✕</button>
    </div>
  </div>`;
}
function renderSiteMaterialDraftForm(){
  const siteList = Array.from(new Set((DB.siteInstallMaterial||[]).map(r=>r.site).filter(Boolean)));
  const vendorList = Array.from(new Set((DB.siteInstallMaterial||[]).map(r=>r.vendorName).filter(Boolean)));
  return `<div class="panel">
    <h3>New site installation material entry</h3>
    <form id="sim-form">
      <div class="row">
        <div class="field"><label>Site</label><input required id="sim-site" list="sim-site-list" value="${m_escape(simDraft.site)}" placeholder="Site name / location" oninput="simDraft.site=this.value">
          <datalist id="sim-site-list">${siteList.map(s=>`<option value="${m_escape(s)}">`).join('')}</datalist>
        </div>
        <div class="field"><label>Issued On</label><input required id="sim-issuedon" type="date" value="${simDraft.issuedOn}" max="${todayStr()}" oninput="simDraft.issuedOn=this.value"></div>
        <div class="field"><label>Vendor Name</label><input required id="sim-vendor" list="sim-vendor-list" value="${m_escape(simDraft.vendorName)}" placeholder="Vendor name" oninput="simDraft.vendorName=this.value">
          <datalist id="sim-vendor-list">${vendorList.map(v=>`<option value="${m_escape(v)}">`).join('')}</datalist>
        </div>
        <div class="field"><label>Location (stock affected here)</label>
          <select id="sim-location" onchange="simDraft.location=this.value">${(DB.locations||[]).map(l=>`<option ${l===simDraft.location?'selected':''}>${l}</option>`).join('')}</select>
        </div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:15px">Materials</h3>
      <div class="section-sub">Sending several materials out together? Download the template, fill in one row per material, and upload it back — fills the rows below instead of adding them one at a time.</div>
      <input type="file" id="sim-import-file" accept=".xlsx,.xls" style="display:none" onchange="bulkImportSiteMaterialsFromExcel(this)">
      <button type="button" class="btn small secondary" onclick="document.getElementById('sim-import-file').click()">Upload Excel file</button>
      <button type="button" class="btn small secondary" onclick="downloadSiteMaterialImportTemplate()">Download template</button>
      <div id="sim-material-rows" style="margin-top:12px">${simDraft.materials.map((m,i)=>renderSimMaterialRow(m,i)).join('')}</div>
      <button type="button" class="btn small secondary" onclick="simAddMaterialRow()">+ Add Material</button>
      <button type="button" class="btn small secondary" onclick="toggleSimHealthField()" title="Only needed if what's going out isn't in new/Good condition">${simHealthUIState ? 'Hide Material Health' : '+ Material Health (if not new)'}</button>
      <div style="margin-top:16px"><button class="btn" type="submit">Save Entry</button></div>
    </form>
  </div>`;
}
function wireSiteMaterialDraftForm(){
  simDraft.materials.forEach((m,i)=>{
    const input = document.querySelector(`.sim-mat-input[data-idx="${i}"]`);
    const listEl = document.getElementById(`sim-mat-list-${i}`);
    if(!input || !listEl) return;
    attachAutocomplete(input, listEl, ()=>DB.materials, (mat)=>{
      simDraft.materials[i].materialId = mat.id;
      simDraft.materials[i].materialName = mat.name;
      input.value = mat.name;
      const hint = document.getElementById(`sim-mat-hint-${i}`);
      if(hint) hint.textContent = `In stock: ${getStock(mat.id)} ${mat.unit}`;
      // Pre-fill Size/Grade from the matched material's master record — still editable
      // afterward, in case the piece actually going out differs slightly.
      simDraft.materials[i].size = mat.size || '';
      simDraft.materials[i].grade = mat.grade || '';
      const sizeInput = document.getElementById(`sim-mat-size-${i}`);
      if(sizeInput) sizeInput.value = simDraft.materials[i].size;
      const gradeInput = document.getElementById(`sim-mat-grade-${i}`);
      if(gradeInput) gradeInput.value = simDraft.materials[i].grade;
      simRecalcProductCode(i);
    }, (mat)=>`${mat.productCode?'Code: '+mat.productCode+' · ':''}stock ${getStock(mat.id)}`);
  });
  document.getElementById('sim-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const site = simDraft.site.trim();
    const vendorName = simDraft.vendorName.trim();
    const location = simDraft.location || (DB.locations&&DB.locations[0]) || '';
    if(!site){ toast('Enter the site', true); return; }
    if(!vendorName){ toast('Enter the vendor name', true); return; }
    const lines = [];
    for(const m of simDraft.materials){
      const name = (m.materialName||'').trim();
      if(!name) continue;
      const qty = Number(m.qty)||0;
      if(qty<=0){ toast(`Enter a quantity for ${name}`, true); return; }
      if(m.materialId && getStock(m.materialId, location) < qty){
        toast(`Only ${getStock(m.materialId, location)} ${materialById(m.materialId).unit} of ${name} in stock at ${location}`, true);
        return;
      }
      lines.push({ id:uid(), productCode:(m.productCode||'').trim(), materialName:name, materialId:m.materialId||null, qty, qtyUnit:(m.qtyUnit||'').trim(), size:(m.size||'').trim(), grade:(m.grade||'').trim(), materialHealth:m.materialHealth||'Good', returnedQty:0, returnedHealth:null, usedQty:0 });
    }
    if(!lines.length){ toast('Add at least one material line', true); return; }
    lines.forEach(l=>{ if(l.materialId) addStock(l.materialId, location, -l.qty); });
    if(!DB.siteInstallMaterial) DB.siteInstallMaterial = [];
    const entry = {
      id: uid(), srNo: DB.siteInstallMaterial.length + 1,
      site, issuedOn: simDraft.issuedOn, vendorName, location,
      date: todayStr(), time: nowTimeStr(), status:'open',
      materials: lines
    };
    DB.siteInstallMaterial.push(entry);
    await saveKey('siteInstallMaterial'); await saveKey('stock');
    toast(`Logged site installation entry — Sr No. ${entry.srNo} (${lines.length} material${lines.length>1?'s':''})`);
    simResetDraft();
    render();
  });
}
// Which entry groups are expanded in the site-installation list — keyed by entry id,
// several can be open at once, same pattern as the GRN challan groups.
let simGroupUIState = {};
function toggleSimGroup(id){ simGroupUIState[id] = !simGroupUIState[id]; render(); }
window.toggleSimGroup = toggleSimGroup;
function renderSiteInstallGrouped(rows, withClose){
  if(!rows.length) return `<div class="empty">No site installation material entries yet.</div>`;
  return rows.map(entry=>{
    const isOpen = !!simGroupUIState[entry.id];
    const matCount = (entry.materials||[]).length;
    return `<div class="ent-group">
      <button type="button" class="ent-group-toggle" onclick="toggleSimGroup('${entry.id}')">
        <span class="chev">${isOpen?'▾':'▸'}</span> Sr No. ${entry.srNo} — ${m_escape(entry.site)}
        <span class="ent-group-meta">${xlDate(entry.issuedOn)||entry.date} · Vendor ${m_escape(entry.vendorName)||'—'} · ${m_escape(entry.location)||'—'} · ${matCount} material${matCount>1?'s':''} · ${siteInstallStatusBadge(entry)}</span>
      </button>
      <div class="ent-group-body" style="display:${isOpen?'block':'none'}">
        <table><thead><tr><th>Product Code</th><th>Material Name</th><th>Size</th><th>Grade</th><th>Qty Issued</th><th>Material Health</th><th>Returned Qty</th><th>Return Condition</th><th>Installed (Used)</th><th>Product Mismatch</th></tr></thead><tbody>
        ${(entry.materials||[]).map(m=>`<tr${m.productMismatch?' style="background:var(--red-bg)"':''}><td>${m_escape(m.productCode)||'—'}</td><td>${m_escape(m.materialName)}</td><td>${m_escape(m.size)||'—'}</td><td>${m_escape(m.grade)||'—'}</td><td>${fmtQty(m.qty, m)}</td><td>${siteMaterialHealthBadge(m.materialHealth)}</td><td>${m.returnedQty||0}</td>
        <td>${m.returnedHealth==='good' ? '<span class="status-ok">Good — restocked</span>' : (m.returnedHealth==='damaged' ? '<span class="status-crit">Damaged — scrapped</span>' : '—')}</td>
        <td>${m.usedQty ? `<span class="status-low">${m.usedQty} installed</span>` : '—'}</td>
        <td>${m.productMismatch ? `<span class="status-crit">⚠ Mismatch${m.mismatchNote?' — '+m_escape(m.mismatchNote):''}</span>` : '—'}</td></tr>`).join('')}
        </tbody></table>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          ${(withClose && entry.status==='open') ? `<button class="btn small" onclick="openCloseInstallationModal('${entry.id}')">Close Installation / Return Material</button>` : ''}
          <button class="btn small secondary" onclick="printSiteMaterialSlip('${entry.id}')">Print / View</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
// "Close Installation" — Device 2 records how much of each material line actually
// came back from site and in what condition. Good returns go straight back into
// stock at the entry's location; Damaged returns are logged to the Damaged/Scrap
// log instead (never added back to good stock). Anything left un-returned is
// treated as consumed/installed permanently at the site. Closing is final.
// Which rows have "Product Mismatch" flagged while the Close Installation modal is open —
// runtime-only, keyed by material-line index, reset each time the modal opens.
let simCloseMismatchState = {};
function toggleSimMismatch(i){
  simCloseMismatchState[i] = !simCloseMismatchState[i];
  const btn = document.getElementById(`sim-mismatch-btn-${i}`);
  const noteRow = document.getElementById(`sim-mismatch-note-row-${i}`);
  if(btn){
    btn.classList.toggle('mismatch-active', !!simCloseMismatchState[i]);
    btn.textContent = simCloseMismatchState[i] ? '⚠ Mismatch Flagged' : '⚠ Product Mismatch';
  }
  if(noteRow) noteRow.style.display = simCloseMismatchState[i] ? 'flex' : 'none';
}
window.toggleSimMismatch = toggleSimMismatch;
// Live-updates the "remaining to account for" hint under each material row as
// Returned Qty / Installed (Used) are typed, so mismatches are visible before
// submit rather than only surfacing as a blocking error afterward.
function simCloseRecalc(i, issuedQty){
  const qtyEl = document.getElementById(`sim-close-qty-${i}`);
  const usedEl = document.getElementById(`sim-close-used-${i}`);
  const hintEl = document.getElementById(`sim-close-remaining-${i}`);
  if(!qtyEl || !usedEl || !hintEl) return;
  const rq = Number(qtyEl.value)||0;
  const uq = Number(usedEl.value)||0;
  const remaining = issuedQty - rq - uq;
  hintEl.textContent = remaining===0 ? 'All accounted for' : `Remaining to account for: ${remaining}`;
  hintEl.classList.toggle('hint-error', remaining!==0);
}
window.simCloseRecalc = simCloseRecalc;
function openCloseInstallationModal(entryId){
  const entry = (DB.siteInstallMaterial||[]).find(e=>e.id===entryId);
  if(!entry){ toast('Entry not found', true); return; }
  if(entry.status==='closed'){ toast('This installation is already closed', true); return; }
  simCloseMismatchState = {};
  const rows = (entry.materials||[]).map((m,i)=>`
    <div class="close-inst-row">
      <div class="cir-head">${m_escape(m.materialName)}${m.productCode? ' ('+m_escape(m.productCode)+')':''}<span class="hint">Issued ${fmtQty(m.qty, m)}</span></div>
      <div class="row">
        <div class="field"><label>Returned Qty</label><input type="number" min="0" max="${m.qty}" step="any" id="sim-close-qty-${i}" value="0" oninput="simCloseRecalc(${i}, ${m.qty})"></div>
        <div class="field"><label>Condition</label><select id="sim-close-cond-${i}"><option value="good">Good — return to stock</option><option value="damaged">Damaged — scrap</option></select></div>
        <div class="field"><label>Installed (Used)</label><input type="number" min="0" max="${m.qty}" step="any" id="sim-close-used-${i}" value="0" oninput="simCloseRecalc(${i}, ${m.qty})"></div>
      </div>
      <div class="hint" id="sim-close-remaining-${i}">Remaining to account for: ${m.qty}</div>
      <div class="cir-actions">
        <button type="button" class="btn small secondary" id="sim-mismatch-btn-${i}" onclick="toggleSimMismatch(${i})" title="Flag if what physically came back from site isn't this material — e.g. it was swapped for something else on site">⚠ Product Mismatch</button>
        <div class="field" id="sim-mismatch-note-row-${i}" style="display:none;margin-top:8px">
          <input type="text" id="sim-mismatch-note-${i}" placeholder="What came back instead? (optional note for Device 3)">
        </div>
      </div>
    </div>`).join('');
  showModal(`
    <div class="sim-modal-scope">
    <h3>Close Installation — ${m_escape(entry.site)}</h3>
    <div class="admin-note">For each material, split the Issued Qty between Returned Qty (comes back into stock) and Installed (Used) (permanently used up at the site). The two must add up to the Issued Qty. If the material physically returned doesn't match what was issued (it was swapped for something else on site), flag "Product Mismatch" — this raises an alert for Device 3. This cannot be undone.</div>
    ${rows}
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="sim-close-cancel">Cancel</button>
      <button class="btn" type="button" id="sim-close-submit">Close Installation</button>
    </div>
    </div>`, {wide:true});
  document.getElementById('sim-close-cancel').onclick = closeModal;
  document.getElementById('sim-close-submit').onclick = async ()=>{
    // Every material line must fully account for its Issued Qty as Returned + Used
    // before we allow closing — otherwise silently guess which is exactly what this
    // explicit split was added to avoid.
    const mismatchLines = [];
    (entry.materials||[]).forEach((m,i)=>{
      const qtyEl = document.getElementById(`sim-close-qty-${i}`);
      const usedEl = document.getElementById(`sim-close-used-${i}`);
      let rq = Number(qtyEl.value)||0;
      let uq = Number(usedEl.value)||0;
      if(rq<0) rq = 0; if(uq<0) uq = 0;
      if(rq + uq !== m.qty) mismatchLines.push(`${m.materialName} (Issued ${m.qty}, entered ${rq+uq})`);
    });
    if(mismatchLines.length){
      toast(`Returned + Installed (Used) must add up to Issued Qty for: ${mismatchLines.join(', ')}`, true);
      return;
    }
    let anyMismatch = false;
    (entry.materials||[]).forEach((m,i)=>{
      const qtyEl = document.getElementById(`sim-close-qty-${i}`);
      const condEl = document.getElementById(`sim-close-cond-${i}`);
      const usedEl = document.getElementById(`sim-close-used-${i}`);
      const noteEl = document.getElementById(`sim-mismatch-note-${i}`);
      let rq = Number(qtyEl.value)||0;
      if(rq<0) rq = 0;
      if(rq>m.qty) rq = m.qty;
      let uq = Number(usedEl.value)||0;
      if(uq<0) uq = 0;
      if(uq>m.qty) uq = m.qty;
      m.returnedQty = rq;
      m.returnedHealth = rq>0 ? condEl.value : null;
      m.usedQty = uq;
      if(m.materialId && rq>0){
        if(m.returnedHealth==='good'){
          addStock(m.materialId, entry.location, rq);
        } else {
          DB.damaged = DB.damaged||[];
          DB.damaged.push({id:uid(), materialId:m.materialId, materialName:m.materialName, qty:rq, date:todayStr(), location:entry.location, note:`Returned damaged from site installation (${entry.site})`});
        }
      }
      m.productMismatch = !!simCloseMismatchState[i];
      m.mismatchNote = m.productMismatch ? (noteEl && noteEl.value || '').trim() : '';
      if(m.productMismatch){
        anyMismatch = true;
        openProductMismatchTicket({materialId:m.materialId, materialName:m.materialName, site:entry.site, srNo:entry.srNo, productCode:m.productCode, note:m.mismatchNote});
      }
    });
    entry.status = 'closed';
    entry.closedDate = todayStr(); entry.closedTime = nowTimeStr();
    await saveKey('siteInstallMaterial'); await saveKey('stock'); await saveKey('damaged');
    if(anyMismatch) await saveKey('tickets');
    closeModal();
    toast(anyMismatch ? `Installation at ${entry.site} closed — Product Mismatch alert sent to Device 3` : `Installation at ${entry.site} closed`);
    render();
  };
}
window.openCloseInstallationModal = openCloseInstallationModal;
// Human-readable slip serial derived from the entry's existing sequential srNo
// (1, 2, 3…) — NOT from entry.id, which stays a random uid used only internally
// for lookups/DOM ids and is never meant to be read by a person. Blocks of 1000:
// srNo 1-1000 -> a0001-a1000, 1001-2000 -> b0001-b1000, and so on; past z (26,000
// entries) it rolls into aa, ab… the same way spreadsheet columns do, so it never
// runs out.
function siteSlipSerial(srNo){
  if(!srNo || srNo<1) return '—';
  const num = ((srNo-1)%1000)+1;
  let block = Math.floor((srNo-1)/1000);
  let letters = '';
  do{
    letters = String.fromCharCode(97 + (block%26)) + letters;
    block = Math.floor(block/26) - 1;
  } while(block>=0);
  return `${letters}${String(num).padStart(4,'0')}`;
}
function siteMaterialSlipHTML(entry){
  const rows = (entry.materials||[]).map((m,i)=>{
    const returnLabel = m.returnedHealth==='good' ? 'Good — restocked' : (m.returnedHealth==='damaged' ? 'Damaged — scrapped' : '—');
    const returnCls = m.returnedHealth==='good' ? 'pill-good' : (m.returnedHealth==='damaged' ? 'pill-bad' : 'pill-muted');
    return `
   <tr class="${i%2? 'alt':''}${m.productMismatch?' mismatch-row':''}">
    <td class="mat-cell"><span class="mat-name">${m_escape(m.materialName)}</span>${m.productCode?`<span class="mat-code">${m_escape(m.productCode)}</span>`:''}</td>
    <td>${m_escape(m.size)||'—'}</td>
    <td>${m_escape(m.grade)||'—'}</td>
    <td class="num">${fmtQty(m.qty, m)}</td>
    <td>${m_escape(m.materialHealth)||'—'}</td>
    <td class="num">${m.returnedQty||0}</td>
    <td><span class="pill ${returnCls}">${returnLabel}</span></td>
    <td class="num">${m.usedQty||0}</td>
    <td>${m.productMismatch ? `<span class="pill pill-warn">⚠ Mismatch</span>${m.mismatchNote?`<div class="mismatch-note">${m_escape(m.mismatchNote)}</div>`:''}` : '—'}</td>
   </tr>`;
  }).join('');
  const statusClosed = entry.status==='closed';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Site Installation Material Slip — ${m_escape(entry.site)}</title>
<style>
  :root{
    --brand-navy:#152a40; --brand-blue:#2d5c85; --brand-accent:#c99a3c;
    --ink:#1c262d; --muted:#5c6b78; --line:#d7e0e7; --band:#eef3f6;
  }
  *{box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;margin:0;padding:0;color:var(--ink);background:#fff;}
  .sheet{max-width:820px;margin:0 auto;padding:0 32px 32px;}

  /* ---- branded header band ---- */
  .letterhead{background:linear-gradient(135deg,var(--brand-navy),var(--brand-blue));color:#fff;padding:26px 32px;display:flex;align-items:center;gap:16px;margin:0 0 22px;}
  .brand-mark{flex:0 0 auto;width:52px;height:52px;border-radius:10px;background:var(--brand-accent);color:var(--brand-navy);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;letter-spacing:.5px;box-shadow:0 2px 6px rgba(0,0,0,.25);}
  .brand-text{flex:1 1 auto;}
  .brand-text h1{margin:0;font-size:21px;font-weight:800;letter-spacing:.5px;}
  .brand-text h1 em{font-style:normal;color:var(--brand-accent);}
  .brand-text .doc-title{margin-top:3px;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#cfe0ee;font-weight:600;}
  .status-chip{flex:0 0 auto;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
    background:${statusClosed?'rgba(58,168,102,.18)':'rgba(214,158,46,.22)'};color:${statusClosed?'#3aa866':'#e0ac3a'};border:1px solid ${statusClosed?'rgba(58,168,102,.5)':'rgba(224,172,58,.55)'};}

  /* ---- meta info card ---- */
  .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:22px;}
  .meta-cell{padding:11px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;}
  .meta-cell:nth-child(4n){border-right:none;}
  .meta-grid .meta-cell:nth-last-child(-n+4){border-bottom:none;}
  .meta-cell .lbl{display:block;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:3px;}
  .meta-cell .val{font-size:13.5px;font-weight:600;color:var(--ink);}

  /* ---- materials table ---- */
  h2.section-h{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--brand-blue);font-weight:700;margin:0 0 8px;border-bottom:2px solid var(--brand-blue);padding-bottom:6px;}
  table{width:100%;border-collapse:collapse;}
  thead th{background:var(--brand-navy);color:#fff;font-size:11px;letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:10px 10px;font-weight:600;}
  tbody td{padding:10px;font-size:13px;border-bottom:1px solid var(--line);vertical-align:top;}
  tbody tr.alt{background:var(--band);}
  tbody tr.mismatch-row{background:#fbeaea;}
  td.num{text-align:right;font-variant-numeric:tabular-nums;}
  .mat-cell .mat-name{font-weight:600;display:block;}
  .mat-cell .mat-code{font-size:11px;color:var(--muted);}
  .pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap;}
  .pill-good{background:#e3f5ea;color:#1f8a4c;}
  .pill-bad{background:#fbe6e6;color:#c23a3a;}
  .pill-warn{background:#fdf0da;color:#9a6a12;}
  .pill-muted{color:var(--muted);}
  .mismatch-note{margin-top:4px;font-size:11.5px;color:#9a3a3a;}

  /* ---- signatures ---- */
  .sig{margin-top:54px;display:flex;justify-content:space-between;gap:40px;}
  .sig div{width:44%;text-align:center;}
  .sig .line{border-top:1.5px solid #333;padding-top:7px;font-size:11.5px;color:var(--muted);letter-spacing:.3px;}

  .footnote{margin-top:26px;padding-top:12px;border-top:1px solid var(--line);font-size:10.5px;color:var(--muted);display:flex;justify-content:space-between;}

  @media print{
    .letterhead{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .sheet{padding:0 8mm 8mm;}
    thead th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style></head><body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand-mark">HG</div>
      <div class="brand-text">
        <h1>HL <em>GALVATECH</em></h1>
        <div class="doc-title">Site Installation Material Slip</div>
      </div>
      <div class="status-chip">${statusClosed?'Closed':'Open'}</div>
    </div>

    <div class="meta-grid">
      <div class="meta-cell"><span class="lbl">Sr No.</span><span class="val">${entry.srNo}</span></div>
      <div class="meta-cell"><span class="lbl">Slip Ref.</span><span class="val">${siteSlipSerial(entry.srNo)}</span></div>
      <div class="meta-cell"><span class="lbl">Site</span><span class="val">${m_escape(entry.site)||'—'}</span></div>
      <div class="meta-cell"><span class="lbl">Issued On</span><span class="val">${xlDate(entry.issuedOn)||'—'}</span></div>
      <div class="meta-cell"><span class="lbl">Vendor Name</span><span class="val">${m_escape(entry.vendorName)||'—'}</span></div>
      <div class="meta-cell"><span class="lbl">Location</span><span class="val">${m_escape(entry.location)||'—'}</span></div>
      <div class="meta-cell"><span class="lbl">Entered</span><span class="val">${entry.date}${entry.time?', '+entry.time:''}</span></div>
      <div class="meta-cell"><span class="lbl">Closed</span><span class="val">${statusClosed ? (entry.closedDate||'—')+(entry.closedTime?', '+entry.closedTime:'') : '—'}</span></div>
    </div>

    <h2 class="section-h">Materials</h2>
    <table>
     <thead><tr><th>Material</th><th>Size</th><th>Grade</th><th style="text-align:right">Qty Issued</th><th>Health</th><th style="text-align:right">Returned Qty</th><th>Return Condition</th><th style="text-align:right">Installed (Used)</th><th>Product Mismatch</th></tr></thead>
     <tbody>${rows}</tbody>
    </table>

    <div class="sig">
      <div><div class="line">Issued by (Store)</div></div>
      <div><div class="line">Received at Site</div></div>
    </div>

    <div class="footnote">
      <span>HL Galvatech — Stocks and Store Management</span>
      <span>Generated ${xlDate(todayStr())||''}</span>
    </div>
  </div>
</body></html>`;
}
function printSiteMaterialSlip(entryId){
  const entry = (DB.siteInstallMaterial||[]).find(r=>r.id===entryId);
  if(!entry){ toast('Entry not found', true); return; }
  const html = siteMaterialSlipHTML(entry);
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
  a.href = url; a.download = `site-install-slip-${(entry.site||'entry').replace(/[^a-z0-9]/gi,'_')}-${entry.date}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
window.printSiteMaterialSlip = printSiteMaterialSlip;
function renderSiteMaterial2(el){
  if(!simDraft) simResetDraft();
  const rows = (DB.siteInstallMaterial||[]).slice().sort((a,b)=>(b.srNo||0)-(a.srNo||0));
  const openCount = rows.filter(r=>r.status==='open').length;
  el.innerHTML = `
    <div class="sim-scope">
    <h2 class="section-title">Site Installation Material</h2>
    ${renderSiteMaterialDraftForm()}
    ${collapsePanel('sim2-all', 'All site installation material entries', renderSiteInstallGrouped(rows, true), `${rows.length} entr${rows.length===1?'y':'ies'}${openCount?` · ${openCount} open`:''}`)}
    </div>`;
  wireSiteMaterialDraftForm();
}
function renderSiteMaterial3(el){
  const rows = (DB.siteInstallMaterial||[]).slice().sort((a,b)=>(b.srNo||0)-(a.srNo||0));
  const openCount = rows.filter(r=>r.status==='open').length;
  el.innerHTML = `
    <div class="sim-scope">
    <h2 class="section-title">Site Installation Material</h2>
    ${collapsePanel('sim3-all', 'All site installation material entries', renderSiteInstallGrouped(rows, false), `${rows.length} entr${rows.length===1?'y':'ies'}${openCount?` · ${openCount} open`:''}`)}
    </div>`;
}

