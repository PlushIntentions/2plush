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




/****************************************************
 * PANEL SYSTEM — SHOWPANEL ONLY
 ****************************************************/
function showPanel(panelId) {
  // Hide all panels
  document.querySelectorAll(".panel").forEach(p => {
    p.classList.add("hidden");
  });

  // Show the requested panel
  const target = document.getElementById(panelId);
  if (!target) {
    console.error("Panel not found:", panelId);
    return;
  }

  target.classList.remove("hidden");
}

/****************************************************
 * LOAD JOBS
 ****************************************************/
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

/****************************************************
 * RENDER ACTIVE JOBS
 ****************************************************/
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

/****************************************************
 * CHECK-IN WORKFLOW
 ****************************************************/
async function checkIn(jobId) {
  try {
    const timestamp = new Date().toISOString();

    const { error } = await sb
      .from("jobs")
      .update({
        status: "in_progress",
        check_in_time: timestamp
      })
      .eq("id", jobId);

    if (error) throw error;

    showToast("Clock-in recorded.");
    loadJobs();
    showPanel("active-panel");

  } catch (err) {
    console.error(err);
    showToast("Clock-in failed.");
  }
}

/****************************************************
 * FILES UPLOAD WORKFLOW
 ****************************************************/
function openJobFiles(jobId) {
  currentJobForFiles = jobId;
  loadJobFiles(jobId);
  showPanel("files-panel");
}

async function loadJobFiles(jobId) {
  const { data, error } = await sb
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

  const { error } = await sb.storage
    .from("job-files")
    .upload(filePath, file);

  if (error) throw error;

  await sb.from("job_files").insert({
    job_id: currentJobForFiles,
    file_path: filePath,
    type: "workorder"
  });
}

async function submitJobFiles() {
  try {
    const file1 = document.getElementById("file-upload-1").files[0];
    const file2 = document.getElementById("file-upload-2").files[0];

    if (!file1 && !file2) {
      showToast("Please select at least one file.");
      return;
    }

    const uploads = [];

    if (file1) uploads.push(uploadJobFile(file1));
    if (file2) uploads.push(uploadJobFile(file2));

    await Promise.all(uploads);

    showToast("Files uploaded.");
    loadJobFiles(currentJobForFiles);
    showPanel("active-panel");

  } catch (err) {
    console.error(err);
    showToast("Upload failed.");
  }
}

function closeFilesPanel() {
  currentJobForFiles = null;
  showPanel("active-panel");
}

/****************************************************
 * CHECK-OUT WORKFLOW
 ****************************************************/
function markComplete(jobId) {
  currentJobForSignout = jobId;
  showPanel("signout-panel");
}

async function uploadSignoutFile(file) {
  const filePath = `signout/${currentJobForSignout}/${Date.now()}-${file.name}`;

  const { error } = await sb.storage
    .from("job-files")
    .upload(filePath, file);

  if (error) throw error;

  await sb.from("job_files").insert({
    job_id: currentJobForSignout,
    file_path: filePath,
    type: "signout"
  });
}

async function submitSignOutUpload() {
  try {
    const file1 = document.getElementById("signout-photo-1").files[0];
    const file2 = document.getElementById("signout-photo-2").files[0];

    if (!file1 && !file2) {
      showToast("Please upload at least one photo.");
      return;
    }

    const uploads = [];

    if (file1) uploads.push(uploadSignoutFile(file1));
    if (file2) uploads.push(uploadSignoutFile(file2));

    await Promise.all(uploads);

    const timestamp = new Date().toISOString();

    const { error } = await sb
      .from("jobs")
      .update({
        status: "completed",
        completed_time: timestamp
      })
      .eq("id", currentJobForSignout);

    if (error) throw error;

    showToast("Job completed.");
    currentJobForSignout = null;

    loadJobs();
    showPanel("active-panel");

  } catch (err) {
    console.error(err);
    showToast("Sign-out failed.");
  }
}

function cancelSignOutUpload() {
  currentJobForSignout = null;
  showPanel("active-panel");
}

/****************************************************
 * MAP WORKFLOW — USING #map-panel
 ****************************************************/
let map;
let jobMarkers = [];
let techMarker;

function initMap() {
  const mapDiv = document.getElementById("map-panel");

  if (!mapDiv) {
    console.error("Map container #map-panel not found.");
    return;
  }

  map = new google.maps.Map(mapDiv, {
    center: { lat: 41.6528, lng: -83.5379 },
    zoom: 11
  });

  trackTechnicianLocation();
}

function trackTechnicianLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude } = pos.coords;

    if (!techMarker) {
      techMarker = new google.maps.Marker({
        position: { lat: latitude, lng: longitude },
        map,
        icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
        title: "Your Location"
      });
    } else {
      techMarker.setPosition({ lat: latitude, lng: longitude });
    }
  });
}

function plotJobsOnMap(jobs) {
  jobMarkers.forEach(m => m.setMap(null));
  jobMarkers = [];

  jobs.forEach(job => {
    if (!job.clients || !job.clients.lat) return;

    const marker = new google.maps.Marker({
      position: { lat: job.clients.lat, lng: job.clients.lng },
      map,
      title: job.title,
      icon: getJobMarkerIcon(job.status)
    });

    marker.addListener("click", () => {
      openJobFiles(job.id);
    });

    jobMarkers.push(marker);
  });
}

function getJobMarkerIcon(status) {
  switch (status) {
    case "in_progress":
      return "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
    case "completed":
      return "https://maps.google.com/mapfiles/ms/icons/green-dot.png";
    default:
      return "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
  }
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
async function bootApp() {
  showMainPanel();

  // Load logged-in user FIRST
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
    console.error("Technician record not found.");
    showPanel("onboarding-panel");
    return;
  }

  techRecord = tech;

  // Technician approval logic
  if (!techRecord.documents_submitted) {
    showPanel("onboarding-panel");
    return;
  }

  if (!techRecord.approved) {
    showPanel("approval-panel");
    return;
  }

  // Technician is fully approved → show dashboard
  showPanel("active-panel");
  loadJobs();
  initMap();
}

