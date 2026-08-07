const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Verifies the JWT and attaches the user to req.user
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, name, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Checks that req.user has the given role (Admin) within req.params.projectId
function requireProjectRole(...allowedRoles) {
  return (req, res, next) => {
    const projectId = req.params.projectId || req.body.project_id || req.params.id;
    const member = db.prepare(
      'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, req.user.id);

    if (!member) {
      return res.status(403).json({ error: 'You are not a member of this project' });
    }
    if (!allowedRoles.includes(member.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${allowedRoles.join(', ')}` });
    }
    req.projectRole = member.role;
    next();
  };
}

module.exports = { authenticate, requireProjectRole, JWT_SECRET };
