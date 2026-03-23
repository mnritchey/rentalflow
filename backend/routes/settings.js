const router = require('express').Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/data/uploads/company';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  rows.forEach(s => obj[s.key] = s.value);
  res.json(obj);
});

router.put('/', authMiddleware, (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const upsertAll = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, value);
    }
  });
  upsertAll();
  res.json({ success: true });
});

router.post('/logo', authMiddleware, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = getDb();
  const logoPath = `/uploads/company/${req.file.filename}`;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('logo_path', logoPath);
  res.json({ logo_path: logoPath });
});

router.delete('/logo', authMiddleware, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key='logo_path'").get();
  if (row?.value) {
    const abs = '/data' + row.value.replace('/uploads', '/uploads');
    try { fs.unlinkSync('/data' + row.value); } catch {}
  }
  db.prepare("DELETE FROM settings WHERE key='logo_path'").run();
  res.json({ success: true });
});

// Version info — reads from package.json so it always reflects what's deployed
router.get('/version', (req, res) => {
  try {
    const pkg = require('../package.json');
    res.json({
      version:     pkg.version,
      name:        pkg.name,
      description: pkg.description,
      built_at:    new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    res.json({ version: 'unknown', name: 'rentalflow' });
  }
});

module.exports = router;
