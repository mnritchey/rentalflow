const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const assets = db.prepare(`
    SELECT a.*, m.name as model_name, m.rental_price_day, m.replacement_value,
    cat.name as category_name, cat.color as category_color,
    sl.name as location_name, sl.notes as location_notes,
    p.id as current_project_id, p.name as current_project_name
    FROM assets a
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN storage_locations sl ON a.storage_location_id = sl.id
    LEFT JOIN project_assets pa ON pa.asset_id = a.id AND pa.status = 'checked_out'
    LEFT JOIN projects p ON p.id = pa.project_id
    ORDER BY m.name, a.barcode
  `).all();
  res.json(assets);
});

router.get('/lookup/:barcode', authMiddleware, (req, res) => {
  const db = getDb();
  const asset = db.prepare(`
    SELECT a.*, m.name as model_name, m.rental_price_day, m.replacement_value,
    cat.name as category_name, sl.name as location_name
    FROM assets a
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN storage_locations sl ON a.storage_location_id = sl.id
    WHERE a.barcode = ?
  `).get(req.params.barcode);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  
  // Find current project assignment
  const assignment = db.prepare(`
    SELECT pa.*, p.name as project_name FROM project_assets pa
    JOIN projects p ON pa.project_id = p.id
    WHERE pa.asset_id = ? AND pa.status = 'checked_out'
  `).get(asset.id);
  
  res.json({ ...asset, current_assignment: assignment });
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { model_id, barcode, serial_number, storage_location_id, condition, notes, purchase_date, purchase_price } = req.body;
  const id = uuidv4();
  try {
    db.prepare('INSERT INTO assets (id, model_id, barcode, serial_number, storage_location_id, condition, notes, purchase_date, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, model_id, barcode, serial_number, storage_location_id || null, condition || 'excellent', notes, purchase_date, purchase_price);
    res.json({ id, barcode });
  } catch (e) {
    res.status(400).json({ error: 'Barcode already exists' });
  }
});

router.post('/bulk', authMiddleware, (req, res) => {
  const db = getDb();
  const { model_id, barcodes, storage_location_id } = req.body;
  const results = [];
  const insert = db.prepare('INSERT OR IGNORE INTO assets (id, model_id, barcode, storage_location_id) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction(() => {
    for (const barcode of barcodes) {
      const id = uuidv4();
      insert.run(id, model_id, barcode.trim(), storage_location_id || null);
      results.push({ id, barcode: barcode.trim() });
    }
  });
  insertMany();
  res.json(results);
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { barcode, serial_number, storage_location_id, condition, notes, purchase_date, purchase_price } = req.body;
  db.prepare('UPDATE assets SET barcode=?, serial_number=?, storage_location_id=?, condition=?, notes=?, purchase_date=?, purchase_price=? WHERE id=?').run(barcode, serial_number, storage_location_id || null, condition, notes, purchase_date, purchase_price, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM assets WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Generate next available barcode
router.get('/next-barcode', authMiddleware, (req, res) => {
  const db = getDb();
  const { prefix = 'RF' } = req.query;

  // Find all existing barcodes that match the prefix + numeric pattern
  const existing = db.prepare(
    "SELECT barcode FROM assets WHERE barcode LIKE ? ORDER BY barcode"
  ).all(prefix + '%').map(r => r.barcode);

  // Find the highest numeric suffix used
  let maxNum = 0;
  for (const b of existing) {
    const suffix = b.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }

  // Next barcode = prefix + zero-padded number
  const next = prefix + String(maxNum + 1).padStart(4, '0');
  res.json({ barcode: next, prefix, next_number: maxNum + 1 });
});

// Check if a barcode is available
router.get('/check-barcode/:barcode', authMiddleware, (req, res) => {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM assets WHERE barcode=?').get(req.params.barcode);
  res.json({ available: !exists, barcode: req.params.barcode });
});

module.exports = router;

// Transfer asset to a different model
router.put('/:id/transfer', authMiddleware, (req, res) => {
  const db = getDb();
  const { new_model_id } = req.body;
  if (!new_model_id) return res.status(400).json({ error: 'new_model_id required' });
  const model = db.prepare('SELECT id, name FROM equipment_models WHERE id=?').get(new_model_id);
  if (!model) return res.status(404).json({ error: 'Model not found' });
  db.prepare('UPDATE assets SET model_id=? WHERE id=?').run(new_model_id, req.params.id);
  res.json({ success: true, model_name: model.name });
});
