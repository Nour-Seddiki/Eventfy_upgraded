/**
 * EVENTFY — ORGANIZER DASHBOARD PAGE LOGIC
 * Fetches real events from the backend for the logged-in organizer.
 * Includes secondary role guard (API-backed) after the DOM-level guard.
 */
(function () {
  'use strict';

  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=280&h=160&fit=crop';

  // SVG icon helpers
  const calSVG   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
  const pinSVG   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.686 2 6 4.686 6 8c0 5.25 6 13 6 13s6-7.75 6-13c0-3.314-2.686-6-6-6z"/><circle cx="12" cy="8" r="2"/></svg>`;
  const eyeSVG   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const editSVG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const trashSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
  const plusSVG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const settingSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return 'TBD';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch { return iso; }
  }

  /* ── Currency formatter ── */
  /* Currency formatting delegated to currencyUtils.js */
  function fmtMoney(amount, currency) {
    if (!amount || amount <= 0) {
      return typeof formatCurrencyValue === 'function' ? formatCurrencyValue(0, currency || 'DZD') : '0.00 DZD';
    }
    return displayPrice(amount, currency || 'DZD');
  }

  /* ── Deadline status ── */
  function getDeadlineStatus(deadline) {
    if (!deadline) return null;
    const now = new Date();
    const dl = new Date(deadline);
    if (dl < now) return { label: 'Registration Closed', cls: 'badge-closed' };
    const hoursLeft = (dl - now) / 3600000;
    if (hoursLeft < 24) return { label: `Closes in ${Math.ceil(hoursLeft)}h`, cls: 'badge-closing' };
    return { label: 'Registration Open', cls: 'badge-open' };
  }

  /* ── Render event list ── */
  function renderEvents(events) {
    const list = document.getElementById('orgEventsList');
    if (!list) return;

    // Update header stats if they exist
    const totalEl = document.getElementById('orgTotalEvents');
    if (totalEl) totalEl.textContent = events.length;

    // Calculate aggregate stats
    const totalRevenueDisplay = document.getElementById('totalRevenueDisplay');
    const totalTicketsSoldDisplay = document.getElementById('totalTicketsSoldDisplay');
    let totalRevenue = 0;
    let totalTicketsSold = 0;
    
    events.forEach(ev => {
      totalRevenue += (ev.revenue || 0);
      totalTicketsSold += (ev.tickets_sold || 0);
    });

    if (totalRevenueDisplay) totalRevenueDisplay.textContent = fmtMoney(totalRevenue);
    if (totalTicketsSoldDisplay) totalTicketsSoldDisplay.textContent = totalTicketsSold.toString();

    if (events.length === 0) {
      list.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#94a3b8;">
          <div style="font-size:40px;margin-bottom:12px;">📅</div>
          <h3 style="color:#64748b;font-weight:600;margin:0 0 8px;font-size:16px;">No events yet</h3>
          <p style="margin:0 0 16px;font-size:13px;max-width:280px;margin-left:auto;margin-right:auto;line-height:1.5;">Click <strong style="color:#7f0df2;">+ Create Event</strong> above to get started and build your community!</p>
        </div>`;
      return;
    }

    list.innerHTML = events.map(ev => {
      const status = (ev.status || 'pending').toLowerCase();
      const badgeClass = status === 'approved' ? 'badge-approved' : 'badge-pending';
      const badgeText  = status === 'approved' ? 'Approved' : 'Pending';

      // Date display — prefer start_date, fallback to date
      const displayDate = ev.start_date || ev.date;
      const endDateStr = ev.end_date ? ` — ${formatDate(ev.end_date)}` : '';

      // Deadline badge
      const dlStatus = getDeadlineStatus(ev.registration_deadline);
      const dlBadgeHTML = dlStatus
        ? `<span class="${dlStatus.cls}" style="font-size:11px;padding:2px 8px;border-radius:6px;font-weight:600;">${dlStatus.label}</span>`
        : '';

      // Currency-aware revenue
      const evCurrency = ev.currency || getUserCurrency();

      return `
        <article class="org-event-card" data-id="${ev.id}">
          <img class="org-event-thumb"
               src="${ev.image || FALLBACK_IMG}"
               alt="${ev.title || 'Event'}"
               onerror="this.src='${FALLBACK_IMG}'"/>
          <div class="org-event-info">
            <div class="org-event-top">
              <h3 class="org-event-title">${ev.title || 'Untitled Event'}</h3>
              <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div class="org-event-meta">
              <span class="org-event-meta-item">${calSVG} ${formatDate(displayDate)}${endDateStr}</span>
              <span class="org-event-meta-item">${pinSVG} ${ev.location || 'Location TBD'}</span>
            </div>
            <div class="org-event-stats" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; font-size:13px; color:#64748b; font-weight:500;">
              <span style="background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0;">Tickets Sold: <strong style="color:#1e293b;">${ev.tickets_sold || 0}</strong></span>
              <span style="background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0;">Revenue: <strong style="color:#1e293b;">${fmtMoney(ev.revenue || 0, evCurrency)}</strong></span>
              ${ev.requires_approval ? '<span style="background:#ede9fe; padding:4px 8px; border-radius:6px; border:1px solid #ddd6fe; color:#7c3aed; font-weight:600;">📋 Approval Required</span>' : ''}
              ${dlBadgeHTML}
            </div>
            <div class="org-event-divider"></div>
            <div class="org-event-actions">
              <a href="../index.html#/event/${ev.id}" class="btn-action btn-action-view">
                ${eyeSVG} View
              </a>
              <button class="btn-action btn-action-form-builder" data-id="${ev.id}" data-title="${ev.title || ''}" title="Edit Registration Form">
                ${plusSVG} Form
              </button>
              <button class="btn-action btn-action-attendees" data-id="${ev.id}" data-title="${ev.title || ''}" title="View Attendees" style="color:#0ea5e9;">
                👥 Attendees
              </button>
              ${ev.requires_approval ? `<button class="btn-action btn-action-registrations" data-id="${ev.id}" data-title="${ev.title || ''}" title="View Registrations" style="color:#7c3aed;">
                ${eyeSVG} Registrations
              </button>` : ''}
              <button class="btn-action btn-action-manage" data-id="${ev.id}" data-date="${displayDate || ''}" data-capacity="${ev.available_tickets || 0}">
                ${settingSVG} Manage
              </button>
              <button class="btn-action btn-action-scan" data-id="${ev.id}" data-title="${ev.title || ''}" title="Scan QR Tickets" style="color:#22c55e;">
                📱 Scan
              </button>
              <a href="../new Event/index.html?editId=${ev.id}" class="btn-action btn-action-edit">
                ${editSVG} Edit
              </a>
              <button class="btn-action btn-action-delete" data-id="${ev.id}">
                ${trashSVG} Delete
              </button>
            </div>
          </div>
        </article>`;
    }).join('');

    // Wire delete buttons
    list.querySelectorAll('.btn-action-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eventId = btn.dataset.id;
        const isConfirmed = await window.showConfirmModal(
          'Are you sure? You will lose the access to it and all your revenue will be lost.',
          'Delete Event',
          'Cancel',
          'danger'
        );
        if (!isConfirmed) return;
        btn.disabled = true;
        try {
          await deleteEvent(eventId);
          const card = list.querySelector(`[data-id="${eventId}"]`);
          if (card) {
            card.style.transition = 'opacity .3s, transform .3s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => { card.remove(); }, 300);
          }
          showToast('Event deleted ✓');
        } catch (e) {
          showToast('Could not delete event. Please try again.', false);
          btn.disabled = false;
        }
      });
    });

    // Wire manage buttons
    list.querySelectorAll('.btn-action-manage').forEach(btn => {
      btn.addEventListener('click', () => {
        const eventId = btn.dataset.id;
        const eventDate = btn.dataset.date;
        const capacity = btn.dataset.capacity;
        openQuickManageModal(eventId, eventDate, capacity);
      });
    });

    // Wire form builder buttons
    list.querySelectorAll('.btn-action-form-builder').forEach(btn => {
      btn.addEventListener('click', () => {
        openFormBuilderModal(btn.dataset.id, btn.dataset.title);
      });
    });

    // Wire registrations buttons
    list.querySelectorAll('.btn-action-registrations').forEach(btn => {
      btn.addEventListener('click', () => {
        openRegistrationsModal(btn.dataset.id, btn.dataset.title);
      });
    });

    // Wire attendees buttons
    list.querySelectorAll('.btn-action-attendees').forEach(btn => {
      btn.addEventListener('click', () => {
        openAttendeesModal(btn.dataset.id, btn.dataset.title);
      });
    });

    // Wire QR scanner buttons
    list.querySelectorAll('.btn-action-scan').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof openQRScanner === 'function') {
          openQRScanner(btn.dataset.id, btn.dataset.title);
        } else {
          showToast('QR scanner not available', false);
        }
      });
    });
  }

  /* ── Show spinner ── */
  function showSpinner() {
    const list = document.getElementById('orgEventsList');
    if (list) list.innerHTML = `
      <div style="text-align:center;padding:48px;color:#94a3b8;">
        <div style="width:36px;height:36px;border:3px solid #e2e8f0;border-top-color:#7f0df2;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px;"></div>
        Loading your events…
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </div>`;
  }

  /* ── Toast ── */
  function showToast(msg, ok = true) {
    let t = document.getElementById('org-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'org-toast';
      t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;z-index:9999;transition:opacity .3s;opacity:0;color:#fff;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? '#1e293b' : '#dc2626';
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.style.opacity = '0', 3000);
  }

  /* ── Load events from API ── */
  async function loadOrgEvents() {
    showSpinner();
    try {
      // Secondary role check via API (catches stale cache)
      const profile = await fetchMyProfile();
      setCachedUser(profile);
      const role = (profile.role || '').toLowerCase();
      if (role && role !== 'organizer') {
        // Organizers only; admins moderate events from the admin panel
        window.location.href = role === 'admin' ? '../Admin/admin.html' : '../index.html#/profile';
        return;
      }

      // Populate organizer name in the dashboard header
      const nameEl = document.getElementById('orgName');
      if (nameEl) {
        nameEl.textContent = profile.full_name || profile.username || 'Organizer';
      }

      const events = await fetchMyEvents();
      const evArray = Array.isArray(events) ? events : (events.events || events.items || []);
      renderEvents(evArray);
    } catch (err) {
      const list = document.getElementById('orgEventsList');
      if (list) list.innerHTML = `
        <div style="text-align:center;padding:48px;color:#f87171;">
          <p style="margin:0 0 12px;">Failed to load your events.</p>
          <button onclick="location.reload()" style="background:transparent;border:1px solid #f87171;color:#f87171;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;">Retry</button>
        </div>`;
    }
  }

  /* ── Create Event button ── */
  document.getElementById('createEventBtn')?.addEventListener('click', () => {
    window.location.href = '../new Event/index.html';
  });

  /* ── Quick Manage Modal Logic ── */
  const qmModal = document.getElementById('quickManageModal');
  const qmForm = document.getElementById('quickManageForm');
  
  function openQuickManageModal(eventId, dateStr, capacity) {
    if (!qmModal) return;
    document.getElementById('quickManageEventId').value = eventId;
    
    // Convert UTC/ISO date to local datetime-local format (YYYY-MM-DDThh:mm)
    let formattedDate = '';
    if (dateStr && dateStr !== 'undefined') {
      try {
        const d = new Date(dateStr);
        // adjust for timezone offset
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        formattedDate = d.toISOString().slice(0, 16);
      } catch (e) {}
    }
    
    document.getElementById('qmDate').value = formattedDate;
    document.getElementById('qmCapacity').value = capacity || '';
    
    qmModal.style.display = 'flex';
  }

  function closeQuickManageModal() {
    if (qmModal) qmModal.style.display = 'none';
  }

  document.getElementById('closeQuickManageBtn')?.addEventListener('click', closeQuickManageModal);
  document.getElementById('cancelQuickManageBtn')?.addEventListener('click', closeQuickManageModal);

  // Close when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === qmModal) {
      closeQuickManageModal();
    }
  });

  qmForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('saveQuickManageBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    const eventId = document.getElementById('quickManageEventId').value;
    const dateInput = document.getElementById('qmDate').value;
    const capacityInput = document.getElementById('qmCapacity').value;
    
    try {
      // Need to format datetime-local string to ISO if necessary. 
      // Input value format: "2026-04-25T14:30"
      const isoDate = dateInput ? new Date(dateInput).toISOString() : null;
      
      const payload = {
        start_date: isoDate,
        available_tickets: parseInt(capacityInput, 10)
      };

      await updateEvent(eventId, payload);
      showToast('Event updated successfully!');
      closeQuickManageModal();
      
      // Reload events to show fresh stats and updated info
      loadOrgEvents();
    } catch (err) {
      showToast(err.message || 'Failed to update event', false);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });

  /* ═══════════════════════════════════════════
     FORM BUILDER MODAL
     ═══════════════════════════════════════════ */
  const QUESTION_TYPES = [
    { value: 'short_text', label: 'Short Text' },
    { value: 'long_text', label: 'Long Text' },
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'yes_no', label: 'Yes / No' },
  ];
  const PROFILE_FIELDS = [
    { value: '', label: '— None (custom question) —' },
    { value: 'phone', label: 'Phone Number' },
    { value: 'full_name', label: 'Full Name' },
    { value: 'university', label: 'University' },
    { value: 'major', label: 'Major / Field of Study' },
    { value: 'dietary_restrictions', label: 'Dietary Restrictions' },
    { value: 'date_of_birth', label: 'Date of Birth' },
    { value: 'gender', label: 'Gender' },
    { value: 'location', label: 'Location' },
    { value: 'bio', label: 'Bio' },
  ];

  async function openFormBuilderModal(eventId, eventTitle) {
    // Remove existing modal if any
    document.getElementById('formBuilderOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'formBuilderOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width:640px;max-height:85vh;overflow-y:auto;">
        <div class="modal-header">
          <div>
            <h3>📋 Form Builder</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:2px;">${eventTitle || 'Event'}</p>
          </div>
          <button class="modal-close-btn" id="closeFormBuilder" aria-label="Close">✕</button>
        </div>
        <div id="formBuilderBody" style="padding:16px;">
          <div style="text-align:center;padding:24px;color:#94a3b8;">Loading questions…</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('closeFormBuilder').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const body = document.getElementById('formBuilderBody');
    let questions = [];

    try {
      const existing = await fetchEventQuestions(eventId);
      questions = (existing || []).map((q, i) => ({ ...q, _idx: i }));
    } catch { /* fresh form */ }

    renderFormBuilder(body, questions, eventId, overlay);
  }

  function renderFormBuilder(container, questions, eventId, overlay) {
    function render() {
      let html = '';

      if (questions.length === 0) {
        html += `<div style="text-align:center;padding:24px 16px;color:#94a3b8;font-size:14px;">
          <div style="font-size:32px;margin-bottom:8px;">📝</div>
          No questions yet. Add your first question below.
        </div>`;
      }

      questions.forEach((q, idx) => {
        const typeOpts = QUESTION_TYPES.map(t => `<option value="${t.value}" ${t.value === q.question_type ? 'selected' : ''}>${t.label}</option>`).join('');
        const profileOpts = PROFILE_FIELDS.map(p => `<option value="${p.value}" ${p.value === (q.profile_field_key || '') ? 'selected' : ''}>${p.label}</option>`).join('');

        html += `
          <div class="fb-question" data-idx="${idx}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font-size:12px;font-weight:700;color:#94a3b8;">QUESTION ${idx + 1}</span>
              <button class="fb-remove-btn" data-idx="${idx}" style="font-size:18px;color:#ef4444;background:none;border:none;cursor:pointer;padding:4px;" title="Remove">✕</button>
            </div>
            <input type="text" class="fb-label" data-idx="${idx}" value="${escapeAttr(q.label || '')}" placeholder="Question text…" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:8px;font-family:inherit;" />
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
              <select class="fb-type" data-idx="${idx}" style="padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;">${typeOpts}</select>
              <select class="fb-profile" data-idx="${idx}" style="padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;">${profileOpts}</select>
            </div>
            ${q.question_type === 'multiple_choice' ? `
              <input type="text" class="fb-options" data-idx="${idx}" value="${escapeAttr(q._optionsStr || tryParseOptions(q.options_json))}" placeholder="Options (comma-separated)" style="width:100%;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:8px;font-family:inherit;" />
            ` : ''}
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;cursor:pointer;">
              <input type="checkbox" class="fb-required" data-idx="${idx}" ${q.is_required !== false ? 'checked' : ''} style="accent-color:#7c3aed;" />
              Required
            </label>
          </div>
        `;
      });

      html += `
        <button id="fbAddQuestion" style="width:100%;padding:12px;border:2px dashed #d1d5db;border-radius:12px;color:#7c3aed;font-weight:600;font-size:14px;cursor:pointer;background:transparent;transition:background .2s;">+ Add Question</button>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button id="fbSaveBtn" class="btn-primary" style="flex:1;justify-content:center;">Save Form</button>
          <button id="fbCancelBtn" class="btn-secondary" style="padding:10px 22px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;font-size:14px;cursor:pointer;">Cancel</button>
        </div>
      `;

      container.innerHTML = html;

      // Wire events
      container.querySelectorAll('.fb-remove-btn').forEach(btn => {
        btn.onclick = () => { questions.splice(parseInt(btn.dataset.idx), 1); render(); };
      });

      container.querySelectorAll('.fb-type').forEach(sel => {
        sel.onchange = () => {
          syncFromUI();
          render();
        };
      });

      document.getElementById('fbAddQuestion').onclick = () => {
        syncFromUI();
        questions.push({ question_type: 'short_text', label: '', is_required: true, profile_field_key: '', display_order: questions.length });
        render();
      };

      document.getElementById('fbCancelBtn').onclick = () => overlay.remove();

      document.getElementById('fbSaveBtn').onclick = async () => {
        syncFromUI();
        // Validate
        const invalid = questions.find(q => !q.label.trim());
        if (invalid) { showToast('Please fill in all question labels', false); return; }

        const btn = document.getElementById('fbSaveBtn');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
          const payload = questions.map((q, i) => ({
            question_type: q.question_type,
            label: q.label.trim(),
            options_json: q.question_type === 'multiple_choice'
              ? JSON.stringify((q._optionsStr || '').split(',').map(s => s.trim()).filter(Boolean))
              : null,
            is_required: q.is_required,
            profile_field_key: q.profile_field_key || null,
            display_order: i,
          }));
          await saveEventQuestions(eventId, payload);
          showToast('Form saved ✓');
          overlay.remove();
          loadOrgEvents(); // Refresh to show approval badge
        } catch (err) {
          showToast(err.message || 'Failed to save form', false);
          btn.disabled = false;
          btn.textContent = 'Save Form';
        }
      };
    }

    function syncFromUI() {
      container.querySelectorAll('.fb-label').forEach(el => {
        questions[parseInt(el.dataset.idx)].label = el.value;
      });
      container.querySelectorAll('.fb-type').forEach(el => {
        questions[parseInt(el.dataset.idx)].question_type = el.value;
      });
      container.querySelectorAll('.fb-profile').forEach(el => {
        questions[parseInt(el.dataset.idx)].profile_field_key = el.value;
      });
      container.querySelectorAll('.fb-required').forEach(el => {
        questions[parseInt(el.dataset.idx)].is_required = el.checked;
      });
      container.querySelectorAll('.fb-options').forEach(el => {
        questions[parseInt(el.dataset.idx)]._optionsStr = el.value;
      });
    }

    render();
  }

  function tryParseOptions(json) {
    try { return JSON.parse(json || '[]').join(', '); } catch { return ''; }
  }
  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }


  /* ═══════════════════════════════════════════
     REGISTRATIONS MODAL (Approval Dashboard)
     ═══════════════════════════════════════════ */
  async function openRegistrationsModal(eventId, eventTitle) {
    document.getElementById('registrationsOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'registrationsOverlay';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width:720px;max-height:85vh;overflow-y:auto;">
        <div class="modal-header">
          <div>
            <h3>👥 Registrations</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:2px;">${eventTitle || 'Event'}</p>
          </div>
          <button class="modal-close-btn" id="closeRegistrations" aria-label="Close">✕</button>
        </div>
        <div style="padding:12px 16px 4px;display:flex;gap:6px;flex-wrap:wrap;" id="regFilterBar">
          <button class="reg-filter-btn active" data-filter="">All</button>
          <button class="reg-filter-btn" data-filter="pending">🟡 Pending</button>
          <button class="reg-filter-btn" data-filter="approved">🟢 Approved</button>
          <button class="reg-filter-btn" data-filter="rejected">🔴 Rejected</button>
        </div>
        <div id="registrationsBody" style="padding:16px;">
          <div id="regSummaryBar" style="display:none;padding:0 0 12px;display:flex;gap:8px;flex-wrap:wrap;"></div>
          <div id="regListContent" style="text-align:center;padding:24px;color:#94a3b8;">Loading…</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('closeRegistrations').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Filter buttons
    let currentFilter = '';
    overlay.querySelectorAll('.reg-filter-btn').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('.reg-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        loadRegistrations();
      };
      // Inline style for filter buttons
      btn.style.cssText = 'padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;cursor:pointer;transition:all .2s;';
    });
    // Active button style
    const activeStyle = () => {
      overlay.querySelectorAll('.reg-filter-btn').forEach(b => {
        if (b.classList.contains('active')) {
          b.style.background = '#ede9fe';
          b.style.color = '#7c3aed';
          b.style.borderColor = '#ddd6fe';
        } else {
          b.style.background = '#f8fafc';
          b.style.color = '#64748b';
          b.style.borderColor = '#e2e8f0';
        }
      });
    };
    activeStyle();

    const body = document.getElementById('registrationsBody');
    const listEl = document.getElementById('regListContent');
    const summaryBar = document.getElementById('regSummaryBar');

    async function loadRegistrations() {
      activeStyle();
      listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;">Loading…</div>';
      try {
        const regs = await fetchEventRegistrations(eventId, currentFilter || undefined);
        if (!regs || regs.length === 0) {
          summaryBar.style.display = 'none';
          listEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">No registrations found.</div>';
          return;
        }
        // Show summary counts
        const pending = regs.filter(r => r.status === 'in_processing' || r.status === 'payment_required').length;
        const approved = regs.filter(r => r.status === 'confirmed').length;
        const rejected = regs.filter(r => r.status === 'rejected').length;
        summaryBar.style.display = 'flex';
        summaryBar.innerHTML = `
          <span style="background:#fff7ed;color:#f97316;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">🟡 ${pending} Pending</span>
          <span style="background:#d1fae5;color:#10b981;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">🟢 ${approved} Approved</span>
          <span style="background:#fff5f5;color:#ef4444;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">🔴 ${rejected} Rejected</span>
          <span style="background:#f1f5f9;color:#64748b;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;">Total: ${regs.length}</span>
        `;
        renderRegistrations(listEl, regs, eventId, overlay, loadRegistrations);
      } catch (err) {
        listEl.innerHTML = `<div style="text-align:center;padding:24px;color:#ef4444;">${err.message}</div>`;
      }
    }

    loadRegistrations();
  }

  function renderRegistrations(container, regs, eventId, overlay, reloadFn) {
    const statusBadge = (s) => {
      if (s === 'confirmed') return '<span style="background:#d1fae5;color:#10b981;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">APPROVED</span>';
      if (s === 'rejected') return '<span style="background:#fff5f5;color:#ef4444;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">REJECTED</span>';
      if (s === 'payment_required') return '<span style="background:#fef3c7;color:#d97706;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">PENDING PAYMENT</span>';
      return '<span style="background:#fff7ed;color:#f97316;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">PENDING</span>';
    };

    let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    regs.forEach(reg => {
      const date = new Date(reg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      html += `
        <div class="reg-row" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;transition:all .2s;" onmouseenter="this.style.borderColor='#c4b5fd';this.style.background='#faf5ff'" onmouseleave="this.style.borderColor='#e2e8f0';this.style.background='#f8fafc'">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:#1e293b;">${reg.user_name || 'User'}</div>
            <div style="font-size:12px;color:#94a3b8;">${reg.user_email || ''} · ${date}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${statusBadge(reg.status)}
            <span style="font-size:11px;color:#94a3b8;font-weight:500;background:#f1f5f9;padding:2px 8px;border-radius:999px;">${reg.attempt_count || 1}/3</span>
          </div>
          <button class="reg-view-btn" data-id="${reg.id}" style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;background:#fff;border:1px solid #e2e8f0;cursor:pointer;color:#64748b;">View</button>
          ${reg.status === 'in_processing' ? `
            <button class="reg-approve-btn" data-id="${reg.id}" style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;background:#10b981;color:#fff;border:none;cursor:pointer;">Approve</button>
            <button class="reg-reject-btn" data-id="${reg.id}" data-attempts="${reg.attempt_count || 1}" style="padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;background:#ef4444;color:#fff;border:none;cursor:pointer;">Reject</button>
          ` : ''}
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;

    // Wire view buttons
    container.querySelectorAll('.reg-view-btn').forEach(btn => {
      btn.onclick = async () => {
        try {
          const detail = await fetchRegistrationDetail(parseInt(btn.dataset.id));
          let ansHtml = '<div style="display:flex;flex-direction:column;gap:12px;">';
          (detail.answers || []).forEach(a => {
            ansHtml += `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;">
                <div style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:4px;">${a.question_label}</div>
                <div style="font-size:14px;color:#1e293b;font-weight:500;">${a.answer_value}</div>
              </div>
            `;
          });
          ansHtml += '</div>';

          const detailOverlay = document.createElement('div');
          detailOverlay.className = 'modal-overlay';
          detailOverlay.style.display = 'flex';
          detailOverlay.style.zIndex = '1200';
          detailOverlay.innerHTML = `
            <div class="modal-content" style="max-width:480px;max-height:80vh;overflow-y:auto;">
              <div class="modal-header">
                <h3>📄 Registration Details</h3>
                <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">✕</button>
              </div>
              <div style="padding:16px;">
                <div style="margin-bottom:16px;">
                  <div style="font-weight:700;font-size:15px;color:#1e293b;">${detail.user_name || 'User'}</div>
                  <div style="font-size:13px;color:#94a3b8;">${detail.user_email || ''}</div>
                  <div style="margin-top:6px;">${statusBadge(detail.status)}</div>
                </div>
                <div style="font-weight:700;font-size:13px;color:#64748b;margin-bottom:8px;">SUBMITTED ANSWERS</div>
                ${ansHtml}
              </div>
            </div>
          `;
          document.body.appendChild(detailOverlay);
          detailOverlay.addEventListener('click', e => { if (e.target === detailOverlay) detailOverlay.remove(); });
        } catch (err) {
          showToast('Failed to load details: ' + err.message, false);
        }
      };
    });

    // Wire approve/reject buttons
    container.querySelectorAll('.reg-approve-btn').forEach(btn => {
      btn.onclick = async () => {
        const isConfirmed = await window.showConfirmModal(
          'Approve this registration? A ticket will be generated for the user.',
          'Approve',
          'Cancel',
          'warning'
        );
        if (!isConfirmed) return;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          await reviewRegistration(parseInt(btn.dataset.id), 'approve');
          showToast('Registration approved ✓');
          reloadFn();
        } catch (err) {
          showToast(err.message, false);
          btn.disabled = false;
          btn.textContent = 'Approve';
        }
      };
    });

    container.querySelectorAll('.reg-reject-btn').forEach(btn => {
      btn.onclick = async () => {
        const attemptsUsed = parseInt(btn.dataset.attempts || 1);
        const remaining = 3 - attemptsUsed;
        const confirmMsg = remaining > 0
          ? `Reject this registration? The user will have ${remaining} attempt(s) remaining to re-apply.`
          : 'Reject this registration? This is the user\'s final attempt — they will be permanently blocked from this event.';
        const isConfirmed = await window.showConfirmModal(
          confirmMsg,
          'Reject',
          'Cancel',
          'danger'
        );
        if (!isConfirmed) return;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          await reviewRegistration(parseInt(btn.dataset.id), 'reject');
          showToast('Registration rejected');
          reloadFn();
        } catch (err) {
          showToast(err.message, false);
          btn.disabled = false;
          btn.textContent = 'Reject';
        }
      };
    });


  }

  // --- ATTENDEES MODAL ---
  function openAttendeesModal(eventId, eventTitle) {
    let overlay = document.getElementById('attendeesOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'attendeesOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s;padding:20px;';
    
    overlay.innerHTML = `
      <div style="background:#fff;width:100%;max-width:700px;max-height:85vh;border-radius:24px;box-shadow:0 24px 48px rgba(0,0,0,0.2);display:flex;flex-direction:column;transform:scale(0.95);transition:transform 0.3s;">
        <div style="padding:24px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h2 style="margin:0;font-size:24px;color:#1e293b;font-weight:700;">👥 Attendees List</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:14px;">Tickets sold for <strong style="color:#1e293b;">${escHtml(eventTitle)}</strong></p>
          </div>
          <button id="closeAttendeesBtn" style="background:none;border:none;font-size:24px;color:#94a3b8;cursor:pointer;padding:8px;border-radius:50%;line-height:1;transition:background 0.2s;">✕</button>
        </div>
        
        <div id="attendeesListContainer" style="flex:1;overflow-y:auto;padding:24px 32px;background:#f8fafc;border-bottom-left-radius:24px;border-bottom-right-radius:24px;">
          <!-- Loading state -->
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.children[0].style.transform = 'scale(1)';
    });

    const close = () => {
      overlay.style.opacity = '0';
      overlay.children[0].style.transform = 'scale(0.95)';
      setTimeout(() => overlay.remove(), 300);
    };

    document.getElementById('closeAttendeesBtn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const listEl = document.getElementById('attendeesListContainer');

    async function loadAttendees() {
      listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;">Loading attendees…</div>';
      try {
        const attendees = await fetchEventAttendees(eventId);
        if (!attendees || attendees.length === 0) {
          listEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">No tickets sold yet.</div>';
          return;
        }
        
        let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
        attendees.forEach(user => {
          const date = new Date(user.purchased_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          html += `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
              <div style="width:40px;height:40px;background:#f1f5f9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;color:#1e293b;">${escHtml(user.user_name || 'Anonymous User')}</div>
                <div style="font-size:12px;color:#94a3b8;">${escHtml(user.user_email || '')} · Bought on ${date}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                ${user.status === 'used' 
                  ? '<span style="background:#f1f5f9;color:#64748b;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">CHECKED IN</span>' 
                  : user.status === 'cancelled'
                  ? '<span style="background:#fff5f5;color:#ef4444;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">CANCELLED</span>'
                  : '<span style="background:#d1fae5;color:#10b981;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">ACTIVE</span>'
                }
              </div>
            </div>
          `;
        });
        html += '</div>';
        listEl.innerHTML = html;
      } catch (err) {
        listEl.innerHTML = `<div style="text-align:center;padding:24px;color:#ef4444;">${err.message}</div>`;
      }
    }

    loadAttendees();
  }


  loadOrgEvents();
})();
