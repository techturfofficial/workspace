// Member picker state
const pickerState = {
  client: { selected: [] }
};
let allUsers = [];

async function initClients() {
  loadClients();
  initSearch();
  loadTeamLeaders();
  initPickerCloseOnOutsideClick();
  initEditForm();

  document.getElementById('new-client-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      // 1. Basic Client Information
      name: document.getElementById('client-name').value,
      company: document.getElementById('client-company').value,
      phone: document.getElementById('client-phone').value,
      phone_alt: document.getElementById('client-phone-alt').value,
      email: document.getElementById('client-email').value,
      location: document.getElementById('client-location').value,
      comm_method: document.getElementById('client-comm-method').value,
      project_key: document.getElementById('client-project-key').value,
      stage: document.getElementById('client-stage')?.value || 'new_register',

      // 2. Business Details
      industry: document.getElementById('client-industry').value,
      business_desc: document.getElementById('client-business-desc').value,
      audience: document.getElementById('client-audience').value,
      competitors: document.getElementById('client-competitors').value,
      brand_assets: document.getElementById('client-brand-assets').value,

      // 3. Project Details
      service_type: document.getElementById('client-service-type').value,
      project_desc: document.getElementById('client-project-desc').value,
      project_goals: document.getElementById('client-project-goals').value,
      features: document.getElementById('client-features').value,
      design_prefs: document.getElementById('client-design-prefs').value,
      reference_examples: document.getElementById('client-references').value,

      // 4. Technical Requirements
      platform: document.getElementById('client-platform').value,
      tech: document.getElementById('client-tech').value,
      integrations: document.getElementById('client-integrations').value,
      hosting: document.getElementById('client-hosting').value,

      // 5. Budget & Timeline
      budget: document.getElementById('client-budget').value,
      timeline: document.getElementById('client-timeline').value,
      urgency: document.getElementById('client-urgency').value,

      // 6. Content & Resources
      content: document.getElementById('client-content').value,
      media: document.getElementById('client-media').value,
      guidelines: document.getElementById('client-guidelines').value,
      credentials: document.getElementById('client-credentials').value,

      // 7. Legal & Agreement
      agreement: document.getElementById('client-agreement').value,
      payment_terms: document.getElementById('client-payment-terms').value,
      ownership: document.getElementById('client-ownership').value,
      nda: document.getElementById('client-nda').value,

      // 8. Post-Project Needs
      maintenance: document.getElementById('client-maintenance').value,
      updates: document.getElementById('client-updates').value,
      marketing: document.getElementById('client-marketing').value,

      // 9. Team members
      team_members: pickerState.client.selected.map(u => u.name).join(', '),

      // 10. Team leader
      team_leader_id: document.getElementById('client-team-leader-id').value || null
    };
    try {
      await api.post('/clients', data);
      showToast('Client added successfully', 'success');
      closeModal('new-client-modal');
      e.target.reset();
      clearPicker('client');
      loadClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function loadClients() {
  try {
    const search = document.getElementById('client-search')?.value?.trim().toLowerCase() || '';
    const clients = await api.get('/clients');
    const filtered = !search ? clients : clients.filter((client) => {
      return [client.name, client.company, client.email, client.phone].some((value) => (value || '').toLowerCase().includes(search));
    });
    const stages = ['new_register', 'order_confirmed', 'processing', 'review', 'completion'];
    const grouped = {};

    stages.forEach(stage => {
      grouped[stage] = [];
      const colCards = document.getElementById(`cards-${stage}`);
      const colCount = document.getElementById(`count-${stage}`);
      if (colCards) colCards.innerHTML = '';
      if (colCount) colCount.textContent = '0';
    });

    filtered.forEach(c => {
      const stage = stages.includes(c.stage) ? c.stage : 'new_register';
      grouped[stage].push(c);
    });

    stages.forEach(stage => {
      const colCards = document.getElementById(`cards-${stage}`);
      const colCount = document.getElementById(`count-${stage}`);
      if (!colCards) return;

      const clientsInStage = grouped[stage];
      if (colCount) colCount.textContent = clientsInStage.length;

      if (clientsInStage.length === 0) {
        colCards.innerHTML = '<div class="kanban-empty">No clients in this stage</div>';
        return;
      }

      colCards.innerHTML = clientsInStage.map(c => `
        <div class="glass-card client-card anim-fade-up" draggable="true" data-client-id="${c.id}" onclick="openClientDetail('${c.id}')">
          <div class="client-avatar">${c.name.substring(0, 2).toUpperCase()}</div>
          <div class="client-name">${c.name}</div>
          <div class="client-company">${c.company || 'Private Client'}</div>
          <div class="client-stats">
            <div class="client-stat">
              <div class="client-stat-val">${c.active_projects}</div>
              <div class="client-stat-label">Projects</div>
            </div>
            <div class="client-stat">
              <div class="client-stat-val">${c.satisfaction_score || 0}</div>
              <div class="client-stat-label">Rating</div>
            </div>
          </div>
        </div>
      `).join('');
    });

    initDragAndDrop();
  } catch (e) {
    showToast('Failed to load clients', 'error');
  }
}

function initDragAndDrop() {
  const cards = document.querySelectorAll('.client-card');
  const columns = document.querySelectorAll('.kanban-column-cards');

  cards.forEach(card => {
    if (card._dragInit) return;
    card._dragInit = true;

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.clientId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.kanban-column.drag-over').forEach(col => col.classList.remove('drag-over'));
    });
  });

  columns.forEach(column => {
    if (column._dragInit) return;
    column._dragInit = true;

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.closest('.kanban-column')?.classList.add('drag-over');
    });

    column.addEventListener('dragenter', (e) => {
      e.preventDefault();
      column.closest('.kanban-column')?.classList.add('drag-over');
    });

    column.addEventListener('dragleave', (e) => {
      if (!column.contains(e.relatedTarget)) {
        column.closest('.kanban-column')?.classList.remove('drag-over');
      }
    });

    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      const col = column.closest('.kanban-column');
      col?.classList.remove('drag-over');

      const clientId = e.dataTransfer.getData('text/plain');
      const targetStage = col?.dataset.stage;
      if (!clientId || !targetStage) return;

      try {
        await api.put(`/clients/${clientId}`, { stage: targetStage });
        showToast('Stage updated successfully', 'success');
        loadClients();
      } catch (err) {
        showToast('Failed to update stage: ' + err.message, 'error');
      }
    });
  });
}

