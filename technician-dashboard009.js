/****************************************************
 * PANEL SYSTEM
 ****************************************************/
function showMainPanel() {
  const mp = document.getElementById("main-panel");
  if (mp) mp.classList.remove("hidden");
}

function showPanel(panelId) {
  document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
  const target = document.getElementById(panelId);
  if (!target) {
    console.error("Panel not found:", panelId);
    return;
  }
  target.classList.remove("hidden");
}

/****************************************************
 * GLOBAL STATE
 ****************************************************/
let techRecord = null;
let currentJobForFiles = null;
let currentJobForSignout = null;

/****************************************************
 * BOOT APP — ONBOARDING UNLESS APPROVED
 ****************************************************/
async function bootApp() {
  showMainPanel();

  // Load logged-in user
  const { data: userData } = await sb.auth.getUser();
  if (!userData || !userData.user) {
    console.error("No logged-in user.");
    return;
  }

  const currentUser = userData.user;

  // Load technician record
  const { data: tech, error } = await sb
    .from("technicians")
    .select("*")
    .eq("user_id", currentUser.id)
    .single();

  if (error || !tech) {
    console.error("Technician record missing.");
    showPanel("onboarding-panel");
    return;
  }

  techRecord = tech;

  // Approval logic
  if (!techRecord.documents_submitted) {
    showPanel("onboarding-panel");
    return;
  }

  if (!techRecord.approved) {
    showPanel("approval-panel");
    return;
  }

  // Approved → show dashboard
  showPanel("active-panel");
  loadJobs();
  initMap();
}

/****************************************************
 * LOAD JOBS
 ****************************************************/
async function loadJobs() {
  if (!techRecord) return;

  const { data: jobs, error } = await sb
    .from("jobs")
    .select("*, clients(name, address, lat, lng)")
    .eq("technician_id", techRecord.id)
    .order("start_time", { ascending: true });

  if (error) {
    showToast("Failed to load jobs.");
    return;
  }

  renderActiveJobs(jobs.filter(j => j.status !== "completed"));
  renderCompletedJobs(jobs.filter(j => j.status === "completed"));
  plotJobsOnMap(jobs);
}

/****************************************************
 * RENDER ACTIVE JOBS
 ****************************************************/
function renderActiveJobs(jobs) {
  const el = document.getElementById("active-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = "<p>No active jobs yet</p>";
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
      <button onclick="openJobFiles('${job.id}')">Files</button>
      <button onclick="markComplete('${job.id}')">Check Out</button>
    `;
    el.appendChild(card);
  });
}

/****************************************************
 * RENDER COMPLETED JOBS
 ****************************************************/
function renderCompletedJobs(jobs) {
  const el = document.getElementById("completed-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = "<p>No completed jobs yet</p>";
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

/****************************************************
 * CHECK-IN
 ****************************************************/
async function checkIn(jobId) {
  const timestamp = new Date().toISOString();

  const { error } = await sb
    .from("jobs")
    .update({ status: "in_progress", check_in_time: timestamp })
    .eq("id", jobId);

  if (error) {
    showToast("Clock-in failed.");
    return;
  }

  showToast("Clock-in recorded.");
  loadJobs();
  showPanel("active-panel");
}

/****************************************************
 * FILES PANEL
 ****************************************************/
function openJobFiles(jobId) {
  currentJobForFiles = jobId;
  loadJobFiles(jobId);
  showPanel("files-panel");
}

async function loadJobFiles(jobId) {
  const { data } = await sb
    .from("job_files")
    .select("*")
    .eq("job_id", jobId)
    .eq("type", "workorder");

  const list = document.getElementById("files-list");
  list.innerHTML = "";

  if (!data || !data.length) {
    list.innerHTML = "<p>No files uploaded yet.</p>";
    return;
  }

  data.forEach(f => {
    const item = document.createElement("p");
    item.textContent = f.file_path;
    list.appendChild(item);
  });
}

async function uploadJobFile(file) {
  const filePath = `files/${currentJobForFiles}/${Date.now()}-${file.name}`;
  await sb.storage.from("job-files").upload(filePath, file);
  await sb.from("job_files").insert({
    job_id: currentJobForFiles,
    file_path: filePath,
    type: "workorder"
  });
}

async function submitJobFiles() {
  const f1 = document.getElementById("file-upload-1").files[0];
  const f2 = document.getElementById("file-upload-2").files[0];

  if (!f1 && !f2) {
    showToast("Select at least one file.");
    return;
  }

  const uploads = [];
  if (f1) uploads.push(uploadJobFile(f1));
  if (f2) uploads.push(uploadJobFile(f2));

  await Promise.all(uploads);

  showToast("Files uploaded.");
  loadJobFiles(currentJobForFiles);
  showPanel("active-panel");
}

/****************************************************
 * SIGNOUT PANEL
 ****************************************************/
function markComplete(jobId) {
  currentJobForSignout = jobId;
  showPanel("signout-panel");
}

async function uploadSignoutFile(file) {
  const filePath = `signout/${currentJobForSignout}/${Date.now()}-${file.name}`;
  await sb.storage.from("job-files").upload(filePath, file);
  await sb.from("job_files").insert({
    job_id: currentJobForSignout,
    file_path: filePath,
    type: "signout"
  });
}

async function submitSignOutUpload() {
  const f1 = document.getElementById("signout-photo-1").files[0];
  const f2 = document.getElementById("signout-photo-2").files[0];

  if (!f1 && !f2) {
    showToast("Upload at least one photo.");
    return;
  }

  const uploads = [];
  if (f1) uploads.push(uploadSignoutFile(f1));
  if (f2) uploads.push(uploadSignoutFile(f2));

  await Promise.all(uploads);

  await sb
    .from("jobs")
    .update({ status: "completed", completed_time: new Date().toISOString() })
    .eq("id", currentJobForSignout);

  showToast("Job completed.");
  currentJobForSignout = null;
  loadJobs();
  showPanel("active-panel");
}

/****************************************************
 * MAPBOX MAP
 ****************************************************/
let map;
let jobMarkers = [];
let techMarker;

function initMap() {
  mapboxgl.accessToken = "YOUR_MAPBOX_ACCESS_TOKEN";

  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v11",
    center: [-83.5379, 41.6528],
    zoom: 11
  });

  map.on("load", () => {
    trackTechnicianLocation();
  });
}

function trackTechnicianLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude } = pos.coords;

    if (!techMarker) {
      techMarker = new mapboxgl.Marker({ color: "blue" })
        .setLngLat([longitude, latitude])
        .addTo(map);
    } else {
      techMarker.setLngLat([longitude, latitude]);
    }
  });
}

function plotJobsOnMap(jobs) {
  jobMarkers.forEach(m => m.remove());
  jobMarkers = [];

  jobs.forEach(job => {
    if (!job.clients || !job.clients.lat) return;

    const color =
      job.status === "completed"
        ? "green"
        : job.status === "in_progress"
        ? "yellow"
        : "red";

    const marker = new mapboxgl.Marker({ color })
      .setLngLat([job.clients.lng, job.clients.lat])
      .addTo(map);

    marker.getElement().addEventListener("click", () => {
      openJobFiles(job.id);
    });

    jobMarkers.push(marker);
  });
}

/****************************************************
 * TOAST
 ****************************************************/
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
