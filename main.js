/* ================= GLOBAL STATE ================= */

// Projects will be fetched from server; keep local placeholders while loading
let projects = [];
let projectTasks = [];

// Progress
let unlockedIndex = parseInt(localStorage.getItem("unlockedIndex")) || 0;
let completedProjects = JSON.parse(localStorage.getItem("completedProjects")) || [];
let userPoints = parseInt(localStorage.getItem("userPoints")) || 0;

// Ensure localStorage keys exist (defaults)
if (!localStorage.getItem("unlockedIndex")) localStorage.setItem("unlockedIndex", "0");
if (!localStorage.getItem("completedProjects")) localStorage.setItem("completedProjects", "[]");
if (!localStorage.getItem("userPoints")) localStorage.setItem("userPoints", "0");

// Helper: safe fetch wrapper for JSON
async function fetchJSON(url, opts = {}) {
  try {
    // Normalize common short paths (some clients or cached scripts may call 'projects' or 'user')
    if (typeof url === 'string' && !url.startsWith('/') && !url.startsWith('http')) {
      if (url === 'projects') { console.warn('Normalized short path "projects" to "/api/projects"'); url = '/api/projects'; }
      else if (url === 'user') { console.warn('Normalized short path "user" to "/api/user"'); url = '/api/user'; }
    }
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts));

    // read raw text first (safer when server returns non-JSON or empty body)
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = null; }
    }

    if (!res.ok) {
      // If server returned JSON with message use it, otherwise include raw text/status
      const err = (data && (data.message || data.error)) ? (data.message || data.error) : (text || res.statusText || `HTTP ${res.status}`);
      throw { message: err, status: res.status, raw: text };
    }

    return data;
  } catch (err) {
    console.error('fetchJSON error', url, err);
    throw err;
  }
}

// Load projects and project tasks from server if available
async function loadServerProjects() {
  try {
    const data = await fetchJSON('/api/projects');
    if (data.projects) projects = data.projects;
    if (data.project_tasks) projectTasks = data.project_tasks;
    renderProjects();
      // render research charts once projects are available
      try { renderResearchCharts(); } catch (e) { /* ignore */ }
  } catch (e) {
    console.warn('Could not load projects from server, using local data if present');
  }
}

/* ================= PAGE CONTROL ================= */
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ================= AUTH ================= */
async function registerUser() {
  const u = reg("username");
  const a = reg("admission");
  const e = reg("email");
  const p = reg("password");

  if (!u || !a || !e || !p) return alert("Please fill all fields.");
  try {
    const res = await fetchJSON('/api/register', { method: 'POST', body: JSON.stringify({ username: u, admission: a, email: e, password: p }) });
    // Clear form fields
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-admission').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    alert(res.message || 'Account created successfully. Please log in.');
    showPage('login-page');
  } catch (err) {
    alert(err.message || 'Could not register (server error)');
  }
}

async function loginUser() {
  const username = val("login-username");
  const password = val("login-password");
  try {
    const res = await fetchJSON('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (res && res.success) {
      await loadUserState();
      showPage('portfolio-page');
    }
  } catch (err) {
    alert(err.message || 'Login failed');
  }
}

async function logout() {
  try {
    await fetchJSON('/api/logout', { method: 'POST' });
  } catch (e) {
    console.warn('Logout request failed', e);
  }
  // clear UI state
  unlockedIndex = 0;
  completedProjects = [];
  userPoints = 0;
  const ui = document.getElementById('user-info'); if (ui) ui.innerText = '';
  updatePointsDisplay();
  showBadges();
  showPage('login-page');
}

/* ================= PROJECTS ================= */
function renderProjects() {
  const container = document.getElementById("projects-container");
  if (!container) return;

  container.innerHTML = "";
  // unlockedIndex and completedProjects are synced from server via loadUserState()
  unlockedIndex = unlockedIndex || 0;
  completedProjects = completedProjects || [];

  projects.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute('data-index', String(i));
    // visually mark selected project when rendering list
    if (typeof window._currentProject !== 'undefined' && window._currentProject === i) {
      card.classList.add('selected');
    }

    if (i > unlockedIndex) {
      card.classList.add("locked");
      card.innerHTML = `<h3>${p.name}</h3><p>🔒 Locked</p>`;
    } else {
      card.innerHTML = `
        <div class="mini-chart" aria-hidden="true"><canvas id="project-mini-chart-${i}"></canvas></div>
        <img src="${p.image}" class="project-image">
        <h3>${p.name} ${completedProjects.includes(i) ? "✔" : ""}</h3>
        <p>${p.description}</p>
        <button class="btnn" onclick="selectProject(${i})">Open Project</button>
      `;
    }

    container.appendChild(card);
  });

  updateProjectsProgressBar();
  // render mini charts inside each project card
  try { renderProjectMiniCharts(); } catch (e) { /* ignore */ }
}

