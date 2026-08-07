const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function getMembership(projectId, userId) {
  return db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
}

// GET /api/tasks/project/:projectId - list tasks in a project
router.get('/project/:projectId', (req, res) => {
  const member = getMembership(req.params.projectId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this project' });

  const tasks = db.prepare(`
    SELECT t.*, u.name as assigned_name, u.email as assigned_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.project_id = ?
    ORDER BY t.created_at DESC
  `).all(req.params.projectId);

  res.json(tasks);
});

// POST /api/tasks - create a task (any project member)
router.post('/', (req, res) => {
  const { project_id, title, description, assigned_to, due_date, status } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title are required' });

  const member = getMembership(project_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this project' });

  if (assigned_to) {
    const assigneeMember = getMembership(project_id, assigned_to);
    if (!assigneeMember) return res.status(400).json({ error: 'Assignee is not a member of this project' });
  }

  const info = db.prepare(`
    INSERT INTO tasks (project_id, title, description, assigned_to, due_date, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(project_id, title, description || '', assigned_to || null, due_date || null, status || 'To Do', req.user.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(task);
});

// PUT /api/tasks/:id - update a task (status, assignment, etc.)
// Admins can edit any task; Members can only update status/details of tasks assigned to them.
router.put('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = getMembership(task.project_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this project' });

  const isAdmin = member.role === 'Admin';
  const isAssignee = task.assigned_to === req.user.id;
  if (!isAdmin && !isAssignee) {
    return res.status(403).json({ error: 'Only Admins or the assigned member can update this task' });
  }

  const { title, description, status, assigned_to, due_date } = req.body;

  // Members (non-admin) may only change status, not reassign or retitle
  const fields = isAdmin
    ? { title, description, status, assigned_to, due_date }
    : { status };

  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/tasks/:id - delete a task (Admin only)
router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = getMembership(task.project_id, req.user.id);
  if (!member || member.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Admins can delete tasks' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// GET /api/tasks/dashboard/:projectId - summary counts for dashboard
router.get('/dashboard/:projectId', (req, res) => {
  const member = getMembership(req.params.projectId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this project' });

  const total = db.prepare('SELECT COUNT(*) c FROM tasks WHERE project_id = ?').get(req.params.projectId).c;
  const todo = db.prepare("SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND status = 'To Do'").get(req.params.projectId).c;
  const inProgress = db.prepare("SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND status = 'In Progress'").get(req.params.projectId).c;
  const done = db.prepare("SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND status = 'Done'").get(req.params.projectId).c;
  const overdue = db.prepare(`
    SELECT COUNT(*) c FROM tasks
    WHERE project_id = ? AND status != 'Done' AND due_date IS NOT NULL AND due_date < date('now')
  `).get(req.params.projectId).c;

  res.json({ total, todo, inProgress, done, overdue });
});

module.exports = router;
