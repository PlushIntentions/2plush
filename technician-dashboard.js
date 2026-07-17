/* ============================================================
   TECHNICIAN DASHBOARD — JOB REQUEST FEATURE
   ============================================================ */

let sb;
let map;
let jobMarkers = [];
let currentUser = null;
let techRecord = null;
let currentJobForSignout = null;
let currentJobForFiles = null;
let jobRequestSubscription = null;


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
    "nav-requested": "requested-panel",
    "nav-profile": "profile-panel"
  };

  Object.keys(navItems).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("click", () => {
      showPanel(navItems[id]);
      highlightNav(id);
      
      // Load job requests when panel is shown
      if (id === "nav-requested") {
        loadJobRequests();
      }
    });
  });

  const hamburger = document.getElementById("sidebar-open");
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

  // Setup signout button
  const signoutBtn = document.getElementById("btn-signout");
  if (signoutBtn) {
    signoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "/login.html";
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
    await loadJobRequests();
    renderProfile();

    // Setup realtime listener for job requests (admin-side)
    setupJobRequestListener();

    showPanel("map-panel");
    highlightNav("nav-map");

    document.getElementById("loader").classList.add("hidden");
    return;
  }

  await initMap();
  await loadJobs();
  await loadUnassignedJobs();
  await loadJobRequests();
  renderProfile();

  // Setup realtime listener for job requests (admin-side)
  setupJobRequestListener();

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

  // Update sidebar stats
  document.getElementById("stat-active").textContent = active.length;
  document.getElementById("stat-completed").textContent = completed.length;
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

