from flask import Flask, request, jsonify, session, render_template
import os
import json
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import create_engine, Column, Integer, String, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SQLITE = f"sqlite:///{os.path.join(BASE_DIR, 'kevs.db')}"
DATABASE_URL = os.environ.get('DATABASE_URL', DEFAULT_SQLITE)
SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'change-me-in-production')

# Flask app
app = Flask(__name__, static_folder='.', template_folder='.')
app.secret_key = SECRET_KEY
# Recommended production cookie settings (can be overridden by env)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax'),
    SESSION_COOKIE_SECURE=(os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() == 'true')
)

# SQLAlchemy setup
if DATABASE_URL.startswith('sqlite'):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)
SessionLocal = scoped_session(sessionmaker(bind=engine))
Base = declarative_base()


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(150), unique=True, nullable=False)
    admission = Column(String(100), nullable=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    unlocked_index = Column(Integer, default=0, nullable=False)
    # completed_projects and task_completion stored as JSON (list/dict)
    completed_projects = Column(JSON, default=list)
    task_completion = Column(JSON, default=dict)
    points = Column(Integer, default=0, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'admission': self.admission,
            'email': self.email,
            'unlocked_index': self.unlocked_index,
            'completed_projects': self.completed_projects or [],
            'task_completion': self.task_completion or {},
            'points': self.points
        }


# Projects & tasks (static)
PROJECTS = [
    {
        'id': 0,
        'name': 'Web-Based Organizational Support System',
        'description': 'This project helps organizations manage information, visualize dashboards, and respond to inquiries.',
        'image': 'images/kevs4.jpeg',
        'resources': [
            {'label': 'Project Spec (PDF)', 'url': 'https://example.com/web-org-spec.pdf'},
            {'label': 'Dashboard Patterns', 'url': 'https://uxdesign.cc/dashboard-patterns'},
            {'label': 'Flask Tutorials', 'url': 'https://flask.palletsprojects.com/en/2.2.x/tutorial/'}
        ]
    },
    {
        'id': 1,
        'name': 'Student Information Management System',
        'description': 'Manages student records, academic performance, and attendance.',
        'image': 'images/kevs2.jpeg',
        'resources': [
            {'label': 'Education Data Models', 'url': 'https://example.com/edu-data-models'},
            {'label': 'Reporting Best Practices', 'url': 'https://www.smartsheet.com/reporting-best-practices'},
            {'label': 'SQLite vs Postgres', 'url': 'https://www.postgresql.org/docs/current/datatype-json.html'}
        ]
    },
    {
        'id': 2,
        'name': 'Smart Room Energy Monitoring System',
        'description': 'Monitors and visualizes room energy usage using digital meters.',
        'image': 'images/kevs1.jpeg',
        'resources': [
            {'label': 'IoT Energy Monitoring Guide', 'url': 'https://example.com/iot-energy-guide'},
            {'label': 'Data Visualization Tips', 'url': 'https://observablehq.com/@d3/visualization'},
            {'label': 'MQTT Intro', 'url': 'https://mqtt.org/documentation'}
        ]
    },
    {
        'id': 3,
        'name': 'Library Management System',
        'description': 'Manages book records, borrowing, returns, and users.',
        'image': 'images/download.jpeg',
        'resources': [
            {'label': 'Library Systems Overview', 'url': 'https://example.com/library-systems'},
            {'label': 'Cataloging Standards', 'url': 'https://www.oclc.org/en/worldcat.html'},
            {'label': 'User Authentication Patterns', 'url': 'https://www.owasp.org/index.php/Authentication_Cheat_Sheet'}
        ]
    }
]

PROJECT_TASKS = [
    ["Requirement Gathering", "Design", "Development", "Testing", "Deployment"],
    ["Student Data Entry", "Grades Input", "Attendance Tracking", "Reporting"],
    ["Meter Installation", "Data Monitoring", "Visualization", "Alerts Setup"],
    ["Book Cataloging", "Borrowing Management", "Return Tracking", "User Accounts"]
]


def init_db():
    # Create tables
    Base.metadata.create_all(bind=engine)
    # Ensure demo user exists
    db = SessionLocal()
    try:
        demo = db.query(User).filter_by(username='demo').first()
        if not demo:
            demo_user = User(
                username='demo',
                admission='123',
                email='demo@example.com',
                password_hash=generate_password_hash('demo123'),
                points=0
            )
            db.add(demo_user)
            db.commit()
    finally:
        db.close()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/projects', methods=['GET'])
def api_projects():
    return jsonify({'projects': PROJECTS, 'project_tasks': PROJECT_TASKS})


@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    admission = (data.get('admission') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not username or not email or not password:
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    db = SessionLocal()
    try:
        exists = db.query(User).filter((User.username == username) | (User.email == email)).first()
        if exists:
            return jsonify({'success': False, 'message': 'Username or email already exists'}), 400

        user = User(
            username=username,
            admission=admission,
            email=email,
            password_hash=generate_password_hash(password),
            unlocked_index=0,
            completed_projects=[],
            task_completion={},
            points=0
        )
        db.add(user)
        db.commit()
        return jsonify({'success': True, 'message': 'Account created'})
    finally:
        db.close()


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=username).first()
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({'success': False, 'message': 'Invalid credentials'}), 400
        session['username'] = username
        return jsonify({'success': True, 'username': username})
    finally:
        db.close()


@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('username', None)
    return jsonify({'success': True})


def get_current_user():
    username = session.get('username')
    if not username:
        return None
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=username).first()
        return user
    finally:
        db.close()


@app.route('/api/user', methods=['GET'])
def api_user():
    user = get_current_user()
    if not user:
        return jsonify({'logged_in': False}), 200
    return jsonify(dict(logged_in=True, **user.to_dict()))


@app.route('/api/user/progress/task', methods=['POST'])
def api_toggle_task():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json() or {}
    project_index = int(data.get('project_index'))
    task_index = int(data.get('task_index'))
    checked = bool(data.get('checked'))

    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=user.id).first()
        tc = u.task_completion or {}
        key = str(project_index)
        if key not in tc:
            tc[key] = []
        while len(tc[key]) <= task_index:
            tc[key].append(False)
        tc[key][task_index] = checked
        u.task_completion = tc
        db.add(u)
        db.commit()
        return jsonify({'success': True, 'task_completion': tc})
    finally:
        db.close()


@app.route('/api/user/progress/complete', methods=['POST'])
def api_complete_project():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json() or {}
    project_index = int(data.get('project_index'))

    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=user.id).first()
        completed = u.completed_projects or []
        unlocked_index = int(u.unlocked_index or 0)
        points = int(u.points or 0)

        if project_index not in completed:
            completed.append(project_index)
            points += 50
            if project_index == unlocked_index and unlocked_index < len(PROJECTS) - 1:
                unlocked_index += 1

            u.completed_projects = completed
            u.unlocked_index = unlocked_index
            u.points = points
            db.add(u)
            db.commit()

        return jsonify({'success': True, 'completed_projects': u.completed_projects, 'unlocked_index': u.unlocked_index, 'points': u.points})
    finally:
        db.close()


@app.route('/api/user/progress/reset', methods=['POST'])
def api_reset_progress():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=user.id).first()
        u.unlocked_index = 0
        u.completed_projects = []
        u.task_completion = {}
        u.points = 0
        db.add(u)
        db.commit()
        return jsonify({'success': True})
    finally:
        db.close()


if __name__ == '__main__':
    init_db()
    # Use debug mode only when FLASK_ENV=development
    debug_mode = os.environ.get('FLASK_ENV', '') == 'development'
    app.run(debug=debug_mode)
