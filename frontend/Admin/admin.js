'use strict';

/* ══════════════════════════════════════════
   EVENTFY — admin.js
   Full admin panel: sidebar tabs, charts,
   pagination, user/event/payment/review mgmt
══════════════════════════════════════════ */

/* ── Auth Guard ── */
(function authGuard() {
  if (!isLoggedIn()) { window.location.href = '../index.html#/signin'; return; }
  const user = getCachedUser();
  if (!user || user.role !== 'admin') { window.location.href = '../index.html#/discover'; return; }
})();

/* ── State ── */
let allUsers = [];
let allEvents = [];
let allPayments = [];
let allReviews = [];
let dashData = null;
let analyticsData = null;
let confirmCallback = null;

const PAGE_SIZE = 10;
let userPage = 1, eventPage = 1, paymentPage = 1, reviewPage = 1;

/* Chart instances */
let revenueChartInstance = null;
let usersChartInstance = null;
let ticketsChartInstance = null;
let eventsChartInstance = null;


/* ══════════════════════════════════════════
   DOM READY
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {

  /* ── ESC closes everything ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideModal(); closeDetailDrawer(); closeMobileSidebar();
    }
  });

  /* ── MODAL ── */
  document.getElementById('modalCancel').addEventListener('click', hideModal);
  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal();
  });
  document.getElementById('modalConfirm').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    hideModal();
  });

  /* ── SIDEBAR TAB SYSTEM ── */
  initSidebar();

  /* ── SEARCH INPUTS ── */
  document.getElementById('userSearchInput').addEventListener('input', () => { userPage = 1; renderUsersTable(); });
  document.getElementById('eventSearchInput').addEventListener('input', () => { eventPage = 1; renderEventsTable(); });
  document.getElementById('paymentSearchInput').addEventListener('input', () => { paymentPage = 1; renderPaymentsTable(); });
  document.getElementById('reviewSearchInput').addEventListener('input', () => { reviewPage = 1; renderReviewsGrid(); });

  /* ── FILTER SELECTS ── */
  document.getElementById('userRoleFilter').addEventListener('change', () => { userPage = 1; renderUsersTable(); });
  document.getElementById('eventStatusFilter').addEventListener('change', () => { eventPage = 1; renderEventsTable(); });
  document.getElementById('paymentStatusFilter').addEventListener('change', () => { paymentPage = 1; renderPaymentsTable(); });

  /* ── DETAIL DRAWER ── */
  document.getElementById('detailCloseBtn').addEventListener('click', closeDetailDrawer);
  document.getElementById('detailOverlay').addEventListener('click', closeDetailDrawer);

  /* ── MOBILE SIDEBAR TOGGLE ── */
  const sidebarToggle = document.createElement('button');
  sidebarToggle.className = 'sidebar-toggle';
  sidebarToggle.id = 'sidebarToggle';
  sidebarToggle.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>';
  document.body.appendChild(sidebarToggle);

  const sidebarBackdrop = document.createElement('div');
  sidebarBackdrop.className = 'sidebar-backdrop';
  sidebarBackdrop.id = 'sidebarBackdrop';
  document.body.appendChild(sidebarBackdrop);

  sidebarToggle.addEventListener('click', toggleMobileSidebar);
  sidebarBackdrop.addEventListener('click', closeMobileSidebar);

  /* ── Load all data ── */
  await loadDashboard();
});


/* ══════════════════════════════════════════
   SIDEBAR TAB SYSTEM
══════════════════════════════════════════ */

const TAB_MAP = {
  dashboard: 'tabDashboard',
  users:     'tabUsers',
  events:    'tabEvents',
  payments:  'tabPayments',
  reviews:   'tabReviews',
};

function initSidebar() {
  document.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
      closeMobileSidebar();
    });
  });

  // Read initial tab from hash
  const hash = window.location.hash.replace('#', '');
  if (hash && TAB_MAP[hash]) {
    switchTab(hash);
  }

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (h && TAB_MAP[h]) switchTab(h);
  });
}

