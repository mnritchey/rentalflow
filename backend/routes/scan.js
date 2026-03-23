const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { barcode, project_id, action, force_checkin_project_id } = req.body;
  const broadcast = req.app.get('broadcast');
  const logId = uuidv4();

  const asset = db.prepare(`
    SELECT a.*, m.name as model_name FROM assets a
    JOIN equipment_models m ON a.model_id = m.id
    WHERE a.barcode = ?
  `).get(barcode);

  if (!asset) {
    const msg = { success: false, sound: 'error', message: `Unknown barcode: ${barcode}` };
    db.prepare('INSERT INTO scan_log (id, barcode, project_id, action, user_id, result, message) VALUES (?, ?, ?, ?, ?, ?, ?)').run(logId, barcode, project_id, action, req.user.id, 'not_found', msg.message);
    broadcast('scan', { ...msg, barcode });
    return res.json(msg);
  }

  // CHECKOUT
  if (action === 'checkout') {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
    if (!project) return res.json({ success: false, sound: 'error', message: 'Project not found' });

    const alreadyOnThisProject = db.prepare(
      "SELECT * FROM project_assets WHERE project_id=? AND asset_id=? AND status='checked_out'"
    ).get(project_id, asset.id);
    if (alreadyOnThisProject) {
      const msg = { success: false, sound: 'warning', message: `${asset.model_name} (${barcode}) is already checked out on this project` };
      db.prepare('INSERT INTO scan_log (id, barcode, asset_id, project_id, action, user_id, result, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(logId, barcode, asset.id, project_id, 'checkout', req.user.id, 'duplicate', msg.message);
      return res.json(msg);
    }

    const currentAssignment = db.prepare(`
      SELECT pa.*, p.name as project_name FROM project_assets pa
      JOIN projects p ON pa.project_id = p.id
      WHERE pa.asset_id = ? AND pa.status = 'checked_out'
    `).get(asset.id);

    if (currentAssignment && !force_checkin_project_id) {
      return res.json({
        success: false, sound: 'warning', requires_action: true,
        action_type: 'already_checked_out',
        message: `${asset.model_name} (${barcode}) is checked out to "${currentAssignment.project_name}". Scan again to transfer here.`,
        asset, current_project_id: currentAssignment.project_id,
        current_project_name: currentAssignment.project_name,
        current_assignment_id: currentAssignment.id
      });
    }

    if (force_checkin_project_id && currentAssignment) {
      db.prepare('UPDATE project_assets SET status=?, checked_in_at=CURRENT_TIMESTAMP, checked_in_by=? WHERE id=?').run('checked_in', req.user.id, currentAssignment.id);
      db.prepare("UPDATE assets SET status='available' WHERE id=?").run(asset.id);
    }

    let assignment = db.prepare("SELECT * FROM project_assets WHERE project_id=? AND asset_id=? AND status='booked'").get(project_id, asset.id);
    if (!assignment) {
      const newId = uuidv4();
      db.prepare('INSERT INTO project_assets (id, project_id, asset_id, status, checked_out_at, checked_out_by) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)').run(newId, project_id, asset.id, 'checked_out', req.user.id);
    } else {
      db.prepare('UPDATE project_assets SET status=?, checked_out_at=CURRENT_TIMESTAMP, checked_out_by=? WHERE id=?').run('checked_out', req.user.id, assignment.id);
    }
    db.prepare("UPDATE assets SET status='checked_out' WHERE id=?").run(asset.id);

    const transferNote = force_checkin_project_id ? ` (transferred from "${currentAssignment?.project_name}")` : '';
    const msg = { success: true, sound: 'success', message: `✓ ${asset.model_name} (${barcode}) checked out${transferNote}`, asset };
    db.prepare('INSERT INTO scan_log (id, barcode, asset_id, project_id, action, user_id, result, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(logId, barcode, asset.id, project_id, 'checkout', req.user.id, 'success', msg.message);
    broadcast('scan', { ...msg, project_id });
    return res.json(msg);
  }

  // CHECKIN (project-specific)
  if (action === 'checkin') {
    const assignment = db.prepare("SELECT * FROM project_assets WHERE project_id=? AND asset_id=? AND status='checked_out'").get(project_id, asset.id);
    if (!assignment) {
      const anyAssignment = db.prepare(`
        SELECT pa.*, p.name as project_name FROM project_assets pa
        JOIN projects p ON pa.project_id = p.id
        WHERE pa.asset_id = ? AND pa.status = 'checked_out'
      `).get(asset.id);
      if (anyAssignment) return res.json({ success: false, sound: 'warning', message: `${asset.model_name} is checked out to "${anyAssignment.project_name}", not this project` });
      return res.json({ success: false, sound: 'error', message: `${asset.model_name} (${barcode}) is not checked out` });
    }
    db.prepare('UPDATE project_assets SET status=?, checked_in_at=CURRENT_TIMESTAMP, checked_in_by=? WHERE id=?').run('checked_in', req.user.id, assignment.id);
    db.prepare("UPDATE assets SET status='available' WHERE id=?").run(asset.id);
    const msg = { success: true, sound: 'success', message: `✓ ${asset.model_name} (${barcode}) checked in`, asset };
    db.prepare('INSERT INTO scan_log (id, barcode, asset_id, project_id, action, user_id, result, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(logId, barcode, asset.id, project_id, 'checkin', req.user.id, 'success', msg.message);
    broadcast('scan', { ...msg, project_id });
    return res.json(msg);
  }

  // GLOBAL CHECKIN
  if (action === 'global_checkin') {
    const assignment = db.prepare(`
      SELECT pa.*, p.name as project_name FROM project_assets pa
      JOIN projects p ON pa.project_id = p.id
      WHERE pa.asset_id = ? AND pa.status = 'checked_out'
    `).get(asset.id);
    if (!assignment) return res.json({ success: false, sound: 'error', message: `${asset.model_name} (${barcode}) is not checked out anywhere` });
    db.prepare('UPDATE project_assets SET status=?, checked_in_at=CURRENT_TIMESTAMP, checked_in_by=? WHERE id=?').run('checked_in', req.user.id, assignment.id);
    db.prepare("UPDATE assets SET status='available' WHERE id=?").run(asset.id);
    const msg = { success: true, sound: 'success', message: `✓ ${asset.model_name} (${barcode}) returned from "${assignment.project_name}"`, asset, from_project: assignment.project_name };
    db.prepare('INSERT INTO scan_log (id, barcode, asset_id, project_id, action, user_id, result, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(logId, barcode, asset.id, assignment.project_id, 'global_checkin', req.user.id, 'success', msg.message);
    broadcast('scan', { ...msg });
    return res.json(msg);
  }

  res.json({ success: false, sound: 'error', message: 'Invalid action' });
});

// Activity log — supports filtering by user, project, action, date range
router.get('/log', authMiddleware, (req, res) => {
  const db = getDb();
  const { user_id, project_id, action, result, from, to, limit = 500 } = req.query;

  let where = [];
  let params = [];

  if (user_id)    { where.push('sl.user_id = ?');    params.push(user_id); }
  if (project_id) { where.push('sl.project_id = ?'); params.push(project_id); }
  if (action)     { where.push('sl.action = ?');     params.push(action); }
  if (result)     { where.push('sl.result = ?');     params.push(result); }
  if (from)       { where.push('sl.created_at >= ?');params.push(from); }
  if (to)         { where.push('sl.created_at <= ?');params.push(to + ' 23:59:59'); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const logs = db.prepare(`
    SELECT
      sl.*,
      u.full_name  AS user_name,
      u.username   AS username,
      p.name       AS project_name,
      m.name       AS model_name,
      a.barcode    AS asset_barcode
    FROM scan_log sl
    LEFT JOIN users  u ON sl.user_id  = u.id
    LEFT JOIN projects p ON sl.project_id = p.id
    LEFT JOIN assets a ON sl.asset_id = a.id
    LEFT JOIN equipment_models m ON a.model_id = m.id
    ${whereClause}
    ORDER BY sl.created_at DESC
    LIMIT ?
  `).all(...params, parseInt(limit));

  res.json(logs);
});

// Summary stats for activity page
router.get('/log/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const stats = {
    by_user: db.prepare(`
      SELECT u.full_name, u.username, sl.user_id,
        COUNT(*) as total,
        SUM(CASE WHEN sl.action IN ('checkout','global_checkin') AND sl.result='success' THEN 1 ELSE 0 END) as checkouts,
        SUM(CASE WHEN sl.action IN ('checkin','global_checkin') AND sl.result='success' THEN 1 ELSE 0 END) as checkins
      FROM scan_log sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE sl.result = 'success'
      GROUP BY sl.user_id
      ORDER BY total DESC
    `).all(),
    by_action: db.prepare(`
      SELECT action, result, COUNT(*) as count
      FROM scan_log
      GROUP BY action, result
      ORDER BY count DESC
    `).all(),
    recent_days: db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as scans,
        SUM(CASE WHEN result='success' THEN 1 ELSE 0 END) as successes
      FROM scan_log
      WHERE created_at >= date('now', '-14 days')
      GROUP BY day ORDER BY day DESC
    `).all(),
  };
  res.json(stats);
});

module.exports = router;
