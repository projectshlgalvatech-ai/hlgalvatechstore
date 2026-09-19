function showModal(html, opts){
  const box = document.getElementById('modal-box');
  box.innerHTML = html;
  box.classList.toggle('wide', !!(opts && opts.wide));
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
  document.getElementById('modal-box').innerHTML = '';
  document.getElementById('modal-box').classList.remove('wide');
}

/* ---------------- unified login (front page) ---------------- */
// Every account — Device 1/2/3 and any admin-created requester account — logs in
// through the same Login ID + Password form on the front page. This checks the
// entered credentials against the three fixed devices first, then against
// CONFIG.requesterAccounts, and routes into the right dashboard.
function findAccountByUsername(username){
  const u = (username||'').trim().toLowerCase();
  if(!u) return null;
  return (CONFIG.requesterAccounts||[]).find(a=>String(a.username).toLowerCase()===u) || null;
}
function findAccountByName(name){
  const n = (name||'').trim().toLowerCase();
  if(!n) return null;
  return (CONFIG.requesterAccounts||[]).find(a=>String(a.name).trim().toLowerCase()===n) || null;
}
function attemptUnifiedLogin(username, password){
  const u = (username||'').trim();
  if(!u) return false;
  for(const n of [1,2,3]){
    if(u.toLowerCase()===String(CONFIG.deviceUsernames[n]).toLowerCase() && password===CONFIG.devicePasswords[n]){
      selectDevice(n);
      return true;
    }
  }
  const acc = findAccountByUsername(u);
  if(acc && password===acc.password){
    selectRequesterAccount(acc);
    return true;
  }
  return false;
}

/* ---------------- self-service password changes (all logged-in identities) ----------------
   Both Device 1/2/3 logins and admin-created requester accounts can change their own login
   password from inside the app (header button "Change password"). New passwords are written
   straight into CONFIG.devicePasswords / the account's `password` field — the exact same place
   the Admin Panel's own password inputs read from and write to — so the admin always sees
   whatever password is currently in effect; there's no separate/hidden password store.

   The gate on changing it yourself is a recovery code, not the old password: the first time an
   identity ever changes its password, it's asked to create one alongside the new password. Any
   change after that requires typing that same code back in — proves it's the same person without
   requiring they still remember the password they're trying to replace. If forgotten, "Forgot
   password?" on the login screen takes the Login ID + that same code and reveals the current
   password as the recovery "hint" (this app stores passwords in plain text everywhere already —
   the Admin Panel shows them the same way — so there's no hashing to make a partial hint
   meaningful; showing the actual value is the honest version of "hint" here).

   The Admin Panel's own password fields are a completely separate code path (see openAdminPanel's
   save handler) and were never routed through this recovery-code check — the admin can already
   overwrite any device's or account's password directly, with no code needed, exactly as asked. */
function getCurrentIdentity(){
  if(DEVICE===1 || DEVICE===2 || DEVICE===3){
    const n = DEVICE;
    return {
      label: CONFIG.deviceNames[n],
      getPassword: ()=>CONFIG.devicePasswords[n],
      setPassword: (p)=>{ CONFIG.devicePasswords[n]=p; },
      getSecretCode: ()=>CONFIG.deviceSecretCodes[n],
      setSecretCode: (c)=>{ CONFIG.deviceSecretCodes[n]=c; }
    };
  }
  if(DEVICE==='req' && CURRENT_ACCOUNT){
    const acc = CURRENT_ACCOUNT; // same object reference as the entry inside CONFIG.requesterAccounts
    return {
      label: acc.name,
      getPassword: ()=>acc.password,
      setPassword: (p)=>{ acc.password=p; },
      getSecretCode: ()=>acc.secretCode,
      setSecretCode: (c)=>{ acc.secretCode=c; }
    };
  }
  return null;
}
function openChangePasswordModal(){
  const identity = getCurrentIdentity();
  if(!identity){ toast('No account is logged in', true); return; }
  const hasCode = !!identity.getSecretCode();
  if(hasCode){
    showModal(`
      <h3>Change Password — ${identity.label}</h3>
      <div class="admin-note">Enter your recovery code to confirm it's you, then set a new password.</div>
      <div class="field"><label>Recovery code</label><input type="password" id="cp-code" autocomplete="off"></div>
      <div class="field"><label>New password</label><input type="password" id="cp-new" autocomplete="new-password"></div>
      <div class="field"><label>Confirm new password</label><input type="password" id="cp-confirm" autocomplete="new-password"></div>
      <div class="modal-actions">
        <button class="btn secondary" type="button" id="cp-cancel">Cancel</button>
        <button class="btn" type="button" id="cp-save">Save new password</button>
      </div>`);
    document.getElementById('cp-cancel').onclick = closeModal;
    document.getElementById('cp-save').onclick = async ()=>{
      const code = document.getElementById('cp-code').value.trim();
      const np = document.getElementById('cp-new').value;
      const cf = document.getElementById('cp-confirm').value;
      if(code !== String(identity.getSecretCode())){ toast('Incorrect recovery code', true); return; }
      if(!np){ toast('Enter a new password', true); return; }
      if(np !== cf){ toast('Passwords do not match', true); return; }
      identity.setPassword(np);
      await saveConfig();
      closeModal();
      toast('Password changed');
    };
  } else {
    showModal(`
      <h3>Change Password — ${identity.label}</h3>
      <div class="admin-note">First time changing your password — also create a recovery code. If you
      ever forget your new password, entering this same code on the login screen's "Forgot password?"
      link will remind you what it is. Only the admin can see this too (same as your password) — it's
      not shown to other crew members.</div>
      <div class="field"><label>New password</label><input type="password" id="cp-new" autocomplete="new-password"></div>
      <div class="field"><label>Confirm new password</label><input type="password" id="cp-confirm" autocomplete="new-password"></div>
      <div class="field"><label>Create a recovery code</label><input type="password" id="cp-code" autocomplete="off"></div>
      <div class="field"><label>Confirm recovery code</label><input type="password" id="cp-code-confirm" autocomplete="off"></div>
      <div class="modal-actions">
        <button class="btn secondary" type="button" id="cp-cancel">Cancel</button>
        <button class="btn" type="button" id="cp-save">Save</button>
      </div>`);
    document.getElementById('cp-cancel').onclick = closeModal;
    document.getElementById('cp-save').onclick = async ()=>{
      const np = document.getElementById('cp-new').value;
      const cf = document.getElementById('cp-confirm').value;
      const code = document.getElementById('cp-code').value.trim();
      const codeConfirm = document.getElementById('cp-code-confirm').value.trim();
      if(!np){ toast('Enter a new password', true); return; }
      if(np !== cf){ toast('Passwords do not match', true); return; }
      if(!code){ toast('Create a recovery code', true); return; }
      if(code !== codeConfirm){ toast('Recovery codes do not match', true); return; }
      identity.setPassword(np);
      identity.setSecretCode(code);
      await saveConfig();
      closeModal();
      toast('Password and recovery code saved');
    };
  }
}
window.openChangePasswordModal = openChangePasswordModal;

function openForgotPasswordModal(){
  showModal(`
    <h3>Forgot Password</h3>
    <div class="admin-note">Enter your Login ID and your recovery code to be reminded of your current
    password. Never set a recovery code? Ask the admin to reset your password instead.</div>
    <div class="field"><label>Login ID</label><input id="fp-username" autocomplete="username"></div>
    <div class="field"><label>Recovery code</label><input type="password" id="fp-code" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="fp-cancel">Cancel</button>
      <button class="btn" type="button" id="fp-submit">Show my password</button>
    </div>
    <div id="fp-result"></div>`);
  document.getElementById('fp-cancel').onclick = closeModal;
  document.getElementById('fp-submit').onclick = ()=>{
    const u = document.getElementById('fp-username').value.trim().toLowerCase();
    const code = document.getElementById('fp-code').value.trim();
    const resultEl = document.getElementById('fp-result');
    if(!u || !code){ toast('Enter your Login ID and recovery code', true); return; }
    let match = null;
    for(const n of [1,2,3]){
      if(u === String(CONFIG.deviceUsernames[n]).toLowerCase()){ match = {password: CONFIG.devicePasswords[n], code: CONFIG.deviceSecretCodes[n]}; break; }
    }
    if(!match){
      const acc = findAccountByUsername(u);
      if(acc){ match = {password: acc.password, code: acc.secretCode}; }
    }
    if(!match || !match.code || String(match.code) !== code){
      resultEl.innerHTML = `<div class="admin-note" style="color:var(--danger, #c0392b)">No match found — check the Login ID and recovery code, or ask the admin to reset your password.</div>`;
      return;
    }
    resultEl.innerHTML = `<div class="admin-note">Your current password is: <strong>${String(match.password).replace(/</g,'&lt;')}</strong></div>`;
  };
}
window.openForgotPasswordModal = openForgotPasswordModal;

