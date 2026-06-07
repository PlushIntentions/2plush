/* ============================================================
   tech-dashboard.js — Plush Intentions Technician Dashboard
   ============================================================ */

let sb;
let map;
let jobMarkers = [];
let currentUser = null;
let techRecord = null;
let currentJobForSignout = null;
let currentJobForFiles = null;
let pendingDeclineJobId = null;

/* CONFIG: set these */
const SUPABASE_URL = "https://iazvpykfdckpffhakncd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA";
const MAPBOX_TOKEN = "pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg";

/* SUPABASE INIT */
function initSupabase() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* AUTO‑AUTH CHECK (NO LOGIN SCREEN ON THIS PAGE) */
window.addEventListener("load", async () => {
  initSupabase();

  const { data: session } = await sb.auth.getSession();

  if (!session || !session.session) {
    window.location.href = "/login.html";
    return;
  }

  currentUser = session.session.user;
  await bootApp();
});

/* BOOT APP */
async function bootApp() {
  document.getElementById("loader").classList.remove("hidden");

  const { data, error } = await sb
    .from("technicians")
    .select("*")
    .eq("user_id", currentUser.id)
    .single();

  if (error || !data) {
    showToast("Technician record not found.");
    document.getElementById("loader").classList.add("hidden");
    return;
  }

  techRecord = data;

  document.getElementById("main-panel").classList.remove("hidden");

  if (techRecord.status === "pending_documents") {
    showOnboardingPanel();
    document.getElementById("loader").classList.add("hidden");
    return;
  }

  if (techRecord.status === "pending_approval") {
    showApprovalPanel();
    document.getElementById("loader").classList.add("hidden");
    return;
  }

  await initMap();
  await loadJobs();
  await loadUnassignedJobs();
  renderProfile();
  showPanel("map-panel");

  document.getElementById("loader").classList.add("hidden");
}

/* ONBOARDING PANEL */
function showOnboardingPanel() {
  hideAllPanels();
  document.getElementById("onboarding-panel").classList.remove("hidden");
}

async function uploadAllDocuments() {
  const msa = document.getElementById("doc-msa").files[0];
  const nda = document.getElementById("doc-nda").files[0];
  const w9 = document.getElementById("doc-w9").files[0];
  const idFile = document.getElementById("doc-id").files[0];

  if (!msa || !nda || !w9 || !idFile) {
    showToast("Please upload all required documents.");
    return;
  }

  const folder = `tech_docs/${currentUser.id}`;

  const uploads = [
    sb.storage.from("tech_docs").upload(`${folder}/msa_${msa.name}`, msa, { upsert: true }),
    sb.storage.from("tech_docs").upload(`${folder}/nda_${nda.name}`, nda, { upsert: true }),
    sb.storage.from("tech_docs").upload(`${folder}/w9_${w9.name}`, w9, { upsert: true }),
    sb.storage.from("tech_docs").upload(`${folder}/id_${idFile.name}`, idFile, { upsert: true })
  ];

  const results = await Promise.all(uploads);
  if (results.some(r => r.error)) {
    showToast("Failed to upload one or more documents.");
    return;
  }

  await sb.from("technicians")
    .update({ status: "pending_approval" })
    .eq("id", techRecord.id);

  techRecord.status = "pending_approval";
  showApprovalPanel();
}

