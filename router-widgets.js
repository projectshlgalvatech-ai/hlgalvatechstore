/* =========================================================================
   RENDER ROUTER
   ========================================================================= */
function render(){
  renderAlertBanner();
  renderD1AccessBanner();
  const openTix = DB.tickets.filter(t=>t.status==='open').length;
  const navTick = document.getElementById('nav-tick');
  if(navTick){ navTick.style.display = openTix? 'inline-block':'none'; navTick.textContent = openTix; }

  const view = document.getElementById('view');
  // Device 1 is fully frozen while Device 2's access grant is active — no tab, gate
  // request, or stale click can get past this. The instant the grant goes off, the
  // next render() (buildNav's deactivate call triggers one immediately) falls through
  // to the normal router below and everything is exactly as it was.
  if(d1Frozen()){
    view.innerHTML = `<div class="panel" style="border-left:4px solid var(--amber);text-align:center;padding:40px 20px">
      <h2 class="section-title" style="margin-bottom:8px">Device 1 is temporarily locked</h2>
      <p class="hint" style="display:inline">Device 2 currently has full Device 1 access, so this device's features are switched off to avoid two devices entering data at once. This screen will unlock automatically the moment Device 2 turns Device 1 access off.</p>
    </div>`;
    return;
  }
  // Safety net: if Device 1 has a pending gate entry request, force the view back to
  // GRN even if TAB was left pointing at a now-locked section (e.g. by a stale click).
  // Only a real Device 1 login gets stuck "pending" — see buildNav's lockOtherTabs note.
  if(DEVICE===1 && (DB.gateRequests||[]).some(r=>r.status==='pending') && TAB!=='gate'){ TAB='gate'; }
  const map = {
    1: {dash:renderDash1, gate:renderGate, materials:renderMaterials1, so:renderSO1, factory:renderFactory1, mrf:renderMRF1, materialrepair:renderMaterialRepair, contacts:renderContacts, categories:renderCategories, reports:renderReports1, entries:renderEntriesHub},
    2: {dash:renderDash2, stock:renderStock2, returns:renderReturns, transfer:renderTransfer, usage:renderUsage, history:renderHistory, so:renderSO2, factory:renderFactory2, mrf:renderMRF2, materialrepair:renderMaterialRepair, sitematerial:renderSiteMaterial2, entries:renderEntriesHub,
        // Device 1's tabs, reachable under distinct ids once an access grant is
        // active (see NAV_D1_FOR_D2) — registering them here is harmless even when
        // the grant is off, since buildNav() only ever shows these buttons when it's on.
        gate:renderGate, materials:renderMaterials1, so1:renderSO1, factory1:renderFactory1, mrf1:renderMRF1, contacts:renderContacts, categories:renderCategories},
    3: {dash:renderDash3, materials:renderMaterials3, stock:renderStock3, thresholds:renderThresholds, tickets:renderTickets, so:renderSO3, factory:renderFactory3, mrf:renderMRF3, materialrepair:renderMaterialRepair, contacts:renderContacts, sitematerial:renderSiteMaterial3, reports:renderReports3, entries:renderEntriesHub},
    req: {dash:renderRequesterDash, entries:renderEntriesHub}
  };
  const navItems = navItemsFor();
  const fn = (map[DEVICE]||{})[TAB] || map[DEVICE][navItems[0][0]];
  view.innerHTML='';
  fn(view);
  normalizeFormsToOneLine(view);
  scheduleFitToViewport();
}

/* =========================================================================
   AUTO-FIT — shrinks the content area (via CSS zoom) so a screen's content
   fits the visible window without scrolling, as long as it can still stay
   reasonably readable. If content is so long that shrinking further would
   make it too small to read, it stops shrinking at MIN_ZOOM and main's own
   overflow-y:auto takes over as a fallback so nothing is ever cut off.
   ========================================================================= */
const MIN_ZOOM = 0.55;
let __fitRAF = null;
function scheduleFitToViewport(){
  if(__fitRAF) cancelAnimationFrame(__fitRAF);
  __fitRAF = requestAnimationFrame(fitToViewport);
}
function fitToViewport(){
  // Auto-shrink disabled: every screen now keeps its text at full, regular
  // size — including collapsible entries once opened, and Device 1's tabs
  // when reached via Device 2's access grant. Tall content scrolls (main
  // already has overflow-y:auto) instead of zooming the page out.
  __fitRAF = null;
  const wrap = document.getElementById('zoom-wrap');
  if(wrap) wrap.style.zoom = 1;
}
window.addEventListener('resize', scheduleFitToViewport);
if(!window.__zoomWrapObserver){
  window.__zoomWrapObserver = new MutationObserver(scheduleFitToViewport);
}

