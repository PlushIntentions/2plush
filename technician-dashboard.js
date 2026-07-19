/* ============================================================
   TECHNICIAN DASHBOARD — FULLY REFACTORED TO MATCH YOUR HTML
   ============================================================ */

let sb;
let map;
let jobMarkers = [];
let currentUser = null;
let techRecord = null;
let currentJobForSignout = null;
let currentJobForFiles = null;

/* CONFIG */
const SUPABASE_URL = "https://iazvpykfdckpffhakncd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA";
const MAPBOX_TOKEN = "pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg";

/* INIT SUPABASE */
function initSupabase() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* SIDEBAR NAVIGATION */
function setupSidebarNavigation() {
  const navItems = {
    "nav-map": "map-panel",
    "nav-active": "active-panel",
    "nav-completed": "completed-panel",
    "nav-unassigned": "unassigned-panel",
    "nav-profile": "profile-panel"
  };

  Object.keys(navItems).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("click", () => {
      showPanel(navItems[id]);
      highlightNav(id);
    });
  });

  const hamburger = document.getElementById("hamburger");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");
  const closeBtn = document.querySelector(".sidebar-close-btn");

  if (hamburger) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.add("open");
      backdrop.classList.add("show");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
    });
  }
}

/* PANEL SWITCHING */
function hideAllPanels() {
  document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
}

function showPanel(id) {
  hideAllPanels();
  const panel = document.getElementById(id);
  if (panel) panel.classList.remove("hidden");
}

function highlightNav(id) {
  document.querySelectorAll(".nav-link").forEach(n => n.classList.remove("active"));
  const active = document.getElementById(id);
  if (active) active.classList.add("active");
}

/* AUTO‑AUTH CHECK */
window.addEventListener("DOMContentLoaded", async () => {
  initSupabase();

  const { data: session } = await sb.auth.getSession();
  if (!session || !session.session) {
    window.location.href = "/login.html";
    return;
  }

  currentUser = session.session.user;

  try {
    await bootApp();
  } catch (err) {
    console.error("BootApp failed:", err);
  }
});

/* BOOT APP */
async function bootApp() {
  document.getElementById("loader").classList.remove("hidden");

  const { data, error } = await sb
    .from("technicians")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error || !data) {
    showToast("Technician record not found.");
    document.getElementById("loader").classList.add("hidden");
    return;
  }

  techRecord = data;

  document.getElementById("main-panel").classList.remove("hidden");

  setupSidebarNavigation();

  if (techRecord.status === "pending_documents") {
    showPanel("onboarding-panel");
    document.getElementById("loader").classList.add("hidden");
    return;
  }

  if (techRecord.status === "pending_approval") {
    showPanel("approval-panel");
    document.getElementById("loader").classList.add("hidden");
    return;
  }
 if (techRecord.status === "approved") {
    await initMap();
    await loadJobs();
    await loadUnassignedJobs();
    renderProfile();

    showPanel("map-panel");
    highlightNav("nav-map");

    document.getElementById("loader").classList.add("hidden");
    return;
}

  await initMap();
  await loadJobs();
  await loadUnassignedJobs();
  renderProfile();

  showPanel("map-panel");
  highlightNav("nav-map");

  document.getElementById("loader").classList.add("hidden");
}

/* MAP INIT */
async function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v11",
    center: [-81.6326, 38.3498],
    zoom: 11
  });

  map.addControl(new mapboxgl.NavigationControl(), "top-right");
}

/* MAP MARKERS */
function plotJobsOnMap(jobs) {
  if (!map) return;

  // Remove old markers
  jobMarkers.forEach(m => m.remove());
  jobMarkers = [];

  jobs.forEach(job => {
    if (!job.clients?.lat || !job.clients?.lng) return;

    const el = document.createElement("div");
    el.className = "job-marker";

    const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(`
      <strong>${job.title}</strong><br/>
      ${job.clients.name}<br/>
      ${job.clients.address}
    `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([job.clients.lng, job.clients.lat])
      .setPopup(popup)
      .addTo(map);

    jobMarkers.push(marker);
  });
}


/* LOAD JOBS */
async function loadJobs() {
  const { data: jobs, error } = await sb
    .from("jobs")
    .select(`
      *,
      clients (name, address, lat, lng)
    `)
    .eq("technician_id", techRecord.id)
    .order("start_time", { ascending: true });

  if (error) {
    showToast("Failed to load jobs.");
    return;
  }

  const active = jobs.filter(j => j.status !== "completed");
  const completed = jobs.filter(j => j.status === "completed");

  renderActiveJobs(active);
  renderCompletedJobs(completed);
  plotJobsOnMap(jobs);
}

/* LOAD UNASSIGNED JOBS */
async function loadUnassignedJobs() {
  const { data: jobs, error } = await sb
    .from("jobs")
    .select(`
      *,
      clients (name, address, lat, lng)
    `)
    .is("technician_id", null)
    .order("start_time", { ascending: true });

  if (error) {
    showToast("Failed to load available jobs.");
    return;
  }

  renderUnassignedJobs(jobs);
}

/* RENDER JOB LISTS */
function renderActiveJobs(jobs) {
  const el = document.getElementById("active-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = `<p>No active jobs yet</p>`;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    card.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Client:</strong> ${job.clients?.name}</p>
      <p><strong>Address:</strong> ${job.clients?.address}</p>

      <button onclick="checkIn('${job.id}')">Check In</button>
      <button onclick="markComplete('${job.id}')">Complete</button>
      <button onclick="openFilesPanel('${job.id}')">Files</button>


    `;

    el.appendChild(card);
  });
}

function renderCompletedJobs(jobs) {
  const el = document.getElementById("completed-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = `<p>No completed jobs yet</p>`;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    card.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Client:</strong> ${job.clients?.name}</p>
      <p><strong>Completed:</strong> ${job.completed_time}</p>
    `;

    el.appendChild(card);
  });
}