function renderProjectMiniCharts() {
  // destroy previous mini charts
  try {
    if (projectMiniCharts && projectMiniCharts.length) {
      projectMiniCharts.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } });
      projectMiniCharts = [];
    }
  } catch (e) { /* ignore */ }

  projects.forEach((p, i) => {
    const canvas = document.getElementById(`project-mini-chart-${i}`);
    if (!canvas) return;

    // calculate percent same as research charts
    let percent = 0;
    const total = projectTasks[i] ? projectTasks[i].length : 0;
    if (Array.isArray(completedProjects) && completedProjects.includes(i)) {
      percent = 100;
    } else {
      let done = 0;
      try {
        const user = null; // we intentionally reuse local completion when rendering here
        const local = JSON.parse(localStorage.getItem('taskCompletion')) || {};
        if (local[i]) done = local[i].filter(Boolean).length;
      } catch (e) { done = 0; }
      percent = total ? Math.round((done / total) * 100) : 0;
    }

    try {
      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Done', 'Remaining'], datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#2a5298', '#e6e6e6'] }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false }, centerText: { display: true, text: `${percent}%`, color: '#2a5298', fontSize: 12, fontWeight: '700' } }
        }
      });
      projectMiniCharts[i] = chart;
    } catch (e) { console.warn('mini chart failed', i, e); }
  });
}

/* ================= DASHBOARD ================= */
let chartInstance = null;
// keep references to research chart instances so we can destroy them when re-rendering
let researchCharts = [];
// mini charts for project list
let projectMiniCharts = [];

function selectProject(index) {
  // open project dashboard and load server-side task completion for this user
  showPage("dashboard-page");

  const titleEl = document.getElementById("project-title");
  const descEl = document.getElementById("project-description");
  const imgEl = document.getElementById("project-image");

  // defensive checks: ensure project exists
  if (!projects || !projects[index]) {
    if (titleEl) titleEl.innerText = 'Project not found';
    if (descEl) descEl.innerText = '';
    if (imgEl) imgEl.innerHTML = '';
    window._currentProject = undefined;
    return;
  }

  titleEl.innerText = projects[index].name;
  descEl.innerText = projects[index].description;
  imgEl.innerHTML = `<img src="${projects[index].image}" class="project-image">`;

  // fetch user's task completion for this project from server
  (async () => {
    try {
      const user = await fetchJSON('/api/user');
      const completion = (user.task_completion && user.task_completion[String(index)]) || [];
      renderTasks(index, completion);
      renderChart(index, completion);
  // refresh research charts so they reflect current user state
  renderResearchCharts();
      // store current project index in memory for completeProject
        window._currentProject = index;
        // highlight selection in project list
        highlightSelectedProject(index);
        // auto-open chatbox when opening a project dashboard (if chat exists)
        try {
          if (typeof chatBox !== 'undefined' && chatBox && chatBox.classList.contains('hidden')) {
            chatBox.classList.remove('hidden');
            // load history when opened
            if (typeof loadChatHistory === 'function') loadChatHistory().catch(() => {});
            if (chatInput) chatInput.focus();
          }
        } catch (e) { /* ignore if chat not defined yet */ }
    } catch (e) {
      // fallback to localStorage
      renderTasks(index);
      renderChart(index);
      window._currentProject = index;
      highlightSelectedProject(index);
    }
  })();
}

function highlightSelectedProject(index) {
  try {
    document.querySelectorAll('#projects-container .card').forEach(c => c.classList.remove('selected'));
    const sel = document.querySelector(`#projects-container .card[data-index='${index}']`);
    if (sel) sel.classList.add('selected');
  } catch (e) { /* ignore */ }
}