function initSearch() {
  const input = document.getElementById('client-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => loadClients(), 200));
}

function openNewClientEditor() {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('detail-panel-overlay');

  if (!panel || !overlay) {
    return showToast('UI Error: Detail panel missing.', 'error');
  }

  panel.style.display = 'block';
  document.getElementById('panel-title').textContent = 'New Client';
  document.getElementById('panel-body').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="padding:16px; background:var(--bg-hover); border-radius:12px; border-left:3px solid var(--accent-primary);">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Client Identity</div>
        <div class="form-group">
          <label for="quick-client-name">Full Name</label>
          <input id="quick-client-name" class="form-control" type="text" placeholder="Client name">
        </div>
        <div class="form-group">
          <label for="quick-client-company">Company Name</label>
          <input id="quick-client-company" class="form-control" type="text" placeholder="Company or brand">
        </div>
        <div class="form-group">
          <label for="quick-client-project-key">Project Key</label>
          <input id="quick-client-project-key" class="form-control" type="text" placeholder="e.g. LUXE-2024">
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Contact</div>
        <div class="form-group">
          <label for="quick-client-email">Email Address</label>
          <input id="quick-client-email" class="form-control" type="email" placeholder="client@example.com">
        </div>
        <div class="form-group">
          <label for="quick-client-phone">Contact Number</label>
          <input id="quick-client-phone" class="form-control" type="text" placeholder="Primary phone">
        </div>
        <div class="form-group">
          <label for="quick-client-location">Location</label>
          <input id="quick-client-location" class="form-control" type="text" placeholder="City, Country">
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Project Brief</div>
        <div class="form-group">
          <label for="quick-client-service-type">Service Type</label>
          <input id="quick-client-service-type" class="form-control" type="text" placeholder="Website / Branding / Marketing">
        </div>
        <div class="form-group">
          <label for="quick-client-project-desc">Project Description</label>
          <textarea id="quick-client-project-desc" class="form-control" rows="4" placeholder="Short project note"></textarea>
        </div>
      </div>

      <button class="btn-primary" style="width:100%; margin-top:8px;" onclick="createQuickClient()">
        <i class="fas fa-check"></i> CREATE CLIENT
      </button>
      <button class="btn-danger" style="width:100%;" onclick="closeDetailPanel()">CANCEL</button>
    </div>
  `;

  panel.classList.add('open');
  overlay.style.display = 'block';
  overlay.onclick = closeDetailPanel;
  setTimeout(() => document.getElementById('quick-client-name')?.focus(), 50);
}

async function createQuickClient() {
  const name = document.getElementById('quick-client-name')?.value.trim();

  if (!name) {
    return showToast('Client name is required', 'error');
  }

  const data = {
    name,
    company: document.getElementById('quick-client-company')?.value.trim() || '',
    project_key: document.getElementById('quick-client-project-key')?.value.trim() || '',
    email: document.getElementById('quick-client-email')?.value.trim() || '',
    phone: document.getElementById('quick-client-phone')?.value.trim() || '',
    location: document.getElementById('quick-client-location')?.value.trim() || '',
    service_type: document.getElementById('quick-client-service-type')?.value.trim() || '',
    project_desc: document.getElementById('quick-client-project-desc')?.value.trim() || '',
    stage: 'new_register'
  };

  try {
    await api.post('/clients', data);
    showToast('Client created successfully', 'success');
    closeDetailPanel();
    loadClients();
  } catch (err) {
    showToast(err.message || 'Failed to create client', 'error');
  }
}

async function openClientDetail(id) {
  // Emergency alert for browser debugging
  // alert('Opening' + id); 
  console.info(`Opening detail for client ID: ${id}`);
  try {
    const c = await api.get(`/clients/${id}`);
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-panel-overlay');

    if (!panel || !overlay) {
      console.error('Critical Error: Detail panel or overlay not found in DOM.');
      return showToast('UI Error: Detail panel missing.', 'error');
    }

    // Ensure they are correctly reset if opened from a fresh state
    panel.style.display = 'block';

    document.getElementById('panel-title').textContent = c.name;
    document.getElementById('panel-body').innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px;">
        <div>
          <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Company</div>
          <div style="font-weight:700;">${c.company || '—'}</div>
        </div>
        <div>
          <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Project Key</div>
          <div style="font-weight:700; color:var(--accent-primary);">${c.project_key || '—'}</div>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px;">
        <div>
          <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Email</div>
          <div style="font-size:0.85rem;">${c.email || '—'}</div>
        </div>
        <div>
          <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Phone</div>
          <div style="font-size:0.85rem;">${c.phone || '—'}</div>
        </div>
      </div>

      <div style="margin-bottom:24px; padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); border-left:2px solid var(--accent-primary);">
        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Assigned Team</div>
        <div style="margin-bottom:12px;">
          <span style="font-weight:700; font-size:0.75rem; color:var(--accent-primary);">LEADER:</span> 
          <span style="font-size:0.85rem;">${c.team_leader_name || 'Not assigned'}</span>
        </div>
        <div>
          <span style="font-weight:700; font-size:0.75rem; color:var(--accent-primary);">MEMBERS:</span> 
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${c.team_members || 'Not defined'}</div>
        </div>
      </div>

      <div style="margin-bottom:24px; padding:16px; background:var(--bg-hover); border-radius:var(--radius-sm);">
        <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Brand Strategy</div>
        <div style="margin-bottom:12px;">
          <span style="font-weight:700; font-size:0.75rem; color:var(--accent-primary);">TONE:</span> 
          <span style="font-size:0.85rem;">${c.brand_tone || 'Not defined'}</span>
        </div>
        <div>
          <span style="font-weight:700; font-size:0.75rem; color:var(--accent-primary);">GOALS:</span> 
          <span style="font-size:0.85rem;">${c.goals || 'Not defined'}</span>
        </div>
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-top:24px; margin-bottom:16px;">PROJECT HISTORY</div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${c.projects.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No projects yet.</div>' : c.projects.map(p => `
          <div style="padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="location.href='projects.html?search=${encodeURIComponent(p.title)}'">
            <div>
              <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary);">${p.title}</div>
              <div style="font-size:0.65rem; color:var(--text-muted);">${formatDate(p.created_at)}</div>
            </div>
            <div class="badge badge-${p.status}">${p.status}</div>
          </div>
        `).join('')}
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-top:24px; margin-bottom:16px;">RELATED TASKS</div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${!c.tasks || c.tasks.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No related tasks.</div>' : c.tasks.map(t => `
          <div style="padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); cursor:pointer;" onclick="location.href='tasks.html?search=${encodeURIComponent(t.title)}'">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
              <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary);">${t.title}</div>
              <div class="badge badge-${t.status}" style="font-size:0.6rem;">${t.status}</div>
            </div>
            <div style="font-size:0.65rem; color:var(--text-muted);">${t.project_title}</div>
          </div>
        `).join('')}
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-top:24px; margin-bottom:16px;">PROJECT SUBMISSIONS</div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${!c.submissions || c.submissions.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No submissions yet.</div>' : c.submissions.map(s => `
          <div style="padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); cursor:pointer;" onclick="location.href='submissions.html?client=${c.id}'">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary);">v${s.version} Submission</div>
                <div style="font-size:0.65rem; color:var(--text-muted);">${formatDate(s.created_at)} by ${s.user_name || 'System'}</div>
              </div>
              <div class="badge badge-${s.status}">${s.status}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Admin controls
    let adminControls = '';
    if (['admin', 'team_leader', 'client_handler'].includes(auth.getUser().role)) {
      adminControls = `
        <button class="btn-primary" style="width:100%; margin-bottom:12px;" onclick="editClient(${c.id})"><i class="fas fa-edit"></i> Edit Details</button>
        ${auth.getUser().role === 'admin' ? `<button class="btn-danger" style="width:100%;" onclick="deleteClient(${c.id})">Delete Client</button>` : ''}
      `;
    }
    panel.classList.add('open');
    overlay.style.display = 'block';
    overlay.onclick = closeDetailPanel;
    document.getElementById('panel-body').insertAdjacentHTML('beforeend', `<div style="margin-top:32px;">${adminControls}</div>`);
  } catch (e) {
    showToast('Failed to load client details', 'error');
  }
}

