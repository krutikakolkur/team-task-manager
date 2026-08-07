const API_BASE = '/api';

let state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  projects: [],
  currentProject: null,
  tasks: [],
  dashboard: null,
};

// ---------------- API helper ----------------
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ---------------- Auth ----------------
function toggleAuth(which) {
  document.getElementById('login-form').classList.toggle('hidden', which !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', which !== 'signup');
}

function showError(elId, msg) {
  document.getElementById(elId).innerHTML = `<div class="error-msg">${msg}</div>`;
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').innerHTML = '';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setSession(data);
  } catch (err) {
    showError('login-error', err.message);
  }
}

async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  document.getElementById('signup-error').innerHTML = '';
  try {
    const data = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    setSession(data);
  } catch (err) {
    showError('signup-error', err.message);
  }
}

function setSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  boot();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state = { token: null, user: null, projects: [], currentProject: null, tasks: [], dashboard: null };
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

// ---------------- Boot ----------------
async function boot() {
  if (!state.token) return;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  document.getElementById('user-name').textContent = state.user.name;
  document.getElementById('user-email').textContent = state.user.email;
  document.getElementById('user-avatar').textContent = state.user.name.slice(0, 2).toUpperCase();

  await loadProjects();
}

async function loadProjects() {
  state.projects = await api('/projects');
  renderProjectList();
  if (state.projects.length > 0) {
    const stillExists = state.currentProject && state.projects.find(p => p.id === state.currentProject.id);
    await selectProject(stillExists ? state.currentProject.id : state.projects[0].id);
  } else {
    state.currentProject = null;
    renderEmptyMain();
  }
}

function renderProjectList() {
  const el = document.getElementById('project-list');
  if (state.projects.length === 0) {
    el.innerHTML = `<div style="font-size:12.5px;color:var(--text-faint);padding:8px 4px;">No projects yet</div>`;
    return;
  }
  el.innerHTML = state.projects.map(p => `
    <div class="project-item ${state.currentProject && state.currentProject.id === p.id ? 'active' : ''}" onclick="selectProject(${p.id})">
      <span>${escapeHtml(p.name)}</span>
      <span class="role-pill">${p.my_role}</span>
    </div>
  `).join('');
}

function renderEmptyMain() {
  document.getElementById('main-content').innerHTML = `
    <div class="empty-state" style="margin-top:60px;">
      <h2 style="color:var(--text);font-size:17px;">No projects yet</h2>
      <p>Create your first project to start assigning tasks to your team.</p>
      <button class="btn btn-primary" style="width:auto;margin-top:16px;padding:10px 20px;" onclick="openModal('project-modal')">+ New project</button>
    </div>
  `;
}

// ---------------- Project selection ----------------
async function selectProject(id) {
  const project = await api(`/projects/${id}`);
  state.currentProject = project;
  renderProjectList();
  await Promise.all([loadTasks(id), loadDashboard(id)]);
  renderMain();
}

async function loadTasks(projectId) {
  state.tasks = await api(`/tasks/project/${projectId}`);
}

async function loadDashboard(projectId) {
  state.dashboard = await api(`/tasks/dashboard/${projectId}`);
}

// ---------------- Main render ----------------
function renderMain() {
  const p = state.currentProject;
  const d = state.dashboard;
  const isAdmin = p.my_role === 'Admin';

  const statCard = (num, lbl, color) => `
    <div class="stat-card"><div class="rail" style="background:${color}"></div>
      <div class="num">${num}</div><div class="lbl">${lbl}</div>
    </div>`;

  document.getElementById('main-content').innerHTML = `
    <div class="main-header">
      <div>
        <h1>${escapeHtml(p.name)}</h1>
        <p>${escapeHtml(p.description || 'No description yet')}</p>
      </div>
      <div class="fab-row">
        <button class="btn btn-ghost btn-small" onclick="openMembersModal()">👥 Team (${p.members.length})</button>
        <button class="btn btn-primary btn-small" style="width:auto;" onclick="openNewTaskModal()">+ New task</button>
      </div>
    </div>

    <div class="stats-row">
      ${statCard(d.total, 'Total tasks', 'var(--text-faint)')}
      ${statCard(d.todo, 'To do', 'var(--text-faint)')}
      ${statCard(d.inProgress, 'In progress', 'var(--progress)')}
      ${statCard(d.done, 'Done', 'var(--done)')}
      ${statCard(d.overdue, 'Overdue', 'var(--overdue)')}
    </div>

    <div class="section-title">Tasks</div>
    <div id="task-list"></div>
  `;

  renderTaskList(isAdmin);
}