// Render a small research chart card for each project on the dashboard.
async function renderResearchCharts() {
  const container = document.getElementById('research-charts');
  if (!container) return;
  container.innerHTML = '';

  // Register a small Chart.js plugin to render centered percentage text inside the doughnut.
  // We register it once per page load (safeguard with window._centerTextRegistered).
  try {
    if (typeof Chart !== 'undefined' && !window._centerTextRegistered) {
      Chart.register({
        id: 'centerTextPlugin',
        beforeDraw: function(chart, args, options) {
          const cfg = chart.config.options.plugins && chart.config.options.plugins.centerText;
          if (!cfg || !cfg.display) return;
          const ctx = chart.ctx;
          const width = chart.width;
          const height = chart.height;
          ctx.save();
          const fontSize = cfg.fontSize || Math.floor(Math.min(width, height) / 6);
          ctx.font = `${cfg.fontWeight || '700'} ${fontSize}px ${cfg.fontFamily || 'Segoe UI'}`;
          ctx.fillStyle = cfg.color || '#2a5298';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const txt = cfg.text || (chart.data.datasets && chart.data.datasets[0] && chart.data.datasets[0].data ? String(chart.data.datasets[0].data[0]) + '%' : '');
          ctx.fillText(txt, width / 2, height / 2);
          ctx.restore();
        }
      });
      window._centerTextRegistered = true;
    }
  } catch (e) { console.warn('centerText plugin registration failed', e); }

  // Destroy any previously created research charts to fully reset state
  try {
    if (researchCharts && researchCharts.length) {
      researchCharts.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } });
      researchCharts = [];
    }
  } catch (e) { /* ignore */ }

  // Try to get user state from server; if not available fallback to localStorage
  let user = null;
  try {
    const res = await fetchJSON('/api/user');
    if (res && res.logged_in) user = res;
  } catch (e) {
    user = null;
  }

  projects.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="chart-title">${p.name}</div>
        <canvas id="research-chart-${i}" data-index="${i}"></canvas>
        <div class="chart-meta"> <button class="research-btn" data-index="${i}">Research</button> · Click chart to open project</div>
    `;

    // clicking a card opens that project dashboard
      card.addEventListener('click', () => selectProject(i));
    card.addEventListener('keypress', (e) => { if (e.key === 'Enter') selectProject(i); });

      // Research button - open modal with resources
      setTimeout(() => {
        const btn = card.querySelector('.research-btn');
        if (btn) {
          btn.addEventListener('click', (ev) => { ev.stopPropagation(); showResearchModal(i); });
        }
      }, 0);

    container.appendChild(card);

    // compute a simple research metric: percent of tasks completed or project completion
    let percent = 0;
    if (user && Array.isArray(user.completed_projects) && user.completed_projects.includes(i)) {
      percent = 100;
    } else {
      const total = projectTasks[i] ? projectTasks[i].length : 0;
      let done = 0;
      if (user && user.task_completion && user.task_completion[String(i)]) {
        done = user.task_completion[String(i)].filter(Boolean).length;
      } else {
        const local = JSON.parse(localStorage.getItem('taskCompletion')) || {};
        if (local[i]) done = local[i].filter(Boolean).length;
      }
      percent = total ? Math.round((done / total) * 100) : 0;
    }

    // percent will be drawn inside the doughnut via Chart.js center-text plugin

    // Render a small doughnut chart (destroy previous instances first)
    try {
      // Destroy any existing research chart instances before creating new ones
      if (researchCharts && researchCharts[i]) {
        try { researchCharts[i].destroy(); } catch (e) { /* ignore */ }
        researchCharts[i] = null;
      }

      const ctx = document.getElementById(`research-chart-${i}`).getContext('2d');
      const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Done', 'Remaining'],
          datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#2a5298', '#e6e6e6'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true },
            // centerText plugin options used by our registered plugin
            centerText: { display: true, text: `${percent}%`, color: '#2a5298', fontSize: 14, fontWeight: '700', fontFamily: 'Segoe UI' }
          },
          onClick: function(evt, activeEls) {
            // Open the project dashboard when the chart is clicked
            try { selectProject(i); } catch (e) { /* ignore if function not present */ }
          }
        }
      });

      // Keep a reference so we can destroy it on next render
      researchCharts[i] = chart;
    } catch (err) {
      console.warn('Chart render failed for research chart', i, err);
    }
  });
}

function showResearchModal(index) {
  const modal = document.getElementById('research-modal');
  const title = document.getElementById('modal-project-title');
  const list = document.getElementById('modal-resources');
  if (!modal || !title || !list) return;
  const project = projects[index];
  title.innerText = `Research: ${project.name}`;
  list.innerHTML = '';
  const resources = project.resources || [];
  if (!resources.length) {
    list.innerHTML = '<div class="resource-item">No resources available.</div>';
  } else {
    resources.forEach(r => {
      const el = document.createElement('div');
      el.className = 'resource-item';
      el.innerHTML = `<div><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.label}</a></div>`;
      list.appendChild(el);
    });
  }
  modal.setAttribute('aria-hidden', 'false');
}

// Close modal handlers
document.addEventListener('click', (e) => {
  const modal = document.getElementById('research-modal');
  if (!modal) return;
  if (e.target.classList && e.target.classList.contains('modal-close')) {
    modal.setAttribute('aria-hidden', 'true');
  }
});
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('research-modal');
  if (!modal) return;
  if (e.key === 'Escape') modal.setAttribute('aria-hidden', 'true');
});

function renderTasks(index, completionFromServer) {
  const list = document.getElementById("task-list");
  if (!list) return;
  list.innerHTML = "";

  // completionFromServer expected to be an array; if not provided, fall back to localStorage
  let completion = {};
  if (Array.isArray(completionFromServer)) {
    completion[index] = completionFromServer;
  } else {
    completion = JSON.parse(localStorage.getItem("taskCompletion")) || {};
    if (!completion[index]) completion[index] = [];
  }

  // If no tasks are defined for this project, show a helpful message
  if (!projectTasks || !projectTasks[index] || !Array.isArray(projectTasks[index]) || projectTasks[index].length === 0) {
    list.innerHTML = '<div class="empty">No tasks defined for this project.</div>';
    return;
  }

  projectTasks[index].forEach((task, i) => {
    const isChecked = completion[index] && completion[index][i];
    const checked = isChecked ? 'checked' : '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <input type="checkbox" ${checked} id="task-${index}-${i}" />
      <label for="task-${index}-${i}">${task}</label>
    `;
    const input = wrapper.querySelector('input');
    input.addEventListener('change', (e) => toggleTask(index, i, e.target.checked));
    list.appendChild(wrapper);
  });
}

