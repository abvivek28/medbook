const API = 'http://localhost:8000/api';

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  currentPage: null,
  allDocAppts: [],
  currentDocApptFilter: 'all',
};

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(method, path, body, auth) {
  if (auth === undefined) auth = true;
  const headers = {'Content-Type': 'application/json'};
  if (auth && state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (!res.ok) {
    let msg = 'Something went wrong';
    if (data.detail) {
      if (typeof data.detail === 'string') {
        msg = data.detail;
      } else if (Array.isArray(data.detail)) {
        msg = data.detail.map(function(e) {
          const field = e.loc ? e.loc[e.loc.length - 1] : '';
          return field ? field + ': ' + e.msg : e.msg;
        }).join(', ');
      }
    }
    throw new Error(msg);
  }
  return data;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatDate(s) {
  const parts = s.split('-');
  const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
  const dn = dayNames[new Date(y, m - 1, d).getDay()];
  return dn + ', ' + months[m - 1] + ' ' + d;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function el(id) { return document.getElementById(id); }

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type) {
  const t = el('toast');
  t.textContent = msg;
  t.className = 'show ' + (type || '');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.className = ''; }, 3200);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function setAuth(data) {
  state.token = data.token;
  state.user = {id: data.id, name: data.name, role: data.role};
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(state.user));
  updateNav();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateNav();
  showPage('home');
}

