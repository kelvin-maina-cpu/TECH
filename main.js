/* ================= GLOBAL STATE ================= */

// Projects with images
// Preload demo user for deployed site
if (!localStorage.getItem("users")) {
  const demoUsers = [
    { username: "demo", admission: "123", email: "demo@example.com", password: "demo123" }
  ];
  localStorage.setItem("users", JSON.stringify(demoUsers));
}


const projects = [
  { 
    name: "Web-Based Organizational Support System",
    description: "This project helps organizations manage information, visualize dashboards, and respond to inquiries.",
    image: "images/kevs4.jpeg"
  },
  { 
    name: "Student Information Management System",
    description: "Manages student records, academic performance, and attendance.",
    image: "images/kevs2.jpeg"
  },
  { 
    name: "Smart Room Energy Monitoring System",
    description: "Monitors and visualizes room energy usage using digital meters.",
    image: "images/kevs1.jpeg"
  },
  { 
    name: "Library Management System",
    description: "Manages book records, borrowing, returns, and users.",
    image: "images/download.jpeg"
  }
];

// Tasks for each project
const projectTasks = [
  ["Requirement Gathering","Design","Development","Testing","Deployment"],
  ["Student Data Entry","Grades Input","Attendance Tracking","Reporting"],
  ["Meter Installation","Data Monitoring","Visualization","Alerts Setup"],
  ["Book Cataloging","Borrowing Management","Return Tracking","User Accounts"]
];

// User progress and points
let unlockedIndex = parseInt(localStorage.getItem("unlockedIndex")) || 0;

let completedProjects = JSON.parse(localStorage.getItem("completedProjects")) || [];
let userPoints = parseInt(localStorage.getItem("userPoints")) || 0;

/* ================= HELPERS ================= */
const loginUsername = () => document.getElementById("login-username");
const loginPassword = () => document.getElementById("login-password");
const regUsername = () => document.getElementById("reg-username");
const regPassword = () => document.getElementById("reg-password");
const regAdmission = () => document.getElementById("reg-admission");
const regEmail = () => document.getElementById("reg-email");

/* ================= PAGE CONTROL ================= */
function showPage(id){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ================= AUTH FUNCTIONS ================= */
function registerUser() {
  const username = document.getElementById("reg-username").value.trim();
  const admission = document.getElementById("reg-admission").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value.trim();

  if (!username || !admission || !email || !password) {
    alert("Please fill in all fields.");
    return;
  }

  let users = JSON.parse(localStorage.getItem("users")) || [];

  const exists = users.some(u => u.username === username || u.email === email);
  if (exists) {
    alert("Username or email already exists!");
    return;
  }

  users.push({ username, admission, email, password });
  localStorage.setItem("users", JSON.stringify(users));

  alert("Account created successfully! Please log in.");
  
  document.getElementById("reg-username").value = "";
  document.getElementById("reg-admission").value = "";
  document.getElementById("reg-email").value = "";
  document.getElementById("reg-password").value = "";

  showPage("login-page");
}


function loginUser() {
  try {
    const username = loginUsername().value.trim();
    const password = loginPassword().value.trim();
    const users = JSON.parse(localStorage.getItem("users")) || [];
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) { alert("Invalid credentials"); return; }

    localStorage.setItem("currentUser", username);

    if (!localStorage.getItem("unlockedIndex")) localStorage.setItem("unlockedIndex","0");
    if (!localStorage.getItem("completedProjects")) localStorage.setItem("completedProjects","[]");
    if (!localStorage.getItem("userPoints")) localStorage.setItem("userPoints","0");

    renderProjects();            // prepare projects page in background
    showPage("portfolio-page");  // show portfolio first
    updatePointsDisplay();
    showBadges();

  } catch(err){console.error(err);}
  showPage("portfolio-page");
}

function logout() {
  try {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("currentProject");
    showPage("login-page");
  } catch(err){console.error(err);}
}

/* ================= PROJECTS ================= */
function renderProjects() {
  try {
    const container = document.getElementById("projects-container");
    container.innerHTML = "";

    unlockedIndex = parseInt(localStorage.getItem("unlockedIndex")) || 0;
    completedProjects = JSON.parse(localStorage.getItem("completedProjects")) || [];

    projects.forEach((project, index) => {
      const card = document.createElement("div");
      card.className = "card";

      if (index > unlockedIndex) {
        card.classList.add("locked");
        card.innerHTML = `
          <img src="${project.image}" alt="${project.name}" class="project-image">
          <h3>${project.name}</h3>
          <p>🔒 Locked – complete previous project</p>
        `;
      } else {
        const done = completedProjects.includes(index);
        card.innerHTML = `
          <img src="${project.image}" alt="${project.name}" class="project-image">
          <h3>${project.name} ${done ? '<span class="badge">Completed ✔</span>' : ''}</h3>
          <p>${project.description}</p>
          <button class="btnn" onclick="selectProject(${index})">Open Project</button>
        `;
        if (index === unlockedIndex && !done) card.classList.add("unlock");
      }

      container.appendChild(card);
    });

    updateProgress();
  } catch(err){console.error(err);}
}

