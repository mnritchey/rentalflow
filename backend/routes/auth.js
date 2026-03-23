const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

router.get('/users', authMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, full_name, role, created_at FROM users').all();
  res.json(users);
});

router.post('/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, password, full_name, role } = req.body;
  const db = getDb();
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)').run(id, username, hash, full_name, role || 'operator');
    res.json({ id, username, full_name, role });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

router.put('/users/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { full_name, role, password } = req.body;
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET full_name=?, role=?, password_hash=? WHERE id=?').run(full_name, role, hash, req.params.id);
  } else {
    db.prepare('UPDATE users SET full_name=?, role=? WHERE id=?').run(full_name, role, req.params.id);
  }
  res.json({ success: true });
});

router.delete('/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
