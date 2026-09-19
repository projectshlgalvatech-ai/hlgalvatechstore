/* =========================================================================
   DEVICE 2 — STORE ENTRY
   ========================================================================= */
function renderDash2(el){
  const openIssues = DB.issues.filter(i=>issueOutstanding(i)>0).length;
  const dmg = DB.damaged.length;
  const lowCount = DB.materials.filter(m=> DB.thresholds[m.id]!==undefined && getStock(m.id)<=DB.thresholds[m.id]).length;
  el.innerHTML = `
    <h2 class="section-title">Store Dashboard</h2>
    <div class="section-sub">Live stock synced from Device 1, issues managed here.</div>
    <div class="cards">
      ${kpi('Materials tracked', DB.materials.length, '', 'stock')}
      ${kpi('Currently issued (unreturned)', openIssues, '', 'mrf')}
      ${kpi('Below threshold', lowCount, lowCount? 'bad':'good', 'stock')}
      ${kpi('Damaged logged', dmg, dmg?'warn':'', 'returns')}
    </div>
    ${renderGateRequestsPendingPanel()}
    ${collapsePanel('dash2-low-stock', 'Low / understock items', renderTicketMini(), `${lowCount}`)}
    ${scopedCollapsePanel('dash2-recent-issues', 'Recent issues', DB.issues, 'date', renderIssuesTable)}`;
}
function renderGateRequestsPendingPanel(){
  const pending = (DB.gateRequests||[]).filter(r=>r.status==='pending');
  if(!pending.length) return '';
  return collapsePanel('gate-requests-pending', 'New material at the gate — awaiting your approval', `<div class="section-sub">Device 1 is holding these challans until you approve or reject them. Approve to let Device 1 add the materials and choose a location; reject to block this challan from entering stock.</div>
    <table><thead><tr><th>Date</th><th>Challan/Bill</th><th>Vehicle</th><th>Supplier</th><th>PO</th><th>SO / Use</th><th>Challan file</th><th>Action</th></tr></thead><tbody>
    ${pending.map(r=>`<tr><td>${r.date}</td><td>${r.challanNo}</td><td>${r.vehicleNo}</td><td>${r.supplier||'—'}</td><td>${r.poNumber}</td><td>${r.forFactoryUse?'Factory use':(r.soNumber||'—')}</td>
    <td>${r.challanFileId? `<button class="btn small secondary" onclick="viewChallanFile('${r.challanFileId}')">View</button>` : '—'}</td>
    <td><button class="btn small" onclick="approveGateRequest('${r.id}')">Approve</button> <button class="btn small secondary" onclick="rejectGateRequest('${r.id}')">Reject</button></td></tr>`).join('')}
    </tbody></table>`, `${pending.length}`);
}
async function approveGateRequest(id){
  const r = (DB.gateRequests||[]).find(x=>x.id===id);
  if(!r) return;
  r.status = 'approved'; r.approvedDate = todayStr(); r.approvedTime = nowTimeStr();
  await saveKey('gateRequests');
  toast(`Challan ${r.challanNo} approved — Device 1 can now add materials and a location`);
  render();
}
async function rejectGateRequest(id){
  const r = (DB.gateRequests||[]).find(x=>x.id===id);
  if(!r) return;
  const reason = prompt(`Reason for rejecting challan ${r.challanNo} (mandatory):`, '');
  if(reason===null) return;
  const trimmed = reason.trim();
  if(!trimmed){ toast('A remark is required to reject a request', true); return; }
  r.status = 'rejected'; r.rejectReason = trimmed; r.rejectedDate = todayStr();
  await saveKey('gateRequests');
  toast(`Challan ${r.challanNo} rejected — this material cannot be added at the gate`, true);
  render();
}
// Lets Device 1 close out an approved challan request without adding any materials —
// e.g. it was approved by mistake, the goods never actually arrived, or it's a
// duplicate of another challan. Distinct from rejection (Device 2's call, made before
// any materials exist) and from completion (made by saving materials): this is Device
// 1 saying "there's nothing to add here, stop showing this as open."
async function closeGateRequest(id){
  const r = (DB.gateRequests||[]).find(x=>x.id===id);
  if(!r) return;
  if(r.status!=='approved'){ toast('This challan is not open for materials.', true); return; }
  if(!confirm(`Close challan ${r.challanNo} without adding any materials?\n\nThis can't be undone — if this material still needs to come in, Device 2 will need to approve a fresh challan for it.`)) return;
  r.status = 'cancelled'; r.cancelledDate = todayStr();
  await saveKey('gateRequests');
  if(expandedChallanId===id) expandedChallanId = null;
  toast(`Challan ${r.challanNo} closed — no materials were added`);
  TAB = 'gate';
  buildNav();
  render();
}
window.approveGateRequest = approveGateRequest;
window.rejectGateRequest = rejectGateRequest;
window.closeGateRequest = closeGateRequest;