// Runtime-only UI state for the collapsing alert accordion — not persisted,
// so it resets to fully collapsed if the app reloads. Kept outside DB so it
// survives the 4s polling re-render without needing a round trip to storage.
let alertUIState = { open:false, groups:{} };
// Which category pill is active on the Stock screen — kept outside the render
// function (per device) so the 4s auto-refresh poll doesn't snap the view
// back to "All" every time it repaints.
let stockUIState = { 2:'All', 3:'All' };
function safeId(s){ return String(s).replace(/[^a-zA-Z0-9]/g,'_'); }
// How many whole days between a stored date string and today — used to surface
// "open for 3d" style urgency on alert items instead of a bare date.
function daysOpen(dateStr){
  if(!dateStr) return null;
  const d = Math.round((new Date(todayStr()) - new Date(dateStr)) / 86400000);
  return d>=0 ? d : 0;
}

function renderAlertBanner(){
  const banner = document.getElementById('alert-banner');
  if(DEVICE===1){ banner.style.display='none'; return; }
  // Requester ('req') accounts only ever see the material-repair tickets that
  // were referred to them by name — they have no visibility into low-stock,
  // mismatch, or stale-challan tickets, which are store/monitoring concerns.
  let open;
  if(DEVICE==='req'){
    if(!CURRENT_ACCOUNT){ banner.style.display='none'; return; }
    open = DB.tickets.filter(t=>t.status==='open' && t.type==='material-repair' && t.requestAccountId===CURRENT_ACCOUNT.id);
  } else {
    open = DB.tickets.filter(t=>t.status==='open');
  }
  if(!open.length){ banner.style.display='none'; return; }
  banner.style.display='block';

  // Group so a screen with e.g. 200 items / 30+ under threshold doesn't dump
  // everything on screen at once: alert button -> group (by SO, or general
  // low-stock) -> items in that group -> the specific alert detail.
  // so-mismatch and product-mismatch are treated as the more urgent ("critical") class since
  // they mean material already left the store against the wrong SO, or something different came
  // back from site than what was issued; low-stock is "warning".
  const groups = {};
  open.forEach(t=>{
    const critical = t.type==='so-mismatch' || t.type==='product-mismatch' || t.type==='stale-challan';
    const key = t.type==='so-mismatch' ? ('SO mismatch — '+m_escape(t.requestedSO||'—'))
      : t.type==='product-mismatch' ? ('Product mismatch — '+m_escape(t.site||'—'))
      : t.type==='stale-challan' ? `Approved challans awaiting re-approval (${STALE_CHALLAN_DAYS}+ days, no material added)`
      : t.type==='material-repair' ? 'Material out for repair'
      : 'Stock threshold (low stock)';
    if(!groups[key]) groups[key] = { label:key, critical, type:t.type, tickets:[] };
    groups[key].tickets.push(t);
  });
  const orderedKeys = Object.keys(groups).sort((a,b)=> (groups[b].critical - groups[a].critical));
  const critCount = open.filter(t=>t.type==='so-mismatch' || t.type==='product-mismatch' || t.type==='stale-challan').length;
  const warnCount = open.length - critCount;

  banner.innerHTML = `
    <button class="alert-toggle" type="button" onclick="toggleAlertsPanel()">
      <span class="siren">⚠</span>
      <span class="headline">
        <span class="title">${open.length} Alert${open.length===1?'':'s'} Need Attention</span>
        <span class="sub">Tap to ${alertUIState.open?'collapse':'review'} — resolves automatically once corrected</span>
      </span>
      <span class="sev-pills">
        ${critCount ? `<span class="alert-sev-pill critical">● ${critCount} CRITICAL</span>`:''}
        ${warnCount ? `<span class="alert-sev-pill warning">${warnCount} WARNING</span>`:''}
      </span>
      <span class="chev">${alertUIState.open?'▾':'▸'}</span>
    </button>
    <div class="alert-panel" style="display:${alertUIState.open?'block':'none'}">
      ${orderedKeys.map(key=>{
        const g = groups[key];
        const gid = safeId(key);
        const gState = alertUIState.groups[gid] || (alertUIState.groups[gid] = {open:false, items:{}});
        return `<div class="alert-group ${g.critical?'sev-critical':'sev-warning'}">
          <button class="alert-group-toggle" type="button" onclick="toggleAlertGroup('${gid}')">
            <span class="chev">${gState.open?'▾':'▸'}</span>
            <span class="gicon">${g.type==='product-mismatch'?'🧩':g.type==='stale-challan'?'⏳':g.type==='material-repair'?'🔧':(g.critical?'🔀':'📦')}</span> ${g.label}
            <span class="gcount">${g.tickets.length}</span>
          </button>
          <div class="alert-group-body" style="display:${gState.open?'block':'none'}">
            ${g.tickets.map(t=>{
              const itemOpen = !!gState.items[t.id];
              const age = daysOpen(t.createdDate);
              const recurring = (t.alertCount||1) > 1;
              return `<div class="alert-item">
                <button class="alert-item-toggle" type="button" onclick="toggleAlertItem('${gid}','${t.id}')">
                  <span class="chev">${itemOpen?'▾':'▸'}</span>
                  <span class="idot" style="background:${g.critical?'var(--red)':'var(--amber)'}"></span>
                  ${m_escape(t.materialName) || (t.challanNo ? `Challan ${m_escape(t.challanNo)}` : '—')}
                  <span class="imeta${recurring?' recurring':''}">${recurring?`⟳ ${t.alertCount}× · `:''}${age!==null?`open ${age}d`:''}</span>
                </button>
                <div class="alert-item-body" style="display:${itemOpen?'block':'none'}">
                  ${t.type==='so-mismatch'
                    ? `Issued against SO <b>${m_escape(t.requestedSO)||'—'}</b>, but this material is tagged to SO <b>${m_escape(t.materialSO)||'—'}</b> · issued to ${m_escape(t.person)||'—'}<br>Reason given: ${m_escape(t.reason)||'—'}`
                    : t.type==='product-mismatch'
                    ? `Returned material does not match what was issued — flagged on Sr No. <b>${t.srNo||'—'}</b> at <b>${m_escape(t.site)||'—'}</b>${t.productCode?' ('+m_escape(t.productCode)+')':''}${t.note?'<br>Note: '+m_escape(t.note):''}`
                    : t.type==='stale-challan'
                    ? `Challan <b>${m_escape(t.challanNo)||'—'}</b> was approved on <b>${t.approvedDate||'—'}</b> and still has no material added, ${STALE_CHALLAN_DAYS}+ days later — locked from further entry until re-approved.${DEVICE===3? `<br><button class="btn small" style="margin-top:8px" onclick="reapproveStaleChallan('${t.id}')">Re-approve — unlock for Device 2</button>` : '<br><span class="status-low">Only Device 3 (Monitoring) can re-approve this.</span>'}`
                    : t.type==='material-repair'
                    ? `<b>${m_escape(t.materialName)}</b> is with <b>${m_escape(t.vendorName)||'the vendor'}</b> for repair, ${age!==null?age:'—'} day(s) so far — stays open until it's marked Repaired or Scrap on Device 2's Material Repair screen.`
                    : `Stock <b>${getStock(t.materialId)}</b> ≤ threshold <b>${DB.thresholds[t.materialId]??'—'}</b> · alerted ${t.alertCount||1}× · resolves only when Device 1 restocks`}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
function toggleAlertsPanel(){ alertUIState.open = !alertUIState.open; renderAlertBanner(); }
function toggleAlertGroup(gid){
  if(!alertUIState.groups[gid]) alertUIState.groups[gid] = {open:false, items:{}};
  alertUIState.groups[gid].open = !alertUIState.groups[gid].open;
  renderAlertBanner();
}
function toggleAlertItem(gid, ticketId){
  if(!alertUIState.groups[gid]) alertUIState.groups[gid] = {open:true, items:{}};
  alertUIState.groups[gid].items[ticketId] = !alertUIState.groups[gid].items[ticketId];
  renderAlertBanner();
}

/* =========================================================================
   SHARED WIDGETS
   ========================================================================= */
function kpi(label, value, cls, target){
  let attrs = '';
  if(target){
    attrs = target.startsWith('#') ? ` onclick="scrollToAnchor('${target.slice(1)}')"` : ` onclick="jumpToTab('${target}')"`;
  }
  return `<div class="kpi ${cls||''} ${target?'clickable':''}"${attrs}><div class="v">${value}</div><div class="l">${label}</div></div>`;
}
function jumpToTab(tabId){ TAB = tabId; buildNav(); render(); }
function scrollToAnchor(id){
  // If this anchor is also a collapsible panel's id, open it first so the user
  // doesn't land on a collapsed, empty-looking section.
  panelCollapseUIState[id] = true;
  render();
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
}
window.jumpToTab = jumpToTab;
window.scrollToAnchor = scrollToAnchor;
function typeTag(t){ return `<span class="tag ${String(t||'other').toLowerCase()}">${t||'—'}</span>`; }
function stockStatus(materialId){
  const total = getStock(materialId);
  const th = DB.thresholds[materialId];
  if(th===undefined) return {label:total, cls:''};
  if(total<=th) return {label:total+' — LOW', cls: total===0?'status-crit':'status-low'};
  return {label:total, cls:'status-ok'};
}