/* ================= DASHBOARD ================= */
function selectProject(index) {
  try {
    if (index > unlockedIndex) { alert("Project is locked"); return; }
    localStorage.setItem("currentProject", index);

    const project = projects[index];
    document.getElementById("project-title").innerText = project.name;
    document.getElementById("project-description").innerText = project.description;
    document.getElementById("project-image").innerHTML = `<img src="${project.image}" alt="${project.name}" class="project-image">`;

    showPage("dashboard-page");

    // Tasks
    const taskContainer = document.getElementById("task-list");
    taskContainer.innerHTML = "";
    let taskCompletion = JSON.parse(localStorage.getItem("taskCompletion")) || {};
    if (!taskCompletion[index]) taskCompletion[index] = [];

    projectTasks[index].forEach((task, tIndex) => {
      const isChecked = taskCompletion[index][tIndex] || false;
      const taskDiv = document.createElement("div");
      taskDiv.innerHTML = `<input type="checkbox" id="task-${index}-${tIndex}" ${isChecked ? "checked" : ""}/> <label for="task-${index}-${tIndex}">${task}</label>`;
      taskContainer.appendChild(taskDiv);

      taskDiv.querySelector("input").addEventListener("change", e => {
        taskCompletion[index][tIndex] = e.target.checked;
        localStorage.setItem("taskCompletion", JSON.stringify(taskCompletion));
        updateTaskProgress(index);
      });
    });

    updateTaskProgress(index);

    // Chart.js
    const ctx = document.getElementById("projectChart").getContext("2d");
    if (window.projectChartInstance) window.projectChartInstance.destroy();
    const taskProgress = projectTasks[index].map((_, t) => taskCompletion[index][t] ? 100 : 0);

    window.projectChartInstance = new Chart(ctx, {
      type: "bar",
      data: { labels: projectTasks[index], datasets:[{label:"Completion %", data:taskProgress, backgroundColor:"rgba(42,82,152,0.6)", borderColor:"rgba(42,82,152,1)", borderWidth:1}] },
      options: { responsive:true, scales:{ y:{ beginAtZero:true, max:100 } } }
    });

  } catch(err){console.error(err);}
}

/* ================= TASK PROGRESS & GAMIFICATION ================= */
function updateTaskProgress(projectIndex) {
  try {
    let taskCompletion = JSON.parse(localStorage.getItem("taskCompletion")) || {};
    const tasks = projectTasks[projectIndex];
    const completed = taskCompletion[projectIndex] || [];
    const completedCount = completed.filter(c => c).length;
    const percent = Math.round((completedCount / tasks.length) * 100);

    // Update progress bar
    const fill = document.getElementById("progress-fill");
    const text = document.getElementById("progress-text");
    if (fill) fill.style.width = percent + "%";
    if (text) text.innerText = percent + "% Completed";

    // Complete project
    if (completedCount === tasks.length && !completedProjects.includes(projectIndex)) {
      completedProjects.push(projectIndex);
      localStorage.setItem("completedProjects", JSON.stringify(completedProjects));

      // Award points
      userPoints += 50;
      localStorage.setItem("userPoints", userPoints);
      updatePointsDisplay();
      showBadges();

      // Confetti
      confetti({ particleCount:100, spread:70, origin:{y:0.6} });

      // Unlock next project
      if (projectIndex === unlockedIndex && unlockedIndex < projects.length - 1) {
        unlockedIndex++;
        localStorage.setItem("unlockedIndex", unlockedIndex);
        const nextCard = document.querySelectorAll(".card")[unlockedIndex];
        if (nextCard) {
          nextCard.classList.add("unlock");
          setTimeout(() => nextCard.classList.remove("unlock"), 800);
        }
      }

      alert("Project completed! Next project unlocked!");
    }

  } catch(err){console.error(err);}
}

function completeProject() {
  const index = parseInt(localStorage.getItem("currentProject"));
  updateTaskProgress(index);
  backToProjects();
}

/* ================= POINTS & BADGES ================= */
function updatePointsDisplay() {
  const container = document.getElementById("points-display");
  if(container) {
    const level = Math.floor(userPoints / 100) + 1;
    container.innerHTML = `<p>Points: ${userPoints} | Level: ${level}</p>`;
  }
}

function showBadges() {
  const container = document.getElementById("badges-display");
  if(!container) return;
  const badges = [];
  if(userPoints >= 50) badges.push("🏆 Beginner");
  if(userPoints >= 100) badges.push("🎖 Intermediate");
  if(userPoints >= 200) badges.push("🌟 Expert");
  container.innerHTML = badges.map(b => `<span class="badge">${b}</span>`).join(" ");
}

/* ================= RESET ================= */
function resetProgress() {
  if (!confirm("Reset all progress?")) return;
  unlockedIndex = 0;
  completedProjects = [];
  taskCompletion = {};
  userPoints = 0;
  localStorage.setItem("unlockedIndex", unlockedIndex);
  localStorage.setItem("completedProjects", JSON.stringify(completedProjects));
  localStorage.setItem("userPoints", userPoints);
  localStorage.removeItem("taskCompletion");
  renderProjects();
  updatePointsDisplay();
  showBadges();
}

/* ================= NAVIGATION ================= */
function backToProjects() {
  showPage("projects-page");
  renderProjects();
  document.getElementById("project-description").innerText = "";
}
function goToProjects() {
  renderProjects();
  showPage("projects-page");
}

/* ================= INITIAL LOAD ================= */
showPage("login-page");
renderProjects();
updatePointsDisplay();
showBadges();
// Portfolio Carousel
let currentSlide = 0;

function showSlide(index) {
  const slides = document.querySelectorAll(".carousel-slide");
  if(index < 0) index = slides.length - 1;
  if(index >= slides.length) index = 0;
  currentSlide = index;

  slides.forEach((slide, i) => {
    slide.classList.toggle("active", i === currentSlide);
  });
}

function nextSlide() {
  showSlide(currentSlide + 1);
}

function prevSlide() {
  showSlide(currentSlide - 1);
}

// Auto-slide optional
setInterval(() => { nextSlide(); }, 5000);