async function toggleTask(p, t, checked) {
  try {
    await fetchJSON('/api/user/progress/task', { method: 'POST', body: JSON.stringify({ project_index: p, task_index: t, checked }) });
    // update chart using server-side state (fetch /api/user)
    try {
      const user = await fetchJSON('/api/user');
      const completion = (user.task_completion && user.task_completion[String(p)]) || [];
      renderChart(p, completion);
      // update small research charts to reflect this change
      try { renderResearchCharts(); } catch (e) { /* ignore */ }
    } catch (e) {
      renderChart(p);
      try { renderResearchCharts(); } catch (ee) { /* ignore */ }
    }
  } catch (err) {
    // fallback to localStorage when server not available
    let completion = JSON.parse(localStorage.getItem("taskCompletion")) || {};
    if (!completion[p]) completion[p] = [];
    completion[p][t] = checked;
    localStorage.setItem("taskCompletion", JSON.stringify(completion));
    renderChart(p);
  }
}

/* ================= CHART ================= */
function renderChart(index, completionFromServer) {
  const canvas = document.getElementById("projectChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Defensive: if tasks not defined, clear chart area and return
  if (!projectTasks || !projectTasks[index] || projectTasks[index].length === 0) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    // Clear canvas
    try { ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) { /* ignore */ }
    return;
  }

  let data;
  if (Array.isArray(completionFromServer)) {
    data = projectTasks[index].map((_, i) => completionFromServer[i] ? 100 : 0);
  } else {
    const completion = JSON.parse(localStorage.getItem("taskCompletion")) || {};
    data = projectTasks[index].map((_, i) => completion[index]?.[i] ? 100 : 0);
  }

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: projectTasks[index],
      datasets: [{
        label: "Completion %",
        data,
        backgroundColor: "rgba(42,82,152,0.6)"
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });
}