/* APPROVAL PANEL */
function showApprovalPanel() {
  hideAllPanels();
  document.getElementById("approval-panel").classList.remove("hidden");
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

/* LOAD JOBS */
async function loadJobs() {
  const { data: jobs, error } = await sb
    .from("jobs")
    .select(`
      *,
      clients (name, address, lat, lng)
    `)
    .eq("tech_id", techRecord.id)
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

/* RENDER ACTIVE JOBS */
function renderActiveJobs(jobs) {
  const el = document.getElementById("active-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = `<div class="empty-state"><p>No active jobs yet</p></div>`;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    const checkedInBadge = job.check_in_time
      ? `<span class="status-pill status-checkedin">● Checked In — ${formatDate(job.check_in_time)}</span>`
      : "";

    const filesWarningBadge = shouldShowFilesWarning(job)
      ? `<span class="status-pill status-files-warning">● Files Not Downloaded</span>`
      : "";

    card.innerHTML = `
      <span class="status-pill status-active">Active</span>
      ${checkedInBadge}
      ${filesWarningBadge}
      <h3>${job.title || "Untitled Job"}</h3>

      <div class="job-meta">
        <div><strong>Client:</strong> ${job.clients?.name || "N/A"}</div>
        <div><strong>Address:</strong> ${job.clients?.address || "N/A"}</div>
        <div><strong>Start:</strong> ${formatDate(job.start_time)}</div>
        <div><strong>End:</strong> ${formatDate(job.end_time)}</div>
      </div>

      <div class="job-actions">
        <button class="btn-action btn-start" onclick="checkIn('${job.id}')">⏱ Check In</button>
        <button class="btn-action btn-complete" onclick="markComplete('${job.id}')">✓ Mark Complete</button>
        <button class="btn-action btn-files" onclick="openFilesPanel('${job.id}')">📄 Download Files</button>
        <button class="btn-action btn-map" onclick="openDirections('${encodeURIComponent(job.clients.address)}')">🗺 Directions</button>
      </div>
    `;

    el.appendChild(card);

    checkFileReminder(job);
  });
}

/* RENDER COMPLETED JOBS */
function renderCompletedJobs(jobs) {
  const el = document.getElementById("completed-list");
  el.innerHTML = "";

  if (!jobs.length) {
    el.innerHTML = `<div class="empty-state"><p>No completed jobs yet</p></div>`;
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    const checkedInBadge = job.check_in_time
      ? `<span class="status-pill status-checkedin">● Checked In — ${formatDate(job.check_in_time)}</span>`
      : "";

    card.innerHTML = `
      <span class="status-pill status-completed">✓ Completed</span>
      ${checkedInBadge}
      <h3>${job.title}</h3>

      <div class="job-meta">
        <div><strong>Client:</strong> ${job.clients?.name}</div>
        <div><strong>Address:</strong> ${job.clients?.address}</div>
        <div><strong>Completed:</strong> ${formatDate(job.completed_time)}</div>
      </div>
    `;

    el.appendChild(card);
  });
}