/* LOAD JOB REQUESTS */
async function loadJobRequests() {
  const { data: requests, error } = await sb
    .from("job_requests")
    .select("*")
    .eq("tech_id", techRecord.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load job requests:", error);
    showToast("Failed to load job requests.");
    return;
  }

  renderJobRequests(requests || []);
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

      <button class="btn" onclick="checkIn('${job.id}')">Check In</button>
      <button class="btn" onclick="markComplete('${job.id}')">Complete</button>
      <button class="btn" onclick="openFilesPanel('${job.id}')">Files</button>
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
      <p><strong>Completed:</strong> ${job.completed_time || "N/A"}</p>
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

      <button class="btn btn-primary" onclick="requestJob('${job.id}')">Request</button>
      <button class="btn btn-secondary" onclick="declineJob('${job.id}')">Decline</button>
    `;

    el.appendChild(card);
  });
}

/* RENDER JOB REQUESTS */
function renderJobRequests(requests) {
  const el = document.getElementById("requested-list");
  el.innerHTML = "";

  if (!requests.length) {
    el.innerHTML = "<p>No job requests yet. Create one to get started!</p>";
    return;
  }

  requests.forEach(req => {
    const card = document.createElement("div");
    card.className = "job-card";

    const statusClass = req.status === "Approved" ? "status-approved" : 
                       req.status === "Rejected" ? "status-rejected" : 
                       "status-pending";

    card.innerHTML = `
      <h3>${req.title}</h3>
      <p><strong>Location:</strong> ${req.location}</p>
      <p><strong>Priority:</strong> <span class="${statusClass}">${req.priority}</span></p>
      <p><strong>Description:</strong> ${req.description}</p>
      <p><strong>Status:</strong> <span class="${statusClass}">${req.status}</span></p>
      <p><strong>Requested:</strong> ${new Date(req.created_at).toLocaleDateString()}</p>
    `;

    el.appendChild(card);
  });
}

/* FILES PANEL */
function openFilesPanel(jobId) {
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

async function submitSignOutUpload() {
  showToast("Job completion submitted.");
  currentJobForSignout = null;
  await loadJobs();
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

/* REQUEST JOB MODAL */
function openRequestJobModal() {
  document.getElementById("request-job-modal").classList.remove("hidden");
}

function closeRequestJobModal() {
  document.getElementById("request-job-modal").classList.add("hidden");
  document.getElementById("request-job-form").reset();
}

/* SUBMIT JOB REQUEST */
async function submitJobRequest(event) {
  event.preventDefault();

  const title = document.getElementById("req-title").value;
  const description = document.getElementById("req-description").value;
  const location = document.getElementById("req-location").value;
  const priority = document.getElementById("req-priority").value;

  try {
    const { data, error } = await sb
      .from("job_requests")
      .insert([
        {
          tech_id: techRecord.id,
          title,
   
          status: "Pending"
        }
      ]);

    if (error) throw error;

    showToast("Job request submitted successfully!");
    closeRequestJobModal();
    await loadJobRequests();

  } catch (err) {
    console.error("Error submitting job request:", err);
    showToast("Failed to submit job request.");
  }
}

/* SETUP JOB REQUEST LISTENER (Admin-side) */
function setupJobRequestListener() {
  if (jobRequestSubscription) {
    jobRequestSubscription.unsubscribe();
  }

  jobRequestSubscription = sb
    .channel("public:job_requests")
    .on("postgres_changes", 
      { event: "INSERT", schema: "public", table: "job_requests" },
      (payload) => {
        console.log("New job request:", payload);
        showAdminNotification(payload.new);
      }
    )
    .subscribe();
}

/* SHOW ADMIN NOTIFICATION */
function showAdminNotification(request) {
  const notificationEl = document.getElementById("admin-notification");
  const notificationText = document.getElementById("notification-text");

  notificationText.textContent = `New job request: "${request.title}" from ${request.tech_id} - Priority: ${request.priority}`;
  notificationEl.classList.remove("hidden");

  // Auto-hide after 5 seconds
  setTimeout(() => {
    notificationEl.classList.add("hidden");
  }, 5000);
}

/* CLOSE NOTIFICATION */
function closeNotification() {
  document.getElementById("admin-notification").classList.add("hidden");
}

/* APPROVE JOB REQUEST (Admin action) */
async function approveJobRequest(requestId, techId, title, description, location) {
  try {
    // Create a new workorder
    const { data: workorder, error: woError } = await sb
      .from("jobs")
      .insert([
        {
          technician_id: techId,
          title,
          description,
          location,
          status: "created",
          id: requestId
        }
      ])
      .select();

    if (woError) throw woError;

    // Update job request status to Approved
    const { error: updateError } = await sb
      .from("job_requests")
      .update({ status: "Approved" })
      .eq("id", requestId);

    if (updateError) throw updateError;

    showToast("Job request approved and workorder created.");
    return workorder[0];

  } catch (err) {
    console.error("Error approving job request:", err);
    showToast("Failed to approve job request.");
  }
}

/* REJECT JOB REQUEST (Admin action) */
async function rejectJobRequest(requestId) {
  try {
    const { error } = await sb
      .from("job_requests")
      .update({ status: "Rejected" })
      .eq("id", requestId);

    if (error) throw error;

    showToast("Job request rejected.");

  } catch (err) {
    console.error("Error rejecting job request:", err);
    showToast("Failed to reject job request.");
  }
}

/* CHECK IN */
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
    await loadJobs();
    showPanel("active-panel");

  } catch (err) {
    console.error(err);
    showToast("Clock-in failed.");
  }
}

/* REQUEST JOB */
async function requestJob(jobId) {
  try {
    const { error } = await sb
      .from("job_requests")
      .update({
        request_status: "requested",
        requested_by: [techRecord.id]
      })
      .eq("id", jobId);

    if (error) throw error;

    showToast("Job request submitted.");
    await loadUnassignedJobs();
    await loadJobs();

  } catch (err) {
    console.error(err);
    showToast("Failed to request job.");
  }
}

/* DECLINE JOB */
async function declineJob(jobId) {
  try {
    showToast("Job declined.");
    await loadUnassignedJobs();

  } catch (err) {
    console.error(err);
    showToast("Failed to decline job.");
  }
}
