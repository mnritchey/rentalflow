const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT p.*, c.name as contact_name, c.company as contact_company,
    COUNT(DISTINCT pa.id) as total_items,
    SUM(CASE WHEN pa.status = 'checked_out' THEN 1 ELSE 0 END) as checked_out_count
    FROM projects p
    LEFT JOIN contacts c ON p.contact_id = c.id
    LEFT JOIN project_assets pa ON pa.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

// Projects with items still checked out past end_date
router.get('/overdue', authMiddleware, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const overdue = db.prepare(`
    SELECT p.*,
      c.name  AS contact_name,
      c.phone AS contact_phone,
      c.email AS contact_email,
      COUNT(DISTINCT pa.id) AS checked_out_count,
      MIN(p.end_date) AS end_date
    FROM projects p
    LEFT JOIN contacts c ON p.contact_id = c.id
    JOIN project_assets pa ON pa.project_id = p.id AND pa.status = 'checked_out'
    WHERE p.end_date < ?
      AND p.status NOT IN ('completed', 'cancelled')
    GROUP BY p.id
    ORDER BY p.end_date ASC
  `).all(today);
  res.json(overdue);
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, c.name as contact_name, c.company as contact_company, c.email as contact_email, c.phone as contact_phone
    FROM projects p
    LEFT JOIN contacts c ON p.contact_id = c.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(`
    SELECT pa.*, a.barcode, a.serial_number, a.condition,
    m.name as model_name, m.rental_price_day, m.replacement_value,
    cat.name as category_name, cat.color as category_color,
    u_out.full_name as checked_out_by_name,
    u_in.full_name as checked_in_by_name
    FROM project_assets pa
    JOIN assets a ON pa.asset_id = a.id
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN users u_out ON pa.checked_out_by = u_out.id
    LEFT JOIN users u_in ON pa.checked_in_by = u_in.id
    WHERE pa.project_id = ?
    ORDER BY m.name, a.barcode
  `).all(req.params.id);

  const lineItems = db.prepare(
    'SELECT * FROM project_line_items WHERE project_id=? ORDER BY sort_order, created_at'
  ).all(req.params.id);
  res.json({ ...project, items, line_items: lineItems });
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, contact_id, start_date, end_date, venue, description, notes, eula_text } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });
  const id = uuidv4();
  const defaultEula = db.prepare("SELECT value FROM settings WHERE key='eula_default'").get()?.value;
  const nullIfEmpty = v => (v && v.trim()) ? v.trim() : null;
  try {
    db.prepare('INSERT INTO projects (id, name, contact_id, start_date, end_date, venue, description, notes, eula_text, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, name.trim(), nullIfEmpty(contact_id), nullIfEmpty(start_date), nullIfEmpty(end_date),
      nullIfEmpty(venue), nullIfEmpty(description), nullIfEmpty(notes),
      eula_text || defaultEula, req.user.id
    );
    res.json({ id, name });
  } catch (e) {
    console.error('Project create error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, contact_id, status, start_date, end_date, venue, description, notes, eula_text, signature_data, signed_by } = req.body;
  const signed_at = signature_data ? new Date().toISOString() : undefined;
  if (signed_at) {
    db.prepare('UPDATE projects SET name=?, contact_id=?, status=?, start_date=?, end_date=?, venue=?, description=?, notes=?, eula_text=?, signature_data=?, signed_at=?, signed_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, contact_id || null, status, start_date, end_date, venue, description, notes, eula_text, signature_data, signed_at, signed_by, req.params.id);
  } else {
    db.prepare('UPDATE projects SET name=?, contact_id=?, status=?, start_date=?, end_date=?, venue=?, description=?, notes=?, eula_text=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, contact_id || null, status, start_date, end_date, venue, description, notes, eula_text, req.params.id);
  }
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM project_assets WHERE project_id=?').run(req.params.id);
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Add asset to project (pre-booking)
router.post('/:id/items', authMiddleware, (req, res) => {
  const db = getDb();
  const { asset_id, expected_return_date } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO project_assets (id, project_id, asset_id, expected_return_date, status) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, asset_id, expected_return_date, 'booked');
  res.json({ id });
});

router.delete('/:id/items/:itemId', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM project_assets WHERE id=? AND project_id=?').run(req.params.itemId, req.params.id);
  res.json({ success: true });
});

// ── Line Items (manual text entries with quantity) ──────────────────────────

router.get('/:id/line-items', authMiddleware, (req, res) => {
  const db = getDb();
  const items = db.prepare(
    'SELECT * FROM project_line_items WHERE project_id=? ORDER BY sort_order, created_at'
  ).all(req.params.id);
  res.json(items);
});

router.post('/:id/line-items', authMiddleware, (req, res) => {
  const db = getDb();
  const { description, quantity, unit_price, notes } = req.body;
  if (!description || !description.trim())
    return res.status(400).json({ error: 'Description is required' });
  const id = uuidv4();
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order),0) as m FROM project_line_items WHERE project_id=?'
  ).get(req.params.id).m;
  db.prepare(
    'INSERT INTO project_line_items (id, project_id, description, quantity, unit_price, notes, sort_order) VALUES (?,?,?,?,?,?,?)'
  ).run(id, req.params.id, description.trim(), quantity || 1, unit_price || 0, notes || null, maxOrder + 1);
  res.json({ id });
});

router.put('/:id/line-items/:itemId', authMiddleware, (req, res) => {
  const db = getDb();
  const { description, quantity, unit_price, notes } = req.body;
  db.prepare(
    'UPDATE project_line_items SET description=?, quantity=?, unit_price=?, notes=? WHERE id=? AND project_id=?'
  ).run(description, quantity || 1, unit_price || 0, notes || null, req.params.itemId, req.params.id);
  res.json({ success: true });
});

router.delete('/:id/line-items/:itemId', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM project_line_items WHERE id=? AND project_id=?').run(req.params.itemId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