/* MAP MARKERS */
function plotJobsOnMap(jobs) {
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

/* LOCATION CHECK */
function isWithinOneMile(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = x => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c <= 1;
}

/* CHECK-IN */
async function checkIn(jobId) {
  const { data: job } = await sb
    .from("jobs")
    .select("id, clients (lat, lng)")
    .eq("id", jobId)
    .single();

  const techLat = techRecord.lat;
  const techLng = techRecord.lng;

  if (!isWithinOneMile(techLat, techLng, job.clients.lat, job.clients.lng)) {
    showToast("You must be within 1 mile of the worksite to check in.");
    return;
  }

  await sb.from("jobs")
    .update({ check_in_time: new Date().toISOString() })
    .eq("id", jobId);

  showToast("Checked in successfully!");
  loadJobs();
}

/* MARK COMPLETE → SIGNOUT PANEL */
async function markComplete(jobId) {
  const { data: job } = await sb
    .from("jobs")
    .select("id, clients (lat, lng)")
    .eq("id", jobId)
    .single();

  const techLat = techRecord.lat;
  const techLng = techRecord.lng;

  if (!isWithinOneMile(techLat, techLng, job.clients.lat, job.clients.lng)) {
    showToast("You must be within 1 mile of the worksite to complete this job.");
    return;
  }

  currentJobForSignout = jobId;
  document.getElementById("active-panel").classList.add("hidden");
  document.getElementById("signout-panel").classList.remove("hidden");
}

/* SIGNOUT PANEL ACTIONS */
function cancelSignOutUpload() {
  currentJobForSignout = null;
  document.getElementById("signout-panel").classList.add("hidden");
  document.getElementById("active-panel").classList.remove("hidden");
}

async function submitSignOutSheet() {
  const file = document.getElementById("signout-file").files[0];
  const manager = document.getElementById("manager-name").value.trim();
  const rating = document.getElementById("tech-rating").value;
  const satisfied = document.getElementById("satisfied").value;
  const systemWorking = document.getElementById("system-working").value;
  const notes = document.getElementById("completion-notes").value.trim();

  if (!file || !manager || !rating || !satisfied || !systemWorking) {
    showToast("Please complete all required fields.");
    return;
  }

  if ((satisfied === "no" || systemWorking === "no") && notes.length < 5) {
    showToast("Please provide notes for issues.");
    return;
  }

  const jobId = currentJobForSignout;

  await sb.storage.from("signout_sheets")
    .upload(`${jobId}/${file.name}`, file, { upsert: true });

  await sb.from("jobs")
    .update({
      status: "completed",
      completed_time: new Date().toISOString(),
      manager_name: manager,
      rating,
      satisfied,
      system_working: systemWorking,
      notes
    })
    .eq("id", jobId);

  showToast("Job completed!");
  cancelSignOutUpload();
  loadJobs();
}

/* FILE DOWNLOAD PANEL */
async function openFilesPanel(jobId) {
  currentJobForFiles = jobId;

  const { data: files } = await sb.storage
    .from("workorder_files")
    .list(`${jobId}/`);

  const list = document.getElementById("files-list");
  list.innerHTML = "";

  if (!files || !files.length) {
    list.innerHTML = "<p>No files available.</p>";
  } else {
    files.forEach(f => {
      const link = document.createElement("a");
      link.textContent = f.name;
      link.href = sb.storage.from("workorder_files").getPublicUrl(`${jobId}/${f.name}`).data.publicUrl;
      link.target = "_blank";
      link.className = "file-link";
      link.onclick = () => recordFileDownload(jobId, f.name);
      list.appendChild(link);
    });
  }

  document.getElementById("active-panel").classList.add("hidden");
  document.getElementById("files-panel").classList.remove("hidden");
}

function closeFilesPanel() {
  currentJobForFiles = null;
  document.getElementById("files-panel").classList.add("hidden");
  document.getElementById("active-panel").classList.remove("hidden");
}

async function recordFileDownload(jobId, fileName) {
  await sb.from("jobs_files_downloads").insert({
    job_id: jobId,
    tech_id: currentUser.id,
    file_name: fileName,
    downloaded_at: new Date().toISOString()
  });

  await sb.from("jobs")
    .update({ files_downloaded: true })
    .eq("id", jobId);
}

/* FILE REMINDER */
function shouldShowFilesWarning(job) {
  if (!job.start_time) return false;
  if (job.files_downloaded) return false;

  const now = new Date();
  const start = new Date(job.start_time);
  const hoursLeft = (start - now) / 36e5;

  return hoursLeft <= 48;
}

async function checkFileReminder(job) {
  if (!shouldShowFilesWarning(job)) return;

  const { data: reminded } = await sb
    .from("jobs_file_reminders")
    .select("*")
    .eq("job_id", job.id)
    .eq("tech_id", currentUser.id)
    .maybeSingle();

  if (reminded) return;

  showToast("Reminder: Please download all work order files before your job starts.");

  await sb.from("jobs_file_reminders").insert({
    job_id: job.id,
    tech_id: currentUser.id,
    reminded_at: new Date().toISOString()
  });
}

/* DIRECTIONS */
function openDirections(address) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, "_blank");
}

/* PROFILE */
function renderProfile() {
  const el = document.getElementById("profile-content");

  el.innerHTML = `
    <div class="profile-grid">
      <div><label>Name</label><span>${techRecord.name}</span></div>
      <div><label>Email</label><span>${currentUser.email}</span></div>
      <div><label>Phone</label><span>${techRecord.phone || "—"}</span></div>
      <div><label>Status</label><span>${techRecord.status}</span></div>
      <div><label>Member Since</label><span>${formatDate(techRecord.created_at)}</span></div>
    </div>
  `;
}

