const router = require('express').Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// The print page embeds the token in the URL so it works in a new tab
router.get('/project/:id/print', authMiddleware, (req, res) => {
  serveReceipt(req, res);
});

// Token-in-URL version for direct browser tab open
router.get('/project/:id/print/:token', (req, res) => {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth');
  try {
    req.user = jwt.verify(req.params.token, JWT_SECRET);
  } catch {
    return res.status(401).send('<h3>Session expired. Please log back in and try again.</h3>');
  }
  serveReceipt(req, res);
});

function serveReceipt(req, res) {
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, c.name as contact_name, c.company as contact_company,
      c.email as contact_email, c.phone as contact_phone, c.address as contact_address
    FROM projects p
    LEFT JOIN contacts c ON p.contact_id = c.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!project) return res.status(404).send('<h3>Project not found</h3>');

  const items = db.prepare(`
    SELECT pa.*, a.barcode, a.serial_number, m.name as model_name,
      m.rental_price_day, m.replacement_value, cat.name as category_name
    FROM project_assets pa
    JOIN assets a ON pa.asset_id = a.id
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    WHERE pa.project_id = ?
    ORDER BY cat.name, m.name, a.barcode
  `).all(req.params.id);

  const lineItems = db.prepare(
    'SELECT * FROM project_line_items WHERE project_id=? ORDER BY sort_order, created_at'
  ).all(req.params.id);

  const companyName = db.prepare("SELECT value FROM settings WHERE key='company_name'").get()?.value || 'Rental Co';
  const logoPath = db.prepare("SELECT value FROM settings WHERE key='logo_path'").get()?.value || null;
  res.setHeader('Content-Type', 'text/html');
  res.send(generatePrintHTML(project, items, lineItems, companyName, logoPath));
}