function renderTaskList(isAdmin) {
  const el = document.getElementById('task-list');
  if (state.tasks.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No tasks yet. Add the first one to get moving.</p></div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  el.innerHTML = state.tasks.map(t => {
    const isOverdue = t.status !== 'Done' && t.due_date && t.due_date < today;
    const statusClass = t.status === 'Done' ? 'status-done' : t.status === 'In Progress' ? 'status-progress' : 'status-todo';
    const canEdit = isAdmin || t.assigned_to === state.user.id;

    return `
      <div class="task-card ${statusClass} ${isOverdue ? 'overdue' : ''}">
        <div class="task-main">
          <div class="task-title ${t.status === 'Done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            <span class="assignee">👤 ${t.assigned_name ? escapeHtml(t.assigned_name) : 'Unassigned'}</span>
            ${t.due_date ? `<span class="due ${isOverdue ? 'overdue-text' : ''}">${isOverdue ? '⚠ ' : ''}Due ${t.due_date}</span>` : ''}
          </div>
        </div>
        <select class="status-select" ${canEdit ? '' : 'disabled'} onchange="updateTaskStatus(${t.id}, this.value)">
          <option value="To Do" ${t.status === 'To Do' ? 'selected' : ''}>To Do</option>
          <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Done" ${t.status === 'Done' ? 'selected' : ''}>Done</option>
        </select>
        ${isAdmin ? `<button class="icon-btn" onclick="deleteTask(${t.id})" title="Delete task">🗑</button>` : ''}
      </div>
    `;
  }).join('');
}

async function updateTaskStatus(taskId, status) {
  try {
    await api(`/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify({ status }) });
    await loadTasks(state.currentProject.id);
    await loadDashboard(state.currentProject.id);
    renderMain();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await api(`/tasks/${taskId}`, { method: 'DELETE' });
    await loadTasks(state.currentProject.id);
    await loadDashboard(state.currentProject.id);
    renderMain();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------- Projects ----------------
async function createProject() {
  const name = document.getElementById('new-project-name').value.trim();
  const description = document.getElementById('new-project-desc').value.trim();
  if (!name) return alert('Project name is required');
  try {
    await api('/projects', { method: 'POST', body: JSON.stringify({ name, description }) });
    document.getElementById('new-project-name').value = '';
    document.getElementById('new-project-desc').value = '';
    closeModal('project-modal');
    await loadProjects();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------- Tasks ----------------
function openNewTaskModal() {
  const select = document.getElementById('new-task-assignee');
  select.innerHTML = '<option value="">Unassigned</option>' +
    state.currentProject.members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  openModal('task-modal');
}

async function createTask() {
  const title = document.getElementById('new-task-title').value.trim();
  const description = document.getElementById('new-task-desc').value.trim();
  const assigned_to = document.getElementById('new-task-assignee').value || null;
  const due_date = document.getElementById('new-task-due').value || null;
  if (!title) return alert('Task title is required');

  try {
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({ project_id: state.currentProject.id, title, description, assigned_to, due_date }),
    });
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-desc').value = '';
    document.getElementById('new-task-due').value = '';
    closeModal('task-modal');
    await loadTasks(state.currentProject.id);
    await loadDashboard(state.currentProject.id);
    renderMain();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------- Members ----------------
function openMembersModal() {
  renderMembersList();
  openModal('members-modal');
}

function renderMembersList() {
  const el = document.getElementById('members-list');
  const isAdmin = state.currentProject.my_role === 'Admin';
  el.innerHTML = state.currentProject.members.map(m => `
    <div class="member-row">
      <div class="member-info">
        <div class="avatar">${m.name.slice(0, 2).toUpperCase()}</div>
        <div><div class="mname">${escapeHtml(m.name)}</div><div class="memail">${escapeHtml(m.email)}</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="role-badge ${m.role}">${m.role}</span>
        ${isAdmin && m.id !== state.user.id ? `<button class="icon-btn" onclick="removeMember(${m.id})" title="Remove">✕</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function inviteMember() {
  const email = document.getElementById('invite-email').value.trim();
  const role = document.getElementById('invite-role').value;
  if (!email) return alert('Enter an email address');
  try {
    await api(`/projects/${state.currentProject.id}/members`, { method: 'POST', body: JSON.stringify({ email, role }) });
    document.getElementById('invite-email').value = '';
    state.currentProject = await api(`/projects/${state.currentProject.id}`);
    renderProjectList();
    renderMembersList();
  } catch (err) {
    alert(err.message);
  }
}

async function removeMember(userId) {
  if (!confirm('Remove this member from the project?')) return;
  try {
    await api(`/projects/${state.currentProject.id}/members/${userId}`, { method: 'DELETE' });
    state.currentProject = await api(`/projects/${state.currentProject.id}`);
    renderMembersList();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------- Modal helpers ----------------
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------------- Init ----------------
boot();