/* PANEL SWITCHING */
function hideAllPanels() {
  [
    "map-panel",
    "active-panel",
    "completed-panel",
    "profile-panel",
    "onboarding-panel",
    "approval-panel",
    "signout-panel",
    "files-panel",
    "unassigned-panel"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function showPanel(panelId) {
  hideAllPanels();
  document.getElementById(panelId).classList.remove("hidden");

  if (panelId === "unassigned-panel") {
    loadUnassignedJobs();
  }
}

/* UNASSIGNED JOBS */
async function loadUnassignedJobs() {
  const { data, error } = await sb
    .from("jobs")
    .select(`
      *,
      clients (name, address)
    `)
    .is("tech_id", null)
    .eq("status", "unassigned");

  const el = document.getElementById("unassigned-list");
  el.innerHTML = "";

  if (error) {
    el.innerHTML = "<p>Failed to load unassigned jobs.</p>";
    return;
  }

  if (!data || !data.length) {
    el.innerHTML = "<p>No unassigned jobs available.</p>";
    return;
  }

  data.forEach(job => {
    const card = document.createElement("div");
    card.className = "job-card";

    card.innerHTML = `
      <span class="status-pill status-active">Unassigned</span>
      <h3>${job.title || "Untitled Job"}</h3>

      <div class="job-meta">
        <div><strong>Client:</strong> ${job.clients?.name || "N/A"}</div>
        <div><strong>Address:</strong> ${job.clients?.address || "N/A"}</div>
        <div><strong>Start:</strong> ${formatDate(job.start_time)}</div>
        <div><strong>End:</strong> ${formatDate(job.end_time)}</div>
      </div>

      <div class="job-actions">
        <button class="btn-brand" onclick="requestWorkOrder('${job.id}')">Request Work Order</button>
        <button class="btn-action" onclick="startDeclineFlow('${job.id}')">Decline Work Order</button>
      </div>
    `;

    el.appendChild(card);
  });
}

/* REQUEST WORK ORDER (ADMIN APPROVAL) */
async function requestWorkOrder(jobId) {
  const { error } = await sb
    .from("job_requests")
    .insert({
      job_id: jobId,
      tech_id: techRecord.id
    });

  if (error) {
    showToast("Failed to request work order.");
    return;
  }

  showToast("Work order requested. Awaiting admin approval.");
}

/* DECLINE LIMITS */
async function getDeclineCounts() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("job_declines")
    .select("declined_at")
    .eq("tech_id", techRecord.id);

  if (error || !data) return { weekCount: 0, sixtyCount: 0 };

  const weekCount = data.filter(d => d.declined_at >= weekAgo).length;
  const sixtyCount = data.filter(d => d.declined_at >= sixtyAgo).length;

  return { weekCount, sixtyCount };
}

/* START DECLINE FLOW (MODAL) */
async function startDeclineFlow(jobId) {
  const { weekCount, sixtyCount } = await getDeclineCounts();

  if (weekCount >= 3 || sixtyCount >= 12) {
    const msg = `
You have reached the maximum allowed declines.

Weekly limit: 3 declines (you have ${weekCount})
60-day limit: 12 declines (you have ${sixtyCount})

Further declines may result in removal from the platform and this decline is blocked.
    `;
    document.getElementById("decline-modal-text").textContent = msg.trim();
    pendingDeclineJobId = null;
    document.getElementById("decline-modal").classList.remove("hidden");
    return;
  }

  const msg = `
Declining work orders too often may result in removal from the platform.

Weekly limit: 3 declines (you have ${weekCount})
60-day limit: 12 declines (you have ${sixtyCount})

Do you still want to decline this work order?
  `;
  document.getElementById("decline-modal-text").textContent = msg.trim();
  pendingDeclineJobId = jobId;
  document.getElementById("decline-modal").classList.remove("hidden");
}

/* MODAL CONTROLS */
function closeDeclineModal() {
  pendingDeclineJobId = null;
  document.getElementById("decline-modal").classList.add("hidden");
}

/* CONFIRM DECLINE */
async function confirmDecline() {
  if (!pendingDeclineJobId) {
    closeDeclineModal();
    return;
  }

  const jobId = pendingDeclineJobId;

  await sb.from("job_declines").insert({
    job_id: jobId,
    tech_id: techRecord.id
  });

  await sb.from("jobs")
    .update({ status: "declined" })
    .eq("id", jobId);

  showToast("Work order declined.");
  closeDeclineModal();
  loadUnassignedJobs();
}

/* UTIL: FORMAT DATE */
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString();
}

/* TOAST */
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
