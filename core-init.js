/* Prevent a flash of the login screen on refresh: if a session was saved
   from a previous login, hide the role-select screen immediately (before
   any async config loading happens) so the page doesn't briefly show the
   login form before restoreSession() swaps it out for the app. */
(function hideLoginFlashIfSessionSaved(){
  try{
    if(sessionStorage.getItem('hlg::session')){
      const roleScreen = document.getElementById('role-screen');
      if(roleScreen) roleScreen.style.display = 'none';
    }
  }catch(e){ /* ignore (private browsing etc.) */ }
})();

/* =========================================================================
   HL GALVATECH — STOCKS AND STORE MANAGEMENT
   Single-file app. Cross-device sync via Firebase Firestore + Storage.

   ---------------------------------------------------------------------
   HOW THE BACKEND GETS CONFIGURED — no editing this file by hand needed.
   There's a hidden settings panel: on the front (login) screen, just type
   the word  adminbackend  anywhere (no input box needed — it's a secret
   keystroke trigger, nothing on screen hints at it). That opens a panel
   where you paste in your Firebase project's API Key / Auth Domain /
   Project ID / App ID / Storage Bucket (Firebase console → gear icon →
   Project settings → General → "Your apps" → Web app → the `firebaseConfig`
   object). Hitting "Save & connect" reconnects this browser immediately.
   Hitting "Download permanent file" bakes those same values directly into
   a fresh copy of this HTML file, so every other device just opens that
   file and is already connected — nobody else ever has to open the hidden
   panel or type anything in.

   These values are public identifiers, not secrets — Firebase apps are
   built to ship them in client code. Access control belongs in the
   Firestore/Storage "Rules" tabs in the Firebase console, not in hiding
   this object. A permissive starter rule for both (fine for an internal
   tool that already sits behind this app's own login screen):
     rules_version = '2';
     service cloud.firestore { match /databases/{db}/documents { match /{d=**} { allow read, write: if true; } } }
     service firebase.storage { match /b/{bucket}/o { match /{p=**} { allow read, write: if true; } } }
   ---------------------------------------------------------------------
   IMPORTANT — why "Save" can silently do nothing:
   Until a real config has been entered (via the hidden panel, or baked in
   through "Download permanent file"), Firestore is unreachable and every
   get/set call throws. The block below detects that and falls back to the
   browser's localStorage so at least this browser keeps its data across
   reloads. localStorage is per-browser, so it will NOT sync between two
   different devices/computers — real cross-device sync needs a working
   Firebase connection.
   ========================================================================= */