/* ---------------- admin login + panel ---------------- */
function openAdminLogin(){
  showModal(`
    <h3>Admin Login</h3>
    <div class="field"><label>Admin password</label><input type="password" id="ap-input" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="ap-cancel">Cancel</button>
      <button class="btn" type="button" id="ap-submit">Login</button>
    </div>`);
  const input = document.getElementById('ap-input');
  input.focus();
  const submit = ()=>{
    if(input.value === CONFIG.adminPassword){ openAdminPanel(); }
    else { toast('Incorrect admin password', true); input.value=''; input.focus(); }
  };
  document.getElementById('ap-submit').onclick = submit;
  document.getElementById('ap-cancel').onclick = closeModal;
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
}
async function openHiddenBackendPanel(){
  const cfg = FIREBASE_CONFIG;
  const shown = (v)=> (v && !String(v).startsWith('YOUR_')) ? v : '';
  const esc = (v)=> String(v||'').replace(/"/g,'&quot;');
  showModal(`
    <h3>Backend Sync Settings</h3>
    <div class="admin-note" id="hb-status-line">Checking connection…</div>
    <div class="field"><label>API Key</label><input id="hb-apikey" value="${esc(shown(cfg.apiKey))}" placeholder="AIzaSy..."></div>
    <div class="field"><label>Auth Domain</label><input id="hb-authdomain" value="${esc(shown(cfg.authDomain))}" placeholder="your-project.firebaseapp.com"></div>
    <div class="field"><label>Project ID</label><input id="hb-projectid" value="${esc(shown(cfg.projectId))}" placeholder="your-project"></div>
    <div class="field"><label>App ID</label><input id="hb-appid" value="${esc(shown(cfg.appId))}" placeholder="1:xxxxxxxxxx:web:xxxxxxxxxxxxxxxx"></div>
    <div class="field"><label>Storage Bucket (optional — lets crew attach photos/files)</label><input id="hb-storagebucket" value="${esc(shown(cfg.storageBucket))}" placeholder="your-project.appspot.com"></div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="hb-close">Close</button>
      <button class="btn secondary" type="button" id="hb-download-btn">Download permanent file</button>
      <button class="btn" type="button" id="hb-save-btn">Save &amp; connect</button>
    </div>
    <div class="admin-note" style="margin-top:14px">"Save &amp; connect" reconnects <em>this</em> browser only (reloads the page). "Download permanent file" bakes these same values into a fresh copy of the whole app folder (zipped) — hand that zip to the rest of the crew, have them unzip it and open index.html, and they never have to open this panel or type anything; it just connects on its own.</div>

    <div class="admin-row" style="margin-top:16px">
      <h4>Backup &amp; Restore</h4>
      <div class="admin-note">
        A backup is a full snapshot of every material, stock entry, gate entry, SO, contact,
        and this settings panel, saved as one file. Restoring replaces <em>all</em> current data
        on <em>every</em> device — use it to undo a mistake or move to a fresh Firebase project.
      </div>
      <div class="row" style="align-items:flex-end;margin-top:8px">
        <div class="field" style="flex:0 0 auto"><button class="btn" type="button" id="backup-now-btn">Backup now (cloud)</button></div>
        <div class="field" style="flex:0 0 auto"><button class="btn secondary" type="button" id="backup-download-btn">Download backup file</button></div>
        <div class="field" style="flex:0 0 auto">
          <label style="display:block">Restore from a file</label>
          <input type="file" id="backup-restore-file" accept="application/json">
        </div>
      </div>
      <div class="admin-note" style="margin-top:10px"><strong>Cloud backups</strong> (newest first):</div>
      <div id="admin-backup-list">Loading…</div>
    </div>`);

  const statusLine = document.getElementById('hb-status-line');
  if(statusLine){
    if(CLOUD_SYNC){
      const agoSec = LAST_SYNC_AT ? Math.max(0, Math.round((Date.now()-LAST_SYNC_AT)/1000)) : null;
      statusLine.innerHTML = `<strong>Connected</strong> — syncing live with the rest of the crew${agoSec!==null? ` (last update ${agoSec}s ago)`:''}.`;
    } else {
      statusLine.textContent = 'Not connected — running on this browser only. Fill in the fields below and click "Save & connect".';
    }
  }
  document.getElementById('hb-close').onclick = closeModal;

  function readHiddenBackendFields(){
    return {
      apiKey: document.getElementById('hb-apikey').value.trim(),
      authDomain: document.getElementById('hb-authdomain').value.trim(),
      projectId: document.getElementById('hb-projectid').value.trim(),
      appId: document.getElementById('hb-appid').value.trim(),
      storageBucket: document.getElementById('hb-storagebucket').value.trim(),
      messagingSenderId: (cfg.messagingSenderId && !String(cfg.messagingSenderId).startsWith('YOUR_')) ? cfg.messagingSenderId : ''
    };
  }
  document.getElementById('hb-save-btn').onclick = ()=>{
    const newCfg = readHiddenBackendFields();
    if(!newCfg.apiKey || !newCfg.authDomain || !newCfg.projectId){ toast('API Key, Auth Domain and Project ID are required', true); return; }
    localStorage.setItem('hlg::firebaseConfig', JSON.stringify(newCfg));
    toast('Saved — reconnecting…');
    setTimeout(()=>location.reload(), 600);
  };
  document.getElementById('hb-download-btn').onclick = async ()=>{
    const newCfg = readHiddenBackendFields();
    if(!newCfg.apiKey || !newCfg.authDomain || !newCfg.projectId){ toast('Fill in API Key, Auth Domain and Project ID first', true); return; }
    await downloadPermanentFile(newCfg);
  };

  const backupNowBtn = document.getElementById('backup-now-btn');
  const downloadBtn = document.getElementById('backup-download-btn');
  const restoreFileInput = document.getElementById('backup-restore-file');
  const listEl = document.getElementById('admin-backup-list');
  if(backupNowBtn) backupNowBtn.onclick = async ()=>{
    backupNowBtn.disabled = true; backupNowBtn.textContent = 'Backing up…';
    await runBackupNow();
    backupNowBtn.disabled = false; backupNowBtn.textContent = 'Backup now (cloud)';
    renderBackupList();
  };
  if(downloadBtn) downloadBtn.onclick = ()=>downloadBackupFile();
  if(restoreFileInput) restoreFileInput.onchange = ()=>restoreFromLocalFile(restoreFileInput);
  async function renderBackupList(){
    if(!listEl) return;
    if(!firebaseStorage){
      listEl.innerHTML = `<div class="empty">Cloud Storage isn't configured — use "Download backup file" / "Restore from a file" instead.</div>`;
      return;
    }
    const index = await loadBackupIndex();
    if(!index.length){ listEl.innerHTML = `<div class="empty">No cloud backups yet — click "Backup now" above.</div>`; return; }
    listEl.innerHTML = index.map(b=>`
      <div class="row" style="align-items:center">
        <div class="field" style="flex:1 1 auto">${new Date(b.timestamp).toLocaleString()} <span style="color:var(--steel-500)">(${b.sizeKB} KB)</span></div>
        <div class="field" style="flex:0 0 auto"><button class="btn secondary small" type="button" onclick="restoreFromCloudBackup('${b.url.replace(/'/g,"%27")}')">Restore</button></div>
      </div>`).join('');
  }
  renderBackupList();
}
window.openHiddenBackendPanel = openHiddenBackendPanel;

/* This app is split across index.html + styles.css + several .js files that
   all sit in the same folder (see PERMANENT_FILE_MANIFEST below). Bakes a
   given Firebase config directly into a fresh copy of core-init.js (the file
   that holds the FIREBASE_CONFIG_BAKED placeholder), re-fetches every other
   file unchanged, and packages the whole set into one downloadable .zip —
   so any device that unzips it and opens index.html connects with zero
   setup, no hidden panel, no typing anything in. Works by re-fetching each
   file's own raw source (same-origin — not a cross-site request) rather
   than serializing the live, already-modified DOM. */
const PERMANENT_FILE_MANIFEST = [
  'index.html', 'styles.css',
  'core-init.js', 'admin-export.js', 'auth-session-admin.js', 'router-widgets.js',
  'device1-materials.js', 'device1-bulk-scope.js', 'device2-store.js',
  'entries-factory-site.js', 'mrf-requester-repair.js', 'device3-so-projects.js'
];
async function downloadPermanentFile(newCfg){
  try{
    if(typeof JSZip === 'undefined'){
      toast('Zip library failed to load — check your internet connection and try again.', true);
      return;
    }
    const re = /const FIREBASE_CONFIG_BAKED = \{[\s\S]*?\};/;
    const replacement = `const FIREBASE_CONFIG_BAKED = {
  apiKey: ${JSON.stringify(newCfg.apiKey||'')},
  authDomain: ${JSON.stringify(newCfg.authDomain||'')},
  projectId: ${JSON.stringify(newCfg.projectId||'')},
  storageBucket: ${JSON.stringify(newCfg.storageBucket||'')},
  messagingSenderId: ${JSON.stringify(newCfg.messagingSenderId||'')},
  appId: ${JSON.stringify(newCfg.appId||'')}
};`;
    let bakedOk = false;
    const zip = new JSZip();
    for(const filename of PERMANENT_FILE_MANIFEST){
      const fileUrl = new URL(filename, location.href).href;
      const res = await fetch(fileUrl);
      if(!res.ok) throw new Error(`Could not fetch ${filename} (${res.status})`);
      let text = await res.text();
      if(filename === 'core-init.js'){
        if(!re.test(text)){
          toast('Could not locate the config block in core-init.js to bake in — copy the values above and paste them into FIREBASE_CONFIG_BAKED near the top of that file by hand instead.', true);
          return;
        }
        text = text.replace(re, replacement);
        bakedOk = true;
      }
      zip.file(filename, text);
    }
    if(!bakedOk){
      toast('Could not locate core-init.js — copy the values above and paste them into FIREBASE_CONFIG_BAKED by hand instead.', true);
      return;
    }
    const blob = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'HL_Galvatech-synced.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    toast('Permanent file bundle downloaded — unzip it and distribute the whole folder to the crew');
  }catch(e){
    console.error('bake-in failed', e);
    toast('Could not generate the permanent file bundle automatically (this can happen when the app is opened directly from disk instead of the hosted URL). Copy the values above into FIREBASE_CONFIG_BAKED near the top of core-init.js by hand instead.', true);
  }
}
function openAdminPanel(){
  CONFIG.requesterAccounts = CONFIG.requesterAccounts || [];
  showModal(`
    <h3>Admin Panel</h3>
    <div class="field">
      <label>"HL Galvatech" link (opens in a new tab when the title on the main page is clicked)</label>
      <input id="admin-link" placeholder="https://example.com" value="${(CONFIG.siteLink||'').replace(/"/g,'&quot;')}">
    </div>
    ${[1,2,3].map(n=>`
      <div class="admin-row">
        <h4>Device ${n}</h4>
        <div class="field"><label>Name</label><input id="admin-name-${n}" value="${String(CONFIG.deviceNames[n]).replace(/"/g,'&quot;')}"></div>
        <div class="field"><label>Login ID</label><input id="admin-user-${n}" value="${String(CONFIG.deviceUsernames[n]).replace(/"/g,'&quot;')}"></div>
        <div class="field"><label>Password</label><input id="admin-pass-${n}" value="${String(CONFIG.devicePasswords[n]).replace(/"/g,'&quot;')}"></div>
      </div>`).join('')}
    <div class="admin-row">
      <h4>Requester accounts</h4>
      <div class="admin-note">Each account only sees requests logged on Device 2's Material Requisition (MRF) form whose "Referred by" text matches this account's Name exactly (not case-sensitive) — e.g. name it "Device 4" if that's what Device 2 will type in "Referred by". The account holder can then Approve or Reject that request from their own dashboard. On approval, "Request approved by" is automatically set to this account's name.</div>
      <div id="admin-accounts-list">
        ${CONFIG.requesterAccounts.length ? CONFIG.requesterAccounts.map(a=>`
        <div class="row" style="align-items:flex-end">
          <div class="field"><label>Name (must match "Referred by")</label><input id="acc-name-${a.id}" value="${String(a.name).replace(/"/g,'&quot;')}"></div>
          <div class="field"><label>Login ID</label><input id="acc-user-${a.id}" value="${String(a.username).replace(/"/g,'&quot;')}"></div>
          <div class="field"><label>Password</label><input id="acc-pass-${a.id}" value="${String(a.password).replace(/"/g,'&quot;')}"></div>
          <div class="field" style="flex:0 0 auto"><button class="btn danger small" type="button" onclick="removeAdminAccount('${a.id}')">Remove</button></div>
        </div>`).join('') : `<div class="empty">No accounts yet — add one below.</div>`}
      </div>
      <div class="row" style="align-items:flex-end;margin-top:10px">
        <div class="field"><label>Name (must match "Request by")</label><input id="acc-new-name" placeholder="e.g. Device 4"></div>
        <div class="field"><label>Login ID</label><input id="acc-new-user" placeholder="login id"></div>
        <div class="field"><label>Password</label><input id="acc-new-pass" placeholder="password"></div>
        <div class="field" style="flex:0 0 auto"><button class="btn secondary small" type="button" id="acc-add-btn">+ Add account</button></div>
      </div>
    </div>
    <div class="field">
      <label>Admin password</label>
      <input id="admin-adminpass" value="${String(CONFIG.adminPassword).replace(/"/g,'&quot;')}">
    </div>
    <div class="admin-note">Changes sync to all devices. Blank fields are left unchanged.</div>

    <div class="admin-row">
      <h4>Data export</h4>
      <div class="admin-note">Builds one Excel file with every entry ever recorded — GRN receipts, material issues, damaged/returns, factory use, transfers, material requisitions, SO/Projects and stock alerts — each on its own sheet, oldest to newest, from the very first entry up to today.</div>
      <div class="export-options">
        <div class="export-card download">
          <div class="export-card-icon">⬇</div>
          <div class="export-card-body">
            <h5>Save to this device</h5>
            <p>Downloads the Excel workbook straight to your Downloads folder — keep a local copy or move it wherever you like.</p>
            <button class="btn secondary" type="button" id="admin-save-entries-btn" onclick="exportAllEntriesToExcel()">Save entries</button>
          </div>
        </div>
        <div class="export-card email">
          <div class="export-card-icon">✉</div>
          <div class="export-card-body">
            <h5>Send by email</h5>
            <p>Downloads the same file, then opens your default email app addressed to the recipient below with the file's name in the body — browsers can't attach it for you, so drag it in from Downloads before hitting send.</p>
            <div class="field">
              <label>Email recipient</label>
              <input id="admin-email-recipient" placeholder="name@example.com" value="${String(CONFIG.emailRecipient||'').replace(/"/g,'&quot;')}">
            </div>
            <button class="btn secondary" type="button" id="admin-email-entries-btn" onclick="emailEntriesExport()">Email entries</button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn secondary" type="button" id="admin-close">Close</button>
      <button class="btn" type="button" id="admin-save">Save changes</button>
    </div>`);
  document.getElementById('admin-close').onclick = closeModal;
  document.getElementById('acc-add-btn').onclick = async ()=>{
    const name = document.getElementById('acc-new-name').value.trim();
    const username = document.getElementById('acc-new-user').value.trim();
    const password = document.getElementById('acc-new-pass').value;
    if(!name || !username || !password){ toast('Fill in name, login ID and password to add an account', true); return; }
    if(findAccountByUsername(username) || [1,2,3].some(n=>String(CONFIG.deviceUsernames[n]).toLowerCase()===username.toLowerCase())){
      toast('That login ID is already in use', true); return;
    }
    CONFIG.requesterAccounts.push({id:uid(), name, username, password});
    await saveConfig();
    toast(`Account "${name}" created`);
    openAdminPanel();
  };
  document.getElementById('admin-save').onclick = async ()=>{
    CONFIG.siteLink = document.getElementById('admin-link').value.trim();
    for(const n of [1,2,3]){
      const nameVal = document.getElementById('admin-name-'+n).value.trim();
      const userVal = document.getElementById('admin-user-'+n).value.trim();
      const passVal = document.getElementById('admin-pass-'+n).value;
      if(nameVal) CONFIG.deviceNames[n] = nameVal;
      if(userVal) CONFIG.deviceUsernames[n] = userVal;
      if(passVal) CONFIG.devicePasswords[n] = passVal;
    }
    CONFIG.requesterAccounts.forEach(a=>{
      const nameEl = document.getElementById('acc-name-'+a.id);
      const userEl = document.getElementById('acc-user-'+a.id);
      const passEl = document.getElementById('acc-pass-'+a.id);
      if(nameEl && nameEl.value.trim()) a.name = nameEl.value.trim();
      if(userEl && userEl.value.trim()) a.username = userEl.value.trim();
      if(passEl && passEl.value) a.password = passEl.value;
    });
    const newAdminPass = document.getElementById('admin-adminpass').value;
    if(newAdminPass) CONFIG.adminPassword = newAdminPass;
    const emailRecipientEl = document.getElementById('admin-email-recipient');
    if(emailRecipientEl) CONFIG.emailRecipient = emailRecipientEl.value.trim();
    await saveConfig();
    applyConfigToRoleScreen();
    toast('Admin settings saved');
    closeModal();
  };
}
async function removeAdminAccount(id){
  if(!confirm('Remove this account? Past requests logged under its name stay in the MRF history, but no one will be able to log in and approve/reject as this account any more.')) return;
  CONFIG.requesterAccounts = (CONFIG.requesterAccounts||[]).filter(a=>a.id!==id);
  await saveConfig();
  toast('Account removed');
  openAdminPanel();
}
window.removeAdminAccount = removeAdminAccount;
function handleLogoClick(){
  if(CONFIG.siteLink){ window.open(CONFIG.siteLink, '_blank', 'noopener'); }
  else { toast('No link set yet — set one in the Admin panel.'); }
}