function updateNav() {
  const loggedIn = !!state.user;
  el('nav-guest').style.display = loggedIn ? 'none' : 'flex';
  el('nav-auth').style.display  = loggedIn ? 'flex'  : 'none';
  if (!loggedIn) return;
  el('nav-user-name').textContent = state.user.name;
  const dashLink = el('nav-dashboard-link');
  const patientsLink = el('nav-patients-link');
  if (state.user.role === 'doctor') {
    dashLink.textContent = 'Dashboard';
    dashLink.onclick = function() { showPage('doctor-dashboard'); };
    if (patientsLink) patientsLink.style.display = 'inline';
  } else {
    dashLink.textContent = 'My Appointments';
    dashLink.onclick = function() { showPage('patient-appointments'); };
    if (patientsLink) patientsLink.style.display = 'none';
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
function showPage(name, data) {
  data = data || {};
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  const pageEl = el('page-' + name);
  if (pageEl) { pageEl.classList.add('active'); state.currentPage = name; }
  window.scrollTo(0, 0);
  if      (name === 'home')                renderHome();
  else if (name === 'search')              renderSearch(data);
  else if (name === 'doctor-public')       renderDoctorPublic(data.id);
  else if (name === 'doctor-dashboard')    renderDoctorDashboard();
  else if (name === 'doctor-patients')     renderDoctorPatients();
  else if (name === 'patient-appointments')renderPatientAppointments();
  else if (name === 'profile')             renderProfile();
}

function renderHome() {}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
async function renderSearch(data) {
  data = data || {};
  const q = data.q || '';
  const spec = data.spec || '';
  try {
    const specs = await api('GET', '/doctors/specializations', null, false);
    const sel = el('search-spec-filter');
    sel.innerHTML = '<option value="">All Specializations</option>'
      + specs.map(function(s) { return '<option value="' + esc(s) + '"' + (s === spec ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    el('search-input').value = q;
    await doSearch(q, spec);
  } catch(e) { console.error(e); }
}

async function doSearch(q, spec) {
  q = q || ''; spec = spec || '';
  const grid = el('doctors-grid');
  grid.innerHTML = '<div class="empty-state"><div class="spinner"></div><p style="margin-top:0.75rem">Searching...</p></div>';
  try {
    const doctors = await api('GET', '/doctors/search?q=' + encodeURIComponent(q) + '&specialization=' + encodeURIComponent(spec), null, false);
    if (!doctors.length) {
      grid.innerHTML = '<div class="empty-state"><div class="icon">&#128269;</div><p>No doctors found.</p></div>';
      return;
    }
    var html = '';
    doctors.forEach(function(d) {
      html += '<div class="doctor-card" data-doctor-id="' + d.id + '">'
        + '<div class="doctor-card-top">'
        + '<div class="doctor-avatar">' + d.name[0].toUpperCase() + '</div>'
        + '<div class="doctor-info">'
        + '<h3>Dr. ' + esc(d.name) + '</h3>'
        + '<div class="specialization">' + esc(d.specialization) + '</div>'
        + '<div class="clinic">' + (d.clinic_name ? esc(d.clinic_name) : '') + (d.clinic_address ? ' &middot; ' + esc(d.clinic_address) : '') + '</div>'
        + '</div></div>'
        + '<div class="doctor-meta">'
        + (d.experience_years ? '<span class="meta-pill">' + d.experience_years + ' yrs exp</span>' : '')
        + (d.qualification    ? '<span class="meta-pill">' + esc(d.qualification) + '</span>' : '')
        + (d.consultation_fee ? '<span class="meta-pill teal">&#8377;' + d.consultation_fee + '</span>' : '')
        + (d.rating           ? '<span class="meta-pill">&#11088; ' + d.rating + ' (' + d.total_reviews + ')</span>' : '')
        + '</div></div>';
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.doctor-card').forEach(function(card) {
      card.addEventListener('click', function() {
        showPage('doctor-public', {id: parseInt(card.dataset.doctorId)});
      });
    });
  } catch(e) {
    grid.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}

// ─── DOCTOR PUBLIC PROFILE ────────────────────────────────────────────────────
async function renderDoctorPublic(doctorId) {
  const container = el('doctor-public-content');
  container.innerHTML = '<div class="empty-state" style="padding:3rem"><div class="spinner"></div></div>';
  try {
    const results = await Promise.all([
      api('GET', '/doctors/' + doctorId, null, false),
      api('GET', '/doctors/' + doctorId + '/slots', null, false),
    ]);
    const doctor = results[0];
    const slots  = results[1];
    const p = doctor.profile;

    // group slots by date
    const allByDate = {};
    slots.forEach(function(s) {
      if (!allByDate[s.date]) allByDate[s.date] = [];
      allByDate[s.date].push(s);
    });

    // --- build slots section using plain string concat (no template literals) ---
    var slotsHtml = '';
    const dates = Object.keys(allByDate).sort();
    if (dates.length === 0) {
      slotsHtml = '<p style="color:var(--gray-400);font-size:0.875rem">No available slots at the moment.</p>';
    } else {
      dates.forEach(function(date) {
        slotsHtml += '<div style="margin-bottom:1rem">'
          + '<div style="font-size:0.8rem;font-weight:600;color:var(--gray-600);margin-bottom:0.4rem">' + formatDate(date) + '</div>'
          + '<div class="slot-grid">';
        allByDate[date].forEach(function(s) {
          if (s.is_booked) {
            slotsHtml += '<div class="slot-pill booked" title="Already booked">'
              + s.start_time + '<br><small style="font-size:0.65rem;opacity:0.6">Booked</small></div>';
          } else {
            // Use data-* attributes — completely avoids quote escaping in onclick
            slotsHtml += '<div class="slot-pill book-slot-btn"'
              + ' data-slot-id="' + s.id + '"'
              + ' data-date="' + date + '"'
              + ' data-start="' + s.start_time + '"'
              + ' data-end="' + s.end_time + '"'
              + ' data-doctor-id="' + doctorId + '"'
              + ' data-doctor-name="' + esc(doctor.name) + '"'
              + ' title="' + s.start_time + ' - ' + s.end_time + '">'
              + s.start_time + '</div>';
          }
        });
        slotsHtml += '</div></div>';
      });
    }

    // --- build reviews ---
    var reviewsHtml = '';
    if (doctor.reviews && doctor.reviews.length) {
      reviewsHtml += '<div class="divider"></div>'
        + '<h4 style="font-weight:600;color:var(--navy);margin-bottom:1rem">Patient Reviews</h4>'
        + '<div style="display:flex;flex-direction:column;gap:0.75rem">';
      doctor.reviews.forEach(function(r) {
        var stars = '';
        for (var i = 0; i < r.rating; i++) stars += '&#11088;';
        reviewsHtml += '<div style="background:var(--gray-50);padding:0.85rem;border-radius:8px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">'
          + '<strong style="font-size:0.875rem">' + esc(r.patient_name) + '</strong>'
          + '<span class="star-rating" style="font-size:0.8rem">' + stars + '</span>'
          + '</div>'
          + (r.comment ? '<p style="font-size:0.825rem;color:var(--gray-600)">' + esc(r.comment) + '</p>' : '')
          + '<p style="font-size:0.72rem;color:var(--gray-400);margin-top:0.3rem">' + new Date(r.created_at).toLocaleDateString() + '</p>'
          + '</div>';
      });
      reviewsHtml += '</div>';
    }

    var starsText = p.rating
      ? p.rating + '/5 &middot; ' + p.total_reviews + ' review' + (p.total_reviews !== 1 ? 's' : '')
      : 'No reviews yet';

    container.innerHTML =
      '<div class="profile-header" style="border-radius:12px 12px 0 0">'
        + '<div class="profile-avatar-lg">' + doctor.name[0].toUpperCase() + '</div>'
        + '<div>'
          + '<h2>Dr. ' + esc(doctor.name) + '</h2>'
          + '<p>' + esc(p.specialization)
            + (p.qualification ? ' &middot; ' + esc(p.qualification) : '')
            + (p.experience_years ? ' &middot; ' + p.experience_years + ' yrs exp' : '')
          + '</p>'
          + '<div class="star-rating" style="margin-top:0.4rem">' + starsText + '</div>'
        + '</div>'
      + '</div>'
      + '<div style="background:white;padding:1.5rem">'
        + '<div class="two-col">'
          + '<div>'
            + (p.bio ? '<p style="color:var(--gray-600);font-size:0.9rem;line-height:1.7;margin-bottom:1.25rem">' + esc(p.bio) + '</p>' : '')
            + '<div style="display:flex;flex-direction:column;gap:0.6rem;font-size:0.875rem">'
              + (p.clinic_name    ? '<div>&#127973; <strong>' + esc(p.clinic_name) + '</strong></div>' : '')
              + (p.clinic_address ? '<div>&#128205; ' + esc(p.clinic_address) + '</div>' : '')
              + (doctor.phone     ? '<div>&#128222; ' + esc(doctor.phone) + '</div>' : '')
              + (p.consultation_fee ? '<div>&#128176; Fee: <strong style="color:var(--teal)">&#8377;' + p.consultation_fee + '</strong></div>' : '')
              + (p.available_days ? '<div>&#128197; Available: ' + p.available_days.replace(/,/g, ', ') + '</div>' : '')
              + '<div>&#9201; Slot: ' + p.slot_duration_mins + ' min</div>'
            + '</div>'
          + '</div>'
          + '<div>'
            + '<h4 style="font-weight:600;color:var(--navy);margin-bottom:0.75rem">Book a Slot</h4>'
            + slotsHtml
          + '</div>'
        + '</div>'
        + reviewsHtml
      + '</div>';

    // Attach click handlers via addEventListener — no inline onclick at all
    container.querySelectorAll('.book-slot-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectSlot(
          parseInt(btn.dataset.slotId),
          btn.dataset.date,
          btn.dataset.start,
          btn.dataset.end,
          parseInt(btn.dataset.doctorId),
          'Dr. ' + btn.dataset.doctorName
        );
      });
    });

  } catch(e) {
    container.innerHTML = '<div style="padding:2rem"><div class="alert alert-error">' + esc(e.message) + '</div></div>';
  }
}

// ─── SLOT BOOKING ─────────────────────────────────────────────────────────────
var selectedSlotData = null;

function selectSlot(slotId, date, start, end, doctorId, doctorName) {
  if (!state.user) {
    toast('Please login to book an appointment', 'error');
    openModal('modal-login');
    return;
  }
  if (state.user.role === 'doctor') {
    toast('Doctors cannot book appointments as patients', 'error');
    return;
  }
  selectedSlotData = {slotId: slotId, date: date, start: start, end: end, doctorId: doctorId, doctorName: doctorName};
  el('book-slot-info').textContent = doctorName + ' · ' + formatDate(date) + ' · ' + start + ' – ' + end;
  el('book-reason').value = '';
  openModal('modal-book');
}

async function confirmBooking() {
  if (!selectedSlotData) return;
  const btn = el('btn-confirm-booking');
  btn.disabled = true; btn.textContent = 'Booking...';
  try {
    await api('POST', '/appointments/book', {slot_id: selectedSlotData.slotId, reason: el('book-reason').value});
    closeModal('modal-book');
    toast('Appointment booked! &#127881;', 'success');
    renderDoctorPublic(selectedSlotData.doctorId);
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirm Booking';
  }
}

// ─── DOCTOR DASHBOARD ─────────────────────────────────────────────────────────
async function renderDoctorDashboard() {
  if (!state.user || state.user.role !== 'doctor') { showPage('home'); return; }
  try {
    const results = await Promise.all([
      api('GET', '/doctors/my/stats'),
      api('GET', '/doctors/my/appointments'),
    ]);
    const stats = results[0];
    const appts = results[1];
    el('doc-stat-total').textContent     = stats.total_appointments;
    el('doc-stat-today').textContent     = stats.today_appointments;
    el('doc-stat-pending').textContent   = stats.pending;
    el('doc-stat-completed').textContent = stats.completed;
    el('doc-stat-slots').textContent     = stats.available_slots;
    // Revenue estimate — use innerHTML so ₹ symbol renders correctly
    const rev = el('doc-stat-revenue');
    if (rev) {
      try {
        const me = await api('GET', '/auth/me');
        const fee = (me.profile && me.profile.consultation_fee) ? parseFloat(me.profile.consultation_fee) : 0;
        if (fee > 0 && stats.completed > 0) {
          rev.innerHTML = '&#8377;' + (stats.completed * fee).toLocaleString('en-IN');
        } else if (fee > 0) {
          rev.innerHTML = '&#8377;0';
        } else {
          rev.textContent = 'Set fee in profile';
          rev.style.fontSize = '0.85rem';
        }
      } catch(_) {
        rev.textContent = '—';
      }
    }
    state.allDocAppts = appts;
    applyDocApptFilter(state.currentDocApptFilter);
    await renderDoctorSlots();
  } catch(e) { toast(e.message, 'error'); }
}

function applyDocApptFilter(filter, btn) {
  state.currentDocApptFilter = filter || 'all';
  document.querySelectorAll('#appt-filter-tabs .tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.filter === state.currentDocApptFilter);
  });
  var list = state.currentDocApptFilter === 'all'
    ? state.allDocAppts
    : state.allDocAppts.filter(function(a) { return a.status === state.currentDocApptFilter; });
  var searchVal = (el('appt-search-input') ? el('appt-search-input').value : '').toLowerCase();
  if (searchVal) list = list.filter(function(a) { return a.patient && a.patient.name.toLowerCase().indexOf(searchVal) !== -1; });
  renderDoctorAppointments(list);
}

function filterApptByName(val) {
  applyDocApptFilter(state.currentDocApptFilter);
}

function renderDoctorAppointments(appts) {
  const container = el('doc-appointments-list');
  if (!appts.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#128203;</div><p>No appointments found</p></div>';
    return;
  }
  var html = '';
  appts.forEach(function(a) {
    const dateDay = a.slot ? a.slot.date.split('-')[2] : '--';
    const dateMon = a.slot ? months[parseInt(a.slot.date.split('-')[1]) - 1] : '';
    const patAge  = (a.patient && a.patient.age) ? ', ' + a.patient.age + 'y' : '';

    // Build action buttons string
    var actions = '<span class="badge badge-' + a.status + '" style="margin-bottom:0.35rem">' + a.status.replace('_', ' ') + '</span>';
    if (a.status === 'confirmed') {
      actions += '<div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.3rem">'
        + '<button class="btn btn-sm btn-primary" data-action="complete" data-id="' + a.id + '">&#10003; Done</button>'
        + '<button class="btn btn-sm btn-secondary" data-action="notes" data-id="' + a.id + '" data-notes="' + esc(a.notes || '') + '" data-rx="' + esc(a.prescription || '') + '">Notes</button>'
        + '<button class="btn btn-sm" style="background:var(--amber-pale);color:var(--amber);border:1px solid var(--amber);padding:0.3rem 0.5rem;border-radius:6px;cursor:pointer;font-size:0.75rem" data-action="noshow" data-id="' + a.id + '">No Show</button>'
        + '<button class="btn btn-sm btn-danger" data-action="cancel" data-id="' + a.id + '">&#10005;</button>'
        + '</div>';
    }
    if (a.prescription) {
      actions += '<button class="btn btn-sm btn-secondary" style="margin-top:0.3rem" data-action="viewrx" data-notes="' + esc(a.notes || '') + '" data-rx="' + esc(a.prescription) + '" data-date="' + (a.slot ? a.slot.date : '') + '">Rx</button>';
    }
    if (a.patient) {
      // Store only the patient ID — look up full data from state at click time
      // This avoids embedding JSON with quotes inside an HTML attribute
      actions += '<button class="btn btn-sm btn-secondary" style="margin-top:0.3rem" data-action="viewpatient" data-patient-id="' + a.patient.id + '">&#128100; Patient</button>';
    }

    // Layout: date box on left, then a column with [info row + actions row]
    html += '<div class="doc-appt-card">'
      + '<div class="appt-date-box"><div class="day">' + dateDay + '</div><div class="month">' + dateMon + '</div></div>'
      + '<div style="flex:1;min-width:0">'
        // info row
        + '<div style="display:flex;align-items:flex-start;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.25rem">'
          + '<strong style="font-size:0.9rem;color:var(--navy)">' + (a.patient ? esc(a.patient.name) + patAge : 'Unknown') + '</strong>'
          + (a.patient && a.patient.blood_group ? '<span class="meta-pill" style="font-size:0.68rem">' + a.patient.blood_group + '</span>' : '')
          + (a.patient && a.patient.gender ? '<span class="meta-pill" style="font-size:0.68rem">' + a.patient.gender + '</span>' : '')
        + '</div>'
        + '<div style="font-size:0.78rem;color:var(--gray-600)">' + (a.slot ? a.slot.start_time + ' – ' + a.slot.end_time : '') + '</div>'
        + '<div style="font-size:0.78rem;color:var(--gray-400);margin-top:2px">' + (a.reason ? esc(a.reason) : '<em>No reason given</em>') + '</div>'
        + (a.patient && a.patient.allergies ? '<div style="font-size:0.72rem;color:var(--amber);margin-top:3px">&#9888; ' + esc(a.patient.allergies) + '</div>' : '')
        // actions sit BELOW info, inside same column
        + '<div style="margin-top:0.6rem">' + actions + '</div>'
      + '</div>'
      + '</div>';
  });
  container.innerHTML = html;

  // Single event listener on the container
  container.querySelectorAll('[data-action]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const action = btn.dataset.action;
      const id     = parseInt(btn.dataset.id);
      if      (action === 'complete')    updateApptStatus(id, 'completed');
      else if (action === 'cancel')      updateApptStatus(id, 'cancelled');
      else if (action === 'noshow')      updateApptStatus(id, 'no_show');
      else if (action === 'notes')       openApptNotes(id, btn.dataset.notes, btn.dataset.rx);
      else if (action === 'viewrx')      viewRxModal('', btn.dataset.date, btn.dataset.notes, btn.dataset.rx);
      else if (action === 'viewpatient') {
        // Find patient data from already-loaded appointments list
        var patientId = parseInt(btn.dataset.patientId);
        var appt = state.allDocAppts.find(function(a) { return a.patient && a.patient.id === patientId; });
        if (appt && appt.patient) viewPatientDetail(appt.patient);
      }
    });
  });
}

