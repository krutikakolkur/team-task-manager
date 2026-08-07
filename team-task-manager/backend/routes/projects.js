const express = require('express');
const db = require('../db');
const { authenticate, requireProjectRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/projects - list all projects the current user belongs to
router.get('/', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, pm.role as my_role
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(projects);
});

// POST /api/projects - create a project (creator becomes Admin)
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const info = db.prepare(
    'INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)'
  ).run(name, description || '', req.user.id);

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(info.lastInsertRowid, req.user.id, 'Admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...project, my_role: 'Admin' });
});

// GET /api/projects/:projectId - project detail incl. members
router.get('/:projectId', (req, res) => {
  const member = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this project' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, pm.role
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
  `).all(req.params.projectId);

  res.json({ ...project, my_role: member.role, members });
});

// POST /api/projects/:projectId/members - invite/add a member (Admin only)
router.post('/:projectId/members', requireProjectRole('Admin'), (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'No user found with that email. They must sign up first.' });

  const existing = db.prepare(
    'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(req.params.projectId, user.id);
  if (existing) return res.status(409).json({ error: 'User is already a member' });

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(req.params.projectId, user.id, role === 'Admin' ? 'Admin' : 'Member');

  res.status(201).json({ message: 'Member added', user: { id: user.id, name: user.name, email: user.email }, role: role === 'Admin' ? 'Admin' : 'Member' });
});

// PUT /api/projects/:projectId/members/:userId - change a member's role (Admin only)
router.put('/:projectId/members/:userId', requireProjectRole('Admin'), (req, res) => {
  const { role } = req.body;
  if (!['Admin', 'Member'].includes(role)) return res.status(400).json({ error: 'role must be Admin or Member' });

  const result = db.prepare(
    'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?'
  ).run(role, req.params.projectId, req.params.userId);

  if (result.changes === 0) return res.status(404).json({ error: 'Member not found' });
  res.json({ message: 'Role updated' });
});

// DELETE /api/projects/:projectId/members/:userId - remove a member (Admin only)
router.delete('/:projectId/members/:userId', requireProjectRole('Admin'), (req, res) => {
  db.prepare(
    'DELETE FROM project_members WHERE project_id = ? AND user_id = ?'
  ).run(req.params.projectId, req.params.userId);
  res.json({ message: 'Member removed' });
});

// DELETE /api/projects/:projectId - delete project (Admin only)
router.delete('/:projectId', requireProjectRole('Admin'), (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted' });
});

module.exports = router;
