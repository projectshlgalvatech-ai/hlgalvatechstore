/* =========================================================================
   ADMIN PANEL — "Save entries" export to Excel
   Pulls every dated transaction the app has ever recorded (GRN receipts,
   material issues, damaged/returns, factory use, transfers, material
   requisitions, gate-entry requests, SO/Projects and stock alerts) into one
   .xlsx workbook, one sheet per category, each sorted oldest-to-newest with
   plain-English column headers so it reads cleanly outside the app. A cover
   sheet up front states the date range covered and when the file was made.
   Nothing here touches DB — purely a read+format pass over what's already
   loaded, so it's safe to run any time and as often as wanted.
   ========================================================================= */
function xlDate(d){
  // Renders a stored yyyy-mm-dd (or blank/null) as dd-mm-yyyy for a human
  // reader; leaves anything already non-standard untouched rather than
  // guessing at it.
  if(!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}
function xlYesNo(v){ return v ? 'Yes' : 'No'; }
// Defensive measure against spreadsheet "formula injection": a genuine .xlsx cell
// written by ExcelJS is already explicitly typed as text (not a formula) unless you
// pass {formula:...}, so real Excel itself won't execute this — but some older or
// third-party spreadsheet tools still sniff a leading =, +, -, @ and treat it as a
// formula on import. Prefixing those with a straight quote makes the cell
// unambiguously text everywhere, at effectively no cost, so it's applied to every
// value this export writes.
function xlSafeCell(val){
  if(typeof val !== 'string') return val;
  return /^[=+\-@\t\r]/.test(val) ? ("'" + val) : val;
}
function xlDeviceLabel(n){
  if(n===undefined || n===null || n==='') return '';
  return CONFIG.deviceNames && CONFIG.deviceNames[n] ? `Device ${n} — ${CONFIG.deviceNames[n]}` : `Device ${n}`;
}
// Every sheet the export builds, in reading order, each as {name, rows, cols}
// where cols is [header, rowKeyOrFn, sum?] — a function gets the whole row
// object so derived/looked-up values (device labels, formatted dates) work
// the same way as a plain field. sum:true marks a quantity column that gets
// a SUBTOTAL(109, …) total at the bottom, same as ticking "Sum" on an Excel
// Table's Total Row.
function buildEntriesWorkbookSheets(){
  const sheets = [];
  const byDateTime = (a,b)=> String(a.date||'').localeCompare(String(b.date||'')) || String(a.time||'').localeCompare(String(b.time||''));

  const gate = (DB.gateEntries||[]).slice().sort(byDateTime);
  sheets.push({name:'GRN - Material Received', rows:gate, cols:[
    ['Challan Approved Date', r=>xlDate(r.approvedDate||r.date)], ['Material Added Date', r=>xlDate(r.materialAddedDate||r.date)],
    ['Date', r=>xlDate(r.date)], ['Time', 'time'], ['Challan No', 'challanNo'],
    ['Supplier', 'supplier'], ['Vehicle No', 'vehicleNo'], ['PO Number', 'poNumber'],
    ['Material', 'materialName'], ['Qty', 'qty', true], ['Qty (Nos)', r=>r.qtyNos!==undefined?r.qtyNos:'', true],
    ['Location', 'location'], ['SO Number', 'soNumber'], ['SO Product', r=>r.productName||''],
    ['For Factory Use', r=>xlYesNo(r.forFactoryUse)], ['Value', r=>r.value!==undefined?r.value:'', true, 'money'],
    ['Awaiting Requester Approval', r=>xlYesNo(r.pendingApproval)],
    ['Logged By', r=>xlDeviceLabel(r.loggedByDevice)]
  ]});

  const gateReq = (DB.gateRequests||[]).slice().sort(byDateTime);
  sheets.push({name:'GRN - Challan Requests', rows:gateReq, cols:[
    ['Date', r=>xlDate(r.date)], ['Time', 'time'], ['Challan No', 'challanNo'],
    ['Supplier', 'supplier'], ['Vehicle No', 'vehicleNo'], ['PO Number', 'poNumber'],
    ['SO Number', 'soNumber'], ['For Factory Use', r=>xlYesNo(r.forFactoryUse)],
    ['Status', r=>(r.status||'').replace(/^./,c=>c.toUpperCase())],
    ['Requested Date', r=>xlDate(r.requestedDate)], ['Requested Time', 'requestedTime'],
    ['Approved Date', r=>xlDate(r.approvedDate)], ['Approved Time', 'approvedTime'],
    ['Approved By', r=>r.approvedBy||''], ['Logged By', r=>xlDeviceLabel(r.loggedByDevice)]
  ]});

  const issues = (DB.issues||[]).slice().sort(byDateTime);
  sheets.push({name:'Material Issues', rows:issues, cols:[
    ['Date', r=>xlDate(r.date)], ['Time', 'time'], ['Material', 'materialName'],
    ['Qty', 'qty', true], ['Qty (Nos)', r=>r.qtyNos||'', true], ['Location', 'location'],
    ['Issued To', 'person'], ['Purpose', 'purpose'], ['Approved By', 'approvedBy'],
    ['SO Number', r=>r.soNumber||''], ['Cross-SO Issue', r=>xlYesNo(r.crossSO)],
    ['Cross-SO Reason', r=>r.crossSOReason||''], ['Status', r=>(r.status||'').replace(/^./,c=>c.toUpperCase())],
    ['Returned (Good) Qty', r=>r.returnedGoodQty||0, true], ['Damaged Qty', r=>r.damagedQty||0, true],
    ['Consumed Qty', r=>r.consumedQty||0, true], ['Return Date', r=>xlDate(r.returnDate)]
  ]});

  const damaged = (DB.damaged||[]).slice().sort(byDateTime);
  sheets.push({name:'Damaged - Returns', rows:damaged, cols:[
    ['Date', r=>xlDate(r.date)], ['Material', 'materialName'], ['Qty', 'qty', true],
    ['Location', 'location'], ['Note', 'note']
  ]});

  const factory = (DB.factoryUse||[]).slice().sort(byDateTime);
  sheets.push({name:'Factory Use', rows:factory, cols:[
    ['Date', r=>xlDate(r.date)], ['Time', 'time'], ['Material', 'materialName'],
    ['Qty', 'qty', true], ['Qty (Nos)', r=>r.qtyNos||'', true], ['Location', 'location'], ['Purpose', 'purpose']
  ]});

  const transfers = (DB.transfers||[]).slice().sort(byDateTime);
  sheets.push({name:'Stock Transfers', rows:transfers, cols:[
    ['Date', r=>xlDate(r.date)], ['Time', 'time'], ['Material', 'materialName'],
    ['Qty', 'qty', true], ['From Location', 'from'], ['To Location', 'to']
  ]});

  const mrf = (DB.mrf||[]).slice().sort(byDateTime);
  sheets.push({name:'Material Requisitions (MRF)', rows:mrf, cols:[
    ['MRF No', 'mrfNo'], ['Date', r=>xlDate(r.date)], ['Time', 'time'], ['Material', 'materialName'],
    ['Type', r=>r.materialType||''], ['Size', r=>r.size||''], ['Qty', r=>r.qty!==undefined?r.qty:'', true],
    ['Qty (Nos)', r=>r.qtyNos||'', true], ['Location', r=>r.location||''], ['Purpose', r=>r.purpose||''],
    ['Requested By', r=>r.requestBy||''], ['Referred By', r=>r.referredBy||''],
    ['Approved By', r=>r.approvedBy||''], ['SO Number', r=>r.soNumber||''],
    ['Status', r=>(r.status||'').replace(/-/g,' ').replace(/^./,c=>c.toUpperCase())],
    ['Approval Status', r=>r.approvalStatus||'']
  ]});

  const so = (DB.soList||[]).slice().sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')));
  sheets.push({name:'SO - Projects', rows:so, cols:[
    ['SO Number', 'soNumber'], ['Date Opened', r=>xlDate(r.date)], ['Status', r=>(r.status||'').replace(/^./,c=>c.toUpperCase())],
    ['Completed Date', r=>xlDate(r.completedDate)], ['Priority', r=>xlYesNo(r.priority)],
    ['Products On SO', r=>(r.products||[]).length, true]
  ]});

  const siteMatRows = [];
  (DB.siteInstallMaterial||[]).forEach(entry=>{
    (entry.materials||[]).forEach(m=>{
      siteMatRows.push({
        srNo: entry.srNo, site: entry.site, issuedOn: entry.issuedOn, vendorName: entry.vendorName,
        location: entry.location, purpose: entry.purpose, sourceChallanNo: entry.sourceChallanNo, status: entry.status, date: entry.date, time: entry.time,
        productCode: m.productCode, materialName: m.materialName, size: m.size, grade: m.grade, qty: m.qty, qtyUnit: m.qtyUnit, materialHealth: m.materialHealth,
        returnedQty: m.returnedQty, returnedHealth: m.returnedHealth, usedQty: m.usedQty,
        productMismatch: m.productMismatch, mismatchNote: m.mismatchNote
      });
    });
  });
  siteMatRows.sort((a,b)=> (a.srNo||0)-(b.srNo||0));
  sheets.push({name:'Site Installation Material', rows:siteMatRows, cols:[
    ['Sr No', 'srNo'], ['Site', r=>r.site||''], ['Issued On', r=>xlDate(r.issuedOn)], ['Vendor Name', r=>r.vendorName||''],
    ['Location', r=>r.location||''], ['Purpose', r=>r.purpose||''], ['Source GRN Challan', r=>r.sourceChallanNo||''],
    ['Product Code', r=>r.productCode||''], ['Material Name', r=>r.materialName||''],
    ['Size', r=>r.size||''], ['Grade', r=>r.grade||''],
    ['Qty Issued', r=>r.qty, true], ['Qty Unit', r=>r.qtyUnit||''], ['Material Health', r=>r.materialHealth||''],
    ['Returned Qty', r=>r.returnedQty||0, true],
    ['Return Condition', r=>r.returnedHealth==='good'?'Good — restocked':(r.returnedHealth==='damaged'?'Damaged — scrapped':'')],
    ['Installed (Used) Qty', r=>r.usedQty||0, true],
    ['Product Mismatch', r=>xlYesNo(r.productMismatch)], ['Mismatch Note', r=>r.mismatchNote||''],
    ['Status', r=>(r.status||'').replace(/^./,c=>c.toUpperCase())], ['Entered Date', r=>xlDate(r.date)], ['Entered Time', 'time']
  ]});

  const tickets = (DB.tickets||[]).slice().sort((a,b)=> String(a.createdDate||'').localeCompare(String(b.createdDate||'')));
  sheets.push({name:'Alerts - Tickets', rows:tickets, cols:[
    ['Type', r=>r.type==='so-mismatch'?'SO Mismatch':(r.type==='product-mismatch'?'Product Mismatch':'Low Stock')], ['Material', r=>r.materialName||''],
    ['Opened Date', r=>xlDate(r.createdDate)], ['Status', r=>(r.status||'').replace(/^./,c=>c.toUpperCase())],
    ['Resolved Date', r=>xlDate(r.resolvedDate)], ['Requested SO', r=>r.requestedSO||''],
    ['Material SO', r=>r.materialSO||''], ['Reason', r=>r.reason||''], ['Issued To', r=>r.person||''],
    ['Site', r=>r.site||''], ['Sr No', r=>r.srNo||''], ['Product Code', r=>r.productCode||''], ['Note', r=>r.note||'']
  ]});

  return sheets;
}
// Earliest date found across every sheet — used only to label the cover sheet
// and the downloaded filename with the true start of the app's history.
function earliestEntryDate(sheets){
  let min = null;
  sheets.forEach(s=>{
    (s.rows||[]).forEach(r=>{
      const d = r.date || r.createdDate;
      if(d && (!min || d<min)) min = d;
    });
  });
  return min;
}
function excelColLetter(n){
  // 1-based column number -> spreadsheet letters (1->A, 27->AA, …)
  let s = '';
  while(n>0){ const m=(n-1)%26; s = String.fromCharCode(65+m)+s; n = Math.floor((n-1)/26); }
  return s;
}
// Builds the entries workbook and returns {blob, filename} without touching
// the DOM — shared by the plain "Save entries" download and the
// "Email entries" button so the workbook layout only lives in one place.
async function buildEntriesExcelBlob(){
  if(typeof ExcelJS==='undefined'){
    throw new Error('ExcelJS library not loaded — check your internet connection and try again');
  }
  {
    const sheets = buildEntriesWorkbookSheets();
    const firstDate = earliestEntryDate(sheets);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HL Galvatech';
    wb.created = new Date();

    const totalRows = sheets.reduce((n,s)=>n+s.rows.length, 0);
    const cover = wb.addWorksheet('Cover');
    cover.columns = [{width:25},{width:16}];

    // Brand palette — matches the letterhead used on the printed Site
    // Installation slip, so an exported workbook and a printed slip read as
    // the same product rather than two different-looking tools.
    const NAVY = {argb:'FF152A40'};
    const BLUE = {argb:'FF2D5C85'};
    const GOLD = {argb:'FFC99A3C'};
    const WHITE = {argb:'FFFFFFFF'};
    const INK = {argb:'FF1C262D'};
    const MUTED = {argb:'FF5C6B78'};
    const BAND = {argb:'FFEEF3F6'};
    const LINE = {argb:'FFD7E0E7'};
    const QTY_FMT = '#,##0';
    const MONEY_FMT = '$#,##0';

    cover.mergeCells('A1:B1');
    cover.getRow(1).height = 34;
    cover.getCell('A1').fill = {type:'gradient', gradient:'angle', degree:135, stops:[{position:0,color:NAVY},{position:1,color:BLUE}]};
    cover.getCell('A1').value = 'HL Galvatech — Stocks and Store Management';
    cover.getCell('A1').font = {bold:true, size:15, color:WHITE};
    cover.getCell('A1').alignment = {horizontal:'left', vertical:'middle', indent:1};
    cover.mergeCells('A2:B2');
    cover.getRow(2).height = 6;
    cover.getCell('A2').fill = {type:'pattern', pattern:'solid', fgColor:GOLD};

    cover.getRow(4).values = ['All entries export', ''];
    cover.getCell('A4').font = {bold:true, italic:true, size:12, color:BLUE};

    const metaRows = [
      ['Covers', firstDate ? `${xlDate(firstDate)} to ${xlDate(todayStr())}` : 'No entries recorded yet'],
      ['Generated on', `${xlDate(todayStr())} ${nowTimeStr()}`],
      ['Total entries', totalRows]
    ];
    metaRows.forEach((row,i)=>{
      const r = 6+i;
      cover.getCell(r,1).value = row[0];
      cover.getCell(r,1).font = {bold:true, color:MUTED};
      cover.getCell(r,2).value = row[1];
      cover.getCell(r,2).font = {bold:true, size:12, color:INK};
    });

    const tblHeaderR = 6 + metaRows.length + 1;
    cover.getCell(tblHeaderR,1).value = 'Sheet';
    cover.getCell(tblHeaderR,2).value = 'Entries';
    [1,2].forEach(c=>{
      const cell = cover.getCell(tblHeaderR,c);
      cell.font = {bold:true, color:WHITE};
      cell.fill = {type:'pattern', pattern:'solid', fgColor:NAVY};
      cell.alignment = {horizontal: c===1?'left':'right', vertical:'middle', indent: c===1?1:0};
    });
    sheets.forEach((s,i)=>{
      const r = tblHeaderR+1+i;
      cover.getCell(r,1).value = s.name;
      cover.getCell(r,2).value = s.rows.length;
      const bandFill = i%2 ? {type:'pattern', pattern:'solid', fgColor:BAND} : null;
      [1,2].forEach(c=>{
        const cell = cover.getCell(r,c);
        if(bandFill) cell.fill = bandFill;
        cell.border = {bottom:{style:'hair', color:LINE}};
        cell.alignment = {horizontal: c===1?'left':'right', vertical:'middle', indent: c===1?1:0};
        if(c===2) cell.font = {color:INK};
      });
    });

    sheets.forEach(s=>{
      const ws = wb.addWorksheet(s.name.slice(0,31));
      const headerRow = s.cols.map(c=>c[0]);
      const dataRows = s.rows.map(r=> s.cols.map(([,key])=> typeof key==='function' ? key(r) : (r[key]!==undefined && r[key]!==null ? r[key] : '')));
      const lastCol = headerRow.length;
      const headerR = 4, dataStart = 5;

      // Row 1 — merged title banner, same navy→blue gradient as the cover
      // sheet and the printed slip's letterhead.
      ws.mergeCells(1,1,1,lastCol);
      ws.getRow(1).height = 26;
      for(let c=1;c<=lastCol;c++){
        ws.getCell(1,c).fill = {type:'gradient', gradient:'angle', degree:135, stops:[{position:0,color:NAVY},{position:1,color:BLUE}]};
      }
      const titleCell = ws.getCell(1,1);
      titleCell.value = 'HL Galvatech — Stocks and Store Management';
      titleCell.font = {bold:true, size:13, color:WHITE};
      titleCell.alignment = {horizontal:'left', vertical:'middle', indent:1};

      // Row 2 — thin gold accent stripe, echoing the cover sheet.
      ws.mergeCells(2,1,2,lastCol);
      ws.getRow(2).height = 5;
      for(let c=1;c<=lastCol;c++){ ws.getCell(2,c).fill = {type:'pattern', pattern:'solid', fgColor:GOLD}; }

      // Row 3 — subtitle naming this sheet's category (row 4 spacer, then header).
      const subCell = ws.getCell(3,1);
      subCell.value = s.name;
      subCell.font = {bold:true, italic:true, size:11, color:BLUE};

      headerRow.forEach((h,i)=>{
        const cell = ws.getCell(headerR, i+1);
        cell.value = h;
        cell.font = {bold:true, color:WHITE, size:10.5};
        cell.fill = {type:'pattern', pattern:'solid', fgColor:NAVY};
        cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
        cell.border = {bottom:{style:'medium', color:GOLD}};
      });
      ws.getRow(headerR).height = 20;

      // Data rows — soft zebra striping plus a hairline grid, numeric/qty
      // columns right-aligned so figures line up instead of hugging the left.
      dataRows.forEach((row,ri)=>{
        const bandFill = ri%2 ? {type:'pattern', pattern:'solid', fgColor:BAND} : null;
        row.forEach((val,ci)=>{
          const cell = ws.getCell(dataStart+ri, ci+1);
          cell.value = xlSafeCell(val);
          const col = s.cols[ci];
          if(col[2]) cell.numFmt = col[3]==='money' ? MONEY_FMT : QTY_FMT;
          if(bandFill) cell.fill = bandFill;
          cell.border = {bottom:{style:'hair', color:LINE}, right:{style:'hair', color:LINE}};
          cell.alignment = {horizontal: col[2]?'right':'left', vertical:'middle'};
          cell.font = {color:INK, size:10.5};
        });
      });

      const hasData = dataRows.length>0;
      if(hasData){
        // Total row, one blank row below the data — "Total" label plus a live
        // SUBTOTAL(109, …) for every column flagged sum:true, the same
        // formula Excel's own "Sum" option writes on a Table's Total Row, so
        // it keeps recalculating correctly even if a filter hides rows above it.
        const dataLastRow = dataStart + dataRows.length - 1;
        const totalR = dataLastRow + 2;
        for(let c=1;c<=lastCol;c++){
          const cell = ws.getCell(totalR,c);
          cell.font = {bold:true, color:NAVY};
          cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFBF3E2'}};
          cell.border = {top:{style:'medium', color:GOLD}, bottom:{style:'thin', color:GOLD}};
        }
        ws.getCell(totalR,1).value = 'Total';
        ws.getCell(totalR,1).alignment = {horizontal:'left', vertical:'middle', indent:1};
        s.cols.forEach((col,i)=>{
          if(!col[2]) return;
          const letter = excelColLetter(i+1);
          const cell = ws.getCell(totalR, i+1);
          cell.value = {formula: `SUBTOTAL(109,${letter}${dataStart}:${letter}${dataLastRow})`};
          cell.numFmt = col[3]==='money' ? MONEY_FMT : QTY_FMT;
          cell.alignment = {horizontal:'right', vertical:'middle'};
        });
        // Filter dropdown buttons on the header row, same as an Excel Table —
        // scoped to the header+data rows only, so the title band and Total
        // row underneath aren't themselves filterable.
        ws.autoFilter = {from:{row:headerR, column:1}, to:{row:dataLastRow, column:lastCol}};
      } else {
        ws.getCell(dataStart,1).value = 'No entries yet';
        ws.getCell(dataStart,1).font = {italic:true, color:MUTED};
      }

      // Auto-width each column to its widest cell (header, data, or "Total"),
      // capped so one long note field can't blow out the whole sheet.
      s.cols.forEach((col,i)=>{
        let w = String(col[0]).length;
        dataRows.forEach(row=>{ w = Math.max(w, String(row[i]??'').length); });
        ws.getColumn(i+1).width = Math.min(Math.max(w+2, 10), 45);
      });
      // Keep the title/subtitle/header band pinned while scrolling through data.
      ws.views = [{state:'frozen', xSplit:0, ySplit:headerR}];
    });

    const stamp = (firstDate?xlDate(firstDate):'no-entries') + '_to_' + xlDate(todayStr());
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const filename = `HL_Galvatech_Entries_${stamp}.xlsx`;
    return {blob, filename};
  }
}
// Triggers a browser download of a blob under the given filename.
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
async function exportAllEntriesToExcel(){
  const btn = document.getElementById('admin-save-entries-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Building file…'; }
  try{
    const {blob, filename} = await buildEntriesExcelBlob();
    downloadBlob(blob, filename);
    toast('Entries exported to Excel');
  }catch(e){
    console.error('entries export failed', e);
    toast(e.message==='ExcelJS library not loaded — check your internet connection and try again' ? e.message : 'Could not build the Excel file — see console for details', true);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Save entries'; }
  }
}
window.exportAllEntriesToExcel = exportAllEntriesToExcel;
// "Email entries": downloads the same workbook, then opens the default mail
// app with recipient/subject/body pre-filled. Browsers don't allow any
// webpage to attach a file to an email automatically (mailto: has never
// supported attachments, in every browser, for security reasons) — so the
// closest a website can get is: build+download the file, then hand the
// person a ready-to-send email so all that's left is dragging the file in.
async function emailEntriesExport(){
  const btn = document.getElementById('admin-email-entries-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Opening email…'; }
  // Read straight from the input if the Admin Panel is open (so this works
  // even if "Save changes" wasn't clicked yet), otherwise fall back to the
  // saved value. The address itself is NOT run through encodeURIComponent —
  // only the subject/body query params should be percent-encoded; encoding
  // the address turns "@" into "%40", which some mail apps fail to parse
  // back into a proper "To:" field.
  const recipientInput = document.getElementById('admin-email-recipient');
  const to = (recipientInput && recipientInput.value.trim()) || CONFIG.emailRecipient || '';
  if(!to){
    if(btn){ btn.disabled = false; btn.textContent = 'Email entries'; }
    toast('Enter an address in "Email recipient" above first, then try again', true);
    if(recipientInput) recipientInput.focus();
    return;
  }
  const subject = `HL Galvatech — Entries Export (${todayStr()})`;

  let blob, filename;
  try{
    ({blob, filename} = await buildEntriesExcelBlob());
  }catch(e){
    console.error('email entries export failed', e);
    toast(e.message==='ExcelJS library not loaded — check your internet connection and try again' ? e.message : 'Could not build the Excel file — see console for details', true);
    if(btn){ btn.disabled = false; btn.textContent = 'Email entries'; }
    return;
  }

  // Try the OS share sheet FIRST, with the file already attached — this is the
  // one genuinely free way a webpage can hand a real file to a real email app
  // without the download-then-drag-in step below. Supported on most phones
  // (Android/iOS) and some desktop Chrome/Edge/Safari; where it isn't
  // supported, canShare() just returns false and this falls straight through
  // to the mailto+download approach, unchanged. The one thing no web page can
  // set through this API is the "To" address (that's an OS share-sheet
  // limitation, not something this app can work around) — copying it to the
  // clipboard first means it's one paste away once the compose screen opens.
  try{
    const file = new File([blob], filename, {type: blob.type});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.clipboard.writeText(to); }catch(clipErr){ /* clipboard permission denied — not fatal */ }
      // Files ONLY — no title/text alongside them. Gmail's Android app is
      // widely reported to silently drop the attachment when a share intent
      // also carries text, even though the compose screen briefly shows it as
      // attached; a files-only share is the commonly reported workaround.
      // This is a Gmail-app quirk, not something a webpage can fully control —
      // if it still drops the file, try a different app from the share sheet
      // (Outlook, Files, Drive) to confirm it's Gmail-specific, or fall back
      // to "Open email app" in the modal below and attach manually.
      await navigator.share({files:[file]});
      toast(`Share sheet opened with ${filename} attached — paste in the recipient (copied to your clipboard) before sending`);
      if(btn){ btn.disabled = false; btn.textContent = 'Email entries'; }
      return;
    }
  }catch(shareErr){
    if(shareErr && shareErr.name === 'AbortError'){
      // Person closed the share sheet without picking anything — respect that
      // and stop here rather than immediately falling back to mailto below.
      if(btn){ btn.disabled = false; btn.textContent = 'Email entries'; }
      return;
    }
    console.error('share failed, falling back to mailto', shareErr);
  }

  // Fallback for browsers/devices without file-sharing support: download the
  // file and open a pre-addressed mail compose window, same as always — you
  // just drag the downloaded file in and hit send.
  const encodedSubject = encodeURIComponent(subject);
  // Built as mailto:?to=address rather than mailto:address — Edge/Chrome can
  // misparse "name@domain.com" right after the colon as embedded URL
  // credentials (like the "user@" in http://user@host) and strip it before
  // launching the mail app, which explains the subject surviving while the
  // recipient vanished. Putting the address inside the query string avoids
  // that parsing path entirely.
  const mailtoHref = `mailto:?to=${to}&subject=${encodedSubject}`;
  window.location.href = mailtoHref;
  downloadBlob(blob, filename);
  // A page can never confirm whether an OS actually opened a mail app for
  // mailto: — that information isn't exposed to JavaScript, so a toast
  // claiming "email opened" would just be a guess. Show a real, clickable
  // link instead: if the automatic attempt above worked, you won't need
  // it; if your browser has no default mail app set (or blocked the
  // request once and now silently ignores it), this link is the guaranteed
  // way in — same as clicking any other mailto link on a webpage.
  showModal(`
    <h3>Email on its way</h3>
    <div class="export-card email" style="margin-bottom:14px">
      <div class="export-card-icon">✔</div>
      <div class="export-card-body">
        <h5>${m_escape(filename)}</h5>
        <p>Saved to your Downloads folder, and your email app should now be open and addressed to the recipient.</p>
      </div>
    </div>
    <p class="admin-note">If your email app didn't open automatically, click below — then attach the downloaded file and hit Send.</p>
    <p><a class="btn" href="${mailtoHref}" target="_blank" rel="noopener">Open email app</a></p>
    <p class="admin-note">Still nothing? Your browser/device doesn't have a default mail app set — that's a system setting outside this page's control (check your browser's Settings → Site settings → Protocol handlers, or your OS's default apps).</p>
    <div class="modal-actions"><button class="btn secondary" type="button" onclick="closeModal()">Close</button></div>
  `);
  if(btn){ btn.disabled = false; btn.textContent = 'Email entries'; }
}
window.emailEntriesExport = emailEntriesExport;
function downloadBackupFile(json, stamp){
  json = json || JSON.stringify(collectBackupPayload());
  stamp = stamp || new Date().toISOString().replace(/[:.]/g,'-');
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `hl-galvatech-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
async function applyRestoredPayload(payload){
  if(!payload || !payload.db){ toast('That backup file looks invalid', true); return; }
  KEYS.forEach(k=>{ if(payload.db[k]!==undefined) DB[k] = payload.db[k]; });
  if(payload.config) CONFIG = Object.assign({}, CONFIG, payload.config);
  for(const k of KEYS){ await saveKey(k); }
  await saveConfig();
  buildNav();
  render();
  toast('Backup restored — all devices will pick this up within a few seconds');
}
async function restoreFromCloudBackup(url){
  if(!confirm('Restore this backup? This overwrites all current data (materials, stock, gate entries, SOs, everything) on every device. This cannot be undone.')) return;
  try{
    const res = await fetch(url);
    const payload = await res.json();
    await applyRestoredPayload(payload);
  }catch(e){ console.error('restore failed', e); toast('Could not read that backup', true); }
}
window.restoreFromCloudBackup = restoreFromCloudBackup;
async function restoreFromLocalFile(fileInputEl){
  const file = fileInputEl.files && fileInputEl.files[0];
  if(!file) return;
  if(!confirm('Restore this backup file? This overwrites all current data (materials, stock, gate entries, SOs, everything) on every device. This cannot be undone.')) return;
  try{
    const text = await file.text();
    const payload = JSON.parse(text);
    await applyRestoredPayload(payload);
  }catch(e){ console.error('restore failed', e); toast('Could not read that backup file', true); }
  fileInputEl.value = '';
}
window.restoreFromLocalFile = restoreFromLocalFile;

/* ---------------- modal ---------------- */
