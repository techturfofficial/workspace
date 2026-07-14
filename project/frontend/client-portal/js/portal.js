// Tech Turf Client Portal Application controller
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

    init() {
      // Set top bar and sidebar client details immediately
      document.getElementById('profile-client-name').textContent = clientInfo.name || 'Client Contact';
      document.getElementById('profile-client-company').textContent = clientInfo.company || 'Company Ltd.';
      document.getElementById('topbar-client-id').textContent = clientInfo.client_login_id || 'TT-CLI-XXXXX';
      document.getElementById('topbar-avatar').textContent = (clientInfo.name || 'C')[0].toUpperCase();

      // Listen for hash routing
      window.addEventListener('hashchange', () => this.handleRouting());
      this.handleRouting();

      // Setup global event listeners
      this.bindForms();
      this.bindStarRating();
    },

    handleRouting() {
      const hash = window.location.hash.substring(1) || 'home';
      const views = ['home', 'workspace', 'reviews', 'communication', 'payments', 'support', 'change-password'];
      
      if (!views.includes(hash)) {
        window.location.hash = 'home';
        return;
      }

      this.currentView = hash;

      // Stop chat polling if leaving communication view
      if (hash !== 'communication') {
        this.stopChatPolling();
      }

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

      document.getElementById('header-view-title').textContent = hash.replace('-', ' ').toUpperCase();

      // Load data corresponding to the active view
      this.loadViewData(hash);
    },

    async loadViewData(view) {
      try {
        if (view === 'home') {
          const data = await clientApi.get('/home');
          this.renderBanners(data.banners);
          this.renderActiveProjects(data.projects);
        } else if (view === 'workspace') {
          const data = await clientApi.get('/workspace');
          this.renderWorkspace(data.projects, data.reports);
          this.populateReviewProjectsDropdown(data.projects);
        } else if (view === 'reviews') {
          // If we haven't loaded projects yet, fetch them to fill dropdown
          const wsData = await clientApi.get('/workspace');
          this.populateReviewProjectsDropdown(wsData.projects);
          
          const reviews = await clientApi.get('/reviews');
          this.renderReviews(reviews);
        } else if (view === 'communication') {
          this.loadChatMessages();
          this.startChatPolling();
          
          const meetings = await clientApi.get('/meetings');
          this.renderMeetings(meetings);
        } else if (view === 'payments') {
          const data = await clientApi.get('/payments');
          this.renderPayments(data.contract, data.payments);
        } else if (view === 'support') {
          const tickets = await clientApi.get('/tickets');
          this.renderTickets(tickets);
        }
      } catch (err) {
        this.showToast(err.message || 'Failed to sync view data from secure matrix', 'error');
      }
    },

    // --- HOME VIEW RENDERERS ---
    renderBanners(banners) {
      const container = document.getElementById('banners-list');
      if (!banners || banners.length === 0) {
        container.innerHTML = `
          <div class="banner-card" style="background-image: linear-gradient(135deg, #11112b, #070714);">
            <div class="banner-content">
              <h2 class="banner-title">Welcome to Tech Turf Portal</h2>
              <p style="font-size:0.85rem; color:var(--text-secondary);">Access all details relating to your active deliveries and review updates in real time.</p>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = banners.map(b => `
        <div class="banner-card" style="background-image: url('${b.image_url || 'https://images.unsplash.com/photo-1542744094-3a31f103e35f?auto=format&fit=crop&w=600&q=80'}');">
          <div class="banner-content">
            <h2 class="banner-title">${b.title}</h2>
            ${b.link_url ? `<a href="${b.link_url}" target="_blank" class="btn-primary banner-action-btn">LEARN MORE</a>` : ''}
          </div>
        </div>
      `).join('');
    },

    renderActiveProjects(projects) {
      const container = document.getElementById('home-active-projects');
      if (!projects || projects.length === 0) {
        container.innerHTML = '<div class="empty-state">No active projects found on your portfolio</div>';
        return;
      }

      container.innerHTML = projects.map(p => `
        <div class="project-item">
          <div class="project-details">
            <span class="project-title">${p.title}</span>
            <span class="project-meta">Status: <span class="badge badge-active">${p.status}</span> • Deadline: ${p.deadline || 'Flexible'}</span>
          </div>
          <div class="progress-container">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${p.progress_percent || 0}%"></div>
            </div>
            <span class="progress-text">${p.progress_percent || 0}%</span>
          </div>
        </div>
      `).join('');
    },

    // --- WORKSPACE VIEW RENDERERS ---
    renderWorkspace(projects, reports) {
      this.workspaceProjects = projects || [];
      this.workspaceReports = reports || [];

      const pContainer = document.getElementById('workspace-projects-list');
      if (this.workspaceProjects.length === 0) {
        pContainer.innerHTML = '<div class="empty-state">No workspaces assigned to your account yet</div>';
        document.getElementById('workspace-project-details-panel').innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-folder-open"></i>
            <div class="empty-title">No projects available</div>
          </div>
        `;
        return;
      }

      pContainer.innerHTML = this.workspaceProjects.map(p => `
        <div class="project-item" id="workspace-proj-item-${p.id}" style="cursor:pointer;" onclick="portalApp.selectProject(${p.id})">
          <div class="project-details">
            <span class="project-title" style="font-size:0.95rem;">${p.title}</span>
            <span class="project-meta">Status: <span class="badge badge-${p.status}" style="font-size:0.6rem; padding:2px 6px;">${p.status}</span></span>
          </div>
        </div>
      `).join('');

      // Auto select first project
      this.selectProject(this.workspaceProjects[0].id);
    },

    selectProject(projectId) {
      // Highlight selected project item in sidebar list
      if (this.workspaceProjects) {
        this.workspaceProjects.forEach(p => {
          const item = document.getElementById(`workspace-proj-item-${p.id}`);
          if (item) {
            if (p.id === projectId) {
              item.classList.add('selected');
            } else {
              item.classList.remove('selected');
            }
          }
        });
      }

      const p = this.workspaceProjects ? this.workspaceProjects.find(proj => proj.id === projectId) : null;
      const container = document.getElementById('workspace-project-details-panel');
      if (!p || !container) return;

      // Filter reports associated with this project name
      const filteredReports = this.workspaceReports 
        ? this.workspaceReports.filter(r => (r.project_title && r.project_title.toLowerCase() === p.title.toLowerCase()))
        : [];

      // Render the project overview
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Project title -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:6px;">
              <h2 style="font-family:var(--font-display); font-size:1.5rem; font-weight:700; color:white;">${p.title}</h2>
              <span class="badge badge-${p.status}" style="font-size:0.75rem; padding:4px 12px;">${p.status}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted);">PROJECT SPEC OVERVIEW</div>
          </div>

          <!-- Description Section -->
          <div class="glass-card" style="padding:16px; border-color:rgba(255,255,255,0.06); background:rgba(255,255,255,0.01);">
            <h4 style="font-family:var(--font-display); font-size:0.85rem; color:var(--accent-secondary); margin-bottom:10px; font-weight:700;">PROJECT DESCRIPTION</h4>
            <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; margin-bottom:12px;">${p.description || 'No description has been provided for this project.'}</p>
            <div style="font-size:0.8rem; color:var(--text-muted);">Priority Class: <strong style="color:var(--accent-pink); text-transform:uppercase;">${p.priority}</strong></div>
          </div>

          <!-- Status & Metrics -->
          <div class="glass-card" style="padding:16px; border-color:rgba(255,255,255,0.06); background:rgba(255,255,255,0.01); display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items:center;">
            <div>
              <h4 style="font-family:var(--font-display); font-size:0.85rem; color:var(--accent-secondary); margin-bottom:10px; font-weight:700;">COMPLETION PROGRESS</h4>
              <div class="progress-container">
                <div class="progress-bar-bg" style="width:100%; max-width:180px;">
                  <div class="progress-bar-fill" style="width: ${p.progress_percent || 0}%"></div>
                </div>
                <span class="progress-text">${p.progress_percent || 0}%</span>
              </div>
            </div>
            <div>
              <h4 style="font-family:var(--font-display); font-size:0.85rem; color:var(--accent-secondary); margin-bottom:10px; font-weight:700;">MILESTONE DEADLINE</h4>
              <span style="font-family:var(--font-mono); font-size:0.9rem; color:white;"><i class="fa-regular fa-calendar-check" style="margin-right:6px;"></i> ${p.deadline || 'Flexible Schedule'}</span>
            </div>
          </div>

          <!-- Team Members details -->
          <div class="glass-card" style="padding:16px; border-color:rgba(255,255,255,0.06); background:rgba(255,255,255,0.01);">
            <h4 style="font-family:var(--font-display); font-size:0.85rem; color:var(--accent-secondary); margin-bottom:12px; font-weight:700;">ASSIGNED WORKFORCE</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px;">
              ${p.team && p.team.length > 0 
                ? p.team.map(m => {
                    const initial = (m.name || 'U')[0].toUpperCase();
                    return `
                      <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:8px 12px; border-radius:var(--radius-sm);">
                        <div style="width:28px; height:28px; font-size:0.75rem; border-radius:50%; background:linear-gradient(135deg, var(--accent-secondary), var(--accent-primary)); display:flex; align-items:center; justify-content:center; color:white; font-weight:700;">${initial}</div>
                        <div style="display:flex; flex-direction:column;">
                          <span style="font-size:0.85rem; font-weight:700; color:white;">${m.name}</span>
                          <span style="font-size:0.7rem; color:var(--text-muted);">${m.role}</span>
                        </div>
                      </div>
                    `;
                  }).join('')
                : `<span style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No team members assigned to this stream yet.</span>`
              }
            </div>
          </div>

          <!-- Milestone Reports / Deliverables for selected project -->
          <div class="glass-card" style="padding:16px; border-color:rgba(255,255,255,0.06); background:rgba(255,255,255,0.01);">
            <h4 style="font-family:var(--font-display); font-size:0.85rem; color:var(--accent-secondary); margin-bottom:12px; font-weight:700;">PUBLISHED REPORT LEDGER</h4>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${filteredReports.length > 0
                ? filteredReports.map(r => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.85rem;">
                      <div>
                        <strong style="color:white;">${r.report_title}</strong>
                        <span style="font-size:0.7rem; color:var(--text-muted); margin-left:8px;">v${r.version} • Approved</span>
                      </div>
                      <div style="display:flex; gap:8px;">
                        ${r.file_path && r.file_path !== '#' ? `<a href="${r.file_path}" target="_blank" class="btn-secondary" style="font-size:0.6rem; padding:4px 10px; min-height:28px;"><i class="fa-solid fa-download"></i> View</a>` : ''}
                        ${r.external_link ? `<a href="${r.external_link}" target="_blank" class="btn-primary" style="font-size:0.6rem; padding:4px 10px; min-height:28px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Link</a>` : ''}
                      </div>
                    </div>
                  `).join('')
                : `<span style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No reports published for this project yet.</span>`
              }
            </div>
          </div>
        </div>
      `;
    },

    populateReviewProjectsDropdown(projects) {
      const select = document.getElementById('review-project-select');
      if (!select) return;
      
      const currentVal = select.value;
      select.innerHTML = '<option value="">Select a project...</option>' + 
        projects.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
      select.value = currentVal;
    },

    // --- REVIEWS VIEW RENDERERS ---
    renderReviews(reviews) {
      const container = document.getElementById('reviews-history');
      if (!reviews || reviews.length === 0) {
        container.innerHTML = '<div class="empty-state">No feedback reports logged in your ledger</div>';
        return;
      }

      container.innerHTML = reviews.map(r => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
          stars += `<i class="fa-solid fa-star" style="color: ${i <= r.rating ? '#ff9f43' : 'var(--text-muted)'}; margin-right:2px;"></i>`;
        }
        return `
          <div class="project-item" style="flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:0.95rem;">${r.project_title}</span>
              <div>${stars}</div>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">"${r.feedback_text}"</p>
            <span style="font-size:0.7rem; color:var(--text-muted); align-self:flex-end;">Submitted ${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
        `;
      }).join('');
    },

    // --- CHAT MESSAGES RENDERERS & POLLING ---
    async loadChatMessages() {
      try {
        const response = await clientApi.get('/messages');
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        if (response.messages.length === 0) {
          container.innerHTML = '<div class="empty-state">Secure messaging channel initialized. Send a message to initiate contact.</div>';
          return;
        }

        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;

        container.innerHTML = response.messages.map(m => {
          const isOutgoing = m.sender_client_id !== null;
          const bubbleClass = isOutgoing ? 'outgoing' : 'incoming';
          const nameLabel = isOutgoing ? 'You' : `${m.sender_name} (${m.sender_role})`;
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return `
            <div class="message-bubble ${bubbleClass}">
              <div style="font-size:0.75rem; font-weight:700; margin-bottom:4px; opacity:0.8;">${nameLabel}</div>
              <div>${m.message}</div>
              <div class="message-meta">${time}</div>
            </div>
          `;
        }).join('');

        if (isScrolledToBottom) {
          container.scrollTop = container.scrollHeight;
        }
      } catch (err) {
        console.error('Chat messages update failed:', err.message);
      }
    },

    startChatPolling() {
      this.stopChatPolling();
      this.chatInterval = setInterval(() => this.loadChatMessages(), 4000);
    },

    stopChatPolling() {
      if (this.chatInterval) {
        clearInterval(this.chatInterval);
        this.chatInterval = null;
      }
    },

    renderMeetings(meetings) {
      const container = document.getElementById('meetings-list');
      if (!meetings || meetings.length === 0) {
        container.innerHTML = '<div class="empty-state">No scheduled meetings recorded</div>';
        return;
      }

      container.innerHTML = meetings.map(m => `
        <div class="project-item" style="padding:10px 15px; font-size:0.85rem; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700;">${m.title}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
              <i class="fa-solid fa-clock"></i> ${new Date(m.scheduled_at).toLocaleString()}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">With Lead: ${m.team_leader_name || 'Assigned Agent'}</div>
          </div>
          <span class="badge badge-${m.status}">${m.status}</span>
        </div>
      `).join('');
    },

    // --- PAYMENTS VIEW RENDERER ---
    renderPayments(contract, payments) {
      const cContainer = document.getElementById('contract-details');
      if (!contract) {
        cContainer.innerHTML = '<div class="empty-state">Failed to retrieve agreement variables</div>';
      } else {
        cContainer.innerHTML = `
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <span style="color:var(--text-secondary);">Agreement Standard</span>
            <span style="font-weight:700;">${contract.agreement || 'Standard Retainer'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <span style="color:var(--text-secondary);">Payment Terms</span>
            <span style="font-weight:700;">${contract.payment_terms || 'Net 15'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <span style="color:var(--text-secondary);">IP Ownership</span>
            <span style="font-weight:700;">${contract.ownership || 'Shared Transfer'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <span style="color:var(--text-secondary);">NDA Status</span>
            <span style="font-weight:700; color:var(--accent-green);"><i class="fa-solid fa-circle-check"></i> ${contract.nda || 'Active NDA'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <span style="color:var(--text-secondary);">Project Budget</span>
            <span style="font-weight:700; color:var(--accent-secondary);">${contract.budget || 'N/A'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding-bottom:4px;">
            <span style="color:var(--text-secondary);">Delivery Timeline</span>
            <span style="font-weight:700;">${contract.timeline || 'Flexible'}</span>
          </div>
        `;
      }

      const tbody = document.getElementById('payments-tbody');
      if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No payment receipts logged in ledger</td></tr>';
        return;
      }

      tbody.innerHTML = payments.map(p => `
        <tr>
          <td style="font-family:var(--font-mono); font-size:0.8rem;">REF-PAY-${String(p.id).padStart(5, '0')}</td>
          <td>${p.payment_date || 'Awaiting Execution'}</td>
          <td>${p.method || 'Standard Wire'}</td>
          <td>${p.notes || 'Normal Processing'}</td>
          <td style="font-weight:700; color:var(--accent-green);">${p.currency || 'USD'} $${Number(p.amount).toLocaleString()}</td>
          <td><span class="badge badge-success">RECORDED</span></td>
        </tr>
      `).join('');
    },

    generateStatement() {
      const clientName = clientInfo.name || 'Client';
      const clientCompany = clientInfo.company || 'Company';
      const ref = 'STMT-' + Math.floor(100000 + Math.random() * 900000);
      const output = `-----------------------------------------------\nTECH TURF CRM - BILLING SUMMARY\n-----------------------------------------------\nStatement ID: ${ref}\nGenerated At: ${new Date().toLocaleString()}\nClient: ${clientName}\nCompany: ${clientCompany}\n-----------------------------------------------\n* Balance Due: $0.00\n* Status: Account in good standing\n-----------------------------------------------\nThank you for choosing Tech Turf.`;
      
      const blob = new Blob([output], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${ref}.txt`;
      link.click();
      this.showToast('Account statement generated successfully', 'success');
    },

    // --- SUPPORT INCIDENTS RENDERER ---
    renderTickets(tickets) {
      const container = document.getElementById('tickets-list');
      if (!tickets || tickets.length === 0) {
        container.innerHTML = '<div class="empty-state">No active incidents or support tickets raised</div>';
        return;
      }

      container.innerHTML = tickets.map(t => `
        <div class="project-item" style="flex-direction:column; align-items:stretch; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:1rem;">${t.title}</span>
            <span class="badge badge-${t.status}">${t.status}</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${t.description}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:10px; margin-top:5px; font-size:0.75rem; color:var(--text-muted);">
            <span>Priority: <strong style="color:var(--accent-secondary); text-transform:uppercase;">${t.priority}</strong> • Category: ${t.category || 'General'}</span>
            <span>Agent: ${t.assigned_name || 'Awaiting Claim'}</span>
          </div>
        </div>
      `).join('');
    },

    // --- FORM HANDLERS AND EVENT BINDING ---
    bindForms() {
      // 1. Review feedback form
      document.getElementById('review-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const projectId = document.getElementById('review-project-select').value;
        const rating = document.getElementById('selected-rating').value;
        const feedback = document.getElementById('review-feedback').value;

        if (!projectId || !rating) {
          this.showToast('Project selection and rating required', 'error');
          return;
        }

        try {
          await clientApi.post('/reviews', {
            project_id: projectId,
            rating,
            feedback_text: feedback
          });
          this.showToast('Rapport review recorded successfully!', 'success');
          document.getElementById('review-form').reset();
          this.resetStarRating();
          this.loadViewData('reviews'); // refresh
        } catch (err) {
          this.showToast(err.message || 'Feedback log failed', 'error');
        }
      });

      // 2. Propose meeting form
      document.getElementById('meeting-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('meeting-title').value;
        const desc = document.getElementById('meeting-desc').value;
        const time = document.getElementById('meeting-time').value;

        try {
          await clientApi.post('/meetings', {
            title,
            description: desc,
            scheduled_at: time
          });
          this.showToast('Meeting slot proposed successfully!', 'success');
          document.getElementById('meeting-form').reset();
          this.loadViewData('communication'); // refresh
        } catch (err) {
          this.showToast(err.message || 'Failed to submit meeting request', 'error');
        }
      });

      // 3. Live chat send form
      document.getElementById('chat-input-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-message-input');
        const text = input.value.trim();
        if (!text) return;

        try {
          await clientApi.post('/messages', { message: text });
          input.value = '';
          this.loadChatMessages(); // update instantly
        } catch (err) {
          this.showToast('Failed to dispatch message', 'error');
        }
      });

      // 4. Incident support ticket form
      document.getElementById('ticket-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('ticket-title').value;
        const priority = document.getElementById('ticket-priority').value;
        const category = document.getElementById('ticket-category').value;
        const desc = document.getElementById('ticket-desc').value;

        try {
          await clientApi.post('/tickets', {
            title,
            priority,
            category,
            description: desc
          });
          this.showToast('Incident ticket raised successfully!', 'success');
          document.getElementById('ticket-form').reset();
          this.loadViewData('support'); // refresh
        } catch (err) {
          this.showToast(err.message || 'Support request failed', 'error');
        }
      });

      // 5. Change password form
      document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;

        if (newPass !== confirmPass) {
          this.showToast('Passwords do not match', 'error');
          return;
        }

        try {
          await clientApi.post('/change-password', { password: newPass });
          this.showToast('Password credentials updated successfully!', 'success');
          document.getElementById('change-pass-form').reset();
          window.location.hash = 'home';
        } catch (err) {
          this.showToast(err.message || 'Authentication update failed', 'error');
        }
      });
    },

    bindStarRating() {
      const container = document.getElementById('star-rating-container');
      if (!container) return;

      const stars = container.querySelectorAll('.star');
      stars.forEach(s => {
        s.addEventListener('click', () => {
          const rating = s.getAttribute('data-rating');
          document.getElementById('selected-rating').value = rating;

          // Highlights stars up to selected rating
          stars.forEach(star => {
            const val = star.getAttribute('data-rating');
            if (val <= rating) {
              star.classList.add('selected');
            } else {
              star.classList.remove('selected');
            }
          });
        });
      });
    },

    resetStarRating() {
      const container = document.getElementById('star-rating-container');
      if (!container) return;
      const stars = container.querySelectorAll('.star');
      stars.forEach(star => star.classList.remove('selected'));
      document.getElementById('selected-rating').value = '';
    },

    logout() {
      localStorage.removeItem('client_token');
      localStorage.removeItem('client_info');
      this.showToast('Session terminated.', 'info');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 500);
    },

    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `
        <span style="font-weight:600;">${message}</span>
      `;
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
