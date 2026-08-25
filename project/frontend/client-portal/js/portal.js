// Tech Turf Client Connect Portal Controller (Admin Mission Control Theme)
(function () {
  const token = localStorage.getItem('client_token');
  if (!token && !window.location.pathname.endsWith('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  const clientInfo = JSON.parse(localStorage.getItem('client_info') || '{}');

  const portalApp = {
    currentView: 'home',
    chatInterval: null,
    workspaceProjects: [],
    workspaceReports: [],
    selectedProjectId: null,
    activeChannels: [],
    currentConversationId: null,

    getClientInfo() {
      try {
        return JSON.parse(localStorage.getItem('client_info') || '{}');
      } catch (e) {
        return {};
      }
    },

    getClientId() {
      const info = this.getClientInfo();
      return info.id || null;
    },

    init() {
      // Set top bar and sidebar client details
      const info = this.getClientInfo();
      const name = info.name || 'Client Partner';
      const company = info.company || 'Corporate Client';
      const loginId = info.client_login_id || 'TT-CLI-00000';
      const initial = (name || 'C')[0].toUpperCase();

      const profileNameEl = document.getElementById('profile-client-name');
      if (profileNameEl) profileNameEl.textContent = name;

      const profileCompEl = document.getElementById('profile-client-company');
      if (profileCompEl) profileCompEl.textContent = company;

      const sidebarTagEl = document.getElementById('topbar-client-id-sidebar');
      if (sidebarTagEl) sidebarTagEl.textContent = loginId;

      const navNameEl = document.getElementById('nav-client-name');
      if (navNameEl) navNameEl.textContent = name;

      const navCompEl = document.getElementById('nav-client-company');
      if (navCompEl) navCompEl.textContent = company;

      const navAvatarEl = document.getElementById('nav-avatar-badge');
      if (navAvatarEl) navAvatarEl.textContent = initial;

      // Restore collapsed sidebar state
      if (localStorage.getItem('client_sidebar_collapsed') === 'true') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('collapsed');
      }

      // Keyboard shortcut (Ctrl+K or Cmd+K) to focus search
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          const search = document.getElementById('portal-global-search');
          if (search) search.focus();
        }
      });

      // Close notification dropdown when clicking outside
      document.addEventListener('click', (e) => {
        const notifDropdown = document.getElementById('notification-dropdown');
        if (notifDropdown && !e.target.closest('#notification-bell')) {
          notifDropdown.classList.remove('show');
        }
      });

      // Listen for hash routing
      window.addEventListener('hashchange', () => this.handleRouting());
      this.handleRouting();

      // Bind all form submissions and interactive widgets
      this.bindForms();
      this.bindStarRating();
    },

    toggleSidebarCollapse() {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      const isCollapsed = sidebar.classList.toggle('collapsed');
      localStorage.setItem('client_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    },

    copyClientId() {
      const info = this.getClientInfo();
      const loginId = info.client_login_id || 'TT-CLI-00000';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(loginId).then(() => {
          showToast(`Client ID copied: ${loginId}`, 'success');
        });
      } else {
        showToast(`Client ID: ${loginId}`, 'info');
      }
    },

    toggleNotificationDropdown(event) {
      if (event) event.stopPropagation();
      const dropdown = document.getElementById('notification-dropdown');
      if (!dropdown) return;
      dropdown.classList.toggle('show');
      if (dropdown.classList.contains('show')) {
        this.renderNotificationsList();
      }
    },

    markAllNotificationsRead() {
      const badge = document.getElementById('notification-badge');
      if (badge) badge.style.display = 'none';
      const list = document.getElementById('notification-list');
      if (list) list.innerHTML = '<div class="notif-empty-state"><i class="fas fa-check-circle" style="color:#22c55e; margin-right:6px;"></i> All caught up!</div>';
      showToast('All notifications marked as read', 'info');
    },

    renderNotificationsList() {
      const list = document.getElementById('notification-list');
      if (!list) return;

      const items = [
        { icon: 'fa-shield-alt', text: 'Secure encryption active for client data.', time: 'Live' },
        { icon: 'fa-layer-group', text: 'Mission Control synced with active deliverables.', time: 'Today' },
        { icon: 'fa-comments', text: 'Real-time support channel ready in Communication Hub.', time: 'Ongoing' }
      ];

      list.innerHTML = items.map(n => `
        <div class="notif-item">
          <div class="notif-icon"><i class="fas ${n.icon}"></i></div>
          <div>
            <div class="notif-text">${n.text}</div>
            <div class="notif-time">${n.time}</div>
          </div>
        </div>
      `).join('');
    },

    toggleMobileSidebar() {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('mobile-open');
    },

    handleRouting() {
      const hash = window.location.hash.substring(1) || 'home';
      const views = ['home', 'workspace', 'reviews', 'communication', 'payments', 'support'];
      
      if (!views.includes(hash)) {
        window.location.hash = 'home';
        return;
      }

      this.currentView = hash;

      // Stop chat polling if leaving communication view
      if (hash !== 'communication') {
        this.stopChatPolling();
      }

      // Close mobile sidebar on navigation
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');

      // Update sidebar active state
      views.forEach(v => {
        const navEl = document.getElementById(`nav-${v}`);
        if (navEl) navEl.classList.remove('active');
        
        const viewEl = document.getElementById(`view-${v}`);
        if (viewEl) viewEl.classList.remove('active');
      });

      const activeNav = document.getElementById(`nav-${hash}`);
      if (activeNav) activeNav.classList.add('active');

      const activeView = document.getElementById(`view-${hash}`);
      if (activeView) activeView.classList.add('active');

      // Update titles
      const viewTitles = {
        home: { title: 'CONNECT HUB OVERVIEW', breadcrumb: 'CLIENT CONNECT / OVERVIEW' },
        workspace: { title: 'PROJECT WORKSPACE & DELIVERABLES', breadcrumb: 'WORKSPACE / ENGAGEMENTS' },
        reviews: { title: 'CLIENT REVIEW CENTER', breadcrumb: 'FEEDBACK / REVIEWS' },
        communication: { title: 'COMMUNICATION HUB', breadcrumb: 'CONNECT / LIVE MESSENGER' },
        payments: { title: 'INVOICES & FINANCIAL LEDGER', breadcrumb: 'FINANCIAL / BILLING' },
        support: { title: 'SUPPORT & SERVICE TICKETS', breadcrumb: 'SERVICE / TICKETS' }
      };

      const meta = viewTitles[hash] || { title: hash.toUpperCase(), breadcrumb: `CLIENT CONNECT / ${hash.toUpperCase()}` };
      const titleEl = document.getElementById('header-view-title');
      if (titleEl) titleEl.textContent = meta.title;

      const breadcrumbEl = document.getElementById('page-breadcrumb');
      if (breadcrumbEl) breadcrumbEl.innerHTML = `<i class="fas fa-cubes"></i> ${meta.breadcrumb}`;

      // Load active view data
      this.loadViewData(hash);
    },

    refreshCurrentView() {
      this.loadViewData(this.currentView);
      this.showToast('Synchronized with live matrix', 'info');
    },

    async loadViewData(view) {
      try {
        if (view === 'home') {
          const data = await clientApi.get('/home');
          this.renderBanners(data.banners);
          this.renderActiveProjects(data.projects);
          this.updateHudMetrics(data.projects?.length || 0);
        } else if (view === 'workspace') {
          const data = await clientApi.get('/workspace');
          this.renderWorkspace(data.projects, data.reports);
          this.populateReviewProjectsDropdown(data.projects);
        } else if (view === 'reviews') {
          const wsData = await clientApi.get('/workspace');
          this.populateReviewProjectsDropdown(wsData.projects);
          const reviews = await clientApi.get('/reviews');
          this.renderReviews(reviews);
        } else if (view === 'communication') {
          await this.loadChatMessages();
          this.startChatPolling();
          const meetRes = await clientApi.get('/meetings');
          this.renderMeetings(meetRes.meetings, meetRes.allowed_hosts);
        } else if (view === 'payments') {
          const data = await clientApi.get('/payments');
          this.renderPayments(data.contract, data.payments);
        } else if (view === 'support') {
          const tickets = await clientApi.get('/tickets');
          this.renderTickets(tickets);
        }
      } catch (err) {
        this.showToast(err.message || 'Failed to sync view data', 'error');
      }
    },

    async updateHudMetrics(activeProjCount) {
      try {
        const hudProj = document.getElementById('hud-active-projects');
        if (hudProj) hudProj.textContent = activeProjCount;

        const ws = await clientApi.get('/workspace').catch(() => ({}));
        const hudDeliv = document.getElementById('hud-deliverables-count');
        if (hudDeliv) hudDeliv.textContent = ws.reports?.length || 0;

        const pay = await clientApi.get('/payments').catch(() => ({}));
        const paidCount = (pay.payments || []).filter(p => p.status === 'paid' || p.status === 'completed').length;
        const hudPay = document.getElementById('hud-invoices-paid');
        if (hudPay) hudPay.textContent = paidCount;

        const tix = await clientApi.get('/tickets').catch(() => ([]));
        const openCount = Array.isArray(tix) ? tix.filter(t => t.status === 'open' || t.status === 'in_progress').length : 0;
        const hudTix = document.getElementById('hud-open-tickets');
        if (hudTix) hudTix.textContent = openCount;
      } catch (e) {}
    },

    // ==========================================
    // 1. HOME VIEW RENDERERS
    // ==========================================
    renderBanners(banners) {
      const container = document.getElementById('banners-list');
      if (!container) return;

      if (!banners || banners.length === 0) {
        container.innerHTML = `
          <div class="banner-card" style="background-image: linear-gradient(135deg, #102a96, #1e3a8a);">
            <div class="banner-content">
              <h2 class="banner-title">Welcome to Tech Turf Command Hub</h2>
              <p style="font-size:0.86rem; color:rgba(255,255,255,0.85); max-width:600px;">
                Access real-time project milestone tracking, direct engineering chat channels, and verified deliverable documents in high fidelity.
              </p>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = banners.map(b => `
        <div class="banner-card" style="background-image: url('${b.image_url || 'https://images.unsplash.com/photo-1542744094-3a31f103e35f?auto=format&fit=crop&w=800&q=80'}');">
          <div class="banner-content">
            <h2 class="banner-title">${b.title}</h2>
            ${b.link_url ? `<a href="${b.link_url}" target="_blank" class="btn-primary" style="margin-top:10px; font-size:0.75rem; padding:6px 14px;">LEARN MORE</a>` : ''}
          </div>
        </div>
      `).join('');
    },

    renderActiveProjects(projects) {
      const container = document.getElementById('home-active-projects');
      if (!container) return;

      if (!projects || projects.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px; text-align: center;">
            <i class="fas fa-rocket" style="font-size: 2.2rem; color: var(--accent-primary); opacity: 0.4; margin-bottom: 10px; display: block;"></i>
            <div class="empty-title" style="font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; color: var(--text-primary);">No Active Projects Found</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px;">Your assigned projects will appear here once provisioned by Tech Turf.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = projects.map(p => {
        const pct = p.progress_percent || 0;
        return `
          <div class="project-item-card" style="padding: 18px 22px; border-radius: 14px; border: 1px solid rgba(16,42,150,0.08); background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.02); transition: all 0.25s ease;">
            <div class="project-info-block" style="flex: 1; min-width: 240px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span class="badge ${p.status === 'completed' ? 'badge-completed' : 'badge-active'}" style="font-size: 0.65rem; padding: 2px 8px;">
                  <span class="pulse-dot" style="width:5px; height:5px; background:currentColor;"></span>
                  ${(p.status || 'ACTIVE').toUpperCase()}
                </span>
                <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">
                  <i class="far fa-calendar-alt" style="margin-right: 3px;"></i> ${p.deadline ? `Target: ${p.deadline}` : 'Agile Sprint'}
                </span>
              </div>
              <div class="project-name" style="font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 4px;">
                ${p.title}
              </div>
              <div style="font-size: 0.78rem; color: #64748b;">
                ${p.description ? p.description.slice(0, 90) + (p.description.length > 90 ? '...' : '') : 'Active strategic development engagement.'}
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
              <div class="progress-wrap" style="width: 160px;">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:800; margin-bottom:5px;">
                  <span style="color:#64748b; font-size:0.7rem;">PROGRESS</span>
                  <span style="color:var(--accent-primary);">${pct}%</span>
                </div>
                <div class="progress-track" style="height:7px; background:#f1f5f9; border-radius:10px; overflow:hidden;">
                  <div class="progress-fill" style="width: ${pct}%; background: linear-gradient(90deg, #102a96, #3b82f6); border-radius:10px; height:100%;"></div>
                </div>
              </div>
              <button onclick="portalApp.openProjectWorkspace(${p.id})" class="btn-primary" style="font-size:0.78rem; padding:8px 16px; border-radius:8px;">
                <span>View Workspace</span> <i class="fas fa-arrow-right" style="margin-left:4px;"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    openProjectWorkspace(id) {
      window.location.hash = 'workspace';
      setTimeout(() => {
        this.selectProject(id);
      }, 100);
    },

    // ==========================================
    // 2. WORKSPACE VIEW RENDERERS
    // ==========================================
    renderWorkspace(projects, reports) {
      this.workspaceProjects = projects || [];
      this.workspaceReports = reports || [];

      const pContainer = document.getElementById('workspace-projects-list');
      if (!pContainer) return;

      if (this.workspaceProjects.length === 0) {
        pContainer.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><div class="empty-title">No Project Workspaces Available</div></div>';
        document.getElementById('workspace-detail-body').innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:30px;">No project data found.</div>';
      } else {
        pContainer.innerHTML = this.workspaceProjects.map((p, idx) => `
          <div class="project-item-card ${this.selectedProjectId === p.id || (!this.selectedProjectId && idx === 0) ? 'selected' : ''}" 
               id="proj-card-${p.id}" 
               style="cursor:pointer;" 
               onclick="portalApp.selectProject(${p.id})">
            <div class="project-info-block" style="flex:1;">
              <div class="project-name">${p.title}</div>
              <div class="project-sub">
                <span class="badge ${p.status === 'completed' ? 'badge-completed' : 'badge-active'}">${p.status}</span>
                <span>${p.priority?.toUpperCase() || 'NORMAL'}</span>
              </div>
            </div>
            <div style="font-size:0.85rem; color:var(--accent-primary); font-weight:700;">
              ${p.progress_percent || 0}%
            </div>
          </div>
        `).join('');

        const defaultId = this.selectedProjectId || this.workspaceProjects[0].id;
        this.selectProject(defaultId);
      }

      this.renderDeliverablesTable(this.workspaceReports);
    },

    selectProject(id) {
      this.selectedProjectId = id;
      const proj = this.workspaceProjects.find(p => p.id === id);
      if (!proj) return;

      // Update selected class
      document.querySelectorAll('.project-item-card').forEach(el => el.classList.remove('selected'));
      const activeEl = document.getElementById(`proj-card-${id}`);
      if (activeEl) activeEl.classList.add('selected');

      const detailBody = document.getElementById('workspace-detail-body');
      if (!detailBody) return;

      const teamHtml = proj.team && proj.team.length > 0 
        ? proj.team.map(t => `
            <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:#f8fafc; border:1px solid var(--border-subtle); border-radius:var(--radius-xs);">
              <div style="width:28px; height:28px; border-radius:50%; background:var(--accent-gradient); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem;">
                ${(t.name || 'U')[0].toUpperCase()}
              </div>
              <div>
                <div style="font-weight:700; font-size:0.82rem; color:var(--text-primary);">${t.name}</div>
                <div style="font-size:0.68rem; color:var(--accent-primary); text-transform:uppercase; font-weight:600;">${t.role}</div>
              </div>
            </div>
          `).join('')
        : '<div style="font-size:0.78rem; color:var(--text-muted);">Dedicated engineering squad assigned</div>';

      detailBody.innerHTML = `
        <div style="margin-bottom:18px;">
          <h2 style="font-family:var(--font-display); font-size:1.3rem; font-weight:800; color:var(--text-primary); margin-bottom:6px;">
            ${proj.title}
          </h2>
          <p style="font-size:0.86rem; color:var(--text-secondary); line-height:1.5;">
            ${proj.description || 'Comprehensive strategic deliverable track.'}
          </p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:20px;">
          <div style="background:#f8fafc; border:1px solid var(--border-subtle); padding:10px; border-radius:var(--radius-xs);">
            <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Status</div>
            <div style="font-size:0.85rem; font-weight:700; color:#16a34a; margin-top:2px;">${proj.status?.toUpperCase()}</div>
          </div>
          <div style="background:#f8fafc; border:1px solid var(--border-subtle); padding:10px; border-radius:var(--radius-xs);">
            <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Priority</div>
            <div style="font-size:0.85rem; font-weight:700; color:var(--accent-secondary); margin-top:2px;">${proj.priority?.toUpperCase() || 'NORMAL'}</div>
          </div>
          <div style="background:#f8fafc; border:1px solid var(--border-subtle); padding:10px; border-radius:var(--radius-xs);">
            <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Target Date</div>
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${proj.deadline || 'Flexible'}</div>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; margin-bottom:6px;">
            <span>Project Velocity</span>
            <span style="color:var(--accent-primary);">${proj.progress_percent || 0}%</span>
          </div>
          <div class="progress-track" style="height:10px;">
            <div class="progress-fill" style="width:${proj.progress_percent || 0}%;"></div>
          </div>
        </div>

        <div>
          <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px; margin-bottom:10px;">
            Assigned Tech Turf Team
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px;">
            ${teamHtml}
          </div>
        </div>
      `;
    },

    renderDeliverablesTable(reports) {
      const tbody = document.getElementById('workspace-reports-tbody');
      if (!tbody) return;

      if (!reports || reports.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">
              <i class="fas fa-file-invoice" style="font-size:1.8rem; margin-bottom:8px; display:block; color:var(--border);"></i>
              No verified deliverable reports published yet. Once milestone deliverables are approved, they will appear here.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = reports.map(r => `
        <tr>
          <td style="font-weight:700; color:var(--text-primary);">
            <i class="fas fa-file-pdf" style="color:#ef4444; margin-right:8px;"></i>
            ${r.report_title || 'Deliverable Document'}
          </td>
          <td>${r.project_title || 'General Engagement'}</td>
          <td><span class="badge" style="background:#f1f5f9; color:var(--text-secondary);">${r.version ? `v${r.version}` : 'v1.0'}</span></td>
          <td>${r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent'}</td>
          <td><span class="badge badge-active">VERIFIED</span></td>
          <td style="text-align:right;">
            <a href="${r.file_path && r.file_path !== '#' ? r.file_path : 'javascript:void(0)'}" 
               target="_blank" 
               class="btn-secondary" 
               style="padding:5px 12px; font-size:0.75rem;"
               ${!r.file_path || r.file_path === '#' ? 'onclick="portalApp.showToast(\'Deliverable archived in cloud ledger\', \'info\')"' : ''}>
              <i class="fas fa-download"></i> View File
            </a>
          </td>
        </tr>
      `).join('');
    },

    // ==========================================
    // 3. REVIEWS VIEW RENDERERS
    // ==========================================
    populateReviewProjectsDropdown(projects) {
      const select = document.getElementById('review-project-select');
      if (!select || !projects) return;

      select.innerHTML = '<option value="">Choose an active engagement...</option>' + 
        projects.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
    },

    renderReviews(reviews) {
      const container = document.getElementById('reviews-history-container');
      if (!container) return;

      if (!reviews || reviews.length === 0) {
        container.innerHTML = `
          <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); background: #ffffff; border-radius: 16px; border: 1px solid var(--border-subtle);">
            <i class="far fa-star" style="font-size: 2.2rem; opacity: 0.3; margin-bottom: 12px; display: block; color: var(--accent-primary);"></i>
            <div style="font-family: var(--font-display); font-weight: 800; font-size: 1.05rem; color: var(--text-primary);">No Feedback Logged Yet</div>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">Submitted reviews are verified and synchronized live with the leadership command matrix.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = reviews.map(rev => {
        const rating = Number(rev.rating) || 5;
        const dateStr = rev.created_at ? new Date(rev.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

        return `
          <div style="background: #ffffff; border: 1px solid rgba(16,42,150,0.08); border-radius: 14px; padding: 18px 20px; margin-bottom: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.03); transition: all 0.2s ease;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
              <div>
                <span style="display:inline-flex; align-items:center; gap:6px; background:rgba(16,42,150,0.06); color:var(--accent-primary); padding:3px 10px; border-radius:6px; font-size:0.72rem; font-weight:800;">
                  <i class="fas fa-folder-open"></i> ${rev.project_title || 'Core Engagement'}
                </span>
              </div>
              <div style="display:inline-flex; align-items:center; gap:4px; background:rgba(245,158,11,0.12); color:#b45309; border:1px solid rgba(245,158,11,0.25); padding:3px 8px; border-radius:12px; font-weight:800; font-size:0.75rem;">
                <i class="fas fa-star" style="color:#f59e0b;"></i> ${rating}.0
              </div>
            </div>

            <div style="background: #f8fafc; border: 1px solid rgba(16,42,150,0.05); border-radius: 10px; padding: 12px 14px; font-size: 0.84rem; color: #334155; line-height: 1.45; margin-bottom: 10px; font-style: italic;">
              "${rev.feedback_text || 'Excellent engagement velocity and execution.'}"
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:#94a3b8;">
              <span><i class="fas fa-shield-check" style="color:#22c55e; margin-right:4px;"></i> Verified Client Review</span>
              <span>${dateStr}</span>
            </div>
          </div>
        `;
      }).join('');
    },

    bindStarRating() {
      const container = document.getElementById('star-rating-container');
      const label = document.getElementById('star-sentiment-label');
      if (!container) return;

      const sentiments = {
        1: '1.0 ★ Needs Attention',
        2: '2.0 ★ Fair Performance',
        3: '3.0 ★ Satisfactory Standard',
        4: '4.0 ★ High Standard & Precision',
        5: '5.0 ★ Exceptional Delight'
      };

      const stars = container.querySelectorAll('.star');
      stars.forEach(s => {
        s.addEventListener('mouseenter', () => {
          const rating = parseInt(s.getAttribute('data-rating') || '5');
          stars.forEach(st => {
            const r = parseInt(st.getAttribute('data-rating'));
            st.classList.toggle('active', r <= rating);
          });
          if (label) label.textContent = sentiments[rating] || `${rating}.0 ★`;
        });

        s.addEventListener('click', () => {
          const rating = parseInt(s.getAttribute('data-rating') || '5');
          document.getElementById('selected-rating-value').value = rating;
          stars.forEach(st => {
            const r = parseInt(st.getAttribute('data-rating'));
            st.classList.toggle('active', r <= rating);
          });
          if (label) label.textContent = sentiments[rating] || `${rating}.0 ★`;
        });
      });

      container.addEventListener('mouseleave', () => {
        const curRating = parseInt(document.getElementById('selected-rating-value')?.value || '5');
        stars.forEach(st => {
          const r = parseInt(st.getAttribute('data-rating'));
          st.classList.toggle('active', r <= curRating);
        });
        if (label) label.textContent = sentiments[curRating] || `${curRating}.0 ★`;
      });

      // Default 5 stars
      stars.forEach(st => st.classList.add('active'));
    },

    // ==========================================
    // 4. COMMUNICATION / MESSENGER RENDERERS
    // ==========================================
    async loadChatMessages(targetConvId = null) {
      try {
        const convParam = targetConvId || this.currentConversationId;
        const url = convParam ? `/messages?conversation_id=${convParam}` : '/messages';
        const response = await clientApi.get(url);
        
        this.activeChannels = response.channels || [];
        this.currentConversationId = response.conversationId;

        // Update hidden input
        const convInput = document.getElementById('active-chat-conversation-id');
        if (convInput) convInput.value = response.conversationId || '';

        // Render channels sidebar list
        this.renderChannelsList(this.activeChannels, response.conversationId);

        // Update active channel header & participants
        const activeCh = response.channel || this.activeChannels[0];
        if (activeCh) {
          const titleEl = document.getElementById('chat-header-title');
          if (titleEl) titleEl.textContent = activeCh.title;

          const subEl = document.getElementById('chat-header-sub');
          if (subEl) {
            subEl.innerHTML = `
              <span class="pulse-dot" style="display:inline-block; width:6px; height:6px; background:#22c55e; border-radius:50%;"></span>
              <span>${activeCh.type === 'admin' ? 'Direct Admin Channel' : 'Project Team Squad'}</span>
            `;
          }

          const avatarEl = document.getElementById('chat-header-avatar');
          if (avatarEl) {
            avatarEl.innerHTML = activeCh.type === 'admin' ? '<i class="fas fa-user-shield"></i>' : '<i class="fas fa-users-cog"></i>';
          }
        }

        // Render participant badges
        const badgesContainer = document.getElementById('chat-participants-badges');
        if (badgesContainer) {
          const participants = response.participants || [];
          if (participants.length === 0) {
            badgesContainer.innerHTML = '<span style="font-style:italic;">Direct Support Squad</span>';
          } else {
            badgesContainer.innerHTML = participants.map(p => `
              <span style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; background:#ffffff; border:1px solid var(--border-subtle); border-radius:12px; font-size:0.68rem; font-weight:600; color:var(--text-primary);">
                <i class="fas ${p.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}" style="color:${p.role === 'admin' ? '#102a96' : '#f59e0b'}; font-size:0.62rem;"></i>
                ${p.name} <span style="color:var(--text-muted); font-size:0.6rem;">(${p.role})</span>
              </span>
            `).join('');
          }
        }

        // Render message stream
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        const messages = response.messages || [];
        if (messages.length === 0) {
          container.innerHTML = `
            <div style="text-align:center; color:var(--text-muted); padding:40px 20px;">
              <i class="fas fa-comments" style="font-size:2rem; margin-bottom:10px; display:block; color:var(--border);"></i>
              <div style="font-weight:700; color:var(--text-primary);">Channel Channel Ready</div>
              <div style="font-size:0.78rem; margin-top:4px;">Messages sent here are securely routed only to verified squad members.</div>
            </div>
          `;
          return;
        }

        const currentClientId = this.getClientId();
        container.innerHTML = messages.map(m => {
          const isClient = Number(m.sender_client_id) === Number(currentClientId) || (m.sender_role === 'client') || (!m.sender_id && m.sender_client_id);
          const time = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          
          return `
            <div class="chat-bubble ${isClient ? 'client-msg' : 'team-msg'}">
              <div style="font-size:0.72rem; font-weight:700; margin-bottom:2px; opacity:0.9;">
                ${isClient ? 'You' : (m.sender_name || 'Staff')} ${!isClient && m.sender_role ? `• ${m.sender_role}` : ''}
              </div>
              <div>${m.message}</div>
              <div class="chat-meta">${time}</div>
            </div>
          `;
        }).join('');

        container.scrollTop = container.scrollHeight;
      } catch (err) {
        console.error('Load chat error:', err);
      }
    },

    renderChannelsList(channels, activeId) {
      const container = document.getElementById('comm-channels-list');
      if (!container) return;

      if (!channels || channels.length === 0) {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted);">No channels available.</div>';
        return;
      }

      container.innerHTML = channels.map(ch => {
        const isActive = ch.id === activeId;
        const icon = ch.type === 'admin' ? 'fa-user-shield' : 'fa-users-cog';
        const badgeColor = ch.type === 'admin' ? 'background:rgba(16,42,150,0.1); color:#102a96;' : 'background:rgba(255,107,0,0.1); color:#ea580c;';
        
        return `
          <div style="padding:10px 12px; border-radius:var(--radius-sm); border:1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background:${isActive ? 'rgba(16,42,150,0.04)' : '#ffffff'}; cursor:pointer; transition:all 0.2s ease;"
               onclick="portalApp.switchChannel(${ch.id})">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="font-weight:700; font-size:0.82rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                <i class="fas ${icon}" style="color:${ch.type === 'admin' ? 'var(--accent-primary)' : 'var(--accent-secondary)'}; font-size:0.78rem;"></i>
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${ch.title}</span>
              </div>
              <span style="font-size:0.6rem; font-weight:700; padding:2px 6px; border-radius:4px; ${badgeColor}">
                ${ch.badge || 'CHAT'}
              </span>
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${ch.last_message ? `${ch.last_message.sender}: ${ch.last_message.text}` : ch.description}
            </div>
          </div>
        `;
      }).join('');
    },

    switchChannel(conversationId) {
      this.currentConversationId = conversationId;
      this.loadChatMessages(conversationId);
    },

    startChatPolling() {
      this.stopChatPolling();
      this.chatInterval = setInterval(async () => {
        if (this.currentView === 'communication') {
          this.loadChatMessages(this.currentConversationId);
          try {
            const meetRes = await clientApi.get('/meetings');
            this.renderMeetings(meetRes.meetings, meetRes.allowed_hosts);
          } catch (_) {}
        }
      }, 4000);
    },

    stopChatPolling() {
      if (this.chatInterval) {
        clearInterval(this.chatInterval);
        this.chatInterval = null;
      }
    },

    renderMeetings(meetings, allowedHosts) {
      // Populate host dropdown with only allowed hosts
      const hostSelect = document.getElementById('meeting-host-select');
      if (hostSelect && allowedHosts && allowedHosts.length > 0) {
        hostSelect.innerHTML = allowedHosts.map(h => `
          <option value="${h.id}">${h.name} (${h.role.toUpperCase()})</option>
        `).join('');
      }

      const container = document.getElementById('scheduled-meetings-list');
      if (!container) return;

      if (!meetings || meetings.length === 0) {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:14px; background:#f8fafc; border-radius:var(--radius-xs); text-align:center; border:1px dashed var(--border-subtle);"><i class="far fa-calendar-times" style="margin-right:6px;"></i>No syncs requested yet.</div>';
        return;
      }

      container.innerHTML = meetings.map(m => {
        const rawStatus = (m.status || 'pending').toLowerCase();
        let statusBadgeClass = 'badge-pending';
        let statusText = 'PENDING APPROVAL';
        let borderAccent = '#f59e0b';

        if (rawStatus === 'approved' || rawStatus === 'confirmed') {
          statusBadgeClass = 'badge-active';
          statusText = 'CONFIRMED / SCHEDULED';
          borderAccent = '#22c55e';
        } else if (rawStatus === 'completed') {
          statusBadgeClass = 'badge-active';
          statusText = 'COMPLETED';
          borderAccent = '#3b82f6';
        } else if (rawStatus === 'cancelled' || rawStatus === 'rejected') {
          statusBadgeClass = 'badge-urgent';
          statusText = 'CANCELLED';
          borderAccent = '#ef4444';
        }

        const dateStr = m.scheduled_at 
          ? new Date(m.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
          : 'To Be Decided';

        const gmeetLink = m.meeting_link;
        const hostNotes = m.host_notes;
        const cleanDesc = m.clean_description;

        return `
          <div style="padding: 12px 14px; background: #ffffff; border: 1px solid var(--border-subtle); border-left: 4px solid ${borderAccent}; border-radius: var(--radius-xs); box-shadow: 0 2px 8px rgba(0,0,0,0.03); margin-bottom: 8px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 6px; gap:8px;">
              <div style="font-weight: 800; font-size: 0.88rem; color: var(--text-primary); line-height: 1.3;">
                ${m.title}
              </div>
              <span class="badge ${statusBadgeClass}" style="font-size: 0.62rem; padding: 2px 8px; font-weight: 800; text-transform: uppercase; white-space:nowrap;">
                ${statusText}
              </span>
            </div>

            <div style="display:flex; align-items:center; gap:6px; font-size: 0.76rem; color: var(--accent-primary); font-weight: 700; margin-bottom: 6px;">
              <i class="far fa-clock"></i> <span>${dateStr}</span>
            </div>

            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 8px;">
              Host: <strong style="color:var(--text-primary);">${m.team_leader_name || 'Tech Turf Lead'}</strong>
              ${m.team_leader_role ? ` (${m.team_leader_role.toUpperCase()})` : ''}
            </div>

            ${cleanDesc ? `
              <div style="font-size: 0.72rem; color: #475569; background: #f8fafc; padding: 6px 10px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
                <i class="fas fa-align-left" style="color:var(--accent-primary); margin-right:4px;"></i> ${cleanDesc}
              </div>
            ` : ''}

            ${hostNotes ? `
              <div style="font-size: 0.72rem; color: #1e3a8a; background: #eff6ff; padding: 6px 10px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #bfdbfe;">
                <i class="fas fa-comment-dots" style="color:#2563eb; margin-right:4px;"></i> <strong>Staff Note:</strong> ${hostNotes}
              </div>
            ` : ''}

            <!-- Google Meet / Video Conference Link -->
            <div style="padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
              ${gmeetLink ? `
                <a href="${gmeetLink}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex; align-items:center; gap:6px; padding: 6px 14px; font-size: 0.75rem; text-decoration: none; border-radius: 6px; background: linear-gradient(135deg, #00897b, #004d40); color: #ffffff; font-weight: 700; box-shadow: 0 2px 6px rgba(0, 137, 123, 0.3);">
                  <i class="fas fa-video"></i> <span>Join Google Meet</span>
                </a>
              ` : `
                <span style="font-size: 0.7rem; color: #94a3b8; display:flex; align-items:center; gap:5px;">
                  <i class="fas fa-video-slash"></i> Video link will be provided upon confirmation
                </span>
              `}
            </div>
          </div>
        `;
      }).join('');
    },

    // ==========================================
    // 5. PAYMENTS & BILLING RENDERERS
    // ==========================================
    renderPayments(contract, payments) {
      const contractEl = document.getElementById('payment-contract-card');
      if (contractEl) {
        contractEl.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Master Agreement</div>
              <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${contract?.agreement || 'Tech Turf Commercial Terms'}</div>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Payment Terms</div>
              <div style="font-size:0.82rem; color:var(--text-secondary);">${contract?.payment_terms || 'Net 15 / Milestone-based disbursement'}</div>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Intellectual Property</div>
              <div style="font-size:0.82rem; color:var(--text-secondary);">${contract?.ownership || 'Full IP Transfer upon final settlement'}</div>
            </div>
            <div style="padding-top:10px; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:0.82rem;">Contract Status</span>
              <span class="badge badge-active"><i class="fas fa-check-circle"></i> ACTIVE</span>
            </div>
          </div>
        `;
      }

      const tbody = document.getElementById('payments-history-tbody');
      if (!tbody) return;

      if (!payments || payments.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">
              <i class="fas fa-receipt" style="font-size:1.8rem; margin-bottom:8px; display:block; color:var(--border);"></i>
              No billing entries recorded in statement ledger.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = payments.map(p => `
        <tr>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">
            #INV-${String(p.id).padStart(5, '0')}
          </td>
          <td>${p.description || 'Milestone Delivery Payment'}</td>
          <td style="font-weight:700; color:var(--text-primary); font-family:var(--font-mono);">
            ${p.currency || 'USD'} ${Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </td>
          <td>${p.payment_date || (p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A')}</td>
          <td><span class="badge" style="background:#f1f5f9; color:var(--text-secondary);">${p.method || 'Bank Wire'}</span></td>
          <td>
            <span class="badge ${p.status === 'paid' || p.status === 'completed' ? 'badge-active' : 'badge-pending'}">
              ${p.status ? p.status.toUpperCase() : 'COMPLETED'}
            </span>
          </td>
        </tr>
      `).join('');
    },

    generateStatement() {
      window.print();
    },

    // ==========================================
    // 6. SUPPORT TICKETS RENDERERS
    // ==========================================
    renderTickets(tickets) {
      const tbody = document.getElementById('tickets-list-tbody');
      if (!tbody) return;

      if (!tickets || tickets.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">
              <i class="fas fa-ticket-alt" style="font-size:1.8rem; margin-bottom:8px; display:block; color:var(--border);"></i>
              No support tickets raised. Submit a ticket on the left whenever assistance is needed.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = tickets.map(t => {
        const pClass = t.priority === 'urgent' ? 'badge-urgent' : (t.priority === 'low' ? 'badge-completed' : 'badge-pending');
        const sClass = t.status === 'resolved' || t.status === 'closed' ? 'badge-active' : 'badge-pending';
        return `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">
              #TCK-${String(t.id).padStart(4, '0')}
            </td>
            <td style="font-weight:600; color:var(--text-primary);">${t.title}</td>
            <td><span class="badge" style="background:#f1f5f9; color:var(--text-secondary);">${t.category || 'General'}</span></td>
            <td><span class="badge ${pClass}">${t.priority?.toUpperCase() || 'NORMAL'}</span></td>
            <td><span class="badge ${sClass}">${t.status?.toUpperCase() || 'OPEN'}</span></td>
            <td>${t.created_at ? new Date(t.created_at).toLocaleDateString() : 'Recent'}</td>
          </tr>
        `;
      }).join('');
    },

    // ==========================================
    // EVENT BINDINGS
    // ==========================================
    bindForms() {
      // 1. Review submission
      const reviewForm = document.getElementById('review-form');
      if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const projectId = document.getElementById('review-project-select').value;
          const rating = document.getElementById('selected-rating-value').value;
          const feedback = document.getElementById('review-text').value;

          try {
            await clientApi.post('/reviews', {
              project_id: projectId,
              rating: parseInt(rating),
              feedback_text: feedback
            });
            this.showToast('Review submitted successfully! Thank you.', 'success');
            reviewForm.reset();
            this.loadViewData('reviews');
          } catch (err) {
            this.showToast(err.message || 'Failed to submit review', 'error');
          }
        });
      }

      // 2. Schedule meeting
      const meetingForm = document.getElementById('meeting-form');
      if (meetingForm) {
        meetingForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const hostId = document.getElementById('meeting-host-select').value;
          const title = document.getElementById('meeting-title').value;
          const time = document.getElementById('meeting-time').value;
          const desc = document.getElementById('meeting-desc').value;

          try {
            await clientApi.post('/meetings', {
              team_leader_id: hostId ? Number(hostId) : undefined,
              title,
              scheduled_at: time,
              description: desc
            });
            this.showToast('Sync proposed! Awaiting confirmation.', 'success');
            meetingForm.reset();
            const meetRes = await clientApi.get('/meetings');
            this.renderMeetings(meetRes.meetings, meetRes.allowed_hosts);
          } catch (err) {
            this.showToast(err.message || 'Failed to propose meeting', 'error');
          }
        });
      }

      // 3. Send chat message
      const chatForm = document.getElementById('chat-input-form');
      if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = document.getElementById('chat-message-input');
          const text = input.value.trim();
          if (!text) return;

          const convId = document.getElementById('active-chat-conversation-id').value;

          input.value = '';
          try {
            await clientApi.post('/messages', {
              conversation_id: convId ? Number(convId) : undefined,
              message: text
            });
            this.loadChatMessages(this.currentConversationId);
          } catch (err) {
            this.showToast(err.message || 'Failed to send message', 'error');
          }
        });
      }

      // 4. Create support ticket
      const ticketForm = document.getElementById('ticket-form');
      if (ticketForm) {
        ticketForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = document.getElementById('ticket-title').value;
          const category = document.getElementById('ticket-category').value;
          const priority = document.getElementById('ticket-priority').value;
          const desc = document.getElementById('ticket-desc').value;

          try {
            await clientApi.post('/tickets', {
              title,
              category,
              priority,
              description: desc
            });
            this.showToast('Support ticket logged in Mission Control!', 'success');
            ticketForm.reset();
            this.loadViewData('support');
          } catch (err) {
            this.showToast(err.message || 'Support ticket submission failed', 'error');
          }
        });
      }

      // 5. Create squad group
      const squadGroupForm = document.getElementById('form-create-squad-group');
      if (squadGroupForm) {
        squadGroupForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = document.getElementById('squad-group-title').value.trim();
          const projectId = document.getElementById('squad-group-project-select').value;
          const checkedStaff = Array.from(document.querySelectorAll('.squad-staff-checkbox:checked')).map(cb => Number(cb.value));

          if (!title) return;

          try {
            const res = await clientApi.post('/groups', {
              title,
              project_id: projectId ? Number(projectId) : undefined,
              participant_ids: checkedStaff
            });
            this.showToast('Squad group channel created successfully!', 'success');
            document.getElementById('modal-create-squad-group').style.display = 'none';
            squadGroupForm.reset();
            if (res.conversationId) {
              this.currentConversationId = res.conversationId;
            }
            this.loadChatMessages(this.currentConversationId);
          } catch (err) {
            this.showToast(err.message || 'Failed to create squad group', 'error');
          }
        });
      }
    },

    async openNewSquadGroupModal() {
      const modal = document.getElementById('modal-create-squad-group');
      if (!modal) return;

      modal.style.display = 'flex';

      // 1. Populate Projects Dropdown
      const projSelect = document.getElementById('squad-group-project-select');
      if (projSelect) {
        try {
          const projs = await clientApi.get('/projects');
          const list = Array.isArray(projs) ? projs : (projs.projects || []);
          projSelect.innerHTML = '<option value="">-- General Account Squad --</option>' + 
            list.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
        } catch (e) {
          projSelect.innerHTML = '<option value="">-- General Account Squad --</option>';
        }
      }

      // 2. Populate Allowed Staff List
      const staffList = document.getElementById('squad-group-staff-list');
      if (staffList) {
        staffList.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:6px;"><i class="fas fa-spinner fa-spin"></i> Loading squad members...</div>';
        try {
          const meetRes = await clientApi.get('/meetings');
          const hosts = meetRes.allowed_hosts || [];
          if (!hosts.length) {
            staffList.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:6px;">No additional squad members assigned.</div>';
          } else {
            staffList.innerHTML = hosts.map(h => `
              <label style="display:flex; align-items:center; gap:8px; font-size:0.78rem; color:var(--text-primary); cursor:pointer; padding:4px 6px; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="squad-staff-checkbox" value="${h.id}" checked style="accent-color:var(--accent-primary); width:15px; height:15px;">
                <span style="font-weight:600;">${h.name}</span>
                <span class="badge" style="font-size:0.65rem; background:rgba(16,42,150,0.1); color:#102a96;">${h.role}</span>
              </label>
            `).join('');
          }
        } catch (e) {
          staffList.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted);">Admins will automatically be included in your squad group.</div>';
        }
      }
    },

    filterWorkspace(query) {
      const q = (query || '').toLowerCase().trim();
      if (!q) {
        this.renderDeliverablesTable(this.workspaceReports);
        return;
      }

      const filtered = this.workspaceReports.filter(r => 
        (r.report_title && r.report_title.toLowerCase().includes(q)) ||
        (r.project_title && r.project_title.toLowerCase().includes(q))
      );
      this.renderDeliverablesTable(filtered);
    },

    logout() {
      localStorage.removeItem('client_token');
      localStorage.removeItem('client_info');
      window.location.href = 'login.html';
    },

    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `<span style="font-weight:600;">${message}</span>`;
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
  };

  window.portalApp = portalApp;

  document.addEventListener('DOMContentLoaded', () => {
    portalApp.init();
  });
})();
