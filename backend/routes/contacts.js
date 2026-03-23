const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM contacts ORDER BY name').all());
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, email, phone, company, address, notes } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO contacts (id, name, email, phone, company, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, email, phone, company, address, notes);
  res.json({ id, name, email, phone, company });
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, email, phone, company, address, notes } = req.body;
  db.prepare('UPDATE contacts SET name=?, email=?, phone=?, company=?, address=?, notes=? WHERE id=?').run(name, email, phone, company, address, notes, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