/* ---------------- theme ---------------- */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  ['theme-toggle-role','theme-toggle-app'].forEach(id=>{
    const b = document.getElementById(id);
    if(b) b.textContent = t==='light' ? 'Dark mode' : 'Light mode';
  });
  try{ localStorage.setItem('hlg::theme', t); }catch(e){ /* ignore */ }
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'steel';
  applyTheme(current === 'light' ? 'steel' : 'light');
}
(function initTheme(){
  // Default to the clean light theme for anyone without a saved preference yet;
  // devices that already picked a theme keep whatever they last chose.
  let saved = 'light';
  try{ saved = localStorage.getItem('hlg::theme') || 'light'; }catch(e){ /* ignore */ }
  applyTheme(saved);
})();

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function nowTimeStr(){ return new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true}); }

/* ---------------- shared: clickable "time" pill shown on every logged entry,
   across Device 1 / Device 2 / Device 3, so Device 3 (Monitoring) always
   knows exactly when an entry was made. ---------------- */
function timeBadge(dateStr, timeStr){
  const safeDate = (dateStr||'').replace(/"/g,'&quot;');
  const safeTime = (timeStr||'').replace(/"/g,'&quot;');
  return `<button type="button" class="btn small secondary time-pill" onclick="showEntryTime(this)" data-date="${safeDate}" data-time="${safeTime}">${timeStr||'—'}</button>`;
}
function showEntryTime(btn){
  const d = btn.getAttribute('data-date') || 'unknown date';
  const t = btn.getAttribute('data-time') || 'unknown time';
  toast(`Entry logged on ${d} at ${t}`);
}
window.showEntryTime = showEntryTime;

/* ---------------- shared: Excel-style arrow-key navigation between the
   fields/buttons of a form, using the existing .row → .field grid layout as
   the grid coordinates. ---------------- */
function enableGridNav(formEl){
  if(!formEl || formEl.__gridNavWired) return;
  formEl.__gridNavWired = true;
  formEl.addEventListener('keydown', (e)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    const tag = e.target.tagName;
    if(tag==='TEXTAREA') return; // don't hijack multi-line text editing
    if(tag==='SELECT' && (e.key==='ArrowUp'||e.key==='ArrowDown')) return; // let native select cycle options
    if(tag==='INPUT' && e.target.type==='text' && (e.key==='ArrowLeft'||e.key==='ArrowRight')){
      // only jump cell-to-cell when caret is already at the start/end of the text
      const atStart = e.target.selectionStart===0 && e.target.selectionEnd===0;
      const atEnd = e.target.selectionStart===e.target.value.length && e.target.selectionEnd===e.target.value.length;
      if(e.key==='ArrowLeft' && !atStart) return;
      if(e.key==='ArrowRight' && !atEnd) return;
    }
    const rowEls = [...formEl.querySelectorAll('.row')];
    if(!rowEls.length && formEl.classList.contains('row')) rowEls.push(formEl); // form itself is the single row (e.g. cat-form, so-form)
    const grid = rowEls
      .map(r=>[...r.querySelectorAll('input,select,textarea,button')].filter(el=>!el.disabled && el.offsetParent!==null))
      .filter(r=>r.length);
    let ri=-1, ci=-1;
    grid.forEach((row,i)=>{ const idx=row.indexOf(e.target); if(idx>-1){ ri=i; ci=idx; } });
    if(ri===-1) return;
    let target=null;
    if(e.key==='ArrowRight') target = grid[ri][ci+1];
    else if(e.key==='ArrowLeft') target = grid[ri][ci-1];
    else if(e.key==='ArrowDown') target = grid[ri+1] && grid[ri+1][Math.min(ci, grid[ri+1].length-1)];
    else if(e.key==='ArrowUp') target = grid[ri-1] && grid[ri-1][Math.min(ci, grid[ri-1].length-1)];
    if(target){ e.preventDefault(); target.focus(); if(target.select) target.select(); }
  });
}

/* ---------------- shared: collapse every form's separate .row groups into a
   single one-line row (so a whole form sits on one line, wrapping only if the
   window is too narrow), then wire arrow-key navigation across it. Runs after
   every render() so every form on Device 1/2/3 gets this automatically — no
   render function needs to build its markup differently.
   A .row that carries its own `id` is left alone: those are rows an existing
   feature shows/hides as a whole (e.g. the "track piece count" Nos. field, or
   the cross-SO reason box) by toggling that div's own style.display, and
   merging them away would break that toggle. Anonymous .row groups (the vast
   majority — one form is one panel, and its fields belong on one line) are
   folded into the first one, in document order, so buttons and fields that
   used to be split across several stacked lines end up on that single line
   instead. Different forms are never touched by each other's pass, so one
   panel's fields never end up mixed into another panel. ---------------- */
function normalizeFormsToOneLine(root){
  root.querySelectorAll('form').forEach(form=>{
    const rows = [...form.children].filter(c=>c.tagName==='DIV' && c.classList.contains('row') && !c.id);
    if(rows.length>1){
      const primary = rows[0];
      for(let i=1;i<rows.length;i++){
        while(rows[i].firstChild) primary.appendChild(rows[i].firstChild);
        rows[i].remove();
      }
    }
    enableGridNav(form);
  });
}

/* ---------------- shared: outstanding quantity on an issue once partial
   returns / damage / consumption are taken into account. ---------------- */
function issueOutstanding(i){
  return i.qty - (i.returnedGoodQty||0) - (i.damagedQty||0) - (i.consumedQty||0);
}
function fmtDate(d){ if(!d) return '—'; return d; }
function money(n){ return '₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2}); }

/* ---------------- storage layer ---------------- */
async function loadAll(){
  for(const k of KEYS){
    try{
      const res = await Persist.get(k, true);
      if(res && res.value !== undefined){
        DB[k] = JSON.parse(res.value);
      }
    }catch(e){ /* key not found yet — keep default */ }
  }
  LAST_SYNC_AT = Date.now();
  const syncEl = document.getElementById('last-sync');
  if(syncEl) syncEl.textContent = new Date().toLocaleTimeString();
}
async function saveKey(k){
  try{
    await Persist.set(k, JSON.stringify(DB[k]), true);
  }catch(e){ console.error('storage set failed', k, e); toast('Save failed — ' + (CLOUD_SYNC? 'will retry' : 'this browser could not store data') , true); }
}

/* ---------------- Firebase Storage — large file uploads (challan photos/
   PDFs, JSON backups). Firestore documents cap out at 1MB, which a scanned
   challan or multi-page PDF can easily exceed, so any actual file bytes go
   to Cloud Storage instead; only the small resulting download URL gets
   written into Firestore/localStorage via Persist. If Storage isn't
   configured (FIREBASE_CONFIG still has placeholder values, or Firebase
   failed to load), this returns null and callers fall back to embedding a
   base64 data: URL directly — works, but stays local-only in that case
   since it then rides through the same size-limited Persist path. ------- */
async function uploadFileToStorage(file, storagePath){
  if(!firebaseStorage) return null;
  await authReadyPromise;
  const ref = firebaseStorage.ref().child(storagePath);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return {url, path: storagePath};
}
async function deleteFileFromStorage(storagePath){
  if(!firebaseStorage || !storagePath) return;
  await authReadyPromise;
  try{ await firebaseStorage.ref().child(storagePath).delete(); }catch(e){ /* already gone / never existed — ignore */ }
}

/* ---------------- session persistence (survives a page refresh) ----------------
   DEVICE/CURRENT_ACCOUNT only ever lived in memory, so pressing the browser's
   refresh button wiped them and dropped whoever was logged in back to the
   role-select screen. We now mirror the active login into sessionStorage
   (cleared when the tab/browser closes, so it isn't a permanent stay-logged-in)
   and restore it right after config loads on a fresh page load — so a refresh
   just reloads the current screen's content, not the whole login. */
function saveSession(){
  try{
    if(DEVICE==='req' && CURRENT_ACCOUNT){
      sessionStorage.setItem('hlg::session', JSON.stringify({device:'req', accountId: CURRENT_ACCOUNT.id}));
    } else if(DEVICE===1 || DEVICE===2 || DEVICE===3){
      sessionStorage.setItem('hlg::session', JSON.stringify({device: DEVICE}));
    }
  }catch(e){ /* ignore (private browsing etc.) */ }
}
function clearSession(){
  try{ sessionStorage.removeItem('hlg::session'); }catch(e){ /* ignore */ }
}
function restoreSession(){
  let saved = null;
  try{ saved = JSON.parse(sessionStorage.getItem('hlg::session')||'null'); }catch(e){ saved = null; }
  if(!saved){ showRoleScreenIfHidden(); return false; }
  if(saved.device==='req'){
    const acc = (CONFIG.requesterAccounts||[]).find(a=>a.id===saved.accountId);
    if(acc){ selectRequesterAccount(acc); return true; }
  } else if(saved.device===1 || saved.device===2 || saved.device===3){
    selectDevice(saved.device);
    return true;
  }
  clearSession();
  showRoleScreenIfHidden();
  return false;
}
// Undoes the pre-emptive hide from hideLoginFlashIfSessionSaved() in the rare
// case a saved session turns out to be invalid (e.g. account was deleted) —
// otherwise the login screen would stay hidden with nothing to replace it.
function showRoleScreenIfHidden(){
  const roleScreen = document.getElementById('role-screen');
  if(roleScreen && roleScreen.style.display==='none') roleScreen.style.display='flex';
}

/* ---------------- device select ---------------- */
function selectDevice(n){
  DEVICE = n;
  CURRENT_ACCOUNT = null;
  document.getElementById('role-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('device-tag-label').textContent = CONFIG.deviceNames[n];
  const hs = document.getElementById('header-search'); if(hs) hs.style.display='flex';
  buildNav();
  saveSession();
  init();
}
// A requester account (admin-created) — sees "My Requests" plus its own scoped
// "My Entries" log (MRF and repair items referred to it by name only).
function selectRequesterAccount(acc){
  DEVICE = 'req';
  CURRENT_ACCOUNT = acc;
  TAB = null;
  document.getElementById('role-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('device-tag-label').textContent = acc.name;
  const hs = document.getElementById('header-search'); if(hs) hs.style.display='flex';
  buildNav();
  saveSession();
  init();
}
function logoutDevice(){
  clearInterval(window.__poll);
  document.getElementById('app').style.display='none';
  document.getElementById('role-screen').style.display='flex';
  DEVICE = null;
  CURRENT_ACCOUNT = null;
  clearSession();
}

async function init(){
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if(label){
    if(CLOUD_SYNC){
      label.textContent = 'synced across devices';
    } else {
      label.textContent = 'saved to this browser only — not synced to other devices';
      if(dot) dot.style.background = 'var(--amber)';
    }
  }
  await loadAll();
  render();
  window.__poll = setInterval(async ()=>{
    // A modal (Close Installation, Change Password, etc.) can hold a direct
    // reference to an object living inside DB — e.g. openCloseInstallationModal
    // keeps `entry` from DB.siteInstallMaterial for as long as the modal is open,
    // and only writes into it when the modal's own submit button is clicked.
    // loadAll() below replaces DB[k] with brand-new objects fetched from storage,
    // which silently orphans that reference: any edits made after the swap land
    // on the orphaned object, and the eventual saveKey() then writes the fresh
    // (unedited) array straight over them — the close/edit appears to do nothing
    // and the entry looks untouched on the next render. So skip syncing from
    // storage entirely for as long as any modal is open; syncing simply resumes
    // on the next tick once it's closed. This must guard loadAll() itself, not
    // just the render() below — by the time isEditingForm/recentlyTyping were
    // being checked, DB had already been overwritten.
    const modalOpen = document.getElementById('modal-overlay').classList.contains('show');
    if(modalOpen){
      renderAlertBanner();
      const openTix = DB.tickets.filter(t=>t.status==='open').length;
      const navTick = document.getElementById('nav-tick');
      if(navTick){ navTick.style.display = openTix? 'inline-block':'none'; navTick.textContent = openTix; }
      return;
    }
    await loadAll();
    if(DEVICE!==1){ evaluateTickets(false); }
    // Don't rebuild the view while the user is actively typing/selecting in a
    // form field — a full re-render replaces the DOM and wipes out whatever
    // they've entered but not yet submitted. We check TWO signals, not just
    // current focus: some mobile numeric keypads blur/refocus the field for
    // an instant on every keystroke, which would slip past a focus-only
    // check and still wipe the field. A rolling "recently typed anywhere in
    // the form" timer catches that case too.
    const active = document.activeElement;
    const isEditingForm = active && ['INPUT','SELECT','TEXTAREA'].includes(active.tagName)
      && document.getElementById('view').contains(active);
    const recentlyTyping = (Date.now() - lastFormInteraction) < 6000;
    // An open "Materials on this challan" accordion panel can hold unsaved new-material
    // details for a while (picking Type/Category, typing Size/Grade, deciding Price…) —
    // much longer than 6s of no keystrokes. Treat it as "still editing" for as long as
    // it's open, not just while a field literally has focus, so a full re-render never
    // wipes it out from under the person.
    const gateAccordionOpen = TAB==='gate' && actingAsDevice1() && expandedChallanId!==null;
    if(!isEditingForm && !recentlyTyping && !gateAccordionOpen){
      buildNav();
      render();
    } else {
      // Still keep the alert banner / ticket badge fresh without touching the form DOM.
      renderAlertBanner();
      const openTix = DB.tickets.filter(t=>t.status==='open').length;
      const navTick = document.getElementById('nav-tick');
      if(navTick){ navTick.style.display = openTix? 'inline-block':'none'; navTick.textContent = openTix; }
    }
  }, 4000);
}

/* ---------------- Device 2 → Device 1 access grant ----------------
   Covers a staff shortage: Device 2 (Store) can take on all of Device 1's
   (Data Management) features, including gate entry with no separate approval
   step (since Device 2 would otherwise just be approving itself). Turning it
   ON needs Device 3 (Monitoring) to approve the request first; turning it OFF
   is immediate, no approval needed, and the workflow returns to normal right
   away. Every request/approve/reject/activate/deactivate — and every gate
   entry made while it's active — is timestamped so Device 3 always has a
   clear record of who did what and when. */
function grantLog(action, detail){
  DB.deviceAccessGrant = DB.deviceAccessGrant || {status:'inactive', log:[]};
  DB.deviceAccessGrant.log = DB.deviceAccessGrant.log || [];
  DB.deviceAccessGrant.log.unshift({ts:Date.now(), date:todayStr(), time:nowTimeStr(), action, detail: detail||''});
}
// True while Device 2 has an approved Device 1 access grant active — Device 2 then
// gets Device 1's screens ADDED alongside its own (not swapped out), so both sets of
// features are usable at the same time from the one login.
function hasD1Grant(){
  return DEVICE===2 && DB.deviceAccessGrant && DB.deviceAccessGrant.status==='active';
}
// True wherever a feature should behave as Device 1 would — either because this
// really is Device 1, or because Device 2's access grant is currently active.
function actingAsDevice1(){
  return DEVICE===1 || hasD1Grant();
}
// True only on a real Device 1 login while Device 2's access grant is active — this
// is when Device 1 itself must be fully locked out (no tabs, no actions) so the two
// devices are never both acting on the same data at once. False the instant the
// grant is switched off, at which point Device 1 returns to normal immediately.
function d1Frozen(){
  return DEVICE===1 && DB.deviceAccessGrant && DB.deviceAccessGrant.status==='active';
}
async function requestDevice1Access(){
  if(DEVICE!==2) return;
  const g = DB.deviceAccessGrant = DB.deviceAccessGrant || {status:'inactive', log:[]};
  if(g.status==='pending' || g.status==='active') return;
  g.status = 'pending';
  grantLog('requested', 'Device 2 requested Device 1 access');
  await saveKey('deviceAccessGrant');
  toast('Request sent to Device 3 — the button activates once approved');
  render();
}
async function cancelDevice1AccessRequest(){
  if(DEVICE!==2) return;
  const g = DB.deviceAccessGrant;
  if(!g || g.status!=='pending') return;
  g.status = 'inactive';
  grantLog('cancelled', 'Device 2 cancelled its own pending request');
  await saveKey('deviceAccessGrant');
  render();
}
async function deactivateDevice1Access(){
  if(DEVICE!==2) return;
  const g = DB.deviceAccessGrant;
  if(!g || g.status!=='active') return;
  if(!confirm('Turn off Device 1 access?\n\nAll Device 1 features will be removed immediately and the store workflow returns to normal.')) return;
  g.status = 'inactive';
  grantLog('deactivated', 'Device 2 switched Device 1 access off');
  await saveKey('deviceAccessGrant');
  TAB = null;
  buildNav(); render();
}
async function approveDevice1Access(){
  if(DEVICE!==3) return;
  const g = DB.deviceAccessGrant;
  if(!g || g.status!=='pending') return;
  g.status = 'active';
  grantLog('approved', 'Device 3 approved — Device 1 access is now active on Device 2');
  await saveKey('deviceAccessGrant');
  toast('Device 1 access approved for Device 2');
  render();
}
async function rejectDevice1Access(){
  if(DEVICE!==3) return;
  const g = DB.deviceAccessGrant;
  if(!g || g.status!=='pending') return;
  const reason = prompt('Reason for rejecting this request (kept in the log):','');
  if(reason===null) return;
  g.status = 'inactive';
  grantLog('rejected', reason? ('Device 3 rejected — '+reason) : 'Device 3 rejected the request');
  await saveKey('deviceAccessGrant');
  toast('Request rejected');
  render();
}
window.requestDevice1Access = requestDevice1Access;
window.cancelDevice1AccessRequest = cancelDevice1AccessRequest;
window.deactivateDevice1Access = deactivateDevice1Access;
window.approveDevice1Access = approveDevice1Access;
window.rejectDevice1Access = rejectDevice1Access;
function renderD1AccessBanner(){
  const el = document.getElementById('d1-access-banner');
  if(!el) return;
  const g = DB.deviceAccessGrant || {status:'inactive', log:[]};
  const logRows = (g.log||[]).slice(0,8).map(l=>`<tr><td>${l.date} ${l.time}</td><td style="text-transform:capitalize">${l.action}</td><td>${l.detail||'—'}</td></tr>`).join('');
  if(DEVICE===2){
    // Shown on Device 2's own Dashboard tab only, not repeated across every other tab.
    if(TAB!=='dash'){ el.innerHTML=''; return; }
    if(g.status==='active'){
      el.innerHTML = `<div class="panel" style="border-left:4px solid var(--green);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><strong>Device 1 access: ON</strong></div>
        <button class="btn small secondary" onclick="deactivateDevice1Access()">Turn off Device 1 access</button>
      </div>`;
    } else if(g.status==='pending'){
      el.innerHTML = `<div class="panel" style="border-left:4px solid var(--amber);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><strong>Device 1 access: awaiting Device 3 approval</strong></div>
        <button class="btn small secondary" onclick="cancelDevice1AccessRequest()">Cancel request</button>
      </div>`;
    } else {
      el.innerHTML = `<div class="panel" style="border-left:4px solid var(--steel-300);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><strong>Device 1 access: OFF</strong></div>
        <button class="btn small" onclick="requestDevice1Access()">Request Device 1 access</button>
      </div>`;
    }
    return;
  }
  if(DEVICE===3){
    // Just a reminder banner for Device 3 — shown on the Dashboard tab only, not
    // repeated across every other tab — and collapsed into a tap-to-open panel,
    // same accordion pattern as the rest of the app's collapsible lists.
    if(TAB!=='dash'){ el.innerHTML=''; return; }
    const panelId = 'd1-access-alert';
    const open = !!panelCollapseUIState[panelId];
    const chev = `<span class="chev">${open?'▾':'▸'}</span>`;
    if(g.status==='pending'){
      el.innerHTML = `<div class="panel" style="border-left:4px solid var(--amber);margin-bottom:14px">
        <button type="button" class="panel-toggle" onclick="toggleCollapsePanel('${panelId}')">${chev} Device 2 is requesting Device 1 access</button>
        <div style="display:${open?'block':'none'}">
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn small" onclick="approveDevice1Access()">Approve</button>
            <button class="btn small secondary" onclick="rejectDevice1Access()">Reject</button>
          </div>
          ${logRows? `<table style="margin-top:12px"><thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead><tbody>${logRows}</tbody></table>` : ''}
        </div>
      </div>`;
    } else if(g.status==='active'){
      el.innerHTML = `<div class="panel" style="border-left:4px solid var(--green);margin-bottom:14px">
        <button type="button" class="panel-toggle" onclick="toggleCollapsePanel('${panelId}')">${chev} Device 2 currently has Device 1 access active</button>
        <div style="display:${open?'block':'none'}">
          ${logRows? `<table style="margin-top:12px"><thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead><tbody>${logRows}</tbody></table>` : ''}
        </div>
      </div>`;
    } else if(logRows){
      el.innerHTML = `<div class="panel" style="margin-bottom:14px">
        <button type="button" class="panel-toggle" onclick="toggleCollapsePanel('${panelId}')">${chev} Device 1 access — recent activity</button>
        <div style="display:${open?'block':'none'}">
          <table style="margin-top:8px"><thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead><tbody>${logRows}</tbody></table>
        </div>
      </div>`;
    } else {
      el.innerHTML = '';
    }
    return;
  }
  if(DEVICE===1){
    el.innerHTML = g.status==='active'
      ? `<div class="panel" style="border-left:4px solid var(--amber);margin-bottom:14px"><strong>Locked:</strong> <span class="hint" style="display:inline">Device 2 currently has full Device 1 access (approved by Device 3), so this device's features are switched off until Device 2 turns it off.</span></div>`
      : '';
    return;
  }
  el.innerHTML = '';
}

/* ---------------- nav ---------------- */
const NAV = {
  1: [['gate','GRN'],['materials','Materials'],['so','SO / Projects'],['factory','Factory Use'],['mrf','Material Request'],['materialrepair','Material Repair'],['contacts','Customers & Suppliers'],['categories','Categories & Locations'],['entries','All Entries']],
  2: [['dash','Dashboard'],['stock','Stock'],['returns','Returns & Damaged'],['transfer','Transfer Stock'],['usage','Usage Prediction'],['history','Product History'],['so','SO Status'],['factory','Factory Use'],['mrf','Material Requisition (MRF)'],['materialrepair','Material Repair'],['sitematerial','Site Installation Material'],['entries','All Entries']],
  3: [['dash','Dashboard'],['materials','Materials'],['stock','Stock — All Locations'],['thresholds','Thresholds'],['tickets','Tickets'],['so','SO Status'],['factory','Factory Use'],['mrf','Material Request'],['materialrepair','Material Repair'],['contacts','Customers & Suppliers'],['sitematerial','Site Installation Material'],['reports','Reports'],['entries','All Entries']],
  req: [['dash','My Requests'],['entries','My Entries']]
};
// Device 1's tabs, ADDED onto Device 2's own nav while an access grant is active — so
// Device 2 keeps every one of its normal buttons and gains Device 1's on top, usable at
// the same time. Ids are kept distinct from Device 2's own so/factory/mrf/entries tabs
// (suffixed "1") so neither set overwrites the other; only "gate", "materials",
// "contacts" and "categories" are unique to Device 1 already.
const NAV_D1_FOR_D2 = [['gate','GRN (Device 1)'],['materials','Materials (Device 1)'],['so1','SO / Projects (Device 1)'],['factory1','Factory Use (Device 1)'],['mrf1','Material Request (Device 1)'],['contacts','Customers & Suppliers (Device 1)'],['categories','Categories & Locations (Device 1)']];
function navItemsFor(){
  return (DEVICE===2 && hasD1Grant()) ? NAV[2].concat(NAV_D1_FOR_D2) : NAV[DEVICE];
}
// Tracks whether the nav was last built with the grant on or off, so switching it
// resets TAB cleanly to the first tab instead of leaving it pointed at a tab id that
// isn't in the current set (harmless either way, since render() falls back safely, but
// this keeps the nav's "active" highlight accurate).
let lastNavGrantState = null;
// Runtime-only (not persisted) — whether the "Device 1 Access" group in Device
// 2's nav is expanded. Resets to collapsed on reload, same as alertUIState.
let navD1GroupOpen = false;
function buildNav(){
  const nav = document.getElementById('side-nav');
  nav.innerHTML = '';
  const grantOn = hasD1Grant();
  if(grantOn !== lastNavGrantState){ TAB = null; lastNavGrantState = grantOn; navD1GroupOpen = false; }
  // While Device 1 has a gate entry request sitting with Device 2 for approval, every
  // other section is locked — only GRN stays open — so a fresh material can't slip in
  // through another screen before the request is resolved. Only applies to a real
  // Device 1 login — Device 2's own gate entries (made directly, with or without an
  // active grant) never sit "pending", so this never locks Device 2's own screens.
  const frozen = d1Frozen();
  const lockOtherTabs = !frozen && DEVICE===1 && (DB.gateRequests||[]).some(r=>r.status==='pending');
  if(lockOtherTabs && TAB!=='gate'){ TAB='gate'; }
  const d1TabIds = NAV_D1_FOR_D2.map(([id])=>id);
  const isGrouped = DEVICE===2 && grantOn;
  // Device 2's own tabs first — grouping only affects the Device 1 tabs appended below.
  const ownItems = isGrouped ? NAV[2] : navItemsFor();
  // If a Device 1 tab is the current one (e.g. reopened mid-session), keep its group open.
  if(isGrouped && d1TabIds.includes(TAB)) navD1GroupOpen = true;
  const renderBtn = (id,label)=>{
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.tab = id;
    if(id==='tickets'){ b.innerHTML = label+' <span class="tick" id="nav-tick" style="display:none">0</span>'; }
    if(frozen){
      b.disabled = true;
      b.style.opacity = '0.4';
      b.style.cursor = 'not-allowed';
      b.title = 'Locked while Device 2 has Device 1 access active';
    } else if(lockOtherTabs && id!=='gate'){
      b.disabled = true;
      b.style.opacity = '0.4';
      b.style.cursor = 'not-allowed';
      b.title = 'Locked until Device 2 approves the pending gate entry request';
    } else {
      b.onclick = ()=>{ TAB=id; buildNav(); render(); };
    }
    if(TAB===id) b.classList.add('active');
    nav.appendChild(b);
    return b;
  };
  ownItems.forEach(([id,label],i)=>{
    if(i===0 && !TAB) TAB=id;
    renderBtn(id,label);
  });
  if(!isGrouped) return;
  const groupBtn = document.createElement('button');
  groupBtn.className = 'nav-group-toggle'+(navD1GroupOpen?' open':'');
  groupBtn.innerHTML = `<span class="chev">${navD1GroupOpen?'▾':'▸'}</span><span>Device 1 Access</span>`;
  groupBtn.onclick = ()=>{ navD1GroupOpen = !navD1GroupOpen; buildNav(); };
  nav.appendChild(groupBtn);
  const groupWrap = document.createElement('div');
  groupWrap.className = 'nav-group-items'+(navD1GroupOpen?' open':'');
  nav.appendChild(groupWrap);
  NAV_D1_FOR_D2.forEach(([id,label])=>{
    const b = document.createElement('button');
    b.textContent = label.replace(' (Device 1)','');
    b.dataset.tab = id;
    if(frozen){
      b.disabled = true; b.style.opacity='0.4'; b.style.cursor='not-allowed';
      b.title = 'Locked while Device 2 has Device 1 access active';
    } else if(lockOtherTabs && id!=='gate'){
      b.disabled = true; b.style.opacity='0.4'; b.style.cursor='not-allowed';
      b.title = 'Locked until Device 2 approves the pending gate entry request';
    } else {
      b.onclick = ()=>{ TAB=id; buildNav(); render(); };
    }
    if(TAB===id) b.classList.add('active');
    groupWrap.appendChild(b);
  });
}

/* ---------------- toast ---------------- */
function toast(msg, critical){
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = 'toast'+(critical?' crit':'');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(), 5000);
}

/* ---------------- helpers: stock ---------------- */
function stockKey(materialId, location){ return materialId+'|'+location; }
function getStock(materialId, location){
  if(location){ return DB.stock[stockKey(materialId,location)]||0; }
  // total across all locations
  let total=0;
  for(const k in DB.stock){ if(k.startsWith(materialId+'|')) total+=DB.stock[k]; }
  return total;
}
function addStock(materialId, location, delta){
  const k = stockKey(materialId, location);
  DB.stock[k] = (DB.stock[k]||0) + delta;
  if(DB.stock[k] < 0) DB.stock[k]=0;
}
function materialById(id){ return DB.materials.find(m=>m.id===id); }

/* ---------------- helpers: Nos. (piece-count) stock ---------------- */
function stockNosKey(materialId, location){ return materialId+'|'+location; }
function getStockNos(materialId, location){
  if(!DB.stockNos) DB.stockNos = {};
  if(location){ return DB.stockNos[stockNosKey(materialId,location)]||0; }
  let total=0;
  for(const k in DB.stockNos){ if(k.startsWith(materialId+'|')) total+=DB.stockNos[k]; }
  return total;
}
function addStockNos(materialId, location, delta){
  if(!DB.stockNos) DB.stockNos = {};
  const k = stockNosKey(materialId, location);
  DB.stockNos[k] = (DB.stockNos[k]||0) + delta;
  if(DB.stockNos[k] < 0) DB.stockNos[k]=0;
}

/* ---------------- SO / Product / Material BOM helpers ---------------- */
function findSO(soId){ return DB.soList.find(s=>s.id===soId); }
function findSOByNumber(num){
  if(!num) return null;
  const n = num.trim().toLowerCase();
  return DB.soList.find(s=>s.soNumber.trim().toLowerCase()===n);
}
function checkProductCompletion(product){
  product.status = product.materials.length && product.materials.every(r=>r.qtyFulfilled >= r.qtyNeeded) ? 'completed' : 'open';
}
function checkSOCompletion(so){
  so.products.forEach(checkProductCompletion);
  const nowComplete = so.products.length>0 && so.products.every(p=>p.status==='completed');
  // Marking an SO complete can still happen automatically once every product's materials
  // are fully received. Un-marking it, however, is a deliberate call — only Device 3's
  // "Mark Incomplete" button (toggleSOManualStatus) may reopen a completed SO from here on.
  if(nowComplete && so.status!=='completed'){ so.status='completed'; so.completedDate = todayStr(); }
}
// Applies a received quantity of a material toward a specific SO+Product requirement.
// Whatever is beyond what that requirement still needs is banked into the excess pool
// (bookkeeping only — the physical unit was already added to real stock by the caller)
// so it can be applied to a different SO's requirement later instead of over-ordering.
function applyReceiptToRequirement(soId, productId, materialId, qtyReceived){
  const so = findSO(soId); if(!so) return 0;
  const product = so.products.find(p=>p.id===productId); if(!product) return 0;
  const req = product.materials.find(r=>r.materialId===materialId);
  if(!req){ DB.excessPool[materialId] = (DB.excessPool[materialId]||0) + qtyReceived; return qtyReceived; }
  const remaining = Math.max(0, req.qtyNeeded - req.qtyFulfilled);
  const applied = Math.min(remaining, qtyReceived);
  req.qtyFulfilled += applied;
  const excess = qtyReceived - applied;
  if(excess>0){ DB.excessPool[materialId] = (DB.excessPool[materialId]||0) + excess; }
  checkSOCompletion(so);
  return excess;
}
// Allocate stock already sitting in the excess pool toward a requirement, with no new gate entry.
function applyExcessToRequirement(soId, productId, materialId, qty){
  const so = findSO(soId); if(!so) return false;
  const product = so.products.find(p=>p.id===productId); if(!product) return false;
  const req = product.materials.find(r=>r.materialId===materialId); if(!req) return false;
  const available = DB.excessPool[materialId]||0;
  const remaining = Math.max(0, req.qtyNeeded - req.qtyFulfilled);
  const applied = Math.min(available, remaining, qty);
  if(applied<=0) return false;
  DB.excessPool[materialId] = available - applied;
  req.qtyFulfilled += applied;
  checkSOCompletion(so);
  return true;
}

// Called when material is issued against a specific SO number (Device 2, Issue Material).
// Debits the issued quantity off that SO's received/fulfilled tally for the matching
// material, across whichever product(s) under that SO carry it — oldest-listed product
// first. This keeps "qtyFulfilled" meaning "currently available toward this SO" rather
// than a cumulative received total, mirroring how gate entry credits it on receipt.
function debitSOForIssue(soNumber, materialId, qty){
  const so = findSOByNumber(soNumber); if(!so) return 0;
  let remaining = qty;
  so.products.forEach(p=>{
    p.materials.forEach(r=>{
      if(remaining<=0 || r.materialId!==materialId || r.qtyFulfilled<=0) return;
      const take = Math.min(r.qtyFulfilled, remaining);
      r.qtyFulfilled -= take;
      remaining -= take;
    });
  });
  checkSOCompletion(so);
  return qty - remaining; // amount actually debited
}
// How much of a material is currently sitting "received" (qtyFulfilled) against OTHER,
// non-priority SOs' requirements — available for a priority SO to pull in instead of
// waiting on a fresh gate entry. Only counts material that donor requirement doesn't
// itself need to stay above zero remaining... actually it's fine for the donor to go
// back into shortfall; the point of Priority is that this project jumps the queue.
function otherSOAvailable(soId, materialId){
  let total = 0;
  DB.soList.forEach(s=>{
    if(s.id===soId || s.priority) return; // don't rob another priority SO
    s.products.forEach(p=>{
      p.materials.forEach(r=>{ if(r.materialId===materialId && r.qtyFulfilled>0) total += r.qtyFulfilled; });
    });
  });
  return total;
}
// Reassigns already-received quantity of a material from other non-priority SOs'
// requirements to a priority SO's requirement. No physical stock moves (the material
// was already received into the store) — this only changes which SO's paperwork it
// counts against, letting a prioritised project claim material earmarked elsewhere.
function pullFromOtherSO(soId, pid, materialId, qty){
  const so = findSO(soId); if(!so || !so.priority) return false;
  const product = so.products.find(p=>p.id===pid); if(!product) return false;
  const req = product.materials.find(r=>r.materialId===materialId); if(!req) return false;
  let remainingToPull = Math.min(qty, Math.max(0, req.qtyNeeded - req.qtyFulfilled));
  if(remainingToPull<=0) return false;
  for(const s of DB.soList){
    if(remainingToPull<=0) break;
    if(s.id===soId || s.priority) continue;
    for(const p of s.products){
      if(remainingToPull<=0) break;
      for(const r of p.materials){
        if(remainingToPull<=0) break;
        if(r.materialId!==materialId || r.qtyFulfilled<=0) continue;
        const take = Math.min(r.qtyFulfilled, remainingToPull);
        r.qtyFulfilled -= take;
        req.qtyFulfilled += take;
        remainingToPull -= take;
        checkSOCompletion(s);
      }
    }
  }
  checkSOCompletion(so);
  return true;
}

/* ---------------- ticket engine ---------------- */
// openCheck: called after any stock decrease or threshold change — opens tickets if <= threshold
function openCheckFor(materialId){
  const th = DB.thresholds[materialId];
  if(th===undefined || th===null) return;
  const total = getStock(materialId);
  const existing = DB.tickets.find(t=>t.materialId===materialId && t.status==='open' && (t.type===undefined || t.type==='low-stock'));
  if(total <= th){
    if(!existing){
      const mat = materialById(materialId);
      DB.tickets.push({id:uid(), type:'low-stock', materialId, materialName: mat?mat.name:'Unknown', status:'open',
        createdDate: todayStr(), lastAlertDate: todayStr(), alertCount:1, resolvedDate:null, thresholdAtOpen: th});
    }
  }
}
// resolveCheck: called ONLY when Device 1 enters new stock (gate entry) — resolves ticket if now above threshold
function resolveCheckFor(materialId){
  const th = DB.thresholds[materialId];
  const total = getStock(materialId);
  const open = DB.tickets.find(t=>t.materialId===materialId && t.status==='open' && (t.type===undefined || t.type==='low-stock'));
  if(open && th!==undefined && total > th){
    open.status='resolved';
    open.resolvedDate = todayStr();
  }
}
// openSOMismatchTicket: called when Device 2 issues material against a different SO than the
// one the material is tagged with — this is treated the same as an understock condition
// (shows on the alert banner / Device 3) until someone resolves it with an explanation.
function openSOMismatchTicket({materialId, materialName, requestedSO, materialSO, reason, person, issueId}){
  DB.tickets.push({id:uid(), type:'so-mismatch', materialId, materialName, status:'open',
    createdDate: todayStr(), lastAlertDate: todayStr(), alertCount:1, resolvedDate:null,
    requestedSO, materialSO, reason, person, issueId});
}
async function resolveSOMismatch(ticketId){
  const t = DB.tickets.find(x=>x.id===ticketId && x.type==='so-mismatch');
  if(!t) return;
  t.status='resolved'; t.resolvedDate = todayStr();
  await saveKey('tickets');
  toast('SO-mismatch alert resolved');
  render();
}
// openProductMismatchTicket: called when Device 2 flags "Product Mismatch" while closing a site
// installation — the material physically returned from site doesn't match what was issued (i.e.
// it was swapped for something else on site). Treated as critical, same as SO-mismatch, so it
// surfaces on the alert banner and Tickets tab for Device 3 (Monitoring) to review and highlight.
function openProductMismatchTicket({materialId, materialName, site, srNo, productCode, note}){
  DB.tickets.push({id:uid(), type:'product-mismatch', materialId, materialName, status:'open',
    createdDate: todayStr(), lastAlertDate: todayStr(), alertCount:1, resolvedDate:null,
    site, srNo, productCode, note});
}
async function resolveProductMismatch(ticketId){
  const t = DB.tickets.find(x=>x.id===ticketId && x.type==='product-mismatch');
  if(!t) return;
  t.status='resolved'; t.resolvedDate = todayStr();
  await saveKey('tickets');
  toast('Product-mismatch alert resolved');
  render();
}
// daily alert sweep — bump lastAlertDate/alertCount for tickets still open, once per day
// A challan that's been approved for a while with no material ever added against it is
// a real risk (Store may have simply forgotten it) — so after a week it gets locked and
// flagged to Device 3 (Monitoring) instead of sitting open to Device 2 indefinitely.
// The reference date restarts from a Device 3 re-approval, not the original approval,
// so once cleared it gets another full week before flagging again.
const STALE_CHALLAN_DAYS = 7;
function staleReferenceDate(req){ return req.reapprovedDate || req.approvedDate || req.date; }
function isChallanStale(req){
  if(!req || req.status!=='approved') return false;
  return daysSinceToday(staleReferenceDate(req)) >= STALE_CHALLAN_DAYS;
}
function openStaleChallanTicket(req){
  const existing = DB.tickets.find(t=>t.type==='stale-challan' && t.gateRequestId===req.id && t.status==='open');
  if(existing) return;
  DB.tickets.push({id:uid(), type:'stale-challan', gateRequestId: req.id, challanNo: req.challanNo,
    status:'open', createdDate: todayStr(), lastAlertDate: todayStr(), alertCount:1, resolvedDate:null,
    approvedDate: req.approvedDate||req.date});
}
// Only Device 3 (Monitoring) can clear this — unlocks the challan for Device 2 to add
// materials again, and gives it a fresh week before it can flag as stale again.
async function reapproveStaleChallan(ticketId){
  if(DEVICE!==3){ toast('Only Device 3 (Monitoring) can re-approve a flagged challan.', true); return; }
  const t = DB.tickets.find(x=>x.id===ticketId && x.type==='stale-challan');
  if(!t) return;
  const req = (DB.gateRequests||[]).find(r=>r.id===t.gateRequestId);
  if(!req){ toast('That gate request no longer exists.', true); return; }
  req.reapprovedDate = todayStr();
  t.status='resolved'; t.resolvedDate = todayStr();
  await saveKey('gateRequests'); await saveKey('tickets');
  toast(`Challan ${req.challanNo} re-approved — Device 2 can add materials to it again`);
  render();
}
window.reapproveStaleChallan = reapproveStaleChallan;
// Same action, but reachable straight from the locked challan panel (Device 3 might
// open it directly rather than going through the alert banner first).
async function reapproveStaleChallanByReqId(reqId){
  if(DEVICE!==3){ toast('Only Device 3 (Monitoring) can re-approve a flagged challan.', true); return; }
  const t = DB.tickets.find(x=>x.type==='stale-challan' && x.status==='open' && x.gateRequestId===reqId);
  if(t){ await reapproveStaleChallan(t.id); return; }
  // No open ticket found (edge case — e.g. it hasn't been swept yet this session) —
  // unlock the challan directly instead of leaving Device 3 stuck with no button that works.
  const req = (DB.gateRequests||[]).find(r=>r.id===reqId);
  if(!req){ toast('That gate request no longer exists.', true); return; }
  req.reapprovedDate = todayStr();
  await saveKey('gateRequests');
  toast(`Challan ${req.challanNo} re-approved — Device 2 can add materials to it again`);
  render();
}
window.reapproveStaleChallanByReqId = reapproveStaleChallanByReqId;

/* ---------------- material repair ticket helpers ---------------- */
// One open ticket per repair record for as long as it's out with the vendor —
// opened the moment it's logged (unlike stale-challan, we know exactly when this
// starts, no periodic scan needed), resolved the instant it's marked back
// Repaired or Scrap. The generic daily-bump loop in evaluateTickets already keeps
// re-alerting it every day it stays open, for free.
function openMaterialRepairTicket(rep){
  DB.tickets.push({id:uid(), type:'material-repair', repairId: rep.id, materialId: rep.materialId,
    materialName: rep.materialName, vendorName: rep.vendorName, serialCode: rep.serialCode||'',
    requestAccountId: rep.requestAccountId||null, status:'open',
    createdDate: todayStr(), lastAlertDate: todayStr(), alertCount:1, resolvedDate:null});
}
function resolveMaterialRepairTicket(repairId){
  const t = DB.tickets.find(x=>x.type==='material-repair' && x.repairId===repairId && x.status==='open');
  if(t){ t.status='resolved'; t.resolvedDate=todayStr(); }
}
function evaluateTickets(persist){
  let dailyBumpChanged=false, staleChanged=false;
  // Scan approved gate requests for staleness first, so a freshly-crossed-the-week
  // challan gets its ticket opened in the same sweep that bumps everyone else's age.
  (DB.gateRequests||[]).forEach(req=>{
    if(isChallanStale(req)){
      const before = DB.tickets.length;
      openStaleChallanTicket(req);
      if(DB.tickets.length!==before) staleChanged = true;
    }
  });
  // Auto-resolve a stale-challan ticket if its challan stopped being stale by some
  // other route (e.g. materials were added directly before this swept, or it was
  // cancelled) — keeps the alert list from lingering on something no longer true.
  DB.tickets.forEach(t=>{
    if(t.type==='stale-challan' && t.status==='open'){
      const req = (DB.gateRequests||[]).find(r=>r.id===t.gateRequestId);
      if(!req || !isChallanStale(req)){ t.status='resolved'; t.resolvedDate=todayStr(); staleChanged=true; }
    }
  });
  DB.tickets.forEach(t=>{
    if(t.status==='open' && t.lastAlertDate !== todayStr()){
      t.lastAlertDate = todayStr();
      t.alertCount = (t.alertCount||0)+1;
      dailyBumpChanged=true;
    }
  });
  // A stale-challan ticket being opened/resolved is a real state change other
  // devices need to see (Device 3 in particular) — always persist that immediately
  // regardless of the `persist` flag, which only governs the cosmetic daily-age bump.
  if(staleChanged || (dailyBumpChanged && persist!==false)){ saveKey('tickets'); }
  return dailyBumpChanged || staleChanged;
}
async function persistTicketsAndStock(){
  await saveKey('tickets');
  await saveKey('stock');
}

/* ---------------- autocomplete ---------------- */
// Works like a browser address bar / search box "autofill hint":
// - as you type, if there's a material whose name STARTS WITH what you typed,
//   the rest of that name is appended and shown selected/highlighted
// - keep typing normally and your next keystroke just replaces the highlighted
//   part (native input behaviour) — it never blocks or steals what you type
// - press Right-arrow / End / Enter to accept the full suggestion
// - press Escape to dismiss it and keep only what you typed
// - a small dropdown below still lists other (non-prefix) matches you can click
let __acGlobalBound = false;
function attachAutocomplete(inputEl, listEl, source, onPick, extra){
  let deleting = false;

  inputEl.addEventListener('keydown', (e)=>{
    if(e.key==='Backspace' || e.key==='Delete'){ deleting = true; }
    const hasSelection = inputEl.selectionStart !== inputEl.selectionEnd;
    if(hasSelection && e.key==='Enter'){
      // Accept the inline suggestion instead of submitting the form early
      e.preventDefault();
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      listEl.style.display='none';
    } else if(hasSelection && e.key==='Escape'){
      inputEl.value = inputEl.value.slice(0, inputEl.selectionStart);
      listEl.style.display='none';
    }
  });

  inputEl.addEventListener('input', ()=>{
    const typed = inputEl.value;
    const v = typed.trim().toLowerCase();
    listEl.innerHTML='';
    if(!v){ listEl.style.display='none'; deleting=false; return; }

    const all = source();

    // Inline ghost/hint suggestion — only while typing forward, never while deleting
    if(!deleting){
      const prefixMatch = all.find(m=>m.name.toLowerCase().startsWith(v) && m.name.length > typed.length);
      if(prefixMatch){
        inputEl.value = typed + prefixMatch.name.slice(typed.length);
        inputEl.setSelectionRange(typed.length, prefixMatch.name.length);
      }
    }
    deleting = false;

    // Dropdown of matches. Capped at 8 while narrowing down a partial name —
    // but once what's typed is the exact, full name of more than one material
    // (e.g. "Hex Bolt" existing in 31 size/grade variants), that cap is exactly
    // what breaks variant-picking: the hint text above already promises "N
    // variants — pick one from the list below," so silently only ever showing
    // the same first 8 traps the person with no way to reach the rest. In that
    // case show every exact-name match uncapped instead — the list is already
    // scrollable (.autolist has its own max-height), so there's nowhere this
    // doesn't fit.
    const exactMatches = all.filter(m=>m.name.toLowerCase()===v);
    const matches = exactMatches.length>1 ? exactMatches
      : all.filter(m=>m.name.toLowerCase().includes(v))
          .sort((a,b)=> a.name.toLowerCase().indexOf(v) - b.name.toLowerCase().indexOf(v)).slice(0,8);
    if(!matches.length){ listEl.style.display='none'; return; }
    matches.forEach(m=>{
      const d = document.createElement('div');
      d.innerHTML = highlightMatch(m.name, v) + (extra? `<div class="meta">${extra(m)}</div>`:'');
      d.onclick = ()=>{ onPick(m); listEl.style.display='none'; };
      listEl.appendChild(d);
    });
    listEl.style.display='block';
  });
  // One delegated document-level listener handles closing ANY open autolist,
  // instead of stacking a fresh listener on every render (which used to leak).
  if(!__acGlobalBound){
    __acGlobalBound = true;
    document.addEventListener('click', (e)=>{
      document.querySelectorAll('.autolist').forEach(list=>{
        const field = list.closest('.field');
        if(field && !field.contains(e.target)){ list.style.display='none'; }
      });
    });
  }
}
function highlightMatch(name, v){
  const idx = name.toLowerCase().indexOf(v);
  if(idx===-1) return name;
  return name.slice(0,idx)+'<b>'+name.slice(idx,idx+v.length)+'</b>'+name.slice(idx+v.length);
}