/* ================= COMPLETE PROJECT ================= */
async function completeProject() {
  const index = (typeof window._currentProject !== 'undefined') ? window._currentProject : parseInt(localStorage.getItem("currentProject"));
  if (isNaN(index)) return alert('No project selected');

  try {
    const res = await fetchJSON('/api/user/progress/complete', { method: 'POST', body: JSON.stringify({ project_index: index }) });
    if (res && res.success) {
      // sync client state with server response
      unlockedIndex = res.unlocked_index;
      completedProjects = res.completed_projects;
      userPoints = res.points;
      updatePointsDisplay();
      showBadges();
      renderProjects();
      updateProjectsProgressBar();
      try { renderResearchCharts(); } catch (e) { /* ignore */ }
      alert('Project completed! You earned 50 points and the next project unlocked.');
    }
  } catch (err) {
    // fallback to local behavior if server unreachable
    const idx = index;
    if (!completedProjects.includes(idx)) {
      completedProjects.push(idx);
      localStorage.setItem("completedProjects", JSON.stringify(completedProjects));
      userPoints = parseInt(localStorage.getItem('userPoints')) || 0;
      userPoints += 50;
      localStorage.setItem('userPoints', userPoints);
      if (idx === unlockedIndex && unlockedIndex < projects.length - 1) {
        unlockedIndex++;
        localStorage.setItem("unlockedIndex", unlockedIndex);
      }
      alert('Project completed locally. Next project unlocked when server is available.');
    }
    renderProjects();
    updateProjectsProgressBar();
    updatePointsDisplay();
    showBadges();
  }
  backToProjects();
}


/* ================= PROGRESS BAR ================= */
function updateProjectsProgressBar() {
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");

  // Guard against zero projects to avoid division by zero
  const total = (projects && projects.length) ? projects.length : 0;
  const percent = total ? Math.round(((unlockedIndex + 1) / total) * 100) : 0;
  if (fill) fill.style.width = percent + "%";
  if (text) text.innerText = percent + "% Completed";
}

/* ================= POINTS & BADGES ================= */
function updatePointsDisplay() {
  const container = document.getElementById('points-display');
  if (!container) return;
  userPoints = parseInt(localStorage.getItem('userPoints')) || 0;
  const level = Math.floor(userPoints / 100) + 1;
  container.innerText = `Points: ${userPoints} | Level: ${level}`;
}

function showBadges() {
  const container = document.getElementById('badges-display');
  if (!container) return;
  userPoints = parseInt(localStorage.getItem('userPoints')) || 0;
  const badges = [];
  if (userPoints >= 50) badges.push('🏆 Beginner');
  if (userPoints >= 100) badges.push('🎖 Intermediate');
  if (userPoints >= 200) badges.push('🌟 Expert');
  container.innerHTML = badges.map(b => `<span class="badge">${b}</span>`).join(' ');
}

/* ================= NAVIGATION ================= */
function backToProjects() {
  showPage("projects-page");
  renderProjects();
}

function goToProjects() {
  renderProjects();
  showPage("projects-page");
}

/* ================= HELPERS ================= */
function val(id){ return document.getElementById(id).value.trim(); }
function reg(f){ return document.getElementById(`reg-${f}`).value.trim(); }

/* ================= CAROUSEL ================= */
let currentSlide = 0;
function nextSlide(){ showSlide(currentSlide + 1); }
function prevSlide(){ showSlide(currentSlide - 1); }
function showSlide(i){
  const slides = document.querySelectorAll(".carousel-slide");
  if (!slides.length) return;
  currentSlide = (i + slides.length) % slides.length;
  slides.forEach((s, idx) => s.classList.toggle("active", idx === currentSlide));
}
setInterval(nextSlide, 5000);

/* ================= INITIAL ================= */
// Initialize: load server projects and user state
async function initializeApp() {
  await loadServerProjects();
  try {
    const user = await fetchJSON('/api/user');
    if (user && user.logged_in) {
      await loadUserState();
      showPage('portfolio-page');
      return;
    }
  } catch (e) {
    console.warn('Could not fetch user (server may be offline). Using local state.');
  }
  // fallback
  renderProjects();
  updateProjectsProgressBar();
  showPage('login-page');
}

