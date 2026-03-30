const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Get tasks — operators see only their own + global, admins see all
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let where = [];
  let params = [];

  if (req.user.role !== 'admin') {
    // Operators: global tasks OR assigned to them
    where.push('(t.assigned_to IS NULL OR t.assigned_to = ?)');
    params.push(req.user.id);
  }
  if (status) { where.push('t.status = ?'); params.push(status); }

  const sql = `
    SELECT t.*,
      u_assign.full_name  AS assigned_to_name,
      u_assign.username   AS assigned_to_username,
      u_created.full_name AS created_by_name,
      u_closed.full_name  AS closed_by_name,
      p.name              AS project_name,
      COUNT(tn.id)        AS note_count
    FROM tasks t
    LEFT JOIN users u_assign  ON t.assigned_to  = u_assign.id
    LEFT JOIN users u_created ON t.created_by   = u_created.id
    LEFT JOIN users u_closed  ON t.closed_by    = u_closed.id
    LEFT JOIN projects p      ON t.project_id   = p.id
    LEFT JOIN task_notes tn   ON tn.task_id     = t.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY t.id
    ORDER BY
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `;
  res.json(db.prepare(sql).all(...params));
});

// Summary counts for dashboard
router.get('/summary', authMiddleware, (req, res) => {
  const db = getDb();
  let where = "t.status != 'completed'";
  let params = [];
  if (req.user.role !== 'admin') {
    where += ' AND (t.assigned_to IS NULL OR t.assigned_to = ?)';
    params.push(req.user.id);
  }
  const open  = db.prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE ${where}`).get(...params).c;
  const urgent = db.prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE ${where} AND t.priority IN ('urgent','high')`).get(...params).c;
  const overdue = db.prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE ${where} AND t.due_date < date('now')`).get(...params).c;
  res.json({ open, urgent, overdue });
});

// Single task with notes
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*,
      u_assign.full_name  AS assigned_to_name,
      u_assign.username   AS assigned_to_username,
      u_created.full_name AS created_by_name,
      p.name              AS project_name
    FROM tasks t
    LEFT JOIN users u_assign  ON t.assigned_to = u_assign.id
    LEFT JOIN users u_created ON t.created_by  = u_created.id
    LEFT JOIN projects p      ON t.project_id  = p.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  // Permission check for operators
  if (req.user.role !== 'admin' && task.assigned_to && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const notes = db.prepare(`
    SELECT tn.*, u.full_name AS author_name, u.username AS author_username
    FROM task_notes tn
    LEFT JOIN users u ON tn.user_id = u.id
    WHERE tn.task_id = ?
    ORDER BY tn.created_at ASC
  `).all(req.params.id);

  res.json({ ...task, notes });
});

// Create task
router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { title, description, priority, due_date, assigned_to, project_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  // Operators can only assign to themselves or leave global
  const assignee = (req.user.role === 'admin') ? (assigned_to || null) : (assigned_to === req.user.id ? req.user.id : null);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, due_date, assigned_to, project_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), description || null, priority || 'normal',
    due_date || null, assignee, project_id || null, req.user.id);
  res.json({ id });
});

// Update task
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const { title, description, priority, due_date, assigned_to, project_id, status } = req.body;

  // Only admin can reassign
  const newAssignee = req.user.role === 'admin' ? (assigned_to ?? task.assigned_to) : task.assigned_to;

  const closed_by   = status === 'completed' && task.status !== 'completed' ? req.user.id : task.closed_by;
  const closed_at   = status === 'completed' && task.status !== 'completed' ? new Date().toISOString() : task.closed_at;

  db.prepare(`
    UPDATE tasks SET title=?, description=?, priority=?, due_date=?,
      assigned_to=?, project_id=?, status=?, closed_by=?, closed_at=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(title ?? task.title, description ?? task.description, priority ?? task.priority,
    due_date ?? task.due_date, newAssignee, project_id ?? task.project_id,
    status ?? task.status, closed_by, closed_at, req.params.id);

  res.json({ success: true });
});

// Delete task (admin only)
router.delete('/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const db = getDb();
  db.prepare('DELETE FROM task_notes WHERE task_id=?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Add note to task
router.post('/:id/notes', authMiddleware, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Note content required' });
  const id = uuidv4();
  db.prepare('INSERT INTO task_notes (id, task_id, user_id, content) VALUES (?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, content.trim());
  res.json({ id });
});

// Delete note (admin or note author)
router.delete('/:id/notes/:noteId', authMiddleware, (req, res) => {
  const db = getDb();
  const note = db.prepare('SELECT * FROM task_notes WHERE id=?').get(req.params.noteId);
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && note.user_id !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM task_notes WHERE id=?').run(req.params.noteId);
  res.json({ success: true });
});

module.exports = router;
