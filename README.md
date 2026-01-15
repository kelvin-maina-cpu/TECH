Flask backend for KEVS University demo

Overview
--------
This project contains a small single-file Flask backend that provides persistent multi-user storage (SQLite) and simple REST endpoints to manage users and per-user project progress.

What I added
------------
- `app.py` — Flask server with endpoints:
	- `GET /` serves `index.html` (the current frontend)
	- `GET /api/projects` — returns projects and their task lists
	- `POST /api/register` — register a new user
	- `POST /api/login` — login (creates a session)
	- `POST /api/logout` — logout
	- `GET /api/user` — returns current user and progress
	- `POST /api/user/progress/task` — toggle/update a task (body: project_index, task_index, checked)
	- `POST /api/user/progress/complete` — mark a project as completed (awards 50 points & unlocks next)
	- `POST /api/user/progress/reset` — reset current user's progress
- `kevs.db` (created on first run) — SQLite DB (automatically initialized)
- `requirements.txt` — Flask dependency list

Run locally (Windows PowerShell)
-------------------------------
1. Create a virtual environment (recommended):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r requirements.txt
```

3. Run the app:

```powershell
python app.py
```

The server runs on `http://127.0.0.1:5000` by default. Open that URL in your browser. The server will serve the existing `index.html` and static files from the project root.

Flask backend for KEVS University demo

Overview
--------
This project contains a Flask backend that provides persistent multi-user storage (SQLite by default) and simple REST endpoints to manage users and per-user project progress. The DB layer uses SQLAlchemy and supports PostgreSQL via the `DATABASE_URL` environment variable.

What I added
------------
- `app.py` — Flask server with endpoints:
  - `GET /` serves `index.html` (the current frontend)
  - `GET /api/projects` — returns projects and their task lists
  - `POST /api/register` — register a new user
  - `POST /api/login` — login (creates a session)
  - `POST /api/logout` — logout
  - `GET /api/user` — returns current user and progress
  - `POST /api/user/progress/task` — toggle/update a task (body: project_index, task_index, checked)
  - `POST /api/user/progress/complete` — mark a project as completed (awards 50 points & unlocks next)
  - `POST /api/user/progress/reset` — reset current user's progress
- `kevs.db` (created on first run when using the default SQLite fallback) — or configure `DATABASE_URL` to point to PostgreSQL for production
- `requirements.txt` — dependency list including SQLAlchemy and psycopg2

Run locally (Windows PowerShell)
-------------------------------
1. Create a virtual environment (recommended):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r requirements.txt
```

3. Run the app (development):

```powershell
python app.py
```

The server runs on `http://127.0.0.1:5000` by default. Open that URL in your browser.

Using PostgreSQL in production
----------------------------
1. Set a `DATABASE_URL` environment variable (example Postgres URI):

```powershell
$env:DATABASE_URL = 'postgresql://user:password@db-host:5432/kevsdb'
```

2. Set a strong secret and run behind a WSGI server such as gunicorn or Waitress. Example using Waitress on Windows:

```powershell
# set secret
$env:FLASK_SECRET_KEY = 'replace-with-strong-random-secret'
# install waitress
pip install waitress
# run
waitress-serve --listen=0.0.0.0:5000 app:app
```

Notes and next steps
--------------------
- Passwords are hashed with `werkzeug.security.generate_password_hash`.
- Sessions are stored using Flask's signed cookies (set `FLASK_SECRET_KEY` in environment for production).
- The DB layer now uses SQLAlchemy; for schema migrations in production use Alembic (I can add this scaffolding if you want).

Security reminder
-----------------
This demo uses a simple secret key and no CSRF protection. Do not deploy as-is to a public server without hardening (secret key, HTTPS, CSRF, input validation, rate limiting, etc.).

If you'd like, I can add an Alembic setup and initial migration, create a Dockerfile + systemd/nginx example, or convert the app to use async frameworks for high throughput.