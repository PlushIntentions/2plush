document.addEventListener("DOMContentLoaded", () => {
  bootApp();
});




// ============================
// SUPABASE CLIENT + GLOBALS
// ============================
const supabase = window.supabase.createClient(
  "https://iazvpykfdckpffhakncd.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA"
);

let TECH_ID = null;
let mapLoaded = false;

// ============================
// PAGE NAVIGATION
// ============================
function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(page).classList.add("active");

  document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
  document.getElementById("nav-" + page).classList.add("active");

  if (page === "map") loadMap();
  if (page === "earnings") loadEarnings();
}

// ============================
// BOOT APP
// ============================
async function bootApp() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert("Not logged in");

  TECH_ID = user.id;

  loadAssignedJobs();
  loadUnassignedJobs();
  subscribeToJobChanges();
}

// ============================
// LOAD ASSIGNED JOBS
// ============================
async function loadAssignedJobs() {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("assigned_to", TECH_ID);

  const container = document.getElementById("assignedJobs");
  container.innerHTML = "";

  data?.forEach(job => {
    container.innerHTML += `
      <div class="job-card">
        <h3>${job.title}</h3>
        <p>${job.description}</p>
        <button onclick="checkIn(${job.id})">Check In</button>
        <button onclick="completeJob(${job.id})">Complete</button>
      </div>
    `;
  });
}

// ============================
// LOAD AVAILABLE JOBS
// ============================
async function loadUnassignedJobs() {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .is("assigned_to", null);

  const container = document.getElementById("unassignedJobs");
  container.innerHTML = "";

  data?.forEach(job => {
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

// ============================
// ACCEPT JOB
// ============================
async function acceptJob(jobId) {
  await supabase.from("jobs").update({
    assigned_to: TECH_ID,
    status: "accepted"
  }).eq("id", jobId);

  await supabase.from("job_requests").insert({
    job_id: jobId,
    technician_id: TECH_ID
  });

  loadAssignedJobs();
  loadUnassignedJobs();
}

// ============================
// DECLINE JOB
// ============================
async function declineJob(jobId) {
  await supabase.from("job_declines").insert({
    job_id: jobId,
    technician_id: TECH_ID
  });

  loadUnassignedJobs();
}

// ============================
// CHECK-IN / COMPLETE
// ============================
async function checkIn(jobId) {
  await supabase.from("jobs").update({
    status: "in_progress",
    check_in_time: new Date().toISOString()
  }).eq("id", jobId);

  loadAssignedJobs();
}

async function completeJob(jobId) {
  await supabase.from("jobs").update({
    status: "completed",
    completed_time: new Date().toISOString()
  }).eq("id", jobId);

  loadAssignedJobs();
}

// ============================
// REAL-TIME JOB UPDATES
// ============================
function subscribeToJobChanges() {
  supabase
    .channel("jobs")
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
      loadAssignedJobs();
      loadUnassignedJobs();
    })
    .subscribe();
}

// ============================
// EARNINGS CALCULATION
// ============================
async function loadEarnings() {
  const { data } = await supabase
    .from("jobs")
    .select("price, completed_time")
    .eq("assigned_to", TECH_ID)
    .eq("status", "completed");

  let today = 0, week = 0, month = 0;
  const now = new Date();

  data?.forEach(job => {
    const completed = new Date(job.completed_time);
    if (!job.price) return;

    if (completed.toDateString() === now.toDateString()) today += job.price;
    if (completed >= new Date(now - 7 * 86400000)) week += job.price;
    if (completed.getMonth() === now.getMonth()) month += job.price;
  });

  document.getElementById("earningsToday").innerText = `$${today.toFixed(2)}`;
  document.getElementById("earningsWeek").innerText = `$${week.toFixed(2)}`;
  document.getElementById("earningsMonth").innerText = `$${month.toFixed(2)}`;
}

// ============================
// MAPBOX MAP
// ============================
function loadMap() {
  if (mapLoaded) return;

  mapboxgl.accessToken = "pk.eyJ1IjoicGx1c2gtaW50ZW50aW9ucyIsImEiOiJjbXA5ejJlcGwwMzQxMnJwdXBpZTg5NmYxIn0.i0wFsO5_bt70k942AsMNcg";

  const map = new mapboxgl.Map({
    container: "mapbox",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-82.18, 41.45],
    zoom: 10
  });

  mapLoaded = true;
}

// ============================
// START APP
// ============================
bootApp();
