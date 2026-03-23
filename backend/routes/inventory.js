const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// List all sessions
router.get('/sessions', authMiddleware, (req, res) => {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.*,
      u.full_name AS created_by_name,
      COUNT(DISTINCT sc.asset_id) AS scanned_count
    FROM inventory_sessions s
    LEFT JOIN users u ON s.created_by = u.id
    LEFT JOIN inventory_scans sc ON sc.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all();
  res.json(sessions);
});

// Get one session with full results
router.get('/sessions/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT s.*, u.full_name AS created_by_name
    FROM inventory_sessions s
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Assets that were scanned in this session
  const scanned = db.prepare(`
    SELECT sc.*, a.barcode, a.serial_number, a.status AS asset_status,
      m.name AS model_name, cat.name AS category_name,
      u.full_name AS scanned_by_name
    FROM inventory_scans sc
    JOIN assets a ON sc.asset_id = a.id
    JOIN equipment_models m ON a.model_id = m.id
    LEFT JOIN categories cat ON m.category_id = cat.id
    LEFT JOIN users u ON sc.scanned_by = u.id
    WHERE sc.session_id = ?
    ORDER BY sc.scanned_at
  `).all(req.params.id);

  // All non-retired assets not scanned in this session (potentially missing)
  // Only if session is closed
  let missing = [];
  if (session.status === 'closed') {
    const scannedIds = new Set(scanned.map(s => s.asset_id));
    const allAssets = db.prepare(`
      SELECT a.*, m.name AS model_name, cat.name AS category_name
      FROM assets a
      JOIN equipment_models m ON a.model_id = m.id
      LEFT JOIN categories cat ON m.category_id = cat.id
      WHERE a.status NOT IN ('retired')
      ORDER BY m.name, a.barcode
    `).all();
    missing = allAssets.filter(a => !scannedIds.has(a.id));
  }

  res.json({ ...session, scanned, missing });
});

// Create new session
router.post('/sessions', authMiddleware, (req, res) => {
  const db = getDb();
  const { name, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Session name required' });
  // Only one open session at a time
  const openSession = db.prepare("SELECT id FROM inventory_sessions WHERE status='open'").get();
  if (openSession) return res.status(400).json({ error: 'An inventory session is already open. Close it before starting a new one.' });
  const id = uuidv4();
  db.prepare('INSERT INTO inventory_sessions (id, name, notes, created_by) VALUES (?, ?, ?, ?)')
    .run(id, name.trim(), notes || null, req.user.id);
  res.json({ id });
});

// Scan a barcode into the session
router.post('/sessions/:id/scan', authMiddleware, (req, res) => {
  const db = getDb();
  const { barcode } = req.body;
  if (!barcode) return res.status(400).json({ error: 'Barcode required' });

  const session = db.prepare("SELECT * FROM inventory_sessions WHERE id=? AND status='open'").get(req.params.id);
  if (!session) return res.status(400).json({ error: 'Session not found or already closed' });

  const asset = db.prepare(`
    SELECT a.*, m.name AS model_name FROM assets a
    JOIN equipment_models m ON a.model_id = m.id
    WHERE a.barcode = ?
  `).get(barcode.trim());

  if (!asset) return res.json({ success: false, sound: 'error', message: `Unknown barcode: ${barcode}` });

  // Check for duplicate scan in this session
  const alreadyScanned = db.prepare(
    'SELECT id FROM inventory_scans WHERE session_id=? AND asset_id=?'
  ).get(req.params.id, asset.id);

  if (alreadyScanned) {
    return res.json({ success: false, sound: 'warning', message: `${asset.model_name} (${barcode}) already scanned in this session`, asset });
  }

  // Record the scan
  const scanId = uuidv4();
  db.prepare('INSERT INTO inventory_scans (id, session_id, asset_id, barcode, scanned_by) VALUES (?, ?, ?, ?, ?)')
    .run(scanId, req.params.id, asset.id, barcode.trim(), req.user.id);

  // If asset was checked out, mark it as available (it's physically here)
  if (asset.status === 'checked_out') {
    const assignment = db.prepare("SELECT * FROM project_assets WHERE asset_id=? AND status='checked_out'").get(asset.id);
    if (assignment) {
      db.prepare("UPDATE project_assets SET status='checked_in', checked_in_at=CURRENT_TIMESTAMP, checked_in_by=? WHERE id=?")
        .run(req.user.id, assignment.id);
    }
    db.prepare("UPDATE assets SET status='available' WHERE id=?").run(asset.id);
  }

  const scannedCount = db.prepare('SELECT COUNT(*) AS c FROM inventory_scans WHERE session_id=?').get(req.params.id).c;
  return res.json({ success: true, sound: 'success', message: `✓ ${asset.model_name} (${barcode})`, asset, total_scanned: scannedCount });
});

// Remove a scan from the session (undo)
router.delete('/sessions/:id/scan/:assetId', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM inventory_scans WHERE session_id=? AND asset_id=?').run(req.params.id, req.params.assetId);
  res.json({ success: true });
});

// Close a session — mark unscanned items as missing
router.post('/sessions/:id/close', authMiddleware, (req, res) => {
  const db = getDb();
  const { mark_missing } = req.body; // array of asset IDs to mark missing, or true for all unscanned

  const session = db.prepare("SELECT * FROM inventory_sessions WHERE id=? AND status='open'").get(req.params.id);
  if (!session) return res.status(400).json({ error: 'Session not found or already closed' });

  const scannedIds = db.prepare('SELECT asset_id FROM inventory_scans WHERE session_id=?')
    .all(req.params.id).map(r => r.asset_id);

  let markedMissing = 0;
  if (mark_missing === true || (Array.isArray(mark_missing) && mark_missing.length > 0)) {
    const toMark = Array.isArray(mark_missing) ? mark_missing : null;
    const allAssets = db.prepare("SELECT id FROM assets WHERE status NOT IN ('retired', 'maintenance', 'checked_out')").all();
    const candidates = allAssets.filter(a => !scannedIds.includes(a.id));
    const targets = toMark ? candidates.filter(a => toMark.includes(a.id)) : candidates;

    const markStmt = db.prepare("UPDATE assets SET status='missing', condition='poor' WHERE id=?");
    const markAll = db.transaction(() => { targets.forEach(a => { markStmt.run(a.id); markedMissing++; }); });
    markAll();
  }

  db.prepare("UPDATE inventory_sessions SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ success: true, marked_missing: markedMissing });
});

// Reopen a session (if needed)
router.post('/sessions/:id/reopen', authMiddleware, (req, res) => {
  const db = getDb();
  const openSession = db.prepare("SELECT id FROM inventory_sessions WHERE status='open'").get();
  if (openSession) return res.status(400).json({ error: 'Another session is already open' });
  db.prepare("UPDATE inventory_sessions SET status='open', closed_at=NULL WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
