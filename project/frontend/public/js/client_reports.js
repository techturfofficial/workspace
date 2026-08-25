// Tech Turf Client Reports & Feedback Hub Controller - Modernized
const clientReportsApp = {
  currentTab: 'reviews',
  allReviews: [],
  allMeetings: [],
  allDeliverables: [],
  summaryData: {},
  clientsList: [],

  async init() {
    // Authenticate user
    const user = (window.auth && auth.getUser) ? auth.getUser() : null;
    if (user) {
      const nameEl = document.getElementById('nav-user-name');
      const roleEl = document.getElementById('nav-user-role');
      const avatarEl = document.getElementById('nav-avatar-badge');
      if (nameEl) nameEl.textContent = user.name || 'Staff Member';
      if (roleEl) roleEl.textContent = (user.role || 'Staff').toUpperCase();
      if (avatarEl) avatarEl.textContent = (user.name || 'TT').slice(0, 2).toUpperCase();
    }

    await this.loadClientsDropdown();
    await this.refreshAllData();
    this.initRealtimeStream();
  },

  async loadClientsDropdown() {
    try {
      const clients = await api.get('/clients');
      this.clientsList = clients || [];
      const select = document.getElementById('report-client-filter');
      if (select) {
        select.innerHTML = '<option value="">All Clients</option>' + 
          this.clientsList.map(c => `<option value="${c.id}">${c.name} (${c.company || 'Client'})</option>`).join('');
      }
    } catch (_) {}
  },

  async refreshAllData() {
    await Promise.all([
      this.loadSummary(),
      this.loadReviews(),
      this.loadMeetings(),
      this.loadDeliverables()
    ]);
  },

  async loadSummary() {
    try {
      const summary = await api.get('/client-reports/summary');
      this.summaryData = summary || {};
      
      const csatEl = document.getElementById('hud-csat-rating');
      const reviewsEl = document.getElementById('hud-total-reviews');
      const syncsEl = document.getElementById('hud-pending-syncs');
      const delivEl = document.getElementById('hud-total-deliverables');

      if (csatEl) csatEl.textContent = `${summary.avg_rating || '5.0'} ★`;
      if (reviewsEl) reviewsEl.textContent = summary.total_reviews || '0';
      if (syncsEl) syncsEl.textContent = summary.pending_syncs || '0';
      if (delivEl) delivEl.textContent = summary.total_deliverables || '0';

      const syncsBadge = document.getElementById('syncs-count-badge');
      if (syncsBadge) {
        if (summary.pending_syncs > 0) {
          syncsBadge.textContent = summary.pending_syncs;
          syncsBadge.style.display = 'inline-flex';
        } else {
          syncsBadge.style.display = 'none';
        }
      }

      // Analytics tab breakdown
      const csatVal = document.getElementById('analytics-csat-val');
      if (csatVal) csatVal.textContent = summary.avg_rating || '5.0';

      const totalReviews = Number(summary.total_reviews) || 0;
      const b = summary.breakdown || {};
      for (let star = 1; star <= 5; star++) {
        const count = Number(b[star]) || 0;
        const countEl = document.getElementById(`count-${star}-star`);
        const barEl = document.getElementById(`bar-${star}-star`);
        const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : (star === 5 ? 100 : 0);
        if (countEl) countEl.textContent = `${count} (${pct}%)`;
        if (barEl) barEl.style.width = `${pct}%`;
      }
    } catch (err) {
      console.error('Load summary error:', err);
    }
  },

  async loadReviews() {
    try {
      const reviews = await api.get('/client-reports/reviews');
      this.allReviews = reviews || [];
      this.renderReviews(this.allReviews);
    } catch (err) {
      console.error('Load reviews error:', err);
    }
  },

  renderReviews(reviews = []) {
    const container = document.getElementById('reviews-cards-container');
    if (!container) return;

    if (!reviews.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-muted); background:#ffffff; border-radius:18px; border:1px solid rgba(16,42,150,0.08);">
          <i class="far fa-star" style="font-size: 2.5rem; opacity: 0.35; margin-bottom: 14px; display: block; color:var(--accent-primary);"></i>
          <div style="font-family:'Outfit',sans-serif; font-weight: 800; font-size: 1.15rem; color: var(--text-primary);">No Client Reviews Recorded</div>
          <div style="font-size: 0.85rem; color:#64748b; margin-top: 6px;">Reviews submitted via Client Connect will be automatically synchronized here.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = reviews.map(r => {
      const rating = Number(r.rating) || 5;
      const initials = (r.client_name || 'C').slice(0, 2).toUpperCase();
      const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

      return `
        <div class="modern-review-card">
          <div>
            <div class="review-client-header">
              <div style="display:flex; align-items:center; gap:12px;">
                <div class="review-avatar-ring">${initials}</div>
                <div>
                  <div style="font-family:'Outfit',sans-serif; font-weight:800; font-size:1.05rem; color:var(--text-primary); line-height:1.2;">${escapeHtml(r.client_name)}</div>
                  <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${escapeHtml(r.client_company || 'Corporate Client')}</div>
                </div>
              </div>
              
              <div style="text-align:right;">
                <div class="rating-pill-gold">
                  <i class="fas fa-star"></i>
                  <span>${rating}.0</span>
                </div>
                <div style="font-size:0.68rem; color:#94a3b8; margin-top:4px; font-weight:500;">${dateStr}</div>
              </div>
            </div>

            <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(16,42,150,0.05); color:var(--accent-primary); padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; margin-bottom:8px;">
              <i class="fas fa-folder-open"></i> Project: ${escapeHtml(r.project_title || 'General Engagement')}
            </div>

            <div class="review-quote-bubble">
              ${escapeHtml(r.feedback_text || 'Excellent engagement velocity and delivery standard.')}
            </div>

            <!-- Assigned Project Squad (Team Leader & Team Members) -->
            <div style="background:#f8fafc; border:1px solid rgba(16,42,150,0.06); border-radius:10px; padding:10px 12px; margin-bottom:12px;">
              <div style="font-size:0.72rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                <i class="fas fa-users-gear" style="color:var(--accent-primary);"></i> Assigned Project Squad
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                <span style="display:inline-flex; align-items:center; gap:5px; background:rgba(255,107,0,0.1); color:#c2410c; border:1px solid rgba(255,107,0,0.25); padding:3px 8px; border-radius:6px; font-size:0.72rem; font-weight:700;">
                  <i class="fas fa-crown" style="font-size:0.65rem;"></i> Lead: ${escapeHtml(r.leader_name || 'Admin')}
                </span>
                ${(r.assigned_members && r.assigned_members.length > 0) ? r.assigned_members.map(m => `
                  <span style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; color:#334155; border:1px solid rgba(16,42,150,0.1); padding:3px 8px; border-radius:6px; font-size:0.72rem; font-weight:600;">
                    <i class="fas fa-user-check" style="font-size:0.65rem; color:#22c55e;"></i> ${escapeHtml(m.name)} <span style="font-size:0.65rem; color:#94a3b8;">(${escapeHtml(m.role || 'Member')})</span>
                  </span>
                `).join('') : '<span style="font-size:0.72rem; color:#94a3b8; font-style:italic;">Direct Lead Execution</span>'}
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(16,42,150,0.08);">
            <span style="font-size: 0.76rem; color: #64748b;">
              Project Lead: <strong style="color:var(--text-primary);">${escapeHtml(r.leader_name || 'Admin')}</strong>
            </span>
            <button class="btn-primary" onclick="window.location.href='messages.html'" style="padding: 6px 14px; font-size: 0.75rem; border-radius:8px;">
              <i class="fas fa-comment-dots"></i> Open Chat
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  async loadMeetings() {
    try {
      const meetings = await api.get('/client-reports/meetings');
      this.allMeetings = meetings || [];
      this.renderMeetings(this.allMeetings);
    } catch (err) {
      console.error('Load meetings error:', err);
    }
  },

  renderMeetings(meetings = []) {
    const container = document.getElementById('syncs-cards-container');
    if (!container) return;

    if (!meetings.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-muted); background:#ffffff; border-radius:18px; border:1px solid rgba(16,42,150,0.08);">
          <i class="far fa-calendar-alt" style="font-size: 2.5rem; opacity: 0.35; margin-bottom: 14px; display: block; color:var(--accent-primary);"></i>
          <div style="font-family:'Outfit',sans-serif; font-weight: 800; font-size: 1.15rem; color: var(--text-primary);">No Strategic Syncs Requested</div>
          <div style="font-size: 0.85rem; color:#64748b; margin-top: 6px;">Meeting proposals scheduled from Client Connect will stream live here.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = meetings.map(m => {
      let statusClass = (m.status || 'pending').toLowerCase();
      let statusLabel = statusClass.toUpperCase();
      if (statusClass === 'approved') statusLabel = 'CONFIRMED';
      const dateStr = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'To Be Decided';

      return `
        <div class="modern-sync-card ${statusClass}">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <div>
                <span class="status-chip ${statusClass}">
                  <span class="pulse-dot" style="width:6px; height:6px; background:currentColor;"></span>
                  ${statusLabel}
                </span>
                <h4 style="font-family:'Outfit',sans-serif; font-weight: 800; font-size: 1.08rem; color: var(--text-primary); margin: 8px 0 3px;">
                  ${escapeHtml(m.title)}
                </h4>
                <div style="font-size: 0.78rem; color: #64748b;">
                  Client: <strong style="color:var(--text-primary);">${escapeHtml(m.client_name)}</strong> (${escapeHtml(m.client_company || 'Corporate')})
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--accent-primary); font-weight: 700; margin: 12px 0 8px;">
              <i class="far fa-clock"></i> ${dateStr}
            </div>

            ${m.clean_description ? `
              <div style="background: #f8fafc; border: 1px solid rgba(16,42,150,0.06); border-radius: 10px; padding: 10px 12px; font-size: 0.8rem; color: #475569; line-height: 1.45; margin-bottom: 10px;">
                <i class="fas fa-align-left" style="color:var(--accent-primary); margin-right:4px;"></i> ${escapeHtml(m.clean_description)}
              </div>
            ` : ''}

            ${m.host_notes ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 12px; font-size: 0.8rem; color: #1e3a8a; line-height: 1.45; margin-bottom: 10px;">
                <i class="fas fa-comment-dots" style="color:#2563eb; margin-right:4px;"></i> <strong>Staff Note:</strong> ${escapeHtml(m.host_notes)}
              </div>
            ` : ''}

            ${m.meeting_link ? `
              <div style="margin-bottom: 12px;">
                <a href="${escapeHtml(m.meeting_link)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex; align-items:center; gap:6px; padding: 6px 14px; font-size: 0.75rem; text-decoration: none; border-radius: 8px; background: linear-gradient(135deg, #00897b, #004d40); color: #ffffff; font-weight: 700;">
                  <i class="fas fa-video"></i> Launch Google Meet
                </a>
              </div>
            ` : ''}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(16,42,150,0.08);">
            <div style="font-size: 0.76rem; color: #64748b;">
              Host: <strong style="color:var(--text-primary);">${escapeHtml(m.host_name || 'Team Lead')}</strong>
            </div>
            <button class="btn-primary" onclick="clientReportsApp.openMeetingModal(${m.id})" style="padding: 6px 14px; font-size: 0.75rem; border-radius:8px;">
              <i class="fas fa-edit"></i> Manage Sync
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  async loadDeliverables() {
    try {
      const res = await api.get('/submissions');
      this.allDeliverables = (res || []).filter(s => s.client_id || s.admin_status === 'approved');
      this.renderDeliverables(this.allDeliverables);
    } catch (_) {}
  },

  renderDeliverables(deliverables = []) {
    const tbody = document.getElementById('deliverables-tbody');
    if (!tbody) return;

    if (!deliverables.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted); font-size:0.88rem;">No approved deliverables on record yet.</td></tr>';
      return;
    }

    tbody.innerHTML = deliverables.map(d => `
      <tr>
        <td style="font-weight:700; color:var(--text-primary);"><i class="fas fa-file-contract" style="color:var(--accent-primary); margin-right:8px;"></i>${escapeHtml(d.task_title || d.title || 'Milestone Deliverable')}</td>
        <td>${escapeHtml(d.client_name || 'Client Account')}</td>
        <td><span style="font-weight:700; color:var(--accent-secondary);">${escapeHtml(d.project_title || 'Core')}</span></td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Recent'}</td>
        <td><span class="status-chip approved">APPROVED</span></td>
        <td style="text-align:right;">
          ${d.file_path ? `<a href="${d.file_path}" target="_blank" class="btn-secondary" style="padding:5px 12px; font-size:0.75rem; border-radius:8px;"><i class="fas fa-download"></i> Download</a>` : '<span style="color:var(--text-muted); font-size:0.75rem;">Signed Off</span>'}
        </td>
      </tr>
    `).join('');
  },

  switchTab(tab) {
    this.currentTab = tab;
    ['reviews', 'syncs', 'analytics', 'deliverables'].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const panel = document.getElementById(`panel-${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
      if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
  },

  applyFilters() {
    const q = (document.getElementById('report-search-filter')?.value || '').toLowerCase().trim();
    const clientId = document.getElementById('report-client-filter')?.value;
    const rating = document.getElementById('report-rating-filter')?.value;
    const syncStatus = document.getElementById('report-sync-status-filter')?.value;

    // Filter reviews
    let filteredReviews = this.allReviews;
    if (clientId) filteredReviews = filteredReviews.filter(r => String(r.client_id) === String(clientId));
    if (rating) filteredReviews = filteredReviews.filter(r => String(r.rating) === String(rating));
    if (q) {
      filteredReviews = filteredReviews.filter(r => 
        (r.client_name || '').toLowerCase().includes(q) ||
        (r.client_company || '').toLowerCase().includes(q) ||
        (r.project_title || '').toLowerCase().includes(q) ||
        (r.feedback_text || '').toLowerCase().includes(q)
      );
    }
    this.renderReviews(filteredReviews);

    // Filter meetings
    let filteredMeetings = this.allMeetings;
    if (clientId) filteredMeetings = filteredMeetings.filter(m => String(m.client_id) === String(clientId));
    if (syncStatus) {
      filteredMeetings = filteredMeetings.filter(m => {
        const s = String(m.status || '').toLowerCase();
        if (syncStatus === 'approved') return s === 'approved' || s === 'confirmed';
        return s === syncStatus.toLowerCase();
      });
    }
    if (q) {
      filteredMeetings = filteredMeetings.filter(m => 
        (m.title || '').toLowerCase().includes(q) ||
        (m.client_name || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    this.renderMeetings(filteredMeetings);
  },

  resetFilters() {
    const search = document.getElementById('report-search-filter');
    const client = document.getElementById('report-client-filter');
    const rating = document.getElementById('report-rating-filter');
    const status = document.getElementById('report-sync-status-filter');
    if (search) search.value = '';
    if (client) client.value = '';
    if (rating) rating.value = '';
    if (status) status.value = '';
    this.applyFilters();
  },

  openMeetingModal(meetingId) {
    const meeting = this.allMeetings.find(m => Number(m.id) === Number(meetingId));
    if (!meeting) return;

    document.getElementById('modal-meeting-id').value = meeting.id;
    document.getElementById('modal-meeting-status').value = meeting.status === 'confirmed' ? 'approved' : (meeting.status || 'approved');
    if (meeting.scheduled_at) {
      const dt = new Date(meeting.scheduled_at);
      const dtLocal = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('modal-meeting-datetime').value = dtLocal;
    }
    document.getElementById('modal-meeting-url').value = meeting.meeting_link || '';
    document.getElementById('modal-meeting-notes').value = meeting.host_notes || '';

    const modal = document.getElementById('modal-meeting-action');
    if (modal) modal.style.display = 'flex';
  },

  closeMeetingModal() {
    const modal = document.getElementById('modal-meeting-action');
    if (modal) modal.style.display = 'none';
  },

  async submitMeetingAction(e) {
    e.preventDefault();
    const id = document.getElementById('modal-meeting-id').value;
    const status = document.getElementById('modal-meeting-status').value;
    const scheduled_at = document.getElementById('modal-meeting-datetime').value;
    const meeting_link = document.getElementById('modal-meeting-url').value.trim();
    const host_notes = document.getElementById('modal-meeting-notes').value.trim();

    try {
      await api.put(`/client-reports/meetings/${id}/status`, {
        status,
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
        meeting_link,
        host_notes
      });
      showToast(`Meeting status updated to ${status.toUpperCase()}! Client notified.`, 'success');
      this.closeMeetingModal();
      await this.refreshAllData();
    } catch (err) {
      showToast(err.message || 'Failed to update meeting status', 'error');
    }
  },

  initRealtimeStream() {
    try {
      const token = localStorage.getItem('tt_token');
      if (!token) return;

      const es = new EventSource(`/api/messages/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('message', () => {
        this.refreshAllData();
      });
    } catch (_) {}
  },

  exportExecutiveSummary() {
    const reviews = this.allReviews;
    if (!reviews.length) {
      showToast('No client reviews to export yet.', 'info');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Client,Company,Project,Rating,Feedback,Date\n';

    reviews.forEach(r => {
      const row = [
        `"${(r.client_name || '').replace(/"/g, '""')}"`,
        `"${(r.client_company || '').replace(/"/g, '""')}"`,
        `"${(r.project_title || '').replace(/"/g, '""')}"`,
        r.rating || 5,
        `"${(r.feedback_text || '').replace(/"/g, '""')}"`,
        `"${r.created_at || ''}"`
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TechTurf_Client_Reports_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Executive Report Summary downloaded!', 'success');
  }
};

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
