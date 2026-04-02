const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// List all licenses
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const licenses = db.prepare(`
    SELECT l.*,
      COUNT(DISTINCT la.id) AS assigned_count
    FROM software_licenses l
    LEFT JOIN license_assignments la ON la.license_id = l.id
    GROUP BY l.id
    ORDER BY l.software_name, l.version
  `).all();
  res.json(licenses);
});

// Get one license with its assignments
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const license = db.prepare('SELECT * FROM software_licenses WHERE id=?').get(req.params.id);
  if (!license) return res.status(404).json({ error: 'Not found' });

  const assignments = db.prepare(`
    SELECT la.*, a.barcode, a.serial_number,
      m.name AS model_name, cat.name AS category_name,
      u.full_name AS assigned_by_name
    FROM license_assignments la
    JOIN assets a ON la.asset_id = a.id
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN users u ON la.assigned_by = u.id
    WHERE la.license_id = ?
    ORDER BY la.assigned_at DESC
  `).all(req.params.id);

  res.json({ ...license, assignments });
});

// Create license
router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { software_name, version, license_key, license_type, vendor, seat_count,
    purchase_date, expiry_date, cost, notes } = req.body;
  if (!software_name) return res.status(400).json({ error: 'Software name required' });
  const id = uuidv4();
  db.prepare(`
    INSERT INTO software_licenses
      (id, software_name, version, license_key, license_type, vendor,
       seat_count, purchase_date, expiry_date, cost, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, software_name.trim(), version||null, license_key||null,
    license_type||'perpetual', vendor||null,
    seat_count||null, purchase_date||null, expiry_date||null, cost||null, notes||null);
  res.json({ id });
});

// Update license
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { software_name, version, license_key, license_type, vendor,
    seat_count, purchase_date, expiry_date, cost, notes } = req.body;
  db.prepare(`
    UPDATE software_licenses SET software_name=?, version=?, license_key=?,
      license_type=?, vendor=?, seat_count=?, purchase_date=?, expiry_date=?,
      cost=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(software_name, version||null, license_key||null, license_type||'perpetual',
    vendor||null, seat_count||null, purchase_date||null, expiry_date||null,
    cost||null, notes||null, req.params.id);
  res.json({ success: true });
});

// Delete license (removes assignments too)
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM license_assignments WHERE license_id=?').run(req.params.id);
  db.prepare('DELETE FROM software_licenses WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Assign license to an asset
router.post('/:id/assign', authMiddleware, (req, res) => {
  const db = getDb();
  const { asset_id, notes } = req.body;
  if (!asset_id) return res.status(400).json({ error: 'asset_id required' });

  const license = db.prepare('SELECT * FROM software_licenses WHERE id=?').get(req.params.id);
  if (!license) return res.status(404).json({ error: 'License not found' });

  const asset = db.prepare('SELECT id FROM assets WHERE id=?').get(asset_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  // Check seat limit
  if (license.seat_count) {
    const used = db.prepare('SELECT COUNT(*) AS c FROM license_assignments WHERE license_id=?').get(req.params.id).c;
    if (used >= license.seat_count) {
      return res.status(400).json({ error: `All ${license.seat_count} seats are in use` });
    }
  }

  // Prevent duplicate assignment
  const exists = db.prepare('SELECT id FROM license_assignments WHERE license_id=? AND asset_id=?').get(req.params.id, asset_id);
  if (exists) return res.status(400).json({ error: 'This license is already assigned to that asset' });

  const id = uuidv4();
  db.prepare('INSERT INTO license_assignments (id, license_id, asset_id, notes, assigned_by) VALUES (?,?,?,?,?)')
    .run(id, req.params.id, asset_id, notes||null, req.user.id);
  res.json({ id });
});

// Remove assignment
router.delete('/:id/assign/:assignId', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM license_assignments WHERE id=? AND license_id=?').run(req.params.assignId, req.params.id);
  res.json({ success: true });
});

// Get all licenses assigned to a specific asset
router.get('/asset/:assetId', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT la.*, l.software_name, l.version, l.license_type, l.expiry_date, l.vendor
    FROM license_assignments la
    JOIN software_licenses l ON la.license_id = l.id
    WHERE la.asset_id = ?
    ORDER BY l.software_name
  `).all(req.params.assetId);
  res.json(rows);
});

module.exports = router;
