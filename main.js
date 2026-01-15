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
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts));
    const data = await res.json();
    if (!res.ok) throw data;
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

    if (i > unlockedIndex) {
      card.classList.add("locked");
      card.innerHTML = `<h3>${p.name}</h3><p>🔒 Locked</p>`;
    } else {
      card.innerHTML = `
        <img src="${p.image}" class="project-image">
        <h3>${p.name} ${completedProjects.includes(i) ? "✔" : ""}</h3>
        <p>${p.description}</p>
        <button class="btnn" onclick="selectProject(${i})">Open Project</button>
      `;
    }

    container.appendChild(card);
  });

  updateProjectsProgressBar();
}

/* ================= DASHBOARD ================= */
let chartInstance = null;

function selectProject(index) {
  // open project dashboard and load server-side task completion for this user
  showPage("dashboard-page");

  document.getElementById("project-title").innerText = projects[index].name;
  document.getElementById("project-description").innerText = projects[index].description;
  document.getElementById("project-image").innerHTML =
    `<img src="${projects[index].image}" class="project-image">`;

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
    } catch (e) {
      // fallback to localStorage
      renderTasks(index);
      renderChart(index);
      window._currentProject = index;
    }
  })();
}

// Render a small research chart card for each project on the dashboard.
async function renderResearchCharts() {
  const container = document.getElementById('research-charts');
  if (!container) return;
  container.innerHTML = '';

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

    // Render a small doughnut chart
    try {
      const ctx = document.getElementById(`research-chart-${i}`).getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Done', 'Remaining'],
          datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#2a5298', '#e6e6e6'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true } }
        }
      });
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
  list.innerHTML = "";

  // completionFromServer expected to be an array; if not provided, fall back to localStorage
  let completion = {};
  if (Array.isArray(completionFromServer)) {
    completion[index] = completionFromServer;
  } else {
    completion = JSON.parse(localStorage.getItem("taskCompletion")) || {};
    if (!completion[index]) completion[index] = [];
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
    } catch (e) {
      renderChart(p);
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
  const ctx = document.getElementById("projectChart").getContext("2d");
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

  const percent = Math.round(((unlockedIndex + 1) / projects.length) * 100);
  fill.style.width = percent + "%";
  text.innerText = percent + "% Completed";
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
