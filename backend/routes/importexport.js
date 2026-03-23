const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ── EXPORT ────────────────────────────────────────────────────────────────
router.get('/export/:type', authMiddleware, (req, res) => {
  const db   = getDb();
  const type = req.params.type;
  let rows = [], headers = [];

  if (type === 'categories') {
    headers = ['name','color'];
    rows = db.prepare('SELECT name, color FROM categories ORDER BY name').all();
  } else if (type === 'manufacturers') {
    headers = ['name','website','notes'];
    rows = db.prepare('SELECT name, website, notes FROM manufacturers ORDER BY name').all();
  } else if (type === 'models') {
    headers = ['name','manufacturer','category','description','weight_kg','rental_price_day','replacement_value','notes'];
    rows = db.prepare(`
      SELECT m.name, mfr.name as manufacturer, cat.name as category,
        m.description, m.weight_kg, m.rental_price_day, m.replacement_value, m.notes
      FROM equipment_models m
      LEFT JOIN manufacturers mfr ON m.manufacturer_id = mfr.id
      LEFT JOIN categories    cat ON m.category_id     = cat.id
      ORDER BY m.name
    `).all();
  } else if (type === 'assets') {
    headers = ['barcode','model','serial_number','condition','location','purchase_date','purchase_price','notes'];
    rows = db.prepare(`
      SELECT a.barcode, m.name as model, a.serial_number, a.condition,
        sl.name as location, a.purchase_date, a.purchase_price, a.notes
      FROM assets a
      JOIN equipment_models m ON a.model_id = m.id
      LEFT JOIN storage_locations sl ON a.storage_location_id = sl.id
      ORDER BY m.name, a.barcode
    `).all();
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const val = r[h] == null ? '' : String(r[h]);
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-export.csv"`);
  res.send(csv);
});

// ── IMPORT ────────────────────────────────────────────────────────────────
router.post('/import/:type', authMiddleware, (req, res) => {
  const db   = getDb();
  const type = req.params.type;
  const { rows } = req.body;

  // skipped is now an array of { row, reason } objects, not just a count
  const results = { created: 0, skipped: [], errors: [] };

  const skip = (identifier, reason) =>
    results.skipped.push({ identifier: String(identifier), reason });

  const doImport = db.transaction(() => {

    // ── Categories ──────────────────────────────────────────────────────
    if (type === 'categories') {
      const ins = db.prepare(
        'INSERT OR IGNORE INTO categories (id, name, color) VALUES (?, ?, ?)'
      );
      for (let i = 0; i < rows.length; i++) {
        const row  = rows[i];
        const label = row.name ? `"${row.name}"` : `row ${i + 2}`;
        if (!row.name || !row.name.trim()) {
          skip(label, 'Missing required field: name'); continue;
        }
        const exists = db.prepare('SELECT id FROM categories WHERE name=?').get(row.name.trim());
        if (exists) { skip(label, 'Category with this name already exists'); continue; }
        try {
          ins.run(uuidv4(), row.name.trim(), row.color || '#6c63ff');
          results.created++;
        } catch (e) {
          results.errors.push(`${label}: ${e.message}`);
        }
      }

    // ── Manufacturers ────────────────────────────────────────────────────
    } else if (type === 'manufacturers') {
      const ins = db.prepare(
        'INSERT OR IGNORE INTO manufacturers (id, name, website, notes) VALUES (?, ?, ?, ?)'
      );
      for (let i = 0; i < rows.length; i++) {
        const row   = rows[i];
        const label = row.name ? `"${row.name}"` : `row ${i + 2}`;
        if (!row.name || !row.name.trim()) {
          skip(label, 'Missing required field: name'); continue;
        }
        const exists = db.prepare('SELECT id FROM manufacturers WHERE name=?').get(row.name.trim());
        if (exists) { skip(label, 'Manufacturer with this name already exists'); continue; }
        try {
          ins.run(uuidv4(), row.name.trim(), row.website || null, row.notes || null);
          results.created++;
        } catch (e) {
          results.errors.push(`${label}: ${e.message}`);
        }
      }

    // ── Equipment Models ─────────────────────────────────────────────────
    } else if (type === 'models') {
      for (let i = 0; i < rows.length; i++) {
        const row   = rows[i];
        const label = row.name ? `"${row.name}"` : `row ${i + 2}`;
        if (!row.name || !row.name.trim()) {
          skip(label, 'Missing required field: name'); continue;
        }
        const exists = db.prepare('SELECT id FROM equipment_models WHERE name=?').get(row.name.trim());
        if (exists) { skip(label, `Model named "${row.name.trim()}" already exists`); continue; }

        // Warn if manufacturer/category referenced but not found (non-blocking)
        const mfr = row.manufacturer
          ? db.prepare('SELECT id FROM manufacturers WHERE name=?').get(row.manufacturer.trim())
          : null;
        if (row.manufacturer && row.manufacturer.trim() && !mfr) {
          // Still import the model, just without the manufacturer link — note it in a warning
          results.errors.push(`"${row.name}" warning: manufacturer "${row.manufacturer}" not found — imported without manufacturer`);
        }

        const cat = row.category
          ? db.prepare('SELECT id FROM categories WHERE name=?').get(row.category.trim())
          : null;
        if (row.category && row.category.trim() && !cat) {
          results.errors.push(`"${row.name}" warning: category "${row.category}" not found — imported without category`);
        }

        try {
          db.prepare(
            'INSERT INTO equipment_models (id,name,manufacturer_id,category_id,description,weight_kg,rental_price_day,replacement_value,notes) VALUES (?,?,?,?,?,?,?,?,?)'
          ).run(
            uuidv4(), row.name.trim(),
            mfr?.id || null, cat?.id || null,
            row.description || null,
            row.weight_kg ? parseFloat(row.weight_kg) : null,
            row.rental_price_day ? parseFloat(row.rental_price_day) : 0,
            row.replacement_value ? parseFloat(row.replacement_value) : 0,
            row.notes || null
          );
          results.created++;
        } catch (e) {
          results.errors.push(`${label}: ${e.message}`);
        }
      }

    // ── Assets ───────────────────────────────────────────────────────────
    } else if (type === 'assets') {
      for (let i = 0; i < rows.length; i++) {
        const row   = rows[i];
        const label = row.barcode ? `barcode "${row.barcode}"` : `row ${i + 2}`;

        if (!row.barcode || !row.barcode.trim()) {
          skip(label, 'Missing required field: barcode'); continue;
        }
        if (!row.model || !row.model.trim()) {
          skip(label, 'Missing required field: model'); continue;
        }

        const dupBarcode = db.prepare('SELECT id FROM assets WHERE barcode=?').get(row.barcode.trim());
        if (dupBarcode) {
          skip(label, `Barcode "${row.barcode.trim()}" already exists in the system`); continue;
        }

        const model = db.prepare('SELECT id FROM equipment_models WHERE name=?').get(row.model.trim());
        if (!model) {
          skip(label, `Equipment model "${row.model.trim()}" not found — add the model first`); continue;
        }

        const loc = row.location
          ? db.prepare('SELECT id FROM storage_locations WHERE name=?').get(row.location.trim())
          : null;
        if (row.location && row.location.trim() && !loc) {
          results.errors.push(`${label} warning: location "${row.location}" not found — imported without location`);
        }

        const validConditions = ['excellent','good','fair','poor','damaged'];
        const condition = validConditions.includes((row.condition||'').toLowerCase())
          ? row.condition.toLowerCase() : 'excellent';
        if (row.condition && !validConditions.includes(row.condition.toLowerCase())) {
          results.errors.push(`${label} warning: unknown condition "${row.condition}" — defaulted to "excellent"`);
        }

        try {
          db.prepare(
            'INSERT INTO assets (id,model_id,barcode,serial_number,condition,storage_location_id,purchase_date,purchase_price,notes) VALUES (?,?,?,?,?,?,?,?,?)'
          ).run(
            uuidv4(), model.id, row.barcode.trim(),
            row.serial_number || null,
            condition,
            loc?.id || null,
            row.purchase_date || null,
            row.purchase_price ? parseFloat(row.purchase_price) : null,
            row.notes || null
          );
          results.created++;
        } catch (e) {
          results.errors.push(`${label}: ${e.message}`);
        }
      }
    }
  });

  doImport();
  res.json(results);
});

module.exports = router;