function renderUnassignedJobs(jobs) {
  const el = document.getElementById("unassigned-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = "<p>No available jobs right now.</p>";
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    card.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>Client:</strong> ${job.clients?.name}</p>
      <p><strong>Address:</strong> ${job.clients?.address}</p>

      <!-- ⭐ NEW: View Details button -->
      <button class="btn" onclick='openUnassignedModal(${JSON.stringify(job)})'>
        View Details
      </button>

      <button class="btn btn-primary" onclick="requestJob('${job.id}')">Request</button>
      <button class="btn btn-secondary" onclick="declineJob('${job.id}')">Decline</button>
    `;

    el.appendChild(card);
  });
}




/* FILES PANEL */
function showFilesPanel(jobId) {
  currentJobForFiles = jobId;
  showPanel("files-panel");
}

function closeFilesPanel() {
  currentJobForFiles = null;
  showPanel("active-panel");
}

/* SIGNOUT PANEL */
function markComplete(jobId) {
  currentJobForSignout = jobId;
  showPanel("signout-panel");
}

function cancelSignOutUpload() {
  currentJobForSignout = null;
  showPanel("active-panel");
}

/* PROFILE */
function renderProfile() {
  const el = document.getElementById("profile-content");
  el.innerHTML = `
    <p><strong>Name:</strong> ${techRecord.full_name}</p>
    <p><strong>Email:</strong> ${currentUser.email}</p>
    <p><strong>Status:</strong> ${techRecord.status}</p>
  `;
}

/* TOAST */
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3000);
}

async function checkIn(jobId) {
  try {
    const timestamp = new Date().toISOString();

    const { data, error } = await sb
      .from("jobs")
      .update({
        status: "in_progress",
        check_in_time: timestamp
      })
      .eq("id", jobId);

    if (error) throw error;

    showToast("Clock-in recorded.");
    loadActiveJobs();
    showPanel("active-panel");

  } catch (err) {
    console.error(err);
    showToast("Clock-in failed.");
  }
}

async function loadActiveJobs() {
  try {
    const { data, error } = await sb
      .from("jobs")
      .select("*")
      .eq("status", "in_progress")
      .order("check_in_time", { ascending: false });

    if (error) throw error;

    const container = document.getElementById("active-list");
    container.innerHTML = "";

    if (!data || data.length === 0) {
      container.innerHTML = "<p>No active jobs.</p>";
      return;
    }

    data.forEach(job => {
      const card = document.createElement("div");
      card.className = "job-card";

      card.innerHTML = `
        <h3>${job.title}</h3>
        <p>${job.address}</p>
        <p><strong>Clock-in:</strong> ${job.check_in_time || "Not recorded"}</p>
        <button class="btn" onclick="showJobFiles(${job.id})">Files</button>
        <button class="btn" onclick="openSignout(${job.id})">Complete Job</button>
      `;

      container.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    showToast("Failed to load active jobs.");
  }
}


async function checkIn(jobId) {
  try {
    const timestamp = new Date().toISOString();
    const { data, error } = await sb
      .from("jobs")
      .update({ status: "in_progress", check_in_time: timestamp })
      .eq("id", jobId);

    if (error) throw error;

    showToast("Clock-in recorded.");
    loadActiveJobs(); 
    showPanel("active-panel");
  } catch (err) {
    console.error(err);
    showToast("Clock-in failed.");
  }
}
﻿
function openPanel(panelId) {
  document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
  document.getElementById(panelId)?.classList.remove("hidden");
}


  // Show the selected panel
  const target = document.getElementById(panelId);
  if (target) {
    target.classList.remove("hidden");
  } else {
    console.error("Panel not found:", panelId);
  }

async function requestJob(jobId) {
  try {
    const { data, error } = await sb
      .from("job_requests")
      .insert({
        job_id: jobId,
        tech_id: techRecord.id,
        status: "Pending",
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    showToast("Request submitted for approval.");
    showPanel("requests-panel"); // optional: switch panel like checkIn does

  } catch (err) {
    console.error("Request failed:", err);
    showToast("Failed to submit request.");
  }
}
function showPanel(panelId) {
  document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));

  const target = document.getElementById(panelId);
  target.classList.remove("hidden");

  if (panelId === "map-panel") {
    setTimeout(() => {
      if (window.map) {
        map.resize();
      } else {
        initMap();
      }
    }, 150);
  }
}



document.getElementById("nav-requests").addEventListener("click", () => {
  showPanel("requests-panel");
  loadRequestedJobs();
});





/* ============================
   UNASSIGNED JOB MODAL LOGIC
   ============================ */

function openUnassignedModal(job) {
  // Fill modal fields
  document.getElementById("uaModalTitle").innerText = job.title;
  document.getElementById("uaModalAddress").innerText = job.clients?.address || "No address";
  document.getElementById("uaModalStatus").innerText = job.status || "unassigned";
  document.getElementById("uaModalDescription").innerText = job.description || "No description provided.";

  // Show modal
  document.getElementById("unassignedJobModal").style.display = "flex";

  // Attach request handler
  document.getElementById("uaRequestBtn").onclick = function () {
    requestJob(job.id);
  };
}

function closeUnassignedModal() {
  document.getElementById("unassignedJobModal").style.display = "none";
}

