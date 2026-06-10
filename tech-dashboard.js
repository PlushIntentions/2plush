
// ===============================
// TECH DASHBOARD (FINAL VERSION)
// ===============================

// Supabase client
const supabase = window.supabase.createClient(
  "https://iazvpykfdckpffhakncd.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA"
);

// Global state
let TECH_ID = null; // technicians.user_id (UUID)
let CURRENT_JOBS = [];
let UNASSIGNED_JOBS = [];

// ===============================
// BOOT APP
// ===============================
async function bootApp() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return redirectToLogin();

    TECH_ID = user.id; // matches technicians.user_id

    await Promise.all([
      loadAssignedJobs(),
      loadUnassignedJobs(),
      subscribeToJobChanges()
    ]);

    hideLoader();
  } catch (err) {
    console.error("Boot error:", err);
  }
}

// ===============================
// LOAD ASSIGNED JOBS
// ===============================
async function loadAssignedJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("assigned_to", TECH_ID)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadAssignedJobs error:", error);
    return;
  }

  CURRENT_JOBS = data || [];
  renderAssignedJobs();
}

// ===============================
// LOAD UNASSIGNED JOBS
// ===============================
async function loadUnassignedJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .is("assigned_to", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadUnassignedJobs error:", error);
    return;
  }

  UNASSIGNED_JOBS = data || [];
  renderUnassignedJobs();
}

// ===============================
// ACCEPT JOB
// ===============================
async function acceptJob(jobId) {
  const { error } = await supabase
    .from("jobs")
    .update({ assigned_to: TECH_ID, status: "accepted" })
    .eq("id", jobId);

  if (error) {
    console.error("acceptJob error:", error);
    return;
  }

  await supabase.from("job_requests").insert({
    job_id: jobId,
    technician_id: TECH_ID
  });

  loadAssignedJobs();
  loadUnassignedJobs();
}

// ===============================
// DECLINE JOB
// ===============================
async function declineJob(jobId) {
  await supabase.from("job_declines").insert({
    job_id: jobId,
    technician_id: TECH_ID
  });

  loadUnassignedJobs();
}

// ===============================
// CHECK-IN
// ===============================
async function checkIn(jobId) {
  const { error } = await supabase
    .from("jobs")
    .update({
      check_in_time: new Date().toISOString(),
      status: "in_progress"
    })
    .eq("id", jobId);

  if (error) console.error("checkIn error:", error);
  loadAssignedJobs();
}

// ===============================
// CHECK-OUT / COMPLETE JOB
// ===============================
async function completeJob(jobId) {
  const { error } = await supabase
    .from("jobs")
    .update({
      completed_time: new Date().toISOString(),
      status: "completed"
    })
    .eq("id", jobId);

  if (error) console.error("completeJob error:", error);
  loadAssignedJobs();
}

// ===============================
// FILE DOWNLOAD TRACKING
// ===============================
async function trackFileDownload(jobId, fileName) {
  await supabase.from("jobs_files_downloads").insert({
    job_id: jobId,
    technician_id: TECH_ID,
    file_name: fileName
  });
}

// ===============================
// REAL-TIME SUBSCRIPTIONS
// ===============================
function subscribeToJobChanges() {
  supabase
    .channel("jobs_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "jobs" },
      () => {
        loadAssignedJobs();
        loadUnassignedJobs();
      }
    )
    .subscribe();
}

// ===============================
// RENDER ASSIGNED JOBS
// ===============================
function renderAssignedJobs() {
  const container = document.getElementById("assignedJobs");
  container.innerHTML = "";

  CURRENT_JOBS.forEach(job => {
    container.innerHTML += `
      <div class="job-card">
        <h3>${job.title}</h3>
        <p>${job.description}</p>
        <p>Status: ${job.status}</p>

        <button onclick="checkIn(${job.id})">Check In</button>
        <button onclick="completeJob(${job.id})">Complete</button>
      </div>
    `;
  });
}

// ===============================
// RENDER UNASSIGNED JOBS
// ===============================
function renderUnassignedJobs() {
  const container = document.getElementById("unassignedJobs");
  container.innerHTML = "";

  UNASSIGNED_JOBS.forEach(job => {
    container.innerHTML += `
      <div class="job-card">
        <h3>${job.title}</h3>
        <p>${job.description}</p>

        <button onclick="acceptJob(${job.id})">Accept</button>
        <button onclick="declineJob(${job.id})">Decline</button>
      </div>
    `;
  });
}

// ===============================
// HELPERS
// ===============================
function hideLoader() {
  document.getElementById("loader").style.display = "none";
}

function redirectToLogin() {
  window.location.href = "/login";
}

// Start app
bootApp();
