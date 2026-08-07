# Relay — Team Task Manager

A full-stack web app for creating projects, assigning tasks, and tracking progress with role-based access control (Admin / Member).

**Stack:** Node.js + Express (REST API) · SQLite via `better-sqlite3` · JWT auth + bcrypt · Vanilla JS frontend (no build step).

Live URL : https://team-task-manager-1-fwxo.onrender.com/
---

## ✨ Features

- **Authentication** — signup/login with hashed passwords (bcrypt) and JWT sessions
- **Projects & teams** — create projects, invite teammates by email, assign each member a role
- **Role-based access control**
  - **Admin**: create/delete tasks, edit any task, add/remove members, change member roles, delete the project
  - **Member**: create tasks, update the status of tasks assigned to them
- **Task tracking** — title, description, assignee, due date, status (`To Do` / `In Progress` / `Done`)
- **Dashboard** — live counts of total, to-do, in-progress, done, and overdue tasks per project
- **Relational database** — SQLite with foreign keys across `users`, `projects`, `project_members`, `tasks`

---

## 📁 Project structure

```
team-task-manager/
├── backend/
│   ├── server.js            # Express app entry point
│   ├── db.js                 # SQLite connection + schema
│   ├── middleware/auth.js    # JWT verification + role guard
│   ├── routes/
│   │   ├── auth.js           # POST /signup, /login
│   │   ├── projects.js       # projects + membership endpoints
│   │   └── tasks.js          # task CRUD + dashboard endpoint
│   ├── data/                 # SQLite database file (created on first run)
│   └── package.json
├── frontend/
│   ├── index.html            # single-page app shell
│   └── app.js                # API calls + UI rendering
└── README.md
```

---

## 🚀 Run locally

**Requirements:** Node.js 18+

```bash
cd backend
npm install
npm start
```

The server starts on `http://localhost:5000` and serves **both** the API (`/api/...`) and the frontend (`/`) — so once it's running, just open `http://localhost:5000` in your browser. There's nothing extra to start for the frontend.

Optional: create a `backend/.env` file to override defaults:
```
PORT=5000
JWT_SECRET=replace-with-a-long-random-string
```

---

## 🌐 Deploy to Railway

1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Set the **root directory** to `backend`.
4. Railway auto-detects Node.js and runs `npm install && npm start`.
5. Add an environment variable `JWT_SECRET` set to a long random string (Railway → Variables tab).
6. Once deployed, Railway gives you a public URL — that's your live app (frontend + API together, since Express serves both).

> ⚠️ SQLite writes to a local file (`backend/data/app.db`). On Railway's default ephemeral filesystem, this resets on redeploy. For a persistent database across deploys, add a **Railway Volume** mounted at `backend/data`, or swap in Railway's managed Postgres (see "Swapping the database" below).

---

## 🔑 How roles work

- Whoever **creates** a project automatically becomes its **Admin**.
- Admins can invite existing users (they must sign up first) by email and set their role.
- Any project member can create a task and assign it to any other member.
- A **Member** can only change the **status** of tasks assigned to them — they can't retitle, reassign, or delete tasks, and can't manage the team.
- An **Admin** can fully edit or delete any task and manage membership/roles.

---

## 📡 API reference

All endpoints except `/api/auth/*` require a header: `Authorization: Bearer <token>`.

| Method | Endpoint | Description | Role |
|---|---|---|---|
| POST | `/api/auth/signup` | Create account | — |
| POST | `/api/auth/login` | Log in | — |
| GET | `/api/projects` | List my projects | any member |
| POST | `/api/projects` | Create a project | any user |
| GET | `/api/projects/:id` | Project detail + members | member |
| POST | `/api/projects/:id/members` | Add a member | Admin |
| PUT | `/api/projects/:id/members/:userId` | Change a member's role | Admin |
| DELETE | `/api/projects/:id/members/:userId` | Remove a member | Admin |
| DELETE | `/api/projects/:id` | Delete project | Admin |
| GET | `/api/tasks/project/:projectId` | List tasks in project | member |
| POST | `/api/tasks` | Create task | member |
| PUT | `/api/tasks/:id` | Update task | Admin, or assignee (status only) |
| DELETE | `/api/tasks/:id` | Delete task | Admin |
| GET | `/api/tasks/dashboard/:projectId` | Task counts summary | member |

---

## 🔄 Swapping the database (optional)

The schema is plain SQL in `backend/db.js`. To move to Postgres/MySQL for a more traditional "SQL" production setup:
1. Replace `better-sqlite3` with `pg` (or your driver of choice) in `package.json`.
2. Port the `CREATE TABLE` statements in `db.js` (they're already standard SQL with minor SQLite-specific syntax like `AUTOINCREMENT`/`datetime('now')` to adjust).
3. Swap `db.prepare(...).get()/.all()/.run()` calls in the route files for your driver's query methods.