function generatePrintHTML(project, items, lineItems, companyName, logoPath) {
  const totalValue = items.reduce((s, i) => s + (i.replacement_value || 0), 0);
  const grouped = {};
  items.forEach(i => {
    const cat = i.category_name || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(i);
  });

  // Group items by category then model name, aggregating barcodes/serials
  const rows = Object.entries(grouped).map(([cat, catItems]) => {
    // Sub-group by model name within category
    const byModel = {};
    catItems.forEach(i => {
      const key = i.model_name;
      if (!byModel[key]) byModel[key] = { model_name: i.model_name, replacement_value: i.replacement_value||0, barcodes: [], serials: [] };
      byModel[key].barcodes.push(i.barcode);
      if (i.serial_number) byModel[key].serials.push(i.serial_number);
    });

    const modelRows = Object.values(byModel).map((m, idx) => `
      <tr style="background:${idx%2===0?'white':'#f8fafc'}">
        <td style="padding:8px 12px;font-weight:600">${m.model_name}</td>
        <td style="padding:6px 12px;text-align:center;font-weight:700;font-size:15px">${m.barcodes.length}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#475569;line-height:1.8">
          ${m.barcodes.join('<br>')}
        </td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b;line-height:1.8">
          ${m.serials.length > 0 ? m.serials.join('<br>') : '—'}
        </td>
        <td style="padding:8px 12px;text-align:right;font-size:13px">$${(m.replacement_value * m.barcodes.length).toLocaleString()}</td>
      </tr>
    `).join('');

    return `
      <tr><td colspan="5" style="background:#1e293b;color:white;padding:7px 12px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px">${cat}</td></tr>
      ${modelRows}
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt — ${project.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;color:#1e293b;font-size:14px;line-height:1.5;background:white}
  .page{max-width:860px;margin:0 auto;padding:40px}
  .print-bar{background:#1e293b;color:white;padding:12px 20px;border-radius:8px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center}
  .print-bar button{background:#10b981;color:white;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:14px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #1e293b}
  .company-name{font-size:22px;font-weight:800;letter-spacing:-0.5px}
  .doc-title{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .meta-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
  .meta-box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:10px}
  .meta-box p{margin-bottom:3px;color:#334155;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px}
  thead th{background:#f1f5f9;padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0}
  .totals-row{display:flex;justify-content:flex-end;gap:32px;margin-bottom:20px;font-size:14px}
  .totals-row strong{font-size:16px}
  .terms-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:28px}
  .terms-box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:10px}
  .terms-box p{font-size:12px;color:#475569;line-height:1.8}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:8px}
  .sig-field{padding-top:10px}
  .sig-line{border-top:1.5px solid #1e293b;margin-bottom:6px;height:52px}
  .sig-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .print-bar{display:none}
    .page{padding:20px}
  }
</style>
</head>
<body>
<div class="page">
  <div class="print-bar no-print">
    <span style="font-weight:600">📋 Equipment Receipt — ${project.name}</span>
    <button onclick="window.print()">🖨 Print</button>
  </div>

  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoPath ? `<img src="${logoPath}" alt="Logo" style="height:52px;max-width:160px;object-fit:contain">` : ''}
      <div>
        <div class="company-name">${companyName}</div>
        <div class="doc-title">Equipment Receipt &amp; Rental Agreement</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Document Date</div>
      <div style="font-weight:700">${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px">Ref: ${project.id.slice(0,8).toUpperCase()}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h3>Project Details</h3>
      <p><strong>${project.name}</strong></p>
      ${project.venue ? `<p>📍 ${project.venue}</p>` : ''}
      ${project.start_date ? `<p>📅 ${project.start_date}${project.end_date ? ` → ${project.end_date}` : ''}</p>` : ''}
      ${project.description ? `<p style="color:#64748b;margin-top:6px;font-size:12px">${project.description}</p>` : ''}
    </div>
    <div class="meta-box">
      <h3>Client Information</h3>
      ${project.contact_name ? `<p><strong>${project.contact_name}</strong></p>` : '<p style="color:#94a3b8">No contact assigned</p>'}
      ${project.contact_company ? `<p>${project.contact_company}</p>` : ''}
      ${project.contact_email ? `<p>✉ ${project.contact_email}</p>` : ''}
      ${project.contact_phone ? `<p>📞 ${project.contact_phone}</p>` : ''}
      ${project.contact_address ? `<p style="color:#64748b;font-size:12px;margin-top:4px">${project.contact_address}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Equipment</th>
        <th>Barcode / Tag</th>
        <th>Serial #</th>
        <th style="text-align:right">Replacement Value</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${lineItems && lineItems.length > 0 ? `
  <div style="margin-bottom:20px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:8px">Additional Items &amp; Notes</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Description</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Qty</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems.map((li, idx) => `
          <tr style="background:${idx%2===0?'white':'#f8fafc'}">
            <td style="padding:8px 12px;font-weight:500">${li.description}</td>
            <td style="padding:8px 12px;text-align:center;font-weight:700">${li.quantity}</td>
            <td style="padding:8px 12px;font-size:12px;color:#64748b">${li.notes||'—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="totals-row">
    <span>Total Items: <strong>${items.length}</strong></span>
    &nbsp;&nbsp;&nbsp;
    <span>Unique Models: <strong>${Object.values(grouped).reduce((s,arr)=>{ const m={}; arr.forEach(i=>m[i.model_name]=1); return s+Object.keys(m).length; },0)}</strong></span>
    <span>Total Replacement Value: <strong>$${totalValue.toLocaleString()}</strong></span>
  </div>

  <div class="terms-box">
    <h3>Terms &amp; Rental Agreement</h3>
    <p>${(project.eula_text || '').replace(/\n/g, '<br>')}</p>
  </div>

  <div class="sig-grid">
    <div class="sig-field">
      <div class="sig-line"></div>
      <div class="sig-label">Client Signature</div>
    </div>
    <div class="sig-field">
      <div class="sig-line"></div>
      <div class="sig-label">Print Name</div>
    </div>
    <div class="sig-field">
      <div class="sig-line"></div>
      <div class="sig-label">Date</div>
    </div>
  </div>

  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0">
    <div class="sig-grid">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Authorized by — ${companyName}</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Print Name</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

module.exports = router;

// ── Contact report: all equipment currently checked out to a contact ──────
function verifyToken(token) {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth');
  return jwt.verify(token, JWT_SECRET);
}

router.get('/contact/:id/report/:token', (req, res) => {
  try { verifyToken(req.params.token); }
  catch { return res.status(401).send('<h3>Session expired. Please log back in.</h3>'); }

  const db = getDb();

  const contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id);
  if (!contact) return res.status(404).send('<h3>Contact not found</h3>');

  // All assets currently checked out on projects assigned to this contact
  const items = db.prepare(`
    SELECT
      pa.checked_out_at, pa.expected_return_date,
      a.barcode, a.serial_number, a.condition,
      m.name  AS model_name,  m.rental_price_day, m.replacement_value,
      cat.name AS category_name,
      p.id AS project_id, p.name AS project_name,
      p.start_date, p.end_date, p.venue
    FROM project_assets pa
    JOIN assets           a   ON a.id  = pa.asset_id
    JOIN equipment_models m   ON m.id  = a.model_id
    LEFT JOIN categories  cat ON cat.id = m.category_id
    JOIN projects         p   ON p.id  = pa.project_id
    WHERE p.contact_id = ?
      AND pa.status    = 'checked_out'
    ORDER BY p.name, cat.name, m.name, a.barcode
  `).all(req.params.id);

  const companyName = db.prepare("SELECT value FROM settings WHERE key='company_name'").get()?.value || 'Rental Co';
  const logoPath    = db.prepare("SELECT value FROM settings WHERE key='logo_path'").get()?.value || null;

  res.setHeader('Content-Type', 'text/html');
  res.send(generateContactReportHTML(contact, items, companyName, logoPath));
});

// CSV export of the same data
router.get('/contact/:id/report/:token/csv', (req, res) => {
  try { verifyToken(req.params.token); }
  catch { return res.status(401).send('Unauthorized'); }

  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id);
  if (!contact) return res.status(404).send('Not found');

  const items = db.prepare(`
    SELECT
      p.name AS project_name, p.start_date, p.end_date, p.venue,
      cat.name AS category, m.name AS model, a.barcode, a.serial_number,
      a.condition, m.rental_price_day, m.replacement_value,
      pa.checked_out_at, pa.expected_return_date
    FROM project_assets pa
    JOIN assets           a   ON a.id  = pa.asset_id
    JOIN equipment_models m   ON m.id  = a.model_id
    LEFT JOIN categories  cat ON cat.id = m.category_id
    JOIN projects         p   ON p.id  = pa.project_id
    WHERE p.contact_id = ? AND pa.status = 'checked_out'
    ORDER BY p.name, cat.name, m.name, a.barcode
  `).all(req.params.id);

  const headers = ['Project','Start Date','End Date','Venue','Category','Model','Barcode','Serial #','Condition','Day Rate','Replacement Value','Checked Out','Expected Return'];
  const rows = items.map(i => [
    i.project_name, i.start_date||'', i.end_date||'', i.venue||'',
    i.category||'', i.model, i.barcode, i.serial_number||'',
    i.condition||'', i.rental_price_day||0, i.replacement_value||0,
    i.checked_out_at ? new Date(i.checked_out_at).toLocaleString() : '',
    i.expected_return_date||'',
  ].map(v => { const s = String(v==null?'':v); return s.includes(',')||s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; }).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const safeName = (contact.name||'contact').replace(/[^a-z0-9]/gi,'_');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-checked-out.csv"`);
  res.send(csv);
});

function generateContactReportHTML(contact, items, companyName, logoPath) {
  const totalValue = items.reduce((s, i) => s + (i.replacement_value || 0), 0);
  const totalItems = items.length;

  // Group by project
  const projects = {};
  items.forEach(i => {
    if (!projects[i.project_id]) projects[i.project_id] = { name: i.project_name, venue: i.venue, start: i.start_date, end: i.end_date, items: [] };
    projects[i.project_id].items.push(i);
  });

  const projectSections = Object.values(projects).map(proj => {
    const rows = proj.items.map((i, idx) => `
      <tr style="background:${idx%2===0?'white':'#f8fafc'}">
        <td style="padding:8px 12px">${i.category_name||'—'}</td>
        <td style="padding:8px 12px;font-weight:500">${i.model_name}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:13px">${i.barcode}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b">${i.serial_number||'—'}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b">${i.checked_out_at ? new Date(i.checked_out_at).toLocaleDateString() : '—'}</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px">$${(i.replacement_value||0).toLocaleString()}</td>
      </tr>`).join('');

    const projValue = proj.items.reduce((s,i) => s+(i.replacement_value||0), 0);

    return `
      <div style="margin-bottom:28px">
        <div style="background:#1e293b;color:white;padding:10px 16px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:15px">${proj.name}</div>
            ${proj.venue ? `<div style="font-size:12px;opacity:.75;margin-top:2px">📍 ${proj.venue}</div>` : ''}
          </div>
          <div style="text-align:right;font-size:12px;opacity:.8">
            ${proj.start ? `${proj.start}${proj.end ? ` → ${proj.end}` : ''}` : ''}
            <div style="font-weight:600;font-size:13px;margin-top:2px">${proj.items.length} items · $${projValue.toLocaleString()}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Category</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Equipment</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Barcode</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Serial #</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Out Date</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b">Value</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  const noItemsMsg = totalItems === 0 ? `
    <div style="text-align:center;padding:60px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#64748b">
      <div style="font-size:40px;margin-bottom:12px">📦</div>
      <div style="font-size:16px;font-weight:600">No equipment currently checked out</div>
      <div style="font-size:13px;margin-top:6px">This contact has no active checkouts at this time.</div>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Equipment Report — ${contact.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;color:#1e293b;font-size:14px;line-height:1.5;background:white}
  .page{max-width:900px;margin:0 auto;padding:40px}
  .no-print{background:#1e293b;color:white;padding:12px 20px;border-radius:8px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .no-print button{background:#10b981;color:white;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap}
  .no-print .csv-btn{background:#3b82f6}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .no-print{display:none}
    .page{padding:20px}
  }
</style>
</head><body>
<div class="page">
  <div class="no-print">
    <span style="font-weight:600">📋 Equipment Report — ${contact.name}${contact.company ? ` (${contact.company})` : ''}</span>
    <div style="display:flex;gap:8px">
      <button class="csv-btn" onclick="window.location.href=window.location.href+'/csv'">⬇ Export CSV</button>
      <button onclick="window.print()">🖨 Print</button>
    </div>
  </div>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #1e293b">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoPath ? `<img src="${logoPath}" style="height:52px;max-width:160px;object-fit:contain">` : ''}
      <div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-.5px">${companyName}</div>
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px">Equipment Checkout Report</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#94a3b8">Generated</div>
      <div style="font-weight:700">${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px">${new Date().toLocaleTimeString()}</div>
    </div>
  </div>

  <!-- Contact info + summary -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:10px">Contact</div>
      <div style="font-size:16px;font-weight:700">${contact.name}</div>
      ${contact.company ? `<div style="color:#475569;margin-top:2px">${contact.company}</div>` : ''}
      ${contact.email   ? `<div style="margin-top:6px;font-size:13px">✉ ${contact.email}</div>` : ''}
      ${contact.phone   ? `<div style="font-size:13px">📞 ${contact.phone}</div>` : ''}
      ${contact.address ? `<div style="font-size:12px;color:#64748b;margin-top:6px">${contact.address}</div>` : ''}
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:10px">Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div style="font-size:26px;font-weight:800;color:#6c63ff">${totalItems}</div>
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Items Out</div>
        </div>
        <div>
          <div style="font-size:26px;font-weight:800;color:#ef4444">$${totalValue.toLocaleString()}</div>
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Total Value</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:700">${Object.keys(projects).length}</div>
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Projects</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Project sections -->
  ${noItemsMsg || projectSections}
</div>
</body></html>`;
}

module.exports = router;
