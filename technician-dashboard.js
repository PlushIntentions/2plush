
// ---------- SUPABASE INIT ----------
const SUPABASE_URL = 'https://iazvpykfdckpffhakncd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTech = null;
let currentJob = null;


const signoutBtn = document.getElementById("signout-btn");
if (signoutBtn) {
  signoutBtn.addEventListener("click", () => {
    // your logic
  });
}

// ---------- INIT ----------
async function initTechPortal() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  document.getElementById('profile-email').textContent = user.email;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return;

  const { data: tech } = await supabaseClient
    .from('technicians')
    .select('*')
    .eq('profile_id', profile.id)
    .single();

  currentTech = tech;
  document.getElementById('tech-name').textContent = tech.full_name || 'Technician';

  setupNav();
  setupClockButton();
  await loadDashboardData();
}

// ---------- NAV ----------
function setupNav() {
  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchPanel(target);
    });
  });

  const backBtn = document.getElementById('back-to-jobs');
  if (backBtn) {
    backBtn.addEventListener('click', () => switchPanel('jobs'));
  }
}

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');
}

// ---------- CLOCK IN / OUT ----------
function setupClockButton() {
  const clockBtn = document.getElementById('clock-btn');
  if (!clockBtn) return;

  let clockedIn = false;

  clockBtn.addEventListener('click', async () => {
    if (!currentTech) return;

    clockedIn = !clockedIn;
    document.getElementById('tech-status').textContent = clockedIn ? 'Online' : 'Offline';
    clockBtn.textContent = clockedIn ? 'Clock Out' : 'Clock In';

    await supabaseClient.from('work_order_history').insert({
      job_id: null,
      tech_id: currentTech.id,
      status: clockedIn ? 'clock_in' : 'clock_out'
    });
  });
}

// ---------- DASHBOARD LOAD ----------
async function loadDashboardData() {
  await Promise.all([
    loadAssignedJobs(),
    loadUnassignedWorkOrders(),
    loadEarnings(),
    loadInfractions()
  ]);
}

// ---------- ASSIGNED JOBS ----------
async function loadAssignedJobs() {
  if (!currentTech) return;

  const { data, error } = await supabaseClient
    .from('jobs')
    .select('*, work_orders(*)')
    .eq('assigned_to', currentTech.id)
    .order('scheduled_date', { ascending: true });

  const list = document.getElementById('jobs-list');
  if (!list) return;
  list.innerHTML = '';

  if (error || !data || !data.length) {
    list.innerHTML = '<div class="glass-card">No jobs assigned.</div>';
    return;
  }

  data.forEach(job => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.innerHTML = `
      <div><strong>${job.title}</strong></div>
      <div>Status: ${job.status}</div>
      <div>${job.scheduled_date || ''} ${job.scheduled_time || ''}</div>
      <button class="btn-glass" data-id="${job.id}">Open</button>
    `;
    card.querySelector('button').addEventListener('click', () => openJobDetail(job));
    list.appendChild(card);
  });
}

// ---------- UNASSIGNED WORK ORDERS ----------
async function loadUnassignedWorkOrders() {
  const { data, error } = await supabaseClient
    .from('jobs')
    .select('*, work_orders(*)')
    .is('assigned_to', null)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const list = document.getElementById('unassigned-list');
  if (!list) return;
  list.innerHTML = '';

  if (error || !data || !data.length) {
    list.innerHTML = '<div class="glass-card">No unassigned work orders.</div>';
    return;
  }

  data.forEach(job => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.innerHTML = `
      <div><strong>${job.title}</strong></div>
      <div>Status: ${job.status}</div>
      <div>${job.scheduled_date || ''} ${job.scheduled_time || ''}</div>
      <div style="margin-top:8px; display:flex; gap:6px;">
        <button class="btn-glass" data-action="request" data-id="${job.id}">Request</button>
        <button class="btn-glass" data-action="decline" data-id="${job.id}">Decline</button>
      </div>
    `;
    card.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => handleUnassignedAction(job, btn.dataset.action));
    });
    list.appendChild(card);
  });
}

async function handleUnassignedAction(job, action) {
  if (!currentTech) return;

  if (action === 'request') {
    await supabaseClient.from('job_requests').insert({
      job_id: job.id,
      tech_id: currentTech.id
    });
    showToast('Job requested.');
  } else if (action === 'decline') {
    await supabaseClient.from('job_declines').insert({
      job_id: job.id,
      tech_id: currentTech.id
    });
    showToast('Job declined.');
  }
}

// ---------- JOB DETAIL + STATUS ----------
function openJobDetail(job) {
  currentJob = job;
  switchPanel('job-detail');

  const card = document.getElementById('job-detail-card');
  if (!card) return;

  card.innerHTML = `
    <h2>${job.title}</h2>
    <p>${job.description || ''}</p>
    <p>Status: <strong>${job.status}</strong></p>
    <p>Rate: $${job.rate || '0.00'}</p>
    <p>Scheduled: ${job.scheduled_date || ''} ${job.scheduled_time || ''}</p>
    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;">
      <button class="btn-glass" id="btn-start">Start</button>
      <button class="btn-glass" id="btn-pause">Pause</button>
      <button class="btn-glass" id="btn-complete">Complete / Submit Work Order</button>
    </div>
  `;

  document.getElementById('btn-start').onclick = () => updateJobStatus('active');
  document.getElementById('btn-pause').onclick = () => updateJobStatus('pending');

  // IMPORTANT: complete → update status, then open signature modal
  document.getElementById('btn-complete').onclick = async () => {
    await updateJobStatus('completed');
    openSignatureModal();
  };
}