async function editClient(id) {
  try {
    const c = await api.get(`/clients/${id}`);
    closeDetailPanel();

    // Clear picker state
    pickerState.client.selected = [];
    if (c.team_members) {
      const names = c.team_members.split(', ');
      names.forEach(n => {
        const u = allUsers.find(user => user.name === n);
        if (u) pickerState.client.selected.push({ id: u.id, name: u.name, role: u.role });
      });
    }
    renderChips('client');

    const form = document.getElementById('edit-client-form');
    if (!form) return;
    form.dataset.clientId = id;

    const fields = [
      'name', 'company', 'phone', 'phone_alt', 'email', 'location',
      'industry', 'business_desc', 'audience', 'competitors', 'brand_assets',
      'service_type', 'project_desc', 'project_goals', 'features', 'design_prefs',
      'platform', 'tech', 'integrations', 'hosting',
      'budget', 'timeline', 'urgency',
      'content', 'media', 'guidelines', 'credentials',
      'payment_terms', 'ownership', 'marketing',
      'brand_colors', 'brand_tone', 'goals', 'project_key'
    ];

    fields.forEach(f => {
      const el = document.getElementById(`edit-client-${f.replace('_', '-')}`);
      if (el) el.value = c[f] || '';
    });

    // Handle selects separately
    ['comm-method', 'agreement', 'nda', 'maintenance', 'updates', 'team-leader-id', 'stage'].forEach(f => {
      const el = document.getElementById(`edit-client-${f}`);
      if (el) {
        const fieldName = f.replace(/-/g, '_');
        el.value = (fieldName === 'team_leader_id') ? (c.team_leader_id || '') : (c[fieldName] || (el.options[0]?.value || ''));
      }
    });

    // Special handling for references textarea which has ID 'client-references' in new mod, so 'edit-client-references' in edit mod
    const ref = document.getElementById('edit-client-references');
    if (ref) ref.value = c.reference_examples || '';

    // Populate Related Tasks and Submissions in Modal
    const tasksDiv = document.getElementById('edit-client-related-tasks');
    if (tasksDiv) {
      tasksDiv.innerHTML = (!c.tasks || c.tasks.length === 0)
        ? 'No tasks found.'
        : c.tasks.map(t => `<div style="padding:6px 0; border-bottom:2px solid rgba(255,255,255,0.05);">
            <div style="font-weight:700;">${t.title}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${t.project_title} - ${t.status}</div>
          </div>`).join('');
    }

    const subsDiv = document.getElementById('edit-client-project-submissions');
    if (subsDiv) {
      subsDiv.innerHTML = (!c.submissions || c.submissions.length === 0)
        ? 'No submissions found.'
        : c.submissions.map(s => `<div style="padding:6px 0; border-bottom:2px solid rgba(255,255,255,0.05);">
            <div style="font-weight:700;">v${s.version} Submission</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${s.project_title} - ${s.leader_status}</div>
          </div>`).join('');
    }

    openClientEditDrawer(c);
  } catch (e) {
    console.error(e);
    showToast('Failed to load edit data', 'error');
  }
}

