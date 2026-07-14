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

    // Clear all column card containers and counts
    stages.forEach(stage => {
      const colCards = document.getElementById(`cards-${stage}`);
      if (colCards) colCards.innerHTML = '';
      const colCount = document.getElementById(`count-${stage}`);
      if (colCount) colCount.textContent = '0';
    });

    // Group clients by stage
    const grouped = {};
    stages.forEach(stage => grouped[stage] = []);

    filtered.forEach(c => {
      const stage = c.stage || 'new_register';
      if (grouped[stage]) {
        grouped[stage].push(c);
      } else {
        grouped['new_register'].push(c); // fallback
      }
    });

    // Render cards and update counts
    stages.forEach(stage => {
      const colCards = document.getElementById(`cards-${stage}`);
      const colCount = document.getElementById(`count-${stage}`);
      if (!colCards) return;

      const clientsInStage = grouped[stage];
      if (colCount) colCount.textContent = clientsInStage.length;

      if (clientsInStage.length === 0) {
        colCards.innerHTML = `
          <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.8rem; border: 1.5px dashed rgba(255,255,255,0.03); border-radius: var(--radius-sm);">
            No clients in this stage
          </div>
        `;
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
      e.dataTransfer.setData('text/plain', card.dataset.clientId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  columns.forEach(column => {
    if (column._dragInit) return;
    column._dragInit = true;

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      const col = column.closest('.kanban-column');
      if (col) col.classList.add('drag-over');
    });

    column.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });

    column.addEventListener('dragleave', () => {
      const col = column.closest('.kanban-column');
      if (col) col.classList.remove('drag-over');
    });

    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      const col = column.closest('.kanban-column');
      if (col) col.classList.remove('drag-over');

      const clientId = e.dataTransfer.getData('text/plain');
      const targetStage = col.dataset.stage;

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

      <div style="margin-bottom:24px; padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); border-left:3px solid var(--accent-primary);">
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
        : c.tasks.map(t => `<div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="font-weight:700;">${t.title}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${t.project_title} - ${t.status}</div>
          </div>`).join('');
    }

    const subsDiv = document.getElementById('edit-client-project-submissions');
    if (subsDiv) {
      subsDiv.innerHTML = (!c.submissions || c.submissions.length === 0)
        ? 'No submissions found.'
        : c.submissions.map(s => `<div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="font-weight:700;">v${s.version} Submission</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${s.project_title} - ${s.leader_status}</div>
          </div>`).join('');
    }

    openModal('edit-client-modal');
  } catch (e) {
    console.error(e);
    showToast('Failed to load edit data', 'error');
  }
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
window.togglePickerDropdown = togglePickerDropdown;
window.openPickerDropdown = openPickerDropdown;
window.filterPickerOptions = filterPickerOptions;
window.toggleMember = toggleMember;
window.removeMember = removeMember;