async function loadUserState() {
  try {
    const user = await fetchJSON('/api/user');
    if (user && user.logged_in) {
      unlockedIndex = parseInt(user.unlocked_index) || 0;
      completedProjects = user.completed_projects || [];
      userPoints = parseInt(user.points) || 0;
      const ui = document.getElementById('user-info'); if (ui) ui.innerText = `Signed in as: ${user.username}`;
      updatePointsDisplay();
      showBadges();
      renderProjects();
      updateProjectsProgressBar();
        // update research charts when user state is loaded
        try { renderResearchCharts(); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.warn('loadUserState failed', err);
  }
}

initializeApp();

/* ================= RESET PROGRESS ================= */
async function resetProgress() {
  if (!confirm('Reset all progress?')) return;
  try {
    await fetchJSON('/api/user/progress/reset', { method: 'POST' });
    await loadUserState();
    alert('Progress reset on server.');
  } catch (err) {
    // fallback to local
    unlockedIndex = 0;
    completedProjects = [];
    userPoints = 0;
    localStorage.setItem('unlockedIndex', unlockedIndex);
    localStorage.setItem('completedProjects', JSON.stringify(completedProjects));
    localStorage.setItem('userPoints', userPoints);
    localStorage.removeItem('taskCompletion');
    renderProjects();
    updateProjectsProgressBar();
    updatePointsDisplay();
    showBadges();
    alert('Progress reset locally.');
  }
}

/* ================= GLOBAL BINDINGS ================= */
window.loginUser = loginUser;
window.registerUser = registerUser;
window.logout = logout;
window.selectProject = selectProject;
window.completeProject = completeProject;
window.goToProjects = goToProjects;
window.backToProjects = backToProjects;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.updatePointsDisplay = updatePointsDisplay;
window.showBadges = showBadges;
window.resetProgress = resetProgress;

/* ================= CHATBOX (client) ================= */
// Simple chat UI wiring to call /api/chat
const chatBox = document.getElementById('chatbox');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

function formatTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

function renderChatHistory(history) {
  if (!chatMessages) return;
  chatMessages.innerHTML = '';
  history.forEach(m => appendChatMessage(m.who, m.text, m.time));
  // scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendChatMessage(who, text, time) {
  if (!chatMessages) return;
  const el = document.createElement('div');
  el.className = 'chat-msg ' + (who === 'bot' ? 'bot' : 'user');
  const txt = document.createElement('div'); txt.className = 'chat-text'; txt.innerText = text;
  const meta = document.createElement('div'); meta.className = 'chat-meta'; meta.innerText = formatTime(time || new Date().toISOString());
  el.appendChild(txt); el.appendChild(meta);
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadChatHistory() {
  try {
    const res = await fetchJSON('/api/chat');
    if (res && res.success) renderChatHistory(res.history || []);
  } catch (e) {
    appendChatMessage('bot', 'Chat unavailable (server offline or not authenticated).', new Date().toISOString());
  }
}

async function sendChatMessage() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;
  // optimistically append
  appendChatMessage('user', text, new Date().toISOString());
  chatInput.value = '';
  // show a temporary typing indicator
  const typingId = 'typing-' + Date.now();
  appendChatMessage('bot', '…', new Date().toISOString());
  try {
    const res = await fetchJSON('/api/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
    // remove the last bot 'typing' message and render history returned by server
    // simple strategy: clear and re-render server history if provided
    if (res && res.success) {
      if (Array.isArray(res.history)) renderChatHistory(res.history);
      else if (res.reply) {
        // append bot reply
        appendChatMessage('bot', res.reply.text || res.reply, new Date().toISOString());
      }
    } else {
      appendChatMessage('bot', res.message || 'No reply from server', new Date().toISOString());
    }
  } catch (err) {
    appendChatMessage('bot', 'Failed to send message (server offline or not authenticated).', new Date().toISOString());
  }
}

// Toggle chat visibility (header click) and wire events
if (chatBox) {
  // start hidden; user can open by clicking header or programmatically
  chatBox.classList.add('hidden');
  const header = chatBox.querySelector('.chatbox-header');
  const closeBtn = chatBox.querySelector('.chatbox-close');
  if (header) header.addEventListener('click', async (e) => {
    // toggle
    if (chatBox.classList.contains('hidden')) {
      chatBox.classList.remove('hidden');
      // load history when opened
      await loadChatHistory();
      if (chatInput) chatInput.focus();
    } else {
      chatBox.classList.add('hidden');
    }
  });
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); chatBox.classList.add('hidden'); });
  if (chatSend) chatSend.addEventListener('click', sendChatMessage);
  if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
}