const FIREBASE_CONFIG_BAKED = {
  apiKey: "AIzaSyADy7yp8JY2CSwbdVzIJrST2JYZ13JgZkk",
  authDomain: "storage-4fbff.firebaseapp.com",
  projectId: "storage-4fbff",
  storageBucket: "storage-4fbff.firebasestorage.app",
  messagingSenderId: "",
  appId: "1:701688096584:web:7c6a598d43219bf39ef57d"
};
function isConfigured(cfg){
  return !!(cfg && cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY' && cfg.projectId && cfg.projectId !== 'YOUR_PROJECT');
}
function loadFirebaseConfig(){
  // A config saved through the hidden panel (localStorage) always wins over
  // the baked-in one below, so testing a new project on one device never
  // requires re-baking the file first.
  try{
    const raw = localStorage.getItem('hlg::firebaseConfig');
    if(raw){
      const saved = JSON.parse(raw);
      if(isConfigured(saved)) return Object.assign({}, FIREBASE_CONFIG_BAKED, saved);
    }
  }catch(e){ /* ignore malformed local override */ }
  return FIREBASE_CONFIG_BAKED;
}
let FIREBASE_CONFIG = loadFirebaseConfig();
// Firestore collection every DB key/config/challan-file/backup is stored under,
// as one document per key: hlg_store/{key} -> {value: "<json string>", updatedAt}
const FIRESTORE_COLLECTION = 'hlg_store';

let firebaseApp = null, firestoreDB = null, firebaseStorage = null;
// authReadyPromise resolves once Firebase Auth has either signed this browser in
// (anonymously) or given up — every Firestore/Storage call below waits on it first.
// This exists so the security rules can require `request.auth != null` (see the
// rules block in the comment at the top of this file): without ever calling
// signInAnonymously(), a stricter rule would reject every read/write from this
// app with "permission denied", even legitimate ones. Anonymous auth is a modest
// improvement, not a real access-control boundary by itself — anyone who reads
// this same client code can also call firebase.auth().signInAnonymously() with no
// credential of any kind, so it mainly stops generic scanners/tools that talk to
// Firestore's REST API directly without ever touching the Firebase SDK's auth
// flow. Real per-role protection still needs real (non-anonymous) Firebase Auth
// accounts plus rules that check custom claims — a separate, bigger change.
let authReadyPromise = Promise.resolve();
try{
  if(isConfigured(FIREBASE_CONFIG) && typeof firebase !== 'undefined'){
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDB = firebase.firestore();
    firebaseStorage = firebase.storage();
    if(firebase.auth){
      authReadyPromise = firebase.auth().signInAnonymously()
        .catch(e=>{
          // Common cause: the "Anonymous" sign-in provider hasn't been switched on
          // yet in Firebase Console → Authentication → Sign-in method. Logged (not
          // thrown) so the app still tries its Firestore calls against whatever the
          // current rules allow, rather than hanging forever on this promise.
          console.error('Anonymous sign-in failed — check Authentication → Sign-in method → Anonymous is enabled in the Firebase console.', e);
        });
    }
  }
}catch(e){ console.error('Firebase init failed', e); firestoreDB = null; firebaseStorage = null; }

const CLOUD_SYNC = !!firestoreDB;
const FirestoreStore = {
  async get(key){
    await authReadyPromise;
    const snap = await firestoreDB.collection(FIRESTORE_COLLECTION).doc(key).get();
    if(!snap.exists) return null;
    const data = snap.data();
    if(!data || data.value===undefined) return null;
    return {key, value: data.value};
  },
  async set(key, value){
    await authReadyPromise;
    await firestoreDB.collection(FIRESTORE_COLLECTION).doc(key).set({
      value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return {key, value};
  }
};
const LocalFallbackStore = {
  async get(key){
    try{
      const raw = localStorage.getItem('hlg::'+key);
      if(raw===null) return null;
      return {key, value: raw};
    }catch(e){ return null; }
  },
  async set(key, value){
    localStorage.setItem('hlg::'+key, value);
    return {key, value};
  }
};
const Persist = CLOUD_SYNC ? FirestoreStore : LocalFallbackStore;

const MATERIAL_TYPES = ['Electronic','MS','SS','Plastic','Other'];
const UNITS = ['pcs','kg','box','bundle','meter','liter','set','roll'];
const SIZE_UNITS = ['mm','inch','meter','ml','liter','gm','kg','quintal','tonne','nos','Other'];
const SO_MATERIAL_CATEGORIES = ['MS','SS','Plastic','Rubber','Other'];
/* Category select for the SO/Projects "add material" line — composition
   category (MS/SS/Plastic/Rubber/Other), independent of the general
   DB.categories rack-grouping list. "Other" reveals a free-text box. */
function soCategorySelectHTML(id){
  return `<select id="${id}">${SO_MATERIAL_CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select>`;
}

/* Reusable "predefined size unit + value" picker — used wherever a material's
   size is entered (Material master, MRF). Renders as a value box + a unit
   dropdown; picking "Other" reveals a free-text unit box. Combines to a
   single string like "10 mm" for storage, kept compatible with the plain
   text `size` field used everywhere else in the app. */
function sizePickerHTML(prefix, label){
  return `
    <div class="field"><label>${label||'Size'} — value</label><input id="${prefix}-value" type="text" placeholder="e.g. 10 or 10x20"></div>
    <div class="field"><label>${label||'Size'} — unit</label><select id="${prefix}-unit">${SIZE_UNITS.map(u=>`<option value="${u}">${u}</option>`).join('')}</select></div>
    <div class="field" id="${prefix}-other-wrap" style="display:none"><label>Unit — specify</label><input id="${prefix}-other-unit" placeholder="e.g. sq.ft"></div>`;
}
function wireSizePicker(prefix){
  const unitSel = document.getElementById(prefix+'-unit');
  const otherWrap = document.getElementById(prefix+'-other-wrap');
  unitSel.addEventListener('change', ()=>{ otherWrap.style.display = unitSel.value==='Other' ? 'flex' : 'none'; });
}
function readSizeValue(prefix){
  const valueEl = document.getElementById(prefix+'-value');
  const val = valueEl ? valueEl.value.trim() : '';
  if(!val) return '';
  const unitSel = document.getElementById(prefix+'-unit');
  let unit = unitSel ? unitSel.value : '';
  if(unit==='Other'){ unit = (document.getElementById(prefix+'-other-unit').value||'').trim() || 'unit'; }
  return `${val} ${unit}`;
}

/* Per-unit tracking codes — derived from a material's base Product Code
   (set once in the Materials master, e.g. "A0001"). Two materials can share
   the exact same name (e.g. three "Grinder" units), so a plain product code
   alone can't tell them apart once several go out together; these functions
   build a short, readable per-unit code instead: a 2-letter prefix from the
   material's name (first letter of its first word + last letter of its last
   word, lowercased — "Grinder" -> "gr") + the base Product Code + a running
   serial number, e.g. Product Code "A0001" + qty 3 -> grA0001-1, grA0001-2,
   grA0001-3. Used wherever a material is sent out in quantity (Site
   Installation, Material Repair) so identical-name items can be told apart
   at a glance. Materials with no Product Code on file simply get no codes
   (callers should fall back to manual entry in that case). */
function materialCodePrefix(name){
  const words = String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return '';
  const first = words[0], last = words[words.length-1];
  return (first[0] + last[last.length-1]).toLowerCase();
}
function materialSerialCode(m, n){
  if(!m || !m.productCode) return '';
  return `${materialCodePrefix(m.name)}${m.productCode}-${n}`;
}
function materialSerialCodesList(m, qty){
  if(!m || !m.productCode) return [];
  const n = Math.max(1, Math.floor(Number(qty)||0) || 1);
  const codes = [];
  for(let i=1;i<=n;i++) codes.push(materialSerialCode(m, i));
  return codes;
}
let DEVICE = null; // 1, 2, 3, or 'req' for a requester account
let TAB = null;
let CURRENT_ACCOUNT = null; // {id,name,username,password} — set when DEVICE==='req'

// Which approved challan's "Materials on this challan" panel is currently expanded
// (accordion — only one open at a time). Also doubles as a signal to the poll below:
// while a challan panel is open, we never let the auto-refresh replace the DOM under
// the person's hands, which is what used to make in-progress rows (esp. new-material
// details that aren't saved anywhere yet) vanish without warning.
let expandedChallanId = null;
function toggleChallanPanel(id){
  expandedChallanId = (expandedChallanId===id) ? null : id;
  render();
}
window.toggleChallanPanel = toggleChallanPanel;

// Rolling "user is actively typing somewhere in the form" timestamp — updated
// on every keystroke/selection anywhere in the app via delegated listeners
// below, so the poll can avoid re-rendering out from under the person even
// if focus briefly blips (some mobile keyboards do this on number inputs).
let lastFormInteraction = 0;
let LAST_SYNC_AT = 0; // Date.now() of the most recent successful loadAll() — used by the hidden backend panel's status line
document.addEventListener('input', ()=>{ lastFormInteraction = Date.now(); }, true);
document.addEventListener('focusin', ()=>{ lastFormInteraction = Date.now(); }, true);

let DB = {
  materials: [],       // {id,name,type,category,rack,unit,price,size,grade,poNumber,soNumber,dateAdded,trackNos}
                        // NOTE: name is NOT unique — the same name (e.g. "Bend") can have several
                        // entries with different size/grade/type to represent different variants.
  gateEntries: [],      // {id,challanNo,date,time,materialId,materialName,qty,qtyNos,supplier,vehicleNo,poNumber,soNumber,forFactoryUse}
  gateRequests: [],      // {id,challanNo,date,time,supplier,vehicleNo,poNumber,soNumber,forFactoryUse,challanFileId,challanFileName,
                          //  status:'pending'|'approved'|'rejected'|'completed', rejectReason, requestedDate, requestedTime,
                          //  approvedDate, approvedTime, rejectedDate, completedDate}
                          // Two-phase gate entry: Device 1 submits the challan header here first ('pending') — no
                          // Location field and no material lines yet. Device 2 must Approve (unlocks the Location
                          // field and "Materials on this challan" section so Device 1 can finish the entry, which
                          // then flips this to 'completed') or Reject (mandatory reason; the material is never
                          // added). While a request sits 'pending', Device 1's other nav sections are locked.
  stock: {},            // { "<materialId>|<location>": qty }
  stockNos: {},          // { "<materialId>|<location>": qty }  — parallel piece-count stock (Nos.), only used when material.trackNos
  issues: [],           // {id,materialId,materialName,person,purpose,approvedBy,qty,qtyNos,location,date,time,status,
                        //  returnedGoodQty,damagedQty,consumedQty,returnDate,soNumber,crossSO,crossSOReason}
                        //  status: 'issued' while any qty is still outstanding, 'closed' once fully
                        //  accounted for via returns/damage/consumption. Partial quantities supported —
                        //  e.g. issued 4, 3 consumed + 1 returned good is perfectly valid.
  damaged: [],          // {id,materialId,materialName,qty,date,note,location}
  thresholds: {},        // {materialId: qty}  (global, across locations combined)
  tickets: [],           // {id,type:'low-stock'|'so-mismatch'|'product-mismatch'|'stale-challan'|'material-repair',materialId,materialName,status,createdDate,lastAlertDate,alertCount,resolvedDate, requestedSO,materialSO,reason,person,issueId, site,srNo,productCode,note, gateRequestId,challanNo,approvedDate, repairId,vendorName,serialCode,requestAccountId}
                          // product-mismatch: raised from "Close Installation" on Device 2 when the material that
                          // physically came back from site doesn't match what was issued (something was swapped
                          // on site) — shows on the alert banner / Tickets tab for Device 3 (Monitoring) to review.
  contacts: [],           // {id,name,type,phone,address,category}
  contactCategories: [],  // custom "Other" category values typed by the user — remembered for future hints
  sizeOptions: ['inch','mm','foot','kg','gm'], // Gate Entry's per-line "Size" (unit) picker — grows as custom "Others" values are typed in
  sizeCodeOptions: ['A','B','1','2'],categories: ['General'],
  locations: ['Main Store'],
  soList: [],             // {id,soNumber,date,status:'open'|'completed',completedDate,locked,priority,
                            //  products:[{id,name,status:'open'|'completed',
                            //    materials:[{id,materialId,materialName,qtyNeeded,qtyFulfilled}]}]}
                            //  locked: true once the user hits "Save" — hides the add-product/add-material
                            //    forms so the SO reads as finished; "Edit" flips it back open.
                            //  priority: true lets this SO pull already-received stock away from a
                            //    non-priority SO's requirement for the same material (see pullFromOtherSO).
  excessPool: {},          // {materialId: qty} — received beyond what an SO/product needed;
                            // available to apply toward another SO's requirement without a new gate entry
  factoryUse: [],          // {id,materialId,materialName,qty,qtyNos,purpose,date,location} — internal/factory
                            // consumption (refreshments, cleaning agents, etc.) — not tied to an external SO
  customMaterialTypes: [], // custom "Other" material-type values typed by the user — remembered for future hints
  mrf: [],                 // {id,mrfNo,materialId,materialName,materialType,size,qty,requestBy,referredBy,approvedBy,date,time,status,issueId,
                            //  requestAccountId,approvalStatus,kind,rejectReason,purchasedDate,productId}
                            // Material Requisition Form — internal department request for the store to issue items.
                            // status: 'pending' (requested, material exists in stock list, not yet issued — visible to
                            // Device 1 & Device 3), 'issued' (material has actually left the store; issueId points at
                            // the DB.issues record that carries the live return/consumed/damaged status), 'rejected'
                            // (a matched requester account rejected it — never issuable/purchasable), 'awaiting-purchase-approval'
                            // (material typed on Device 2 doesn't exist in the master list yet, and "Referred by" matched
                            // an account — held here until that account approves sending it to Device 1), 'needs-purchase'
                            // (cleared for purchase — either auto, no matching account, or approved out of
                            // 'awaiting-purchase-approval' — now visible to Device 1 to buy and gate-enter),
                            // 'awaiting-stock-approval' (Device 1 has gate-entered it — held OUT of stock until the
                            // matching requester account approves it a second time), or 'stock-approved' (approved —
                            // now in stock).
                            // requestAccountId: set if "Referred by" matched a CONFIG.requesterAccounts name.
                            // approvalStatus: 'auto' (no matching account — issuable/stocked immediately, old
                            // behaviour), 'awaiting' (matched account hasn't acted yet), 'approved' (account
                            // approved), 'rejected' (account rejected).
                            // kind: 'stock-in' for a needs-purchase → gate-entry → account-approval request (see
                            // above); absent/undefined for the original issue-approval flow.
                            // rejectReason: mandatory remark the account typed when rejecting (either kind).
  transfers: [],             // {id,date,time,materialId,materialName,qty,from,to} — a stock move between two
                            // locations that doesn't change total quantity. Logged so "Transfer Stock" and
                            // "Location inventory" can both show a date/time stamp for stock movement.
  siteInstallMaterial: [],   // {id,srNo,site,issuedOn,vendorName,location,date,time,status:'open'|'closed',
                            //  closedDate,closedTime, materials:[{id,productCode,materialName,materialId,qty,
                            //  materialHealth,returnedQty,returnedHealth,productMismatch,mismatchNote}]} — "Site Installation Material" log;
                            // one entry can club several material lines together. Entered only on Device 2
                            // (Store); Device 3 (Monitoring) sees it read-only. srNo is a permanent running
                            // number assigned at entry time. A materialId line deducts stock when saved and,
                            // on "Close Installation", any returnedQty marked Good is added back to stock
                            // (Damaged goes to DB.damaged instead) — whatever isn't returned is treated as
                            // used up at the site.
  deviceAccessGrant: {status:'inactive', log:[]},
                            // Lets Device 2 (Store) temporarily take on all of Device 1's (Data Management)
                            // features — for staff-shortage cover. status: 'inactive' (normal Device 2 only),
                            // 'pending' (Device 2 asked, waiting on Device 3), 'active' (Device 3 approved —
                            // Device 2 now has full Device 1 access, incl. gate entry with no separate
                            // approval step). Turning it off is immediate, no approval needed. log: [{ts,date,
                            // time,action,detail}] — every request/approve/reject/activate/deactivate, so
                            // Device 3 always has a clear record of who did what and when.
  materialRepair: [],      // {id,groupId,materialId,materialName,qty,qtyNos,location,serialCode,vendorName,issueDate,referredBy,
                            //  requestAccountId,date,time,status:'out'|'repaired'|'scrap',returnedDate,returnedTime,
                            //  loggedBy} — material sent out to a vendor for repair. Logged only on Device 2
                            // (Store); Device 1 & Device 3 see it read-only, and the matched "Referred by"
                            // requester account sees their own under "My Requests". Sending it deducts stock
                            // immediately (it's physically off-site); marking it back "Repaired" adds the same
                            // qty back to stock, "Scrap" does not (logged to DB.damaged as a write-off instead).
                            // A daily alert stays open the entire time status==='out' — see the ticket engine.
};

const KEYS = ['materials','gateEntries','gateRequests','stock','stockNos','issues','damaged','thresholds','tickets','contacts','contactCategories','sizeOptions','sizeCodeOptions','categories','locations','soList','excessPool','factoryUse','customMaterialTypes','mrf','transfers','deviceAccessGrant','siteInstallMaterial','materialRepair'];
const CONTACT_CATEGORIES = ['Plastic','Tools','Mild Steel','Stainless Steel','Electronic'];

/* ---------------- admin config (device names, passwords, homepage link) ---------------- */
let CONFIG = {
  deviceNames: {1:'Data Management', 2:'Store Entry', 3:'Monitoring'},
  deviceUsernames: {1:'device1', 2:'device2', 3:'device3'},
  devicePasswords: {1:'device1', 2:'device2', 3:'device3'},
  deviceSecretCodes: {},  // {1:'...', 2:'...', 3:'...'} — set the first time that device changes its own
                          // password (see openChangePasswordModal); used only to recover a forgotten password.
  adminPassword: 'admin123',
  siteLink: 'https://www.hlgalvatech.com/',
  emailRecipient: '', // address pre-filled by the "Email entries" button in the Admin Panel
  requesterAccounts: []   // {id, name, username, password, secretCode?} — accounts created by the admin.
                          // Each account only ever sees MRF requests whose "Request by" text
                          // ("Referred by", typed on Device 2) matches this account's `name` — see findAccountByName.
                          // secretCode is set (like deviceSecretCodes above) the first time the account
                          // holder changes their own password.
};
async function loadConfig(){
  try{
    const res = await Persist.get('config', true);
    if(res && res.value !== undefined){
      const saved = JSON.parse(res.value);
      CONFIG = Object.assign({}, CONFIG, saved, {
        deviceNames: Object.assign({}, CONFIG.deviceNames, saved.deviceNames||{}),
        deviceUsernames: Object.assign({}, CONFIG.deviceUsernames, saved.deviceUsernames||{}),
        devicePasswords: Object.assign({}, CONFIG.devicePasswords, saved.devicePasswords||{}),
        deviceSecretCodes: Object.assign({}, CONFIG.deviceSecretCodes, saved.deviceSecretCodes||{}),
        requesterAccounts: saved.requesterAccounts || CONFIG.requesterAccounts || [],
        // A blank siteLink saved before this default existed shouldn't keep clobbering
        // the permanent default below — only an actual admin-entered value should.
        siteLink: saved.siteLink || 'https://www.hlgalvatech.com/',
        emailRecipient: saved.emailRecipient || ''
      });
    }
  }catch(e){ /* not set yet — keep defaults */ }
}
async function saveConfig(){
  try{
    await Persist.set('config', JSON.stringify(CONFIG), true);
  }catch(e){ console.error('config save failed', e); toast('Save error saving settings — try again', true); }
}
function applyConfigToRoleScreen(){
  /* login screen no longer shows per-device names/cards, so nothing to paint here —
     kept as a no-op hook in case future UI wants to surface config on that screen. */
}

/* ---------------- Firestore sync & backup (admin-only) ----------------
   Everything here lives behind the Admin Panel, which is itself gated by
   CONFIG.adminPassword (see openAdminLogin). Nothing in this block is
   reachable from Device 1/2/3 or a requester account's screens.

   "Backup" = a full snapshot of every DB[key] + CONFIG, serialized to one
   JSON blob. With Storage configured it's uploaded to
   backups/<timestamp>.json and recorded in a small Firestore index doc
   (hlg_store/backup-index) so the admin panel can list/restore past
   backups without needing Storage "list" permissions. Without Storage,
   backups can still be downloaded straight to the admin's device as a
   file, and restored the same way later — a manual, offline safety net. */
const BACKUP_INDEX_KEY = 'backup-index';
async function loadBackupIndex(){
  try{
    const res = await Persist.get(BACKUP_INDEX_KEY, true);
    if(res && res.value !== undefined) return JSON.parse(res.value);
  }catch(e){ /* none yet */ }
  return [];
}
async function saveBackupIndex(list){
  await Persist.set(BACKUP_INDEX_KEY, JSON.stringify(list), true);
}
function collectBackupPayload(){
  const snapshot = {};
  KEYS.forEach(k=>{ snapshot[k] = DB[k]; });
  return {
    exportedAt: new Date().toISOString(),
    config: CONFIG,
    db: snapshot
  };
}
async function runBackupNow(){
  const payload = collectBackupPayload();
  const json = JSON.stringify(payload);
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  if(firebaseStorage){
    try{
      await authReadyPromise;
      const blob = new Blob([json], {type:'application/json'});
      const path = `backups/backup-${stamp}.json`;
      const ref = firebaseStorage.ref().child(path);
      await ref.put(blob);
      const url = await ref.getDownloadURL();
      const index = await loadBackupIndex();
      index.unshift({id: uid(), timestamp: new Date().toISOString(), path, url, sizeKB: Math.round(json.length/1024)});
      // Keep the index itself small — cap history at 20 backups. Older
      // backup files stay in Storage untouched; only the index shrinks.
      await saveBackupIndex(index.slice(0,20));
      toast('Backup saved to Firestore/Storage');
      return true;
    }catch(e){
      console.error('cloud backup failed', e);
      toast('Cloud backup failed — downloading a local copy instead', true);
      downloadBackupFile(json, stamp);
      return false;
    }
  } else {
    toast('Storage isn\'t configured — downloading a local backup file instead');
    downloadBackupFile(json, stamp);
    return false;
  }
}