function switchTab(tab) {
  // Update sidebar links
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar-link[data-tab="${tab}"]`)?.classList.add('active');

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(TAB_MAP[tab]);
  if (panel) {
    panel.classList.add('active');
    // Re-trigger animation
    panel.style.animation = 'none';
    panel.offsetHeight; // force reflow
    panel.style.animation = '';
  }

  // Update hash without scrolling
  history.replaceState(null, '', `#${tab}`);
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.toggle('mobile-open');
  backdrop.classList.toggle('open');
}

function closeMobileSidebar() {
  document.getElementById('adminSidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}


/* ══════════════════════════════════════════
   DATA FETCHING
══════════════════════════════════════════ */

async function loadDashboard() {
  try {
    const [dash, users, events, analytics, payments, reviews] = await Promise.all([
      apiFetch('/admin/dashboard').then(r => r.ok ? r.json() : null),
      apiFetch('/admin/view_all_users').then(r => r.ok ? r.json() : []),
      apiFetch('/admin/view_all_events').then(r => r.ok ? r.json() : []),
      apiFetch('/admin/analytics').then(r => r.ok ? r.json() : null),
      apiFetch('/admin/view_all_payments').then(r => r.ok ? r.json() : []),
      apiFetch('/admin/view_all_reviews').then(r => r.ok ? r.json() : []),
    ]);

    dashData = dash;
    allUsers = users || [];
    allEvents = events || [];
    analyticsData = analytics;
    allPayments = payments || [];
    allReviews = reviews || [];

    // Stats
    if (dashData) {
      animateNumber('statUsers', dashData.users?.total ?? allUsers.length);
      animateNumber('statEvents', dashData.events?.total ?? allEvents.length);
      animateNumber('statTickets', dashData.tickets?.total ?? 0);
      animateNumber('statOrganizers', dashData.users?.organizers ?? allUsers.filter(u => u.role === 'organizer').length);
      const revenue = dashData.revenue ?? 0;
      document.getElementById('statRevenue').textContent = formatCurrency(revenue);
    } else {
      document.getElementById('statUsers').textContent = allUsers.length;
      document.getElementById('statEvents').textContent = allEvents.length;
      document.getElementById('statRevenue').textContent = '—';
      document.getElementById('statTickets').textContent = '—';
      animateNumber('statOrganizers', allUsers.filter(u => u.role === 'organizer').length);
    }

    // Render tables
    renderUsersTable();
    renderEventsTable();
    renderPaymentsTable();
    renderReviewsGrid();

    // Charts
    renderCharts();

    // Show main, hide loading
    document.getElementById('adminLoading').style.display = 'none';
    document.getElementById('adminLayout').style.display = '';
  } catch (err) {
    console.error('Failed to load admin dashboard:', err);
    document.getElementById('adminLoading').innerHTML =
      '<p style="color:#ef4444;">Failed to load data. Please refresh or check your connection.</p>';
  }
}


/* ══════════════════════════════════════════
   CHARTS
══════════════════════════════════════════ */

function renderCharts() {
  if (typeof Chart === 'undefined') return;

  const chartColors = {
    purple:    'rgba(124, 58, 237, 1)',
    purpleL:   'rgba(124, 58, 237, 0.1)',
    blue:      'rgba(59, 130, 246, 1)',
    blueL:     'rgba(59, 130, 246, 0.1)',
    green:     'rgba(16, 185, 129, 1)',
    greenL:    'rgba(16, 185, 129, 0.15)',
    orange:    'rgba(249, 115, 22, 1)',
    orangeL:   'rgba(249, 115, 22, 0.1)',
    pink:      'rgba(236, 72, 153, 1)',
    amber:     'rgba(245, 158, 11, 1)',
    cyan:      'rgba(6, 182, 212, 1)',
    faint:     'rgba(156, 163, 175, 0.3)',
  };

  const defaultOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleFont: { family: 'Inter', weight: '600', size: 13 },
        bodyFont: { family: 'Inter', weight: '500', size: 12 },
        cornerRadius: 8,
        padding: 10,
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 11, weight: '500' }, color: '#9ca3af' }
      },
      y: {
        grid: { color: 'rgba(0,0,0,.04)' },
        ticks: { font: { family: 'Inter', size: 11, weight: '500' }, color: '#9ca3af' },
        beginAtZero: true,
      }
    }
  };

  // Revenue Chart (line)
  const revLabels = analyticsData?.revenue_monthly?.map(d => d.label) || ['No data'];
  const revValues = analyticsData?.revenue_monthly?.map(d => d.value) || [0];
  const revCtx = document.getElementById('revenueChart')?.getContext('2d');
  if (revCtx) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    revenueChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: revLabels,
        datasets: [{
          label: 'Revenue (DZD)',
          data: revValues,
          borderColor: chartColors.green,
          backgroundColor: chartColors.greenL,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: chartColors.green,
          borderWidth: 2.5,
        }]
      },
      options: { ...defaultOpts }
    });
  }

  // Users Chart (bar)
  const userLabels = analyticsData?.users_monthly?.map(d => d.label) || ['No data'];
  const userValues = analyticsData?.users_monthly?.map(d => d.value) || [0];
  const userCtx = document.getElementById('usersChart')?.getContext('2d');
  if (userCtx) {
    if (usersChartInstance) usersChartInstance.destroy();
    usersChartInstance = new Chart(userCtx, {
      type: 'bar',
      data: {
        labels: userLabels,
        datasets: [{
          label: 'New Users',
          data: userValues,
          backgroundColor: chartColors.purpleL,
          borderColor: chartColors.purple,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: { ...defaultOpts }
    });
  }

  // Tickets Chart (doughnut)
  const ticketData = dashData?.tickets || {};
  const tCtx = document.getElementById('ticketsChart')?.getContext('2d');
  if (tCtx) {
    if (ticketsChartInstance) ticketsChartInstance.destroy();
    ticketsChartInstance = new Chart(tCtx, {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Used', 'Cancelled'],
        datasets: [{
          data: [ticketData.active || 0, ticketData.used || 0, ticketData.cancelled || 0],
          backgroundColor: [chartColors.green, chartColors.blue, chartColors.pink],
          borderWidth: 0,
          spacing: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Inter', size: 11, weight: '600' },
              color: '#6b7280',
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 8,
            }
          },
          tooltip: defaultOpts.plugins.tooltip,
        }
      }
    });
  }

  // Events Chart (bar)
  const evLabels = analyticsData?.events_monthly?.map(d => d.label) || ['No data'];
  const evValues = analyticsData?.events_monthly?.map(d => d.value) || [0];
  const evCtx = document.getElementById('eventsChart')?.getContext('2d');
  if (evCtx) {
    if (eventsChartInstance) eventsChartInstance.destroy();
    eventsChartInstance = new Chart(evCtx, {
      type: 'bar',
      data: {
        labels: evLabels,
        datasets: [{
          label: 'Events Created',
          data: evValues,
          backgroundColor: chartColors.orangeL,
          borderColor: chartColors.orange,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: { ...defaultOpts }
    });
  }
}


/* ══════════════════════════════════════════
   RENDER USERS TABLE
══════════════════════════════════════════ */

function getFilteredUsers() {
  let users = allUsers;
  const query = document.getElementById('userSearchInput')?.value?.toLowerCase() || '';
  const roleFilter = document.getElementById('userRoleFilter')?.value || '';

  if (query) {
    users = users.filter(u =>
      (u.username || '').toLowerCase().includes(query) ||
      (u.full_name || '').toLowerCase().includes(query) ||
      (u.email || '').toLowerCase().includes(query) ||
      (u.role || '').toLowerCase().includes(query)
    );
  }
  if (roleFilter) {
    users = users.filter(u => u.role === roleFilter);
  }
  return users;
}

function renderUsersTable() {
  const filtered = getFilteredUsers();
  const paged = paginate(filtered, userPage, PAGE_SIZE);
  const tbody = document.getElementById('usersTableBody');

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="table-empty">No users found</div></td></tr>';
    renderPagination('usersPagination', 0, userPage, p => { userPage = p; renderUsersTable(); });
    return;
  }

  tbody.innerHTML = paged.map(u => {
    const name = u.full_name || u.username || 'Unknown';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const colorClass = getRoleColorClass(u.role);
    const badgeClass = `badge--${u.role || 'attendee'}`;
    const isDeleted = u.is_deleted;
    const isBanned = u.is_banned;
    const isRestricted = u.is_restricted;

    // Differentiated status badges
    let statusBadge;
    if (isBanned) {
      statusBadge = '<span class="badge badge--banned">Banned</span>';
    } else if (isRestricted) {
      statusBadge = '<span class="badge" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;">Restricted</span>';
    } else if (isDeleted) {
      statusBadge = '<span class="badge badge--banned">Inactive</span>';
    } else {
      statusBadge = '<span class="badge badge--active">Active</span>';
    }

    let actions = '';
    if (isDeleted || isBanned) {
      actions = `<button class="btn-reactivate" onclick="handleReactivateUser(${u.id}, '${escapeHtml(name)}')">Reactivate</button>`;
    } else if (u.role === 'admin') {
      actions = '<span class="cell-muted">—</span>';
    } else {
      actions = `
        <button class="btn-details" onclick="handleUserDetails(${u.id})">Details</button>
        ${isRestricted
          ? `<button class="btn-reactivate" onclick="handleUnrestrictUser(${u.id}, '${escapeHtml(name)}')">Unrestrict</button>`
          : `<button class="btn-restrict" onclick="handleRestrictUser(${u.id}, '${escapeHtml(name)}')" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;">Restrict</button>`}
        <button class="btn-ban" onclick="handleBanUser(${u.id}, '${escapeHtml(name)}')">Ban</button>
        <button class="btn-delete" onclick="handleDeleteUser(${u.id}, '${escapeHtml(name)}')">Delete</button>`;
    }

    return `<tr class="${isDeleted || isBanned ? 'row-inactive' : ''}">
      <td>
        <div class="cell-with-img">
          <div class="user-avatar-wrap ${colorClass}">
            ${u.avatar_url
              ? `<img alt="${escapeHtml(name)}" src="${u.avatar_url}"/>`
              : `<span class="avatar-initials">${initials}</span>`}
          </div>
          <span class="cell-name">${escapeHtml(name)}</span>
        </div>
      </td>
      <td class="cell-muted">${escapeHtml(u.email || '')}</td>
      <td class="td-center"><span class="badge ${badgeClass}">${capitalize(u.role || 'attendee')}</span></td>
      <td class="td-center">${statusBadge}</td>
      <td class="td-right"><div class="action-btns">${actions}</div></td>
    </tr>`;
  }).join('');

  renderPagination('usersPagination', filtered.length, userPage, p => { userPage = p; renderUsersTable(); });
}


/* ══════════════════════════════════════════
   RENDER EVENTS TABLE
══════════════════════════════════════════ */

function getFilteredEvents() {
  let events = allEvents;
  const query = document.getElementById('eventSearchInput')?.value?.toLowerCase() || '';
  const statusFilter = document.getElementById('eventStatusFilter')?.value || '';

  if (query) {
    events = events.filter(ev =>
      (ev.title || '').toLowerCase().includes(query) ||
      (ev.organizer_name || '').toLowerCase().includes(query) ||
      (ev.location || '').toLowerCase().includes(query)
    );
  }
  if (statusFilter === 'active') events = events.filter(ev => !ev.is_deleted);
  if (statusFilter === 'deleted') events = events.filter(ev => ev.is_deleted);

  return events;
}

function renderEventsTable() {
  const filtered = getFilteredEvents();
  const paged = paginate(filtered, eventPage, PAGE_SIZE);
  const tbody = document.getElementById('eventsTableBody');

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty">No events found</div></td></tr>';
    renderPagination('eventsPagination', 0, eventPage, p => { eventPage = p; renderEventsTable(); });
    return;
  }

  tbody.innerHTML = paged.map(ev => {
    const title = ev.title || 'Untitled';
    const organizer = ev.organizer_name || '—';
    const location = ev.location || '—';
    const date = ev.date || ev.start_date ? formatDate(ev.date || ev.start_date) : '—';
    const isDeleted = ev.is_deleted;
    const statusBadge = isDeleted
      ? '<span class="badge badge--banned">Deleted</span>'
      : '<span class="badge badge--active">Active</span>';

    const actions = isDeleted
      ? '<span class="cell-muted">Deleted</span>'
      : `<button class="btn-view" onclick="window.open('../index.html#/event/${ev.id}', '_blank')">View</button>
         <button class="btn-delete" onclick="handleDeleteEvent(${ev.id}, '${escapeHtml(title)}')">Delete</button>`;

    return `<tr class="${isDeleted ? 'row-inactive' : ''}">
      <td>
        <div class="cell-with-img">
          <div class="event-thumb">
            ${ev.image
              ? `<img alt="${escapeHtml(title)}" src="${ev.image}"/>`
              : `<div class="event-thumb-placeholder">
                   <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
                 </div>`}
          </div>
          <span class="cell-name">${escapeHtml(title)}</span>
        </div>
      </td>
      <td class="cell-muted">${escapeHtml(organizer)}</td>
      <td class="cell-muted">${escapeHtml(location)}</td>
      <td class="cell-muted">${date}</td>
      <td class="td-center">${statusBadge}</td>
      <td class="td-right"><div class="action-btns">${actions}</div></td>
    </tr>`;
  }).join('');

  renderPagination('eventsPagination', filtered.length, eventPage, p => { eventPage = p; renderEventsTable(); });
}


/* ══════════════════════════════════════════
   RENDER PAYMENTS TABLE
══════════════════════════════════════════ */

function getFilteredPayments() {
  let payments = allPayments;
  const query = document.getElementById('paymentSearchInput')?.value?.toLowerCase() || '';
  const statusFilter = document.getElementById('paymentStatusFilter')?.value || '';

  if (query) {
    payments = payments.filter(p =>
      (p.username || '').toLowerCase().includes(query) ||
      (p.email || '').toLowerCase().includes(query) ||
      (p.event_title || '').toLowerCase().includes(query)
    );
  }
  if (statusFilter) {
    payments = payments.filter(p => p.status === statusFilter);
  }
  return payments;
}

function renderPaymentsTable() {
  const filtered = getFilteredPayments();
  const paged = paginate(filtered, paymentPage, PAGE_SIZE);
  const tbody = document.getElementById('paymentsTableBody');

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty">No payments found</div></td></tr>';
    renderPagination('paymentsPagination', 0, paymentPage, p => { paymentPage = p; renderPaymentsTable(); });
    return;
  }

  tbody.innerHTML = paged.map(p => {
    const statusClass = `badge--${p.status || 'pending'}`;
    return `<tr>
      <td>
        <div class="cell-with-img">
          <div class="user-avatar-wrap user-avatar-wrap--slate">
            <span class="avatar-initials">${(p.username || '?')[0].toUpperCase()}</span>
          </div>
          <div>
            <div class="cell-name">${escapeHtml(p.username || 'Unknown')}</div>
            <div class="cell-muted" style="font-size:11px;">${escapeHtml(p.email || '')}</div>
          </div>
        </div>
      </td>
      <td class="cell-muted">${escapeHtml(p.event_title || 'Unknown')}</td>
      <td class="cell-name">${formatCurrency(p.amount || 0)}</td>
      <td class="cell-muted">${capitalize(p.payment_method || '—')}</td>
      <td class="td-center"><span class="badge ${statusClass}">${capitalize(p.status || 'pending')}</span></td>
      <td class="cell-muted">${p.created_at ? formatDate(p.created_at) : '—'}</td>
    </tr>`;
  }).join('');

  renderPagination('paymentsPagination', filtered.length, paymentPage, p => { paymentPage = p; renderPaymentsTable(); });
}


/* ══════════════════════════════════════════
   RENDER REVIEWS GRID
══════════════════════════════════════════ */

function getFilteredReviews() {
  let reviews = allReviews;
  const query = document.getElementById('reviewSearchInput')?.value?.toLowerCase() || '';
  if (query) {
    reviews = reviews.filter(r =>
      (r.reviewer_name || '').toLowerCase().includes(query) ||
      (r.event_title || '').toLowerCase().includes(query) ||
      (r.comment || '').toLowerCase().includes(query)
    );
  }
  return reviews;
}

function renderReviewsGrid() {
  const filtered = getFilteredReviews();
  const paged = paginate(filtered, reviewPage, PAGE_SIZE);
  const grid = document.getElementById('reviewsGrid');

  if (!filtered.length) {
    grid.innerHTML = '<div class="table-empty">No reviews found</div>';
    renderPagination('reviewsPagination', 0, reviewPage, p => { reviewPage = p; renderReviewsGrid(); });
    return;
  }

  grid.innerHTML = paged.map(r => {
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<svg class="star ${i < r.rating ? '' : 'empty'}" fill="${i < r.rating ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" stroke-width="1.5"/></svg>`
    ).join('');

    return `<div class="review-card">
      <div class="review-card-top">
        <div class="review-stars">${stars}</div>
        <span class="review-meta">${r.created_at ? formatDate(r.created_at) : ''}</span>
      </div>
      <p class="review-comment">${escapeHtml(r.comment || 'No comment')}</p>
      <div class="review-footer">
        <div>
          <div class="review-author">${escapeHtml(r.reviewer_name || 'Anonymous')}</div>
          <div class="review-event">on ${escapeHtml(r.event_title || 'Unknown Event')}</div>
        </div>
        <div class="review-actions">
          <button class="btn-delete" onclick="handleDeleteReview(${r.id}, '${escapeHtml(r.reviewer_name || 'this review')}')">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');

  renderPagination('reviewsPagination', filtered.length, reviewPage, p => { reviewPage = p; renderReviewsGrid(); });
}


/* ══════════════════════════════════════════
   PAGINATION
══════════════════════════════════════════ */

function paginate(arr, page, size) {
  const start = (page - 1) * size;
  return arr.slice(start, start + size);
}

function renderPagination(containerId, totalItems, currentPage, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';

  // Prev
  html += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="return false" data-page="${currentPage - 1}">
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
  </button>`;

  // Page numbers (show max 7 pages with ellipsis)
  const pages = getPageNumbers(currentPage, totalPages);
  for (const p of pages) {
    if (p === '...') {
      html += '<span class="page-info">…</span>';
    } else {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
  }

  // Next
  html += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}">
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
  </button>`;

  container.innerHTML = html;

  // Attach events
  container.querySelectorAll('.page-btn:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    });
  });
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}


/* ══════════════════════════════════════════
   ACTION HANDLERS
══════════════════════════════════════════ */

function handleDeleteUser(userId, name) {
  showModal('Delete User',
    `Are you sure you want to delete <strong>${name}</strong>? This will deactivate their account.`,
    'danger',
    async () => {
      try {
        const res = await apiFetch(`/admin/delete_user/${userId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast(`User "${name}" has been deleted`, 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

function handleBanUser(userId, name) {
  showModal('Ban User',
    `Are you sure you want to ban <strong>${name}</strong>? They will no longer be able to log in.`,
    'danger',
    async () => {
      try {
        const res = await apiFetch(`/admin/ban_user/${userId}`, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast(`User "${name}" has been banned`, 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

function handleRestrictUser(userId, name) {
  showModal('Restrict User',
    `Are you sure you want to restrict <strong>${name}</strong>? They will be able to browse events but cannot purchase tickets or register.`,
    'danger',
    async () => {
      try {
        const res = await apiFetch(`/admin/restrict_user/${userId}`, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast(`User "${name}" has been restricted`, 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

function handleUnrestrictUser(userId, name) {
  showModal('Remove Restriction',
    `Are you sure you want to remove restrictions from <strong>${name}</strong>? They will regain full access.`,
    'confirm',
    async () => {
      try {
        const res = await apiFetch(`/admin/unrestrict_user/${userId}`, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast(`Restrictions removed for "${name}"`, 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

function handleReactivateUser(userId, name) {
  showModal('Reactivate User',
    `Are you sure you want to reactivate <strong>${name}</strong>? This will clear all bans and restrictions.`,
    'confirm',
    async () => {
      try {
        const res = await apiFetch(`/admin/reactive_user/${userId}`, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast(`User "${name}" has been reactivated`, 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

function handleDeleteEvent(eventId, title) {
  showModal('Delete Event',
    `Are you sure you want to delete <strong>${title}</strong>? This action cannot be undone.`,
    'danger',
    async () => {
      try {
        const res = await apiFetch(`/admin/delete_event/${eventId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast(`Event "${title}" has been deleted`, 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

function handleDeleteReview(reviewId, reviewerName) {
  showModal('Delete Review',
    `Are you sure you want to delete the review by <strong>${reviewerName}</strong>?`,
    'danger',
    async () => {
      try {
        const res = await apiFetch(`/admin/delete_review/${reviewId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
        showToast('Review has been deleted', 'success');
        await loadDashboard();
      } catch (err) { showToast(err.message, 'error'); }
    }
  );
}

async function handleUserDetails(userId) {
  try {
    const res = await apiFetch(`/admin/user_details/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch user details');
    const user = await res.json();
    renderDetailDrawer(user);
    openDetailDrawer();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleChangeRole(userId, newRole, name) {
  try {
    const res = await apiFetch(`/admin/change_role/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed');
    showToast(`${name}'s role changed to ${capitalize(newRole)}`, 'success');
    await loadDashboard();
    // Refresh detail drawer if open
    handleUserDetails(userId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}


/* ══════════════════════════════════════════
   DETAIL DRAWER
══════════════════════════════════════════ */

function renderDetailDrawer(user) {
  const body = document.getElementById('detailDrawerBody');
  const name = user.full_name || user.username || 'Unknown';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const roleBadge = `<span class="badge badge--${user.role || 'attendee'}">${capitalize(user.role || 'attendee')}</span>`;
  const statusBadge = user.is_deleted
    ? '<span class="badge badge--banned">Inactive</span>'
    : '<span class="badge badge--active">Active</span>';

  const roleChangeHtml = user.role !== 'admin' && !user.is_deleted
    ? `<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
         ${user.role !== 'organizer'
           ? `<button class="btn-role-change" onclick="handleChangeRole(${user.id}, 'organizer', '${escapeHtml(name)}')">Promote to Organizer</button>`
           : `<button class="btn-role-change" onclick="handleChangeRole(${user.id}, 'attendee', '${escapeHtml(name)}')">Demote to Attendee</button>`
         }
       </div>`
    : '';

  body.innerHTML = `
    <div class="detail-profile">
      <div class="detail-avatar">
        ${user.avatar_url
          ? `<img src="${user.avatar_url}" alt="${escapeHtml(name)}" />`
          : `<span class="initials">${initials}</span>`}
      </div>
      <div class="detail-name">${escapeHtml(name)}</div>
      <div class="detail-email">${escapeHtml(user.email || '')}</div>
      <div class="detail-badges">${roleBadge} ${statusBadge}</div>
      ${roleChangeHtml}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Profile Information</div>
      <div class="detail-info-grid">
        <div class="detail-info-item">
          <div class="detail-info-label">Username</div>
          <div class="detail-info-value">${escapeHtml(user.username || '—')}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Phone</div>
          <div class="detail-info-value">${escapeHtml(user.phone || '—')}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Location</div>
          <div class="detail-info-value">${escapeHtml(user.location || '—')}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Joined</div>
          <div class="detail-info-value">${user.created_at ? formatDate(user.created_at) : '—'}</div>
        </div>
      </div>
    </div>

    ${user.bio ? `<div class="detail-section">
      <div class="detail-section-title">Bio</div>
      <p style="font-size:13px;color:var(--text-2);line-height:1.6;">${escapeHtml(user.bio)}</p>
    </div>` : ''}

    <div class="detail-section">
      <div class="detail-section-title">Events (${user.events?.length || 0})</div>
      ${user.events?.length
        ? `<div class="detail-list">${user.events.map(ev => `
            <div class="detail-list-item">
              <span class="detail-list-item-title">${escapeHtml(ev.title || 'Untitled')}</span>
              <span class="detail-list-item-meta">${ev.start_date ? formatDate(ev.start_date) : '—'}</span>
            </div>`).join('')}</div>`
        : '<div class="detail-empty">No events</div>'}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Tickets (${user.tickets?.length || 0})</div>
      ${user.tickets?.length
        ? `<div class="detail-list">${user.tickets.map(t => `
            <div class="detail-list-item">
              <span class="detail-list-item-title">Ticket #${(t.id || '').toString().slice(0, 8)}</span>
              <span class="badge badge--${t.status === 'active' ? 'active' : t.status === 'cancelled' ? 'banned' : 'pending'}">${capitalize(t.status || 'unknown')}</span>
            </div>`).join('')}</div>`
        : '<div class="detail-empty">No tickets</div>'}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Payments (${user.payments?.length || 0})</div>
      ${user.payments?.length
        ? `<div class="detail-list">${user.payments.map(p => `
            <div class="detail-list-item">
              <span class="detail-list-item-title">${formatCurrency(p.amount || 0)}</span>
              <span class="badge badge--${p.status || 'pending'}">${capitalize(p.status || 'pending')}</span>
            </div>`).join('')}</div>`
        : '<div class="detail-empty">No payments</div>'}
    </div>
  `;
}

function openDetailDrawer() {
  document.getElementById('detailDrawer').classList.add('open');
  document.getElementById('detailOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDetailDrawer() {
  document.getElementById('detailDrawer').classList.remove('open');
  document.getElementById('detailOverlay').classList.remove('open');
  document.body.style.overflow = '';
}


/* ══════════════════════════════════════════
   MODAL
══════════════════════════════════════════ */

function showModal(title, message, type, callback) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').innerHTML = message;
  const confirmBtn = document.getElementById('modalConfirm');

  if (type === 'danger') {
    confirmBtn.className = 'modal-btn modal-btn--danger';
    confirmBtn.textContent = 'Delete';
  } else {
    confirmBtn.className = 'modal-btn modal-btn--confirm';
    confirmBtn.textContent = 'Confirm';
  }

  confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('open');
}

function hideModal() {
  document.getElementById('confirmModal').classList.remove('open');
  confirmCallback = null;
}


/* ══════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════ */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icons = {
    success: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
    error: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
    info: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>'
  };

  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3500);
}


/* ══════════════════════════════════════════
   UTILITY HELPERS
══════════════════════════════════════════ */

function escapeHtml(str) {
  return (str + '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function formatCurrency(amount) {
  if (amount === 0) return '0 DZD';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount) + ' DZD';
}

function getRoleColorClass(role) {
  switch (role) {
    case 'admin':     return 'user-avatar-wrap--purple';
    case 'organizer': return 'user-avatar-wrap--orange';
    default:          return 'user-avatar-wrap--slate';
  }
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  target = parseInt(target) || 0;
  if (target === 0) { el.textContent = '0'; return; }

  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    el.textContent = current.toLocaleString();
  }, 25);
}