async function updateJobStatus(status) {
  if (!currentJob || !currentTech) return;

  await supabaseClient
    .from('jobs')
    .update({ status })
    .eq('id', currentJob.id);

  await supabaseClient.from('work_order_history').insert({
    job_id: currentJob.id,
    tech_id: currentTech.id,
    status
  });

  showToast(`Status updated to ${status}.`);
  await loadAssignedJobs();
}

// ---------- SIGNATURE MODAL (MANAGER ON DUTY) ----------
let sigPad = null;
let sigCtx = null;
let drawing = false;

function openSignatureModal() {
  const modal = document.getElementById('signature-modal');
  if (!modal) return;

  modal.classList.remove('hidden');

  if (!sigPad) initSignaturePad();

  document.getElementById('sig-clear').onclick = () => {
    sigCtx.clearRect(0, 0, sigPad.width, sigPad.height);
  };

  document.getElementById('sig-cancel').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('sig-save').onclick = saveSignature;
}

function initSignaturePad() {
  sigPad = document.getElementById('signature-pad');
  if (!sigPad) return;

  sigCtx = sigPad.getContext('2d');
  sigCtx.strokeStyle = '#ffffff';
  sigCtx.lineWidth = 2;

  sigPad.onmousedown = e => {
    drawing = true;
    sigCtx.beginPath();
    sigCtx.moveTo(e.offsetX, e.offsetY);
  };

  sigPad.onmousemove = e => {
    if (!drawing) return;
    sigCtx.lineTo(e.offsetX, e.offsetY);
    sigCtx.stroke();
  };

  sigPad.onmouseup = () => { drawing = false; };
  sigPad.onmouseleave = () => { drawing = false; };
}

async function saveSignature() {
  if (!currentJob || !currentTech || !sigPad) return;

  const dataUrl = sigPad.toDataURL('image/png');
  const blob = await (await fetch(dataUrl)).blob();
  const fileName = `signature_${currentJob.id}_${Date.now()}.png`;

  const { data, error } = await supabaseClient.storage
    .from('work_order_photos')
    .upload(fileName, blob);

  if (error) {
    showToast('Error saving signature.');
    return;
  }

  const publicUrl = supabaseClient.storage
    .from('work_order_photos')
    .getPublicUrl(data.path).data.publicUrl;

  await supabaseClient
    .from('work_orders')
    .update({ manager_signature_url: publicUrl })
    .eq('job_id', currentJob.id);

  showToast('Signature saved.');
  document.getElementById('signature-modal').classList.add('hidden');
}

// ---------- EARNINGS ----------
async function loadEarnings() {
  if (!currentTech) return;

  const { data, error } = await supabaseClient
    .from('earnings')
    .select('*')
    .eq('tech_id', currentTech.id);

  if (error || !data) return;

  const total = data.reduce((sum, e) => sum + (e.amount || 0), 0);
  document.getElementById('earn-total').textContent = `$${total.toFixed(2)}`;
  document.getElementById('earn-count').textContent = data.length;

  const list = document.getElementById('earnings-list');
  if (!list) return;
  list.innerHTML = '';

  data.forEach(e => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.innerHTML = `
      <div>Job #${e.job_id}</div>
      <div>Amount: $${(e.amount || 0).toFixed(2)}</div>
    `;
    list.appendChild(card);
  });
}

// ---------- INFRACTIONS ----------
async function loadInfractions() {
  if (!currentTech) return;

  const { data, error } = await supabaseClient
    .from('tech_infractions')
    .select('*')
    .eq('tech_id', currentTech.id)
    .order('created_at', { ascending: false });

  const list = document.getElementById('infractions-list');
  if (!list) return;
  list.innerHTML = '';

  if (error || !data || !data.length) {
    list.innerHTML = '<div class="glass-card">No infractions.</div>';
    return;
  }

  data.forEach(inf => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.innerHTML = `
      <div><strong>${inf.type || 'Infraction'}</strong></div>
      <div>${inf.reason || ''}</div>
      <div>${inf.created_at || ''}</div>
    `;
    list.appendChild(card);
  });
}

// ---------- TOAST ----------
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2000);
}
window.addEventListener("DOMContentLoaded", async () => {
  console.log("Forced unhide executed.");

  // Unhide everything
  const mainPanel = document.getElementById("main-panel");
  if (mainPanel) mainPanel.classList.remove("hidden");

  document.querySelectorAll(".panel").forEach(p => {
    p.classList.remove("hidden");
    p.classList.add("active");
  });

  // Boot the app
  try {
    await bootApp();
  } catch (err) {
    console.error("BootApp failed:", err);
  }
});



document.addEventListener("DOMContentLoaded", async () => {
  console.log("Forced unhide executed.");

  try {
    await bootApp();
  } catch (err) {
    console.error("BootApp failed:", err);
  }
});
 
