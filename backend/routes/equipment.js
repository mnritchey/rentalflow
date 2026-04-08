const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/data/uploads/equipment';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Manufacturers
router.get('/manufacturers', authMiddleware, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM manufacturers ORDER BY name').all());
});
router.post('/manufacturers', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, website, notes } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO manufacturers (id, name, website, notes) VALUES (?, ?, ?, ?)').run(id, name, website, notes);
  res.json({ id, name, website, notes });
});
router.put('/manufacturers/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, website, notes } = req.body;
  db.prepare('UPDATE manufacturers SET name=?, website=?, notes=? WHERE id=?').run(name, website, notes, req.params.id);
  res.json({ success: true });
});
router.delete('/manufacturers/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM manufacturers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Categories
router.get('/categories', authMiddleware, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});
router.post('/categories', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, color, parent_id } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO categories (id, name, color, parent_id) VALUES (?, ?, ?, ?)').run(id, name, color || '#4f46e5', parent_id || null);
  res.json({ id, name, color, parent_id });
});
router.put('/categories/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, color } = req.body;
  db.prepare('UPDATE categories SET name=?, color=? WHERE id=?').run(name, color, req.params.id);
  res.json({ success: true });
});
router.delete('/categories/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Storage Locations
router.get('/locations', authMiddleware, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM storage_locations ORDER BY name').all());
});
router.post('/locations', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, description, notes } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO storage_locations (id, name, description, notes) VALUES (?, ?, ?, ?)').run(id, name, description, notes || null);
  res.json({ id, name, description });
});
router.put('/locations/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, description, notes } = req.body;
  db.prepare('UPDATE storage_locations SET name=?, description=?, notes=? WHERE id=?').run(name, description, notes || null, req.params.id);
  res.json({ success: true });
});
router.delete('/locations/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM storage_locations WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Equipment Models
router.get('/models', authMiddleware, (req, res) => {
  const db = getDb();
  const models = db.prepare(`
    SELECT m.*, mfr.name as manufacturer_name, cat.name as category_name, cat.color as category_color,
    COUNT(a.id) as total_assets,
    SUM(CASE WHEN a.status = 'available' THEN 1 ELSE 0 END) as available_assets
    FROM equipment_models m
    LEFT JOIN manufacturers mfr ON m.manufacturer_id = mfr.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN assets a ON a.model_id = m.id
    GROUP BY m.id
    ORDER BY m.name
  `).all();
  res.json(models);
});

router.get('/models/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const model = db.prepare(`
    SELECT m.*, mfr.name as manufacturer_name, cat.name as category_name, cat.color as category_color
    FROM equipment_models m
    LEFT JOIN manufacturers mfr ON m.manufacturer_id = mfr.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!model) return res.status(404).json({ error: 'Not found' });
  const assets = db.prepare(`
    SELECT a.*, sl.name as location_name FROM assets a
    LEFT JOIN storage_locations sl ON a.storage_location_id = sl.id
    LEFT JOIN project_assets pa ON pa.asset_id = a.id AND pa.status = 'checked_out'
    LEFT JOIN projects p ON p.id = pa.project_id
    WHERE a.model_id = ?
    ORDER BY a.barcode
  `).all(req.params.id);
  res.json({ ...model, assets });
});

router.post('/models', authMiddleware, upload.single('image'), (req, res) => {
  const db = getDb();
  const { name, manufacturer_id, category_id, description, weight_lbs, rental_price_day, replacement_value, notes } = req.body;
  const id = uuidv4();
  const image_path = req.file ? `/uploads/equipment/${req.file.filename}` : null;
  db.prepare('INSERT INTO equipment_models (id, name, manufacturer_id, category_id, description, weight_lbs, rental_price_day, replacement_value, image_path, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, manufacturer_id || null, category_id || null, description, weight_lbs || null, rental_price_day || 0, replacement_value || 0, image_path, notes);
  res.json({ id, name });
});

router.put('/models/:id', authMiddleware, upload.single('image'), (req, res) => {
  const db = getDb();
  const { name, manufacturer_id, category_id, description, weight_lbs, rental_price_day, replacement_value, notes } = req.body;
  const image_path = req.file ? `/uploads/equipment/${req.file.filename}` : undefined;
  if (image_path) {
    db.prepare('UPDATE equipment_models SET name=?, manufacturer_id=?, category_id=?, description=?, weight_lbs=?, rental_price_day=?, replacement_value=?, image_path=?, notes=? WHERE id=?').run(name, manufacturer_id || null, category_id || null, description, weight_lbs || null, rental_price_day || 0, replacement_value || 0, image_path, notes, req.params.id);
  } else {
    db.prepare('UPDATE equipment_models SET name=?, manufacturer_id=?, category_id=?, description=?, weight_lbs=?, rental_price_day=?, replacement_value=?, notes=? WHERE id=?').run(name, manufacturer_id || null, category_id || null, description, weight_lbs || null, rental_price_day || 0, replacement_value || 0, notes, req.params.id);
  }
  res.json({ success: true });
});

router.delete('/models/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM equipment_models WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