function renderStock2(el){ renderStockView(el, true, 2); }
function renderStock3(el){ renderStockView(el, false, 3); }
function renderStockView(el, showActions, deviceKey){
  const open = !!panelCollapseUIState['stock-'+deviceKey];
  el.innerHTML = `
    <h2 class="section-title">Stock ${showActions? '': '— All Locations'}</h2>
    <div class="section-sub">View by location, category, or overall.</div>
    <div class="panel">
      <button type="button" class="panel-toggle" onclick="toggleCollapsePanel('stock-${deviceKey}')">
        <span class="chev">${open?'▾':'▸'}</span> Material stock table <span class="panel-toggle-meta">${DB.materials.length} material${DB.materials.length===1?'':'s'}</span>
      </button>
      <div style="display:${open?'block':'none'}">
        <div class="pill-tabs" id="stock-filter-cat"></div>
        <table><thead><tr><th>Material</th><th>Category</th><th>Rack</th><th>Type</th>
        ${DB.locations.map(l=>`<th>${l}</th>`).join('')}<th>Total</th><th>Nos.</th><th>Threshold</th><th>Status</th></tr></thead>
        <tbody id="stock-tbody"></tbody></table>
      </div>
    </div>`;
  if(!stockUIState[deviceKey] || !['All',...DB.categories].includes(stockUIState[deviceKey])) stockUIState[deviceKey]='All';
  const catBar = document.getElementById('stock-filter-cat');
  ['All',...DB.categories].forEach(c=>{
    const b=document.createElement('button'); b.textContent=c; if(c===stockUIState[deviceKey])b.classList.add('active');
    b.onclick=()=>{ stockUIState[deviceKey]=c; [...catBar.children].forEach(x=>x.classList.remove('active')); b.classList.add('active'); paint(); };
    catBar.appendChild(b);
  });
  function paint(){
    const tbody = document.getElementById('stock-tbody');
    const list = DB.materials.filter(m=> stockUIState[deviceKey]==='All' || m.category===stockUIState[deviceKey]);
    if(!list.length){ tbody.innerHTML = `<tr><td colspan="${8+DB.locations.length}" class="empty">No materials in this category.</td></tr>`; return; }
    tbody.innerHTML = list.map(m=>{
      const st = stockStatus(m.id);
      return `<tr><td>${m.name}</td><td>${m.category}</td><td>${m.rack||'—'}</td><td>${typeTag(m.type)}</td>
      ${DB.locations.map(l=>`<td>${getStock(m.id,l)}</td>`).join('')}
      <td><b>${getStock(m.id)}</b></td><td>${getStockNos(m.id)}</td><td>${DB.thresholds[m.id]??'—'}</td><td class="${st.cls}">${st.cls==='status-ok'?'OK':st.cls?'LOW':'—'}</td></tr>`;
    }).join('');
  }
  paint();
}

