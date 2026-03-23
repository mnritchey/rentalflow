const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const records = db.prepare(`
    SELECT mr.*, a.barcode, a.serial_number, m.name as model_name,
      cat.name as category_name, cat.color as category_color,
      u_rep.full_name as reported_by_name, u_res.full_name as resolved_by_name
    FROM maintenance_records mr
    JOIN assets a ON mr.asset_id = a.id
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN users u_rep ON mr.reported_by = u_rep.id
    LEFT JOIN users u_res ON mr.resolved_by = u_res.id
    ORDER BY mr.created_at DESC
  `).all();
  res.json(records);
});

router.get('/asset/:assetId', authMiddleware, (req, res) => {
  const db = getDb();
  const records = db.prepare(`
    SELECT mr.*, u_rep.full_name as reported_by_name, u_res.full_name as resolved_by_name
    FROM maintenance_records mr
    LEFT JOIN users u_rep ON mr.reported_by = u_rep.id
    LEFT JOIN users u_res ON mr.resolved_by = u_res.id
    WHERE mr.asset_id = ?
    ORDER BY mr.created_at DESC
  `).all(req.params.assetId);
  res.json(records);
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { asset_id, type, description, cost, vendor, notes } = req.body;
  const id = uuidv4();

  // Mark asset as in maintenance
  db.prepare("UPDATE assets SET condition='damaged', status='maintenance' WHERE id=?").run(asset_id);
  db.prepare(`
    INSERT INTO maintenance_records (id, asset_id, type, description, cost, vendor, notes, status, reported_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, asset_id, type || 'repair', description, cost || null, vendor, notes, req.user.id);

  res.json({ id });
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { type, description, cost, vendor, notes, status, resolution_notes, condition_after } = req.body;

  const existing = db.prepare('SELECT * FROM maintenance_records WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (status === 'resolved') {
    db.prepare(`
      UPDATE maintenance_records SET type=?, description=?, cost=?, vendor=?, notes=?,
        status='resolved', resolution_notes=?, resolved_by=?, resolved_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(type, description, cost || null, vendor, notes, resolution_notes, req.user.id, req.params.id);
    // Restore asset
    const newCondition = condition_after || 'good';
    db.prepare("UPDATE assets SET condition=?, status='available' WHERE id=?").run(newCondition, existing.asset_id);
  } else {
    db.prepare(`
      UPDATE maintenance_records SET type=?, description=?, cost=?, vendor=?, notes=?, status=?
      WHERE id=?
    `).run(type, description, cost || null, vendor, notes, status || 'open', req.params.id);
  }

  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const record = db.prepare('SELECT * FROM maintenance_records WHERE id=?').get(req.params.id);
  if (record && record.status === 'open') {
    // Restore asset status if deleting an open record
    db.prepare("UPDATE assets SET status='available' WHERE id=? AND status='maintenance'").run(record.asset_id);
  }
  db.prepare('DELETE FROM maintenance_records WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