function openClientEditDrawer(c) {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('detail-panel-overlay');

  if (!panel || !overlay) {
    return showToast('UI Error: Detail panel missing.', 'error');
  }

  const stageOptions = [
    ['new_register', 'New Register'],
    ['order_confirmed', 'Order Confirmed'],
    ['processing', 'Processing'],
    ['review', 'Review'],
    ['completion', 'Completion']
  ].map(([value, label]) => `<option value="${value}" ${c.stage === value ? 'selected' : ''}>${label}</option>`).join('');
  const commOptions = ['Call', 'WhatsApp', 'Email'].map(value => `<option value="${value}" ${c.comm_method === value ? 'selected' : ''}>${value}</option>`).join('');
  const budgetOptions = ['5k-10k', '10k-25k', '25k+'].map(value => `<option value="${value}" ${c.budget === value ? 'selected' : ''}>${value}</option>`).join('');
  const urgencyOptions = ['Normal', 'Fast', 'Urgent'].map(value => `<option value="${value}" ${c.urgency === value ? 'selected' : ''}>${value}</option>`).join('');
  const yesNoOptions = (current) => ['No', 'Yes'].map(value => `<option value="${value}" ${current === value ? 'selected' : ''}>${value}</option>`).join('');
  const leaderOptions = '<option value="">Select a Team Leader</option>' + allUsers
    .filter(u => ['admin', 'team_leader', 'client_handler'].includes(u.role))
    .map(u => `<option value="${u.id}" ${String(c.team_leader_id || '') === String(u.id) ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml((u.role || '').replace('_', ' '))})</option>`)
    .join('');

  panel.style.display = 'block';
  document.getElementById('panel-title').textContent = 'Edit Client';
  document.getElementById('panel-body').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="padding:16px; background:var(--bg-hover); border-radius:12px; border-left:3px solid var(--accent-primary);">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Client Identity</div>
        <div class="form-group">
          <label for="drawer-edit-name">Full Name</label>
          <input id="drawer-edit-name" class="form-control" type="text" value="${escapeAttr(c.name)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-company">Company Name</label>
          <input id="drawer-edit-company" class="form-control" type="text" value="${escapeAttr(c.company)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-project-key">Project Key</label>
          <input id="drawer-edit-project-key" class="form-control" type="text" value="${escapeAttr(c.project_key)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-stage">Stage</label>
          <select id="drawer-edit-stage" class="form-control" title="Stage">${stageOptions}</select>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Contact</div>
        <div class="form-group">
          <label for="drawer-edit-email">Email Address</label>
          <input id="drawer-edit-email" class="form-control" type="email" value="${escapeAttr(c.email)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-phone">Contact Number</label>
          <input id="drawer-edit-phone" class="form-control" type="text" value="${escapeAttr(c.phone)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-phone-alt">Alternate Contact Number</label>
          <input id="drawer-edit-phone-alt" class="form-control" type="text" value="${escapeAttr(c.phone_alt)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-location">Location</label>
          <input id="drawer-edit-location" class="form-control" type="text" value="${escapeAttr(c.location)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-comm-method">Preferred Communication</label>
          <select id="drawer-edit-comm-method" class="form-control" title="Communication Method">${commOptions}</select>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Business Details</div>
        <div class="form-group">
          <label for="drawer-edit-industry">Industry / Business Type</label>
          <input id="drawer-edit-industry" class="form-control" type="text" value="${escapeAttr(c.industry)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-business-desc">Business Description</label>
          <textarea id="drawer-edit-business-desc" class="form-control" rows="3">${escapeHtml(c.business_desc)}</textarea>
        </div>
        <div class="form-group">
          <label for="drawer-edit-audience">Target Audience</label>
          <input id="drawer-edit-audience" class="form-control" type="text" value="${escapeAttr(c.audience)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-competitors">Competitors</label>
          <input id="drawer-edit-competitors" class="form-control" type="text" value="${escapeAttr(c.competitors)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-brand-assets">Existing Brand Assets</label>
          <textarea id="drawer-edit-brand-assets" class="form-control" rows="3">${escapeHtml(c.brand_assets)}</textarea>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Project Brief</div>
        <div class="form-group">
          <label for="drawer-edit-service-type">Service Type</label>
          <input id="drawer-edit-service-type" class="form-control" type="text" value="${escapeAttr(c.service_type)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-project-desc">Project Description</label>
          <textarea id="drawer-edit-project-desc" class="form-control" rows="4">${escapeHtml(c.project_desc)}</textarea>
        </div>
        <div class="form-group">
          <label for="drawer-edit-project-goals">Project Goals</label>
          <input id="drawer-edit-project-goals" class="form-control" type="text" value="${escapeAttr(c.project_goals)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-features">Features Required</label>
          <input id="drawer-edit-features" class="form-control" type="text" value="${escapeAttr(c.features)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-design-prefs">Design Preferences</label>
          <input id="drawer-edit-design-prefs" class="form-control" type="text" value="${escapeAttr(c.design_prefs)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-reference-examples">Reference Examples</label>
          <textarea id="drawer-edit-reference-examples" class="form-control" rows="3">${escapeHtml(c.reference_examples)}</textarea>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Technical Requirements</div>
        <div class="form-group">
          <label for="drawer-edit-platform">Platform Preference</label>
          <input id="drawer-edit-platform" class="form-control" type="text" value="${escapeAttr(c.platform)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-tech">Technology Preference</label>
          <input id="drawer-edit-tech" class="form-control" type="text" value="${escapeAttr(c.tech)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-integrations">Integration Needs</label>
          <input id="drawer-edit-integrations" class="form-control" type="text" value="${escapeAttr(c.integrations)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-hosting">Hosting / Domain Status</label>
          <input id="drawer-edit-hosting" class="form-control" type="text" value="${escapeAttr(c.hosting)}">
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Budget & Timeline</div>
        <div class="form-group">
          <label for="drawer-edit-budget">Budget Range</label>
          <select id="drawer-edit-budget" class="form-control" title="Budget">${budgetOptions}</select>
        </div>
        <div class="form-group">
          <label for="drawer-edit-timeline">Deadline / Timeline</label>
          <input id="drawer-edit-timeline" class="form-control" type="text" value="${escapeAttr(c.timeline)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-urgency">Urgency Level</label>
          <select id="drawer-edit-urgency" class="form-control" title="Urgency">${urgencyOptions}</select>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Content & Access</div>
        <div class="form-group">
          <label for="drawer-edit-content">Content Availability</label>
          <textarea id="drawer-edit-content" class="form-control" rows="3">${escapeHtml(c.content)}</textarea>
        </div>
        <div class="form-group">
          <label for="drawer-edit-media">Media / Assets</label>
          <textarea id="drawer-edit-media" class="form-control" rows="3">${escapeHtml(c.media)}</textarea>
        </div>
        <div class="form-group">
          <label for="drawer-edit-guidelines">Brand Guidelines</label>
          <textarea id="drawer-edit-guidelines" class="form-control" rows="3">${escapeHtml(c.guidelines)}</textarea>
        </div>
        <div class="form-group">
          <label for="drawer-edit-credentials">Credentials / Access Info</label>
          <textarea id="drawer-edit-credentials" class="form-control" rows="3">${escapeHtml(c.credentials)}</textarea>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Legal & Agreement</div>
        <div class="form-group">
          <label for="drawer-edit-agreement">Agreement Signed</label>
          <select id="drawer-edit-agreement" class="form-control" title="Agreement">${yesNoOptions(c.agreement)}</select>
        </div>
        <div class="form-group">
          <label for="drawer-edit-payment-terms">Payment Terms</label>
          <input id="drawer-edit-payment-terms" class="form-control" type="text" value="${escapeAttr(c.payment_terms)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-ownership">Ownership Terms</label>
          <input id="drawer-edit-ownership" class="form-control" type="text" value="${escapeAttr(c.ownership)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-nda">NDA Required</label>
          <select id="drawer-edit-nda" class="form-control" title="NDA">${yesNoOptions(c.nda)}</select>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Post-Project & Team</div>
        <div class="form-group">
          <label for="drawer-edit-maintenance">Maintenance Required</label>
          <select id="drawer-edit-maintenance" class="form-control" title="Maintenance">${yesNoOptions(c.maintenance)}</select>
        </div>
        <div class="form-group">
          <label for="drawer-edit-updates">Future Updates</label>
          <select id="drawer-edit-updates" class="form-control" title="Updates">${yesNoOptions(c.updates)}</select>
        </div>
        <div class="form-group">
          <label for="drawer-edit-marketing">Marketing Needs</label>
          <input id="drawer-edit-marketing" class="form-control" type="text" value="${escapeAttr(c.marketing)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-team-leader-id">Team Leader</label>
          <select id="drawer-edit-team-leader-id" class="form-control" title="Team Leader">${leaderOptions}</select>
        </div>
        <div class="form-group">
          <label for="drawer-edit-team-members">Team Members</label>
          <textarea id="drawer-edit-team-members" class="form-control" rows="3">${escapeHtml(c.team_members)}</textarea>
        </div>
      </div>

      <div style="padding:16px; background:var(--bg-hover); border-radius:12px;">
        <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Brand Strategy</div>
        <div class="form-group">
          <label for="drawer-edit-brand-colors">Brand Colors</label>
          <input id="drawer-edit-brand-colors" class="form-control" type="text" value="${escapeAttr(c.brand_colors)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-brand-tone">Brand Tone</label>
          <input id="drawer-edit-brand-tone" class="form-control" type="text" value="${escapeAttr(c.brand_tone)}">
        </div>
        <div class="form-group">
          <label for="drawer-edit-goals">Brand Goals</label>
          <textarea id="drawer-edit-goals" class="form-control" rows="3">${escapeHtml(c.goals)}</textarea>
        </div>
      </div>

      <button class="btn-primary" style="width:100%; margin-top:8px;" onclick="saveClientDrawerEdit(${Number(c.id)})">
        <i class="fas fa-check"></i> SAVE CHANGES
      </button>
      <button class="btn-danger" style="width:100%;" onclick="openClientDetail('${Number(c.id)}')">CANCEL</button>
    </div>
  `;

  panel.classList.add('open');
  overlay.style.display = 'block';
  overlay.onclick = closeDetailPanel;
  setTimeout(() => document.getElementById('drawer-edit-name')?.focus(), 50);
}

async function saveClientDrawerEdit(id) {
  const name = document.getElementById('drawer-edit-name')?.value.trim();

  if (!name) {
    return showToast('Client name is required', 'error');
  }

  const data = {
    name,
    company: document.getElementById('drawer-edit-company')?.value.trim() || '',
    project_key: document.getElementById('drawer-edit-project-key')?.value.trim() || '',
    stage: document.getElementById('drawer-edit-stage')?.value || 'new_register',
    email: document.getElementById('drawer-edit-email')?.value.trim() || '',
    phone: document.getElementById('drawer-edit-phone')?.value.trim() || '',
    phone_alt: document.getElementById('drawer-edit-phone-alt')?.value.trim() || '',
    location: document.getElementById('drawer-edit-location')?.value.trim() || '',
    comm_method: document.getElementById('drawer-edit-comm-method')?.value || '',
    industry: document.getElementById('drawer-edit-industry')?.value.trim() || '',
    business_desc: document.getElementById('drawer-edit-business-desc')?.value.trim() || '',
    audience: document.getElementById('drawer-edit-audience')?.value.trim() || '',
    competitors: document.getElementById('drawer-edit-competitors')?.value.trim() || '',
    brand_assets: document.getElementById('drawer-edit-brand-assets')?.value.trim() || '',
    service_type: document.getElementById('drawer-edit-service-type')?.value.trim() || '',
    project_desc: document.getElementById('drawer-edit-project-desc')?.value.trim() || '',
    project_goals: document.getElementById('drawer-edit-project-goals')?.value.trim() || '',
    features: document.getElementById('drawer-edit-features')?.value.trim() || '',
    design_prefs: document.getElementById('drawer-edit-design-prefs')?.value.trim() || '',
    reference_examples: document.getElementById('drawer-edit-reference-examples')?.value.trim() || '',
    platform: document.getElementById('drawer-edit-platform')?.value.trim() || '',
    tech: document.getElementById('drawer-edit-tech')?.value.trim() || '',
    integrations: document.getElementById('drawer-edit-integrations')?.value.trim() || '',
    hosting: document.getElementById('drawer-edit-hosting')?.value.trim() || '',
    budget: document.getElementById('drawer-edit-budget')?.value || '',
    timeline: document.getElementById('drawer-edit-timeline')?.value.trim() || '',
    urgency: document.getElementById('drawer-edit-urgency')?.value || '',
    content: document.getElementById('drawer-edit-content')?.value.trim() || '',
    media: document.getElementById('drawer-edit-media')?.value.trim() || '',
    guidelines: document.getElementById('drawer-edit-guidelines')?.value.trim() || '',
    credentials: document.getElementById('drawer-edit-credentials')?.value.trim() || '',
    agreement: document.getElementById('drawer-edit-agreement')?.value || '',
    payment_terms: document.getElementById('drawer-edit-payment-terms')?.value.trim() || '',
    ownership: document.getElementById('drawer-edit-ownership')?.value.trim() || '',
    nda: document.getElementById('drawer-edit-nda')?.value || '',
    maintenance: document.getElementById('drawer-edit-maintenance')?.value || '',
    updates: document.getElementById('drawer-edit-updates')?.value || '',
    marketing: document.getElementById('drawer-edit-marketing')?.value.trim() || '',
    team_leader_id: document.getElementById('drawer-edit-team-leader-id')?.value || null,
    team_members: document.getElementById('drawer-edit-team-members')?.value.trim() || '',
    brand_colors: document.getElementById('drawer-edit-brand-colors')?.value.trim() || '',
    brand_tone: document.getElementById('drawer-edit-brand-tone')?.value.trim() || '',
    goals: document.getElementById('drawer-edit-goals')?.value.trim() || ''
  };

  try {
    await api.put(`/clients/${id}`, data);
    showToast('Client updated successfully', 'success');
    await loadClients();
    openClientDetail(id);
  } catch (err) {
    showToast(err.message || 'Failed to update client', 'error');
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function initEditForm() {
  const form = document.getElementById('edit-client-form');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const id = form.dataset.clientId;

    const fieldKeys = [
      'name', 'company', 'phone', 'phone_alt', 'email', 'location', 'comm_method',
      'industry', 'business_desc', 'audience', 'competitors', 'brand_assets',
      'service_type', 'project_desc', 'project_goals', 'features', 'design_prefs', 'references',
      'platform', 'tech', 'integrations', 'hosting',
      'budget', 'timeline', 'urgency',
      'content', 'media', 'guidelines', 'credentials',
      'agreement', 'payment_terms', 'ownership', 'nda',
      'maintenance', 'updates', 'marketing',
      'brand_colors', 'brand_tone', 'goals', 'team_leader_id', 'project_key', 'stage'
    ];

    const data = {};
    fieldKeys.forEach(key => {
      const fieldId = `edit-client-${key.replace(/_/g, '-')}`;
      const el = document.getElementById(fieldId);
      if (el) {
        data[key] = (key === 'team_leader_id') ? (el.value || null) : el.value;
      }
    });

    // Special case for member picker
    data.team_members = pickerState.client.selected.map(u => u.name).join(', ');

    try {
      await api.put(`/clients/${id}`, data);
      showToast('Client updated successfully', 'success');
      closeModal('edit-client-modal');
      loadClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function loadTeamLeaders() {
  try {
    const users = await api.get('/users');
    allUsers = users;

    // Sort and filter for administration roles 
    const leaders = users.filter(u => ['admin', 'team_leader', 'client_handler'].includes(u.role));

    // Populate "Add Client" leader select
    const newSelect = document.getElementById('client-team-leader-id');
    if (newSelect) {
      newSelect.innerHTML = '<option value="">Select a Team Leader</option>';
      leaders.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.role.replace('_', ' ')})`;
        newSelect.appendChild(opt);
      });
    }

    // Populate "Edit Client" leader select
    const editSelect = document.getElementById('edit-client-team-leader-id');
    if (editSelect) {
      editSelect.innerHTML = '<option value="">Select a Team Leader</option>';
      leaders.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.role.replace('_', ' ')})`;
        editSelect.appendChild(opt);
      });
    }

    // Populate picker dropdowns
    populatePickerDropdown('client-picker-dropdown', 'client');
    populatePickerDropdown('edit-client-picker-dropdown', 'client');
  } catch (e) {
    console.error('Failed to load team leaders', e);
  }
}

// ─── Member Picker Logic ──────────────────────────────────────────────────────
function populatePickerDropdown(dropdownId, pickerKey) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  const filter = dropdown._filter || '';
  const selected = pickerState[pickerKey].selected.map(u => u.id);

  const filtered = allUsers.filter(u =>
    u.name.toLowerCase().includes(filter.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(filter.toLowerCase())
  );

  dropdown.innerHTML = filtered.length === 0
    ? `<div style="padding:10px 14px;color:var(--text-muted);font-size:0.8rem;">No users found</div>`
    : filtered.map(u => `
        <div class="picker-option ${selected.includes(u.id) ? 'selected' : ''}" onclick="toggleMember('${pickerKey}', ${u.id}, '${u.name.replace(/'/g, "\\'")}', '${u.role}')">
          <img src="${getInitialsAvatar(u.name, 24)}" alt="${u.name}">
          <div>
            <div style="font-weight:700;">${u.name}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">${formatRole(u.role)}</div>
          </div>
          ${selected.includes(u.id) ? '<i class="fas fa-check" style="margin-left:auto;color:var(--accent-primary);font-size:0.75rem;"></i>' : ''}
        </div>`
    ).join('');
}

function toggleMember(pickerKey, id, name, role) {
  const state = pickerState[pickerKey];
  const idx = state.selected.findIndex(u => u.id === id);
  if (idx >= 0) {
    state.selected.splice(idx, 1);
  } else {
    state.selected.push({ id, name, role });
  }
  renderChips(pickerKey);
  populatePickerDropdown('client-picker-dropdown', pickerKey);
  populatePickerDropdown('edit-client-picker-dropdown', pickerKey);
}


function renderChips(pickerKey) {
  // Check both pickers
  ['client-member-picker', 'edit-client-member-picker'].forEach(pickerId => {
    const picker = document.getElementById(pickerId);
    if (!picker) return;

    // Find search input within this picker
    const searchInput = picker.querySelector('.member-picker-search');
    if (!searchInput) return;

    // Remove old chips (keep the input)
    picker.querySelectorAll('.member-chip').forEach(c => c.remove());

    const chips = pickerState[pickerKey].selected.map(u => {
      const chip = document.createElement('div');
      chip.className = 'member-chip';
      chip.innerHTML = `
        <img src="${getInitialsAvatar(u.name, 18)}" alt="${u.name}">
        <span>${u.name}</span>
        <i class="fas fa-times chip-remove" onclick="removeMember('${pickerKey}', ${u.id})"></i>
      `;
      return chip;
    });

    chips.forEach(chip => picker.insertBefore(chip, searchInput));
  });
}

function removeMember(pickerKey, id) {
  const state = pickerState[pickerKey];
  state.selected = state.selected.filter(u => u.id !== id);
  renderChips(pickerKey);
  populatePickerDropdown('client-picker-dropdown', pickerKey);
  populatePickerDropdown('edit-client-picker-dropdown', pickerKey);
}

function clearPicker(pickerKey) {
  pickerState[pickerKey].selected = [];
  renderChips(pickerKey);
}

function openPickerDropdown(dropdownId) {
  document.getElementById(dropdownId)?.classList.add('open');
}

function togglePickerDropdown(dropdownId, searchId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  if (dropdown.classList.contains('open')) {
    dropdown.classList.remove('open');
  } else {
    dropdown.classList.add('open');
    document.getElementById(searchId)?.focus();
  }
}

function filterPickerOptions(dropdownId, value) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  dropdown._filter = value;
  populatePickerDropdown(dropdownId, 'client');
  openPickerDropdown(dropdownId);
}

function initPickerCloseOnOutsideClick() {
  document.addEventListener('click', (e) => {
    ['client-picker-dropdown'].forEach(id => {
      const dropdown = document.getElementById(id);
      const picker = document.getElementById(id.replace('-dropdown', ''));
      if (dropdown && picker && !picker.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  });
}

function formatRole(role) {
  if (!role) return '';
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
// Admin: Delete client
async function deleteClient(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  try {
    await api.delete(`/clients/${id}`);
    showToast('Client deleted', 'success');
    closeDetailPanel();
    loadClients();
  } catch (e) { showToast('Failed to delete client', 'error'); }
}
window.deleteClient = deleteClient;

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-panel-overlay').style.display = 'none';
}

window.initClients = initClients;
window.openClientDetail = openClientDetail;
window.closeDetailPanel = closeDetailPanel;
window.editClient = editClient;
window.saveClientDrawerEdit = saveClientDrawerEdit;
window.openNewClientEditor = openNewClientEditor;
window.createQuickClient = createQuickClient;
window.togglePickerDropdown = togglePickerDropdown;
window.openPickerDropdown = openPickerDropdown;
window.filterPickerOptions = filterPickerOptions;
window.toggleMember = toggleMember;
window.removeMember = removeMember;