function issueStatusBadge(i){
  const outstanding = issueOutstanding(i);
  const parts=[];
  if((i.returnedGoodQty||0)>0) parts.push(`${i.returnedGoodQty} returned`);
  if((i.damagedQty||0)>0) parts.push(`${i.damagedQty} damaged`);
  if((i.consumedQty||0)>0) parts.push(`${i.consumedQty} consumed`);
  if(!parts.length) return '<span class="status-low">Issued</span>';
  if(outstanding>0) parts.push(`${outstanding} outstanding`);
  const cls = outstanding>0 ? 'status-low' : ((i.damagedQty||0)>0 ? 'status-crit' : 'status-ok');
  return `<span class="${cls}">${parts.join(' · ')}</span>`;
}
function renderIssuesTable(rows){
  if(!rows.length) return `<div class="empty">No issues logged.</div>`;
  return `<table><thead><tr><th>Date</th><th>Time</th><th>Material</th><th>Qty</th><th>Person</th><th>Purpose</th><th>Approved by</th><th>Location</th><th>SO</th><th>Status</th><th>Slip</th></tr></thead><tbody>
  ${rows.map(i=>`<tr><td>${i.date}</td><td>${timeBadge(i.date,i.time)}</td><td>${i.materialName}</td><td>${i.qty}${i.qtyNos?' ('+i.qtyNos+' Nos.)':''}</td><td>${i.person}</td><td>${i.purpose}</td><td>${i.approvedBy}</td><td>${i.location}</td>
  <td>${i.soNumber||'—'}${i.crossSO?' <span class="status-crit">(different SO)</span>':''}</td>
  <td>${issueStatusBadge(i)}</td>
  <td><button class="btn small secondary" onclick="printIssueSlip('${i.id}')">Print / Save</button></td></tr>`).join('')}
  </tbody></table>`;
}
function issueSlipHTML(issue){
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Material Issue Slip — ${issue.materialName}</title>
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
  <h1>HL GALVATECH<small>Material Issue / Handover Slip</small></h1>
  <table>
   <tr><th>Date</th><td>${issue.date}</td><th>Time</th><td>${issue.time||'—'}</td></tr>
   <tr><th>Slip ref.</th><td colspan="3">${issue.id}</td></tr>
   <tr><th>Material</th><td>${issue.materialName}</td><th>Quantity</th><td>${issue.qty}${issue.qtyNos?' ('+issue.qtyNos+' Nos.)':''}</td></tr>
   <tr><th>Issued to</th><td>${issue.person}</td><th>Purpose</th><td>${issue.purpose}</td></tr>
   <tr><th>Approved by</th><td>${issue.approvedBy}</td><th>Location</th><td>${issue.location}</td></tr>
   <tr><th>SO Number</th><td colspan="3">${issue.soNumber||'—'}</td></tr>
  </table>
  <div class="sig"><div>Issued by (Store)</div><div>Received by</div></div>
</body></html>`;
}
function printIssueSlip(issueId){
  const issue = DB.issues.find(i=>i.id===issueId);
  if(!issue){ toast('Issue record not found', true); return; }
  const html = issueSlipHTML(issue);
  // Hard copy
  const w = window.open('', '_blank', 'width=650,height=820');
  if(w){
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
  } else {
    toast('Pop-up blocked — allow pop-ups to print, saving a copy instead', true);
  }
  // Save a copy to the computer too
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `issue-slip-${(issue.materialName||'item').replace(/[^a-z0-9]/gi,'_')}-${issue.date}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
window.printIssueSlip = printIssueSlip;
async function doConsume(issueId){
  const issue = DB.issues.find(i=>i.id===issueId);
  if(!issue) return;
  const outstanding = issueOutstanding(issue);
  if(outstanding<=0){ toast('Nothing outstanding on this issue', true); return; }
  const raw = prompt(`How many ${issue.materialName} were consumed (used up — not coming back)?\nOutstanding: ${outstanding} of ${issue.qty}`, outstanding);
  if(raw===null) return;
  const qty = Number(raw);
  if(!qty || qty<=0 || qty>outstanding){ toast(`Enter a quantity between 1 and ${outstanding}`, true); return; }
  issue.consumedQty = (issue.consumedQty||0) + qty;
  issue.returnDate = todayStr();
  issue.status = issueOutstanding(issue)<=0 ? 'closed' : 'issued';
  await saveKey('issues');
  toast(`${qty} ${issue.materialName} marked as consumed — no stock change (already deducted at issue time)`);
  render();
}
window.doConsume = doConsume;

function renderOutstandingIssuesTable(rows){
  const hint = `<div class="section-sub">Use <b>Consumed</b> when material was used up on the job and nothing is coming back. Each action asks how many of the outstanding quantity it applies to.</div>`;
  if(!rows.length) return hint + `<div class="empty">Nothing currently outstanding in this range.</div>`;
  return hint + `<table><thead><tr><th>Date</th><th>Time</th><th>Material</th><th>Issued qty</th><th>Outstanding</th><th>Person</th><th>Purpose</th><th>Location</th><th>Action</th></tr></thead><tbody>
  ${rows.map(i=>`<tr><td>${i.date}</td><td>${timeBadge(i.date,i.time)}</td><td>${i.materialName}</td><td>${i.qty}</td><td><b>${issueOutstanding(i)}</b></td><td>${i.person}</td><td>${i.purpose}</td><td>${i.location}</td>
  <td><button class="btn small" onclick="doReturn('${i.id}','good')">Return — Good</button>
  <button class="btn small danger" onclick="doReturn('${i.id}','damaged')">Return — Damaged</button>
  <button class="btn small secondary" onclick="doConsume('${i.id}')">Consumed</button></td></tr>`).join('')}
  </tbody></table>`;
}
function renderDamagedLogTable(rows){
  if(!rows.length) return `<div class="empty">No damaged items logged in this range.</div>`;
  return `<table><thead><tr><th>Date</th><th>Material</th><th>Qty</th><th>Location</th><th>Note</th></tr></thead><tbody>
  ${rows.map(d=>`<tr><td>${d.date}</td><td>${d.materialName}</td><td>${d.qty}</td><td>${d.location}</td><td>${d.note||'—'}</td></tr>`).join('')}
  </tbody></table>`;
}
function renderReturns(el){
  const open = DB.issues.filter(i=>issueOutstanding(i)>0);
  el.innerHTML = `
    <h2 class="section-title">Returns &amp; Damaged Stock</h2>
    <div class="section-sub">Good-condition returns go back into sellable stock. Damaged returns are scrapped and never added back to good stock. Quantities can be split — e.g. issued 4, return 1 good and mark 3 consumed.</div>
    ${scopedCollapsePanel('returns-outstanding', 'Items currently issued — outstanding', open, 'date', renderOutstandingIssuesTable, false, 'all')}
    ${scopedCollapsePanel('returns-damaged-log', 'Damaged / scrapped stock log', DB.damaged, 'date', renderDamagedLogTable)}`;
}
async function doReturn(issueId, condition){
  const issue = DB.issues.find(i=>i.id===issueId);
  if(!issue) return;
  const outstanding = issueOutstanding(issue);
  if(outstanding<=0){ toast('Nothing outstanding on this issue', true); return; }
  const raw = prompt(`How many ${issue.materialName} are being returned ${condition==='good'?'in good condition':'damaged'}?\nOutstanding: ${outstanding} of ${issue.qty}`, outstanding);
  if(raw===null) return;
  const qty = Number(raw);
  if(!qty || qty<=0 || qty>outstanding){ toast(`Enter a quantity between 1 and ${outstanding}`, true); return; }
  if(condition==='good'){
    issue.returnedGoodQty = (issue.returnedGoodQty||0) + qty;
    addStock(issue.materialId, issue.location, qty); // back into good sellable stock
    toast(`${qty} ${issue.materialName} returned in good condition — added back to stock`);
  } else {
    issue.damagedQty = (issue.damagedQty||0) + qty;
    DB.damaged.push({id:uid(), materialId:issue.materialId, materialName:issue.materialName, qty, date:todayStr(), location:issue.location, note:'Returned damaged from '+issue.person});
    toast(`${qty} ${issue.materialName} logged as damaged — NOT added back to stock`, true);
  }
  issue.returnDate = todayStr();
  issue.status = issueOutstanding(issue)<=0 ? 'closed' : 'issued';
  await saveKey('issues'); await saveKey('stock'); await saveKey('damaged');
  render();
}
window.doReturn = doReturn;

// Escapes text for safe insertion into innerHTML. Treats null/undefined as ''
// (NOT the literal string "undefined") so every `m_escape(x)||'—'` fallback
// pattern used throughout the app works correctly when x was never set.
function m_escape(s){ if(s===null||s===undefined) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Small edit-distance helper so a typo'd guess ("glavanized") can still match ("galvanized").
function m_levenshtein(a,b){
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    d[i][j] = a[i-1]===b[j-1] ? d[i-1][j-1] : 1+Math.min(d[i-1][j-1], d[i-1][j], d[i][j-1]);
  }
  return d[m][n];
}
// Scores how well a material name matches a typed guess: exact > starts-with > contains >
// in-order letters (typeahead-style) > close typo. Higher score = better guess.
function m_matchScore(name, kw){
  const text = name.toLowerCase(), q = kw.toLowerCase();
  if(!q) return 0;
  if(text===q) return 1000;
  if(text.startsWith(q)) return 900 - (text.length-q.length);
  if(text.includes(q)) return 700 - text.indexOf(q);
  // Typo tolerance: compare the guess against each individual word in the name,
  // only accepting a small, size-proportional number of edits — this is what
  // lets "glavanised" find "Galvanized Sheet" without random short guesses
  // (like "xyz") accidentally matching something.
  const words = text.split(/[^a-z0-9]+/).filter(w=>w.length>=3);
  let best = 0;
  if(q.length<3) return 0; // too short to guess reliably
  for(const w of words){
    const dist = m_levenshtein(w, q);
    const tolerance = Math.max(1, Math.floor(Math.min(w.length, q.length)/3));
    if(dist<=tolerance){
      const s = 500 - dist*60 - Math.abs(w.length-q.length)*5;
      if(s>best) best = s;
    }
  }
  if(best>0) return best;
  // last resort: in-order letters somewhere in the name (loose typeahead fragment)
  if(q.length>=4){
    let ti=0, qi=0;
    while(ti<text.length && qi<q.length){ if(text[ti]===q[qi]) qi++; ti++; }
    if(qi===q.length) return 90;
  }
  return 0;
}
function renderTransferLocationInventoryTable(){
  const lastTransferFor = (l)=>{
    const touching = (DB.transfers||[]).filter(t=>t.from===l || t.to===l);
    const last = touching.length ? touching[touching.length-1] : null;
    return last ? `${last.date}${last.time?' · '+timeBadge(last.date,last.time):''}<br><span class="hint" style="display:inline">${last.from===l? 'out to '+last.to : 'in from '+last.from}</span>` : '—';
  };
  const kw = (locInvKeyword||'').trim();
  const allStocked = DB.materials.filter(m=> DB.locations.some(l=>getStock(m.id,l)>0));
  let displayMats = allStocked;
  let noMatch = false;
  if(kw){
    const scored = allStocked.map(m=>({m, score:m_matchScore(m.name, kw)})).sort((a,b)=> b.score-a.score);
    const topScore = scored.length ? scored[0].score : 0;
    if(topScore > 60){
      displayMats = scored.filter(s=>s.score===topScore).map(s=>s.m); // only the matched material(s) — everything else is hidden
    } else {
      displayMats = [];
      noMatch = true;
    }
  }
  return `<table><thead><tr><th>Material</th>${DB.locations.map(l=>`<th>${l}</th>`).join('')}<th>Total</th></tr></thead><tbody>
  ${noMatch ? `<tr><td colspan="${DB.locations.length+2}" class="empty">No material matches "${m_escape(kw)}".</td></tr>` : ''}
  ${displayMats.length ? displayMats.map(m=>{
    const total = getStock(m.id);
    return `<tr><td>${m.name}</td>${DB.locations.map(l=>`<td>${getStock(m.id,l)}</td>`).join('')}<td><b>${total}</b></td></tr>`;
  }).join('') : (kw ? '' : `<tr><td colspan="${DB.locations.length+2}" class="empty">No stock at any location.</td></tr>`)}
  </tbody>
  <tfoot><tr><th>Last transfer</th>${DB.locations.map(l=>`<th style="font-weight:400;text-transform:none;letter-spacing:0;font-family:var(--font-body);font-size:12px">${lastTransferFor(l)}</th>`).join('')}<th></th></tr></tfoot>
  </table>`;
}
function renderTransferLocationInventorySearchBar(){
  return `<div class="row" style="align-items:flex-end; gap:8px; margin:10px 0">
    <div class="field" style="flex:0 0 240px">
      <label>Search location inventory</label>
      <input id="loc-inv-kw" type="text" placeholder="Type a material name…" value="${m_escape(locInvKeyword)}" onkeydown="if(event.key==='Enter'){event.preventDefault();guessLocInv();}">
    </div>
    <button type="button" class="btn small" onclick="guessLocInv()">Search</button>
    ${locInvKeyword ? `<button type="button" class="btn small secondary" onclick="clearLocInvFilter()">Clear</button>` : ''}
  </div>`;
}
function renderTransferLocationInventory(){
  return renderTransferLocationInventoryTable();
}
function guessLocInv(){
  const input = document.getElementById('loc-inv-kw');
  locInvKeyword = input ? input.value : '';
  panelCollapseUIState['transfer-location-inventory'] = true; // auto-expand so the result is visible
  render();
}
function clearLocInvFilter(){
  locInvKeyword = '';
  render();
}
window.guessLocInv = guessLocInv;
window.clearLocInvFilter = clearLocInvFilter;
function renderTransferLogTable(rows){
  if(!rows.length) return `<div class="empty">No transfers logged in this range.</div>`;
  return `<table><thead><tr><th>Date</th><th>Time</th><th>Material</th><th>Qty</th><th>From</th><th>To</th></tr></thead><tbody>
  ${rows.map(t=>`<tr><td>${t.date}</td><td>${timeBadge(t.date,t.time)}</td><td>${t.materialName}</td><td>${t.qty}</td><td>${t.from}</td><td>${t.to}</td></tr>`).join('')}
  </tbody></table>`;
}
function renderTransfer(el){
  el.innerHTML = `
    <h2 class="section-title">Transfer Stock Between Locations</h2>
    <div class="section-sub">Move stock from one location to another without changing total quantity.</div>
    <div class="panel">
      <form id="tr-form">
        <div class="row">
          <div class="field" style="position:relative">
            <label>Material</label>
            <input required id="t-material" autocomplete="off" placeholder="Start typing…">
            <div class="autolist" id="t-material-list"></div>
          </div>
          <div class="field"><label>From</label><select id="t-from">${DB.locations.map(l=>`<option>${l}</option>`).join('')}</select></div>
          <div class="field"><label>To</label><select id="t-to">${DB.locations.map(l=>`<option>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Quantity</label><input required id="t-qty" type="number" min="1"></div>
        </div>
        <button class="btn" type="submit">Transfer</button>
      </form>
    </div>
    ${scopedCollapsePanel('transfer-log', 'Recent transfers', DB.transfers||[], 'date', renderTransferLogTable)}
    ${renderTransferLocationInventorySearchBar()}
    ${collapsePanel('transfer-location-inventory', 'Location inventory', renderTransferLocationInventory(), `${DB.locations.length} location${DB.locations.length===1?'':'s'}`)}`;
  let picked=null;
  const input = document.getElementById('t-material');
  attachAutocomplete(input, document.getElementById('t-material-list'), ()=>DB.materials, m=>{ picked=m; input.value=m.name; });
  document.getElementById('tr-form').addEventListener('submit', async e=>{
    e.preventDefault();
    const mat = picked || DB.materials.find(m=>m.name.toLowerCase()===input.value.trim().toLowerCase());
    if(!mat){ toast('Select a valid material', true); return; }
    const from = document.getElementById('t-from').value, to = document.getElementById('t-to').value;
    const qty = Number(document.getElementById('t-qty').value);
    if(from===to){ toast('From and To must differ', true); return; }
    if(getStock(mat.id, from) < qty){ toast(`Only ${getStock(mat.id,from)} at ${from}`, true); return; }
    addStock(mat.id, from, -qty); addStock(mat.id, to, qty);
    DB.transfers = DB.transfers||[];
    DB.transfers.push({ id:uid(), date:todayStr(), time:nowTimeStr(), materialId:mat.id, materialName:mat.name, qty, from, to });
    await saveKey('stock'); await saveKey('transfers');
    toast(`Transferred ${qty} ${mat.unit} of ${mat.name}: ${from} → ${to}`);
    e.target.reset(); render();
  });
}

function renderUsage(el){
  const rows = DB.materials.map(m=>{
    const weekly = weeklyUsage(m.id);
    const stock = getStock(m.id);
    const weeksLeft = weekly>0 ? (stock/weekly) : Infinity;
    return {m, weekly, stock, weeksLeft};
  }).sort((a,b)=>a.weeksLeft-b.weeksLeft);
  el.innerHTML = `
    <h2 class="section-title">Weekly Usage Prediction</h2>
    <div class="section-sub">Based on quantity issued in the last 7 days, projects how many weeks of stock remain.</div>
    ${collapsePanel('usage-prediction', 'Usage &amp; stock outlook', `<table><thead><tr><th>Material</th><th>Current stock</th><th>Issued (last 7 days)</th><th>Weeks of stock left</th><th>Outlook</th></tr></thead><tbody>
    ${rows.length? rows.map(r=>`<tr><td>${r.m.name}</td><td>${r.stock}</td><td>${r.weekly}</td>
      <td>${r.weeksLeft===Infinity? '—' : r.weeksLeft.toFixed(1)}</td>
      <td>${r.weeksLeft===Infinity?'<span class="status-ok">No recent use</span>':r.weeksLeft<1?'<span class="status-crit">Reorder soon</span>':r.weeksLeft<2?'<span class="status-low">Watch</span>':'<span class="status-ok">Healthy</span>'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No materials yet.</td></tr>'}
    </tbody></table>`, `${rows.length} material${rows.length===1?'':'s'}`)}`;
}
function weeklyUsage(materialId){
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-7);
  return DB.issues.filter(i=> i.materialId===materialId && new Date(i.date) >= cutoff).reduce((s,i)=>s+i.qty,0);
}
function isThisWeek(dateStr){
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-7);
  return new Date(dateStr) >= cutoff;
}

function renderHistory(el){
  el.innerHTML = `
    <h2 class="section-title">Product History</h2>
    <div class="section-sub">When each material was received (gate entry) or issued.</div>
    ${collapsePanel('product-history', 'Product history log', `
      <select id="h-material" style="max-width:320px"><option value="">All materials</option>${DB.materials.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <div id="h-body" style="margin-top:12px"></div>
    `)}`;
  function paint(){
    const filter = document.getElementById('h-material').value;
    let events = [];
    DB.gateEntries.forEach(g=>{ if(!filter||g.materialId===filter) events.push({date:g.date, time:g.time, type:'Received', qty:g.qty, detail:`Challan ${g.challanNo||'—'} · ${g.supplier||'—'}`, material:g.materialName}); });
    DB.issues.forEach(i=>{ if(!filter||i.materialId===filter) events.push({date:i.date, time:i.time, type:'Issued', qty:-i.qty, detail:`${i.person} · ${i.purpose}`, material:i.materialName}); });
    events.sort((a,b)=> new Date(b.date)-new Date(a.date));
    document.getElementById('h-body').innerHTML = events.length ? `<table><thead><tr><th>Date</th><th>Time</th><th>Material</th><th>Event</th><th>Qty</th><th>Detail</th></tr></thead><tbody>
      ${events.map(e=>`<tr><td>${e.date}</td><td>${timeBadge(e.date,e.time)}</td><td>${e.material}</td><td>${e.type==='Received'?'<span class="status-ok">Received</span>':'<span class="status-low">Issued</span>'}</td><td>${e.qty>0?'+':''}${e.qty}</td><td>${e.detail}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">No history yet.</div>`;
  }
  document.getElementById('h-material').addEventListener('change', paint);
  paint();
}