async function updateApptStatus(id, status) {
  if (!confirm('Mark this appointment as "' + status.replace('_', ' ') + '"?')) return;
  try {
    await api('PUT', '/doctors/appointments/' + id, {status: status});
    toast('Marked as ' + status.replace('_', ' '), 'success');
    renderDoctorDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

var editingApptId = null;
function openApptNotes(id, existingNotes, existingRx) {
  editingApptId = id;
  el('appt-notes-input').value       = existingNotes || '';
  el('appt-prescription-input').value = existingRx    || '';
  openModal('modal-appt-notes');
}
async function saveApptNotes() {
  try {
    await api('PUT', '/doctors/appointments/' + editingApptId, {
      notes:        el('appt-notes-input').value,
      prescription: el('appt-prescription-input').value
    });
    closeModal('modal-appt-notes');
    toast('Notes saved', 'success');
    renderDoctorDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

function viewPatientDetail(patient) {
  var html = '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem">'
    + '<div class="doctor-avatar" style="width:52px;height:52px;font-size:1.2rem;flex-shrink:0">' + patient.name[0].toUpperCase() + '</div>'
    + '<div>'
      + '<strong style="font-size:1rem;color:var(--navy)">' + esc(patient.name) + '</strong>'
      + '<div style="font-size:0.85rem;color:var(--gray-600)">'
        + (patient.gender || '') + (patient.age ? ' &middot; Age ' + patient.age : '') + (patient.blood_group ? ' &middot; ' + patient.blood_group : '')
      + '</div>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem">'
      + '<div><span style="color:var(--gray-400);font-size:0.78rem;display:block">EMAIL</span>' + esc(patient.email || '—') + '</div>'
      + '<div><span style="color:var(--gray-400);font-size:0.78rem;display:block">PHONE</span>' + esc(patient.phone || '—') + '</div>'
    + '</div>';
  if (patient.allergies) {
    html += '<div class="divider"></div>'
      + '<div style="background:var(--amber-pale);padding:0.75rem;border-radius:8px;font-size:0.875rem">'
      + '<strong style="color:var(--amber)">&#9888; Allergies:</strong> ' + esc(patient.allergies) + '</div>';
  }
  if (patient.medical_history) {
    html += '<div class="divider"></div>'
      + '<div style="font-size:0.875rem"><div style="font-weight:600;color:var(--navy);margin-bottom:0.4rem">Medical History</div>'
      + '<p style="color:var(--gray-600);line-height:1.6">' + esc(patient.medical_history) + '</p></div>';
  }
  el('patient-detail-content').innerHTML = html;
  openModal('modal-patient-detail');
}

function viewRxModal(doctorName, date, notes, rx) {
  el('rx-doctor-name').textContent   = doctorName || '';
  el('rx-date').textContent          = date ? formatDate(date) : '';
  el('notes-in-rx').textContent      = notes || 'No notes recorded.';
  el('prescription-text').textContent = rx   || 'No prescription.';
  openModal('modal-prescription');
}

async function renderDoctorSlots() {
  const container = el('doc-slots-list');
  try {
    const slots = await api('GET', '/doctors/my/slots');
    if (!slots.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">&#128197;</div><p>No upcoming slots.</p></div>';
      return;
    }
    const byDate = {};
    slots.forEach(function(s) { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
    var html = '';
    Object.keys(byDate).sort().forEach(function(date) {
      const daySlots = byDate[date];
      const booked = daySlots.filter(function(s) { return s.is_booked; }).length;
      html += '<div style="margin-bottom:1.1rem">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem">'
          + '<div style="font-size:0.82rem;font-weight:600;color:var(--gray-600)">' + formatDate(date) + '</div>'
          + '<div style="display:flex;gap:0.5rem;align-items:center">'
            + '<span style="font-size:0.72rem;color:var(--gray-400)">' + booked + '/' + daySlots.length + ' booked</span>'
            + (booked < daySlots.length ? '<button class="btn btn-sm" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:var(--red-pale);color:var(--red);border:none;border-radius:4px;cursor:pointer" data-cleardate="' + date + '">Clear free</button>' : '')
          + '</div>'
        + '</div>'
        + '<div class="slot-grid">';
      daySlots.forEach(function(s) {
        if (s.is_booked) {
          html += '<div class="slot-pill booked" title="' + s.start_time + '-' + s.end_time + ' (Booked)">' + s.start_time + '<br><small style="font-size:0.65rem;opacity:0.6">booked</small></div>';
        } else {
          html += '<div class="slot-pill" title="' + s.start_time + '-' + s.end_time + '">' + s.start_time + '<br><small class="del-slot" data-slot-id="' + s.id + '" style="color:var(--red);cursor:pointer;font-size:0.65rem">del</small></div>';
        }
      });
      html += '</div></div>';
    });
    container.innerHTML = html;
    container.querySelectorAll('[data-cleardate]').forEach(function(btn) {
      btn.addEventListener('click', function() { clearDaySlots(btn.dataset.cleardate); });
    });
    container.querySelectorAll('.del-slot').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); deleteSlot(parseInt(btn.dataset.slotId)); });
    });
  } catch(e) {
    container.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}

async function deleteSlot(id) {
  if (!confirm('Delete this slot?')) return;
  try {
    await api('DELETE', '/doctors/slots/' + id);
    toast('Slot deleted', 'success');
    renderDoctorSlots();
  } catch(e) { toast(e.message, 'error'); }
}

async function clearDaySlots(date) {
  if (!confirm('Delete all free slots on ' + formatDate(date) + '?')) return;
  try {
    const res = await api('DELETE', '/doctors/slots/bulk-delete?date=' + date);
    toast(res.deleted + ' slots deleted', 'success');
    renderDoctorSlots();
  } catch(e) { toast(e.message, 'error'); }
}

function switchSlotTab(tab) {
  document.querySelectorAll('#slot-tabs .tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  el('slot-form-single').style.display = tab === 'single' ? 'block' : 'none';
  el('slot-form-weekly').style.display = tab === 'weekly' ? 'block' : 'none';
}

async function addBulkSlots() {
  const date  = el('slot-date').value;
  const start = el('slot-start').value;
  const end   = el('slot-end').value;
  const dur   = parseInt(el('slot-duration').value) || 30;
  if (!date || !start || !end) { toast('Please fill all fields', 'error'); return; }
  if (start >= end) { toast('End time must be after start time', 'error'); return; }
  const btn = el('btn-gen-slots');
  btn.disabled = true; btn.textContent = 'Generating...';
  try {
    const res = await api('POST', '/doctors/slots/bulk', {dates: [date], start_time: start, end_time: end, slot_duration_mins: dur});
    toast(res.created + ' slot' + (res.created !== 1 ? 's' : '') + ' created', 'success');
    renderDoctorSlots();
    renderDoctorDashboard();
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Generate Slots'; }
}

async function addWeeklySlots() {
  const weekdays = Array.from(document.querySelectorAll('#weekly-days-container input:checked')).map(function(c) { return parseInt(c.value); });
  const start = el('weekly-start').value;
  const end   = el('weekly-end').value;
  const dur   = parseInt(el('weekly-duration').value) || 30;
  const weeks = parseInt(el('weekly-weeks').value) || 4;
  if (!weekdays.length) { toast('Select at least one day', 'error'); return; }
  if (!start || !end)   { toast('Set start and end times', 'error'); return; }
  if (start >= end)     { toast('End time must be after start time', 'error'); return; }
  try {
    const res = await api('POST', '/doctors/slots/weekly', {weekdays: weekdays, num_weeks: weeks, start_time: start, end_time: end, slot_duration_mins: dur});
    toast(res.created + ' slots created over ' + weeks + ' weeks', 'success');
    renderDoctorSlots();
    renderDoctorDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── DOCTOR PATIENTS ──────────────────────────────────────────────────────────
async function renderDoctorPatients() {
  if (!state.user || state.user.role !== 'doctor') { showPage('home'); return; }
  const container = el('doctor-patients-content');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    const appts = await api('GET', '/doctors/my/appointments');
    const seen = {};
    const patients = [];
    appts.forEach(function(a) {
      if (a.patient && !seen[a.patient.id]) {
        seen[a.patient.id] = true;
        const patAppts = appts.filter(function(x) { return x.patient && x.patient.id === a.patient.id; });
        var lastVisit = '';
        patAppts.forEach(function(x) { if (x.slot && x.slot.date > lastVisit) lastVisit = x.slot.date; });
        patients.push(Object.assign({}, a.patient, {total_visits: patAppts.length, last_visit: lastVisit}));
      }
    });
    if (!patients.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">&#128101;</div><p>No patients yet.</p></div>';
      return;
    }
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">';
    patients.forEach(function(p, idx) {
      // Use data-idx to reference patient in the array — avoids JSON-in-HTML-attribute bugs
      html += '<div class="card patient-card" style="cursor:pointer" data-idx="' + idx + '">'
        + '<div class="card-body" style="display:flex;gap:1rem;align-items:center">'
          + '<div class="doctor-avatar" style="width:48px;height:48px;font-size:1.2rem;flex-shrink:0">' + p.name[0].toUpperCase() + '</div>'
          + '<div style="flex:1;min-width:0">'
            + '<div style="font-weight:600;color:var(--navy)">' + esc(p.name) + '</div>'
            + '<div style="font-size:0.8rem;color:var(--gray-600)">' + (p.gender || '') + (p.age ? ' &middot; Age ' + p.age : '') + (p.blood_group ? ' &middot; ' + p.blood_group : '') + '</div>'
            + '<div style="font-size:0.78rem;color:var(--gray-400);margin-top:3px">' + p.total_visits + ' visit' + (p.total_visits !== 1 ? 's' : '') + (p.last_visit ? ' &middot; Last: ' + formatDate(p.last_visit) : '') + '</div>'
            + (p.allergies ? '<div style="font-size:0.75rem;color:var(--amber);margin-top:2px">&#9888; ' + esc(p.allergies) + '</div>' : '')
          + '</div>'
        + '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.patient-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var idx = parseInt(card.dataset.idx);
        viewPatientDetail(patients[idx]);
      });
    });
  } catch(e) { container.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}

// ─── PATIENT APPOINTMENTS ─────────────────────────────────────────────────────
async function renderPatientAppointments() {
  if (!state.user) { showPage('home'); return; }
  const container = el('patient-appts-list');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    const appts = await api('GET', '/appointments/my');
    if (!appts.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">&#128197;</div><p>No appointments yet.</p>'
        + '<button class="btn btn-primary" style="margin-top:1rem" onclick="showPage(\'search\')">Find a Doctor</button></div>';
      return;
    }
    const upcoming = appts.filter(function(a) { return a.status === 'confirmed'; });
    const past     = appts.filter(function(a) { return a.status !== 'confirmed'; });

    function buildGroup(list, title) {
      if (!list.length) return '';
      var html = '<div style="margin-bottom:1.5rem">'
        + '<h3 style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--gray-400);margin-bottom:0.75rem">' + title + '</h3>'
        + '<div style="display:flex;flex-direction:column;gap:0.6rem">';
      list.forEach(function(a) {
        const dateDay = a.slot ? a.slot.date.split('-')[2] : '--';
        const dateMon = a.slot ? months[parseInt(a.slot.date.split('-')[1]) - 1] : '';
        html += '<div class="appt-item">'
          + '<div class="appt-date-box"><div class="day">' + dateDay + '</div><div class="month">' + dateMon + '</div></div>'
          + '<div class="appt-info" style="flex:1;min-width:0">'
            + '<strong>' + (a.doctor ? 'Dr. ' + esc(a.doctor.name) : 'Unknown') + '</strong>'
            + '<div class="time">' + (a.slot ? a.slot.start_time + ' – ' + a.slot.end_time : '') + '</div>'
            + '<div class="reason">' + (a.reason ? esc(a.reason) : '<em style="opacity:0.5">No reason specified</em>') + '</div>'
            + (a.notes ? '<div style="font-size:0.78rem;color:var(--teal);margin-top:3px">&#128203; Doctor left notes</div>' : '')
          + '</div>'
          + '<div class="appt-actions" style="flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">'
            + '<span class="badge badge-' + a.status + '">' + a.status.replace('_', ' ') + '</span>'
            + (a.status === 'confirmed' ? '<button class="btn btn-sm btn-danger" data-cancelid="' + a.id + '">Cancel</button>' : '')
            + (a.status === 'completed' && !a.reviewed ? '<button class="btn btn-sm btn-secondary" data-reviewid="' + a.id + '">&#11088; Review</button>' : '')
            + (a.notes || a.prescription ? '<button class="btn btn-sm btn-secondary" data-viewrx="1" data-doctor="' + esc(a.doctor ? 'Dr. ' + a.doctor.name : '') + '" data-date="' + (a.slot ? a.slot.date : '') + '" data-notes="' + esc(a.notes || '') + '" data-rx="' + esc(a.prescription || '') + '">View Rx</button>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div></div>';
      return html;
    }

    container.innerHTML = buildGroup(upcoming, 'Upcoming') + buildGroup(past, 'Past');

    container.querySelectorAll('[data-cancelid]').forEach(function(btn) {
      btn.addEventListener('click', function() { cancelAppt(parseInt(btn.dataset.cancelid)); });
    });
    container.querySelectorAll('[data-reviewid]').forEach(function(btn) {
      btn.addEventListener('click', function() { openReview(parseInt(btn.dataset.reviewid)); });
    });
    container.querySelectorAll('[data-viewrx]').forEach(function(btn) {
      btn.addEventListener('click', function() { viewRxModal(btn.dataset.doctor, btn.dataset.date, btn.dataset.notes, btn.dataset.rx); });
    });
  } catch(e) {
    container.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  }
}

async function cancelAppt(id) {
  if (!confirm('Cancel this appointment?')) return;
  try {
    await api('PUT', '/appointments/' + id + '/cancel');
    toast('Appointment cancelled', 'success');
    renderPatientAppointments();
  } catch(e) { toast(e.message, 'error'); }
}

var reviewApptId = null;
function openReview(id) {
  reviewApptId = id;
  document.querySelectorAll('#review-stars input').forEach(function(i) { i.checked = false; });
  el('review-comment').value = '';
  openModal('modal-review');
}
async function submitReview() {
  const rating = document.querySelector('#review-stars input:checked');
  if (!rating) { toast('Please select a star rating', 'error'); return; }
  try {
    await api('POST', '/appointments/review', {appointment_id: reviewApptId, rating: parseInt(rating.value), comment: el('review-comment').value});
    closeModal('modal-review');
    toast('Review submitted!', 'success');
    renderPatientAppointments();
  } catch(e) { toast(e.message, 'error'); }
}

function printSummary() {
  const doctorName = el('rx-doctor-name').textContent;
  const date       = el('rx-date').textContent;
  const notes      = el('notes-in-rx').textContent;
  const rx         = el('prescription-text').textContent;
  const w = window.open('', '_blank');
  w.document.write('<html><head><title>Prescription</title><style>body{font-family:Georgia,serif;max-width:680px;margin:2rem auto;padding:2rem;border:2px solid #0f2137}h2{color:#0f2137}h3{color:#0d9488;font-size:0.95rem;margin:1.25rem 0 0.4rem;text-transform:uppercase}pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:0.9rem;line-height:1.7;background:#f0fdfb;padding:0.85rem;border-radius:4px}.footer{margin-top:3rem;border-top:1px solid #ccc;padding-top:0.75rem;font-size:0.75rem;color:#999}</style></head><body>'
    + '<h2>MedBook - Consultation Summary</h2>'
    + '<p style="color:#666;font-size:0.85rem">' + doctorName + ' &nbsp;&middot;&nbsp; ' + date + '</p>'
    + '<h3>Clinical Notes</h3><pre>' + notes + '</pre>'
    + '<h3>Prescription</h3><pre>' + rx + '</pre>'
    + '<div class="footer">Generated via MedBook &middot; ' + new Date().toLocaleString() + '</div>'
    + '</body></html>');
  w.document.close(); w.print();
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function renderProfile() {
  if (!state.user) { showPage('home'); return; }
  try {
    const data = await api('GET', '/auth/me');
    const p = data.profile || {};
    el('profile-avatar').textContent       = data.name[0].toUpperCase();
    el('profile-name-display').textContent = data.name;
    el('profile-role-display').textContent = data.role === 'doctor' ? 'Doctor · ' + (p.specialization || '') : 'Patient';
    ['name','phone','email'].forEach(function(f) { if (el('pf-' + f)) el('pf-' + f).value = data[f] || ''; });
    if (data.role === 'doctor') {
      el('profile-doctor-section').style.display = 'block';
      el('profile-patient-section').style.display = 'none';
      ['specialization','qualification','experience_years','clinic_name','clinic_address','consultation_fee','bio','available_days','slot_duration_mins'].forEach(function(f) {
        if (el('pf-' + f)) el('pf-' + f).value = (p[f] !== undefined && p[f] !== null) ? p[f] : '';
      });
    } else {
      el('profile-patient-section').style.display = 'block';
      el('profile-doctor-section').style.display = 'none';
      ['age','gender','blood_group','allergies','medical_history','emergency_contact'].forEach(function(f) {
        if (el('pf-' + f)) el('pf-' + f).value = (p[f] !== undefined && p[f] !== null) ? p[f] : '';
      });
    }
  } catch(e) { toast(e.message, 'error'); }
}

async function saveProfile() {
  const data = {};
  document.querySelectorAll('#profile-form [id^="pf-"]').forEach(function(input) {
    data[input.id.replace('pf-', '')] = input.value;
  });
  const btn = el('btn-save-profile');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await api('PUT', state.user.role === 'doctor' ? '/doctors/profile' : '/patients/profile', data);
    state.user.name = data.name;
    localStorage.setItem('user', JSON.stringify(state.user));
    el('nav-user-name').textContent = data.name;
    toast('Profile updated!', 'success');
    renderProfile();
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
}

// ─── AUTH MODALS ──────────────────────────────────────────────────────────────
async function doLogin() {
  const userEmail = el('login-email').value.trim();
  const userPass  = el('login-password').value;
  const errEl     = el('login-error');
  errEl.style.display = 'none'; errEl.textContent = '';
  if (!userEmail || !userPass) { errEl.textContent = 'Fill in all fields'; errEl.style.display = 'block'; return; }
  const btn = el('btn-login');
  btn.disabled = true; btn.textContent = 'Logging in...';
  try {
    const data = await api('POST', '/auth/login', {email: userEmail, password: userPass}, false);
    setAuth(data); closeModal('modal-login');
    toast('Welcome back, ' + data.name + '!', 'success');
    if (data.role === 'doctor') showPage('doctor-dashboard');
    else showPage('patient-appointments');
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Log In'; }
}

async function doRegister() {
  const selectedRole = document.querySelector('[name="reg-role"]:checked') ? document.querySelector('[name="reg-role"]:checked').value : null;
  const errEl = el('reg-error');
  errEl.textContent = '';
  if (!selectedRole) { errEl.textContent = 'Please select a role'; return; }
  const fullName  = el('reg-name').value.trim();
  const userEmail = el('reg-email').value.trim();
  const userPass  = el('reg-password').value;
  if (!fullName)           { errEl.textContent = 'Name is required'; return; }
  if (!userEmail)          { errEl.textContent = 'Email is required'; return; }
  if (!userPass)           { errEl.textContent = 'Password is required'; return; }
  if (userPass.length < 6) { errEl.textContent = 'Password must be at least 6 characters'; return; }
  const expYears = parseInt(el('reg-experience').value);
  const fee      = parseFloat(el('reg-fee').value);
  const patAge   = parseInt(el('reg-age').value);
  const payload = {
    name:             fullName,
    email:            userEmail,
    password:         userPass,
    role:             selectedRole,
    phone:            el('reg-phone').value,
    specialization:   el('reg-specialization').value,
    qualification:    el('reg-qualification').value,
    experience_years: isNaN(expYears) ? 0 : expYears,
    clinic_name:      el('reg-clinic').value,
    consultation_fee: isNaN(fee) ? 0 : fee,
    age:              isNaN(patAge) ? null : patAge,
    gender:           el('reg-gender').value,
    blood_group:      el('reg-blood').value,
  };
  const btn = el('btn-register');
  btn.disabled = true; btn.textContent = 'Creating account...';
  try {
    const res = await api('POST', '/auth/register', payload, false);
    setAuth(res); closeModal('modal-register');
    toast('Welcome to MedBook, ' + res.name + '!', 'success');
    if (res.role === 'doctor') showPage('doctor-dashboard');
    else showPage('patient-appointments');
  } catch(e) { errEl.textContent = e.message; }
  finally { btn.disabled = false; btn.textContent = 'Create Account'; }
}

function toggleRegRole(role) {
  el('reg-doctor-fields').style.display  = role === 'doctor'  ? 'block' : 'none';
  el('reg-patient-fields').style.display = role === 'patient' ? 'block' : 'none';
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openModal(id) {
  el(id).classList.add('open');
  // Clear login form every time it opens
  if (id === 'modal-login') {
    el('login-email').value    = '';
    el('login-password').value = '';
    el('login-error').style.display = 'none';
    el('login-error').textContent   = '';
  }
  // Clear register form every time it opens
  if (id === 'modal-register') {
    el('reg-error').textContent = '';
    el('reg-name').value        = '';
    el('reg-email').value       = '';
    el('reg-password').value    = '';
    el('reg-phone').value       = '';
    el('reg-specialization').value = '';
    el('reg-qualification').value  = '';
    el('reg-experience').value     = '';
    el('reg-clinic').value         = '';
    el('reg-fee').value            = '';
    el('reg-age').value            = '';
    el('reg-gender').value         = '';
    el('reg-blood').value          = '';
  }
}
function closeModal(id) { el(id).classList.remove('open'); }

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  updateNav();
  showPage('home');

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Search on Enter
  const si = el('search-input');
  if (si) si.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSearch(e.target.value, el('search-spec-filter').value);
  });

  // Login on Enter
  const lp = el('login-password');
  if (lp) lp.addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });

  // Default slot tab
  switchSlotTab('single');

  // Set today as min date for slot picker
  const sd = el('slot-date');
  if (sd) {
    const today = new Date().toISOString().split('T')[0];
    sd.min   = today;
    sd.value = today;
  }
});