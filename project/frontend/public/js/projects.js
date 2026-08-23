async function initProjects() {
  // Handle search parameter from URL (e.g. from Client Portfolio)
  const urlParams = new URLSearchParams(window.location.search);
  const searchVal = urlParams.get('search');
  const searchInput = document.getElementById('project-search');
  if (searchVal && searchInput) {
    searchInput.value = searchVal;
  }

  loadProjects();
  loadFormOptions();
  initSearch();


  // Auto-open New Project modal if ?new=1 in URL
  if (window.location.search.includes('new=1')) {
    setTimeout(() => openNewProjectModal(), 300);
  }

  document.getElementById('new-project-form').onsubmit = async (e) => {
    e.preventDefault();
    const team_members = Array.from(document.querySelectorAll('#proj-team-members-container input:checked')).map(cb => parseInt(cb.value));
    const data = {
      title: document.getElementById('proj-title').value,
      description: document.getElementById('proj-desc').value,
      priority: document.getElementById('proj-priority').value,
      deadline: document.getElementById('proj-deadline').value,
      team_leader_id: document.getElementById('proj-leader').value || null,
      client_id: document.getElementById('proj-client').value || null,
      team_members: team_members
    };
    try {
      await api.post('/projects', data);
      showToast('Project created successfully', 'success');
      closeModal('new-project-modal');
      e.target.reset();
      loadFormOptions();
      loadProjects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('edit-project-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-proj-id').value;
    const team_members = Array.from(document.querySelectorAll('#edit-proj-team-members-container input:checked')).map(cb => parseInt(cb.value));
    const data = {
      title: document.getElementById('edit-proj-title').value,
      description: document.getElementById('edit-proj-desc').value,
      status: document.getElementById('edit-proj-status').value,
      priority: document.getElementById('edit-proj-priority').value,
      deadline: document.getElementById('edit-proj-deadline').value,
      team_leader_id: document.getElementById('edit-proj-leader').value || null,
      client_id: document.getElementById('edit-proj-client').value || null,
      team_members: team_members
    };
    try {
      await api.put(`/projects/${id}`, data);
      showToast('Project updated successfully', 'success');
      closeModal('edit-project-modal');
      closeDetailPanel();
      loadProjects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function loadProjects() {
  try {
    const search = document.getElementById('project-search')?.value?.trim();
    const projects = await api.get('/projects' + (search ? `?search=${encodeURIComponent(search)}` : ''));
    const lists = {
      active: document.getElementById('list-active'),
      paused: document.getElementById('list-paused'),
      completed: document.getElementById('list-completed')
    };
    const counts = {
      active: document.getElementById('count-active'),
      paused: document.getElementById('count-paused'),
      completed: document.getElementById('count-completed')
    };

    Object.values(lists).forEach(l => l.innerHTML = '');
    const groups = { active: [], paused: [], completed: [] };

    projects.forEach(p => {
      if (groups[p.status]) groups[p.status].push(p);
    });

    Object.keys(groups).forEach(status => {
      counts[status].textContent = groups[status].length;
      if (groups[status].length === 0) {
        lists[status].innerHTML = `
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <div class="empty-title">No projects</div>
            <div class="empty-desc">You have no ${status} projects.</div>
          </div>
        `;
        return;
      }
      lists[status].innerHTML = groups[status].map(p => {
        const pct = p.task_count > 0 ? Math.round((p.completed_tasks / p.task_count) * 100) : 0;
        return `
          <div class="glass-card project-card anim-fade-up" draggable="true" data-project-id="${p.id}" onclick="if(!isProjectDragging) openProjectDetail(${p.id})">
            <div class="badge badge-${p.priority} priority-badge">${p.priority}</div>
            <div class="project-card-title">${p.title}</div>
            <div class="project-meta">
              <div><i class="fas fa-user-tie"></i> ${p.client_name || 'No Client'}</div>
              <div><i class="fas fa-user-shield"></i> ${p.leader_name || 'No Leader'}</div>
              <div><i class="fas fa-calendar-alt"></i> ${formatDate(p.deadline)}</div>
            </div>
            <div class="progress-wrap">
              <div style="display:flex; justify-content:space-between; font-size:0.7rem; margin-bottom:4px;">
                <span>Progress</span>
                <span>${pct}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    });

    initProjectDragAndDrop();
  } catch (e) {
    showToast('Failed to load projects', 'error');
  }
}

let isProjectDragging = false;

function initProjectDragAndDrop() {
  const cards = document.querySelectorAll('.project-card');
  const columns = document.querySelectorAll('.kanban-column, .kanban-column-cards');

  cards.forEach(card => {
    if (card._dragInit) return;
    card._dragInit = true;

    card.addEventListener('dragstart', (e) => {
      isProjectDragging = true;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.projectId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.kanban-column.drag-over').forEach(col => col.classList.remove('drag-over'));
      setTimeout(() => {
        isProjectDragging = false;
      }, 100);
    });
  });

  columns.forEach(colEl => {
    if (colEl._dragInit) return;
    colEl._dragInit = true;

    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const col = colEl.closest('.kanban-column') || colEl;
      col?.classList.add('drag-over');
    });

    colEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      const col = colEl.closest('.kanban-column') || colEl;
      col?.classList.add('drag-over');
    });

    colEl.addEventListener('dragleave', (e) => {
      if (!colEl.contains(e.relatedTarget)) {
        const col = colEl.closest('.kanban-column') || colEl;
        col?.classList.remove('drag-over');
      }
    });

    colEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      const col = colEl.closest('.kanban-column') || colEl;
      col?.classList.remove('drag-over');

      const projectId = e.dataTransfer.getData('text/plain');
      const targetStatus = col?.dataset.status;
      if (!projectId || !targetStatus) return;

      try {
        await api.put(`/projects/${projectId}`, { status: targetStatus });
        showToast(`Project moved to ${targetStatus.toUpperCase()}`, 'success');
        loadProjects();
      } catch (err) {
        showToast('Failed to update status: ' + (err.message || err), 'error');
      }
    });
  });
}

function initSearch() {
  const input = document.getElementById('project-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => loadProjects(), 200));
}

function formatRole(role) {
  return (role || '').replace(/_/g, ' ').toUpperCase();
}

async function loadFormOptions() {
  try {
    const [allUsers, clients] = await Promise.all([
      api.get('/users?is_active=1'),
      api.get('/clients')
    ]);

    const leaderSelect = document.getElementById('proj-leader');
    const editLeaderSelect = document.getElementById('edit-proj-leader');
    const clientSelect = document.getElementById('proj-client');
    const editClientSelect = document.getElementById('edit-proj-client');
    const c1 = document.getElementById('proj-team-members-container');
    const c2 = document.getElementById('edit-proj-team-members-container');

    // 1. Populate Team Leader Dropdown
    if (allUsers && allUsers.length > 0) {
      const leaderUsers = allUsers.filter(u =>
        ['team_leader', 'admin', 'frontend_backend', 'backend'].includes(u.role) ||
        (u.secondary_roles || '').includes('team_leader') ||
        (u.secondary_roles || '').includes('admin')
      );
      const otherUsers = allUsers.filter(u => !leaderUsers.includes(u));

      let leaderOpts = '<option value="">Select Team Leader</option>';
      if (leaderUsers.length > 0) {
        leaderOpts += '<optgroup label="Team Leaders & Admins">' +
          leaderUsers.map(u => `<option value="${u.id}">${u.name} (${formatRole(u.role)})</option>`).join('') +
          '</optgroup>';
      }
      if (otherUsers.length > 0) {
        leaderOpts += '<optgroup label="Other Staff">' +
          otherUsers.map(u => `<option value="${u.id}">${u.name} (${formatRole(u.role)})</option>`).join('') +
          '</optgroup>';
      }

      if (leaderSelect) leaderSelect.innerHTML = leaderOpts;
      if (editLeaderSelect) editLeaderSelect.innerHTML = leaderOpts;
    } else {
      if (leaderSelect) leaderSelect.innerHTML = '<option value="">No team members found</option>';
      if (editLeaderSelect) editLeaderSelect.innerHTML = '<option value="">No team members found</option>';
    }

    // 2. Populate Client Dropdown
    if (clients && clients.length > 0) {
      const clientOpts = '<option value="">Select Client (optional)</option>' +
        clients.map(c => `<option value="${c.id}">${c.name}${c.company ? ' — ' + c.company : ''}</option>`).join('');
      if (clientSelect) clientSelect.innerHTML = clientOpts;
      if (editClientSelect) editClientSelect.innerHTML = clientOpts;
    } else {
      if (clientSelect) clientSelect.innerHTML = '<option value="">No clients yet — add one in Client Portfolio</option>';
      if (editClientSelect) editClientSelect.innerHTML = '<option value="">No clients yet</option>';
    }

    // 3. Populate Team Members Checkbox List
    if (allUsers && allUsers.length > 0) {
      const memberItems = allUsers.map(u => `
        <label class="team-member-item" id="tm-label-${u.id}">
          <div class="team-member-label-left">
            <input type="checkbox" value="${u.id}" class="team-member-cb" onchange="this.closest('.team-member-item')?.classList.toggle('checked', this.checked)">
            <span>${u.name}</span>
          </div>
          <span class="team-member-role-badge">${formatRole(u.role)}</span>
        </label>
      `).join('');

      if (c1) c1.innerHTML = memberItems;
      if (c2) c2.innerHTML = memberItems.replace(/tm-label-/g, 'edit-tm-label-').replace(/team-member-cb/g, 'edit-team-member-cb');
    }

  } catch (e) {
    console.error('Failed to load form options:', e);
  }
}

async function openProjectDetail(id) {
  try {
    const p = await api.get(`/projects/${id}`);
    const tasks = await api.get(`/projects/${id}/tasks`);

    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-panel-overlay');

    document.getElementById('panel-title').textContent = p.title;
    document.getElementById('panel-badges').innerHTML = `
      <div class="badge badge-${p.status}">${p.status}</div>
      <div class="badge badge-${p.priority}">${p.priority}</div>
    `;

    document.getElementById('panel-body').innerHTML = `
      <div style="margin-bottom:24px; font-size:0.9rem; color:var(--text-secondary); line-height:1.6;">${p.description || 'No description provided.'}</div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:32px;">
        <div class="glass-card" style="padding:12px;">
          <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Client</div>
          <div style="font-weight:700;">${p.client_name || '—'}</div>
        </div>
        <div class="glass-card" style="padding:12px;">
          <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Deadline</div>
          <div style="font-weight:700;">${formatDate(p.deadline)}</div>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Team Members</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${p.team_members && p.team_members.length > 0
        ? p.team_members.map(m => `<div class="badge" style="background:var(--bg-primary); padding:4px 8px; font-weight:normal;" title="${m.role}">${m.name}</div>`).join('')
        : '<span style="color:var(--text-muted); font-size:0.8rem;">No members assigned</span>'}
        </div>
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-bottom:16px;">TASK LIST</div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${tasks.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No tasks created yet.</div>' : tasks.map(t => `
          <div style="padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; font-size:0.85rem;">${t.title}</div>
              <div style="font-size:0.65rem; color:var(--text-muted);">Assigned to: ${t.assignee_name || 'Unassigned'}</div>
            </div>
            <div class="badge badge-${t.status}">${t.status}</div>
          </div>
        `).join('')}
      </div>
    `;

    // Role-based controls
    let actionControls = '';
    const userRole = auth.getUser().role;

    if (['admin', 'team_leader', 'backend', 'frontend_backend'].includes(userRole)) {
      actionControls += `<button class="btn-primary" style="margin-right:8px;" onclick="openEditProjectModal(${p.id})">Edit</button>`;
    }

    if (userRole === 'admin') {
      if (p.status !== 'archived') {
        actionControls += `<button class="btn-secondary" onclick="archiveProject(${p.id})">Archive</button>`;
      } else {
        actionControls += `<button class="btn-primary" onclick="restoreProject(${p.id})">Restore</button>`;
      }
      actionControls += `<button class="btn-danger" style="margin-left:8px;" onclick="deleteProject(${p.id})">Delete</button>`;
    }

    panel.classList.add('open');
    overlay.style.display = 'block';
    overlay.onclick = closeDetailPanel;
    document.getElementById('panel-body').insertAdjacentHTML('beforeend', `<div style="margin-top:32px;">${actionControls}</div>`);


  } catch (e) {
    showToast('Failed to load project details', 'error');
  }
}

// Admin: Archive project
async function archiveProject(id) {
  if (!confirm('Archive this project?')) return;
  try {
    await api.post(`/projects/${id}/archive`);
    showToast('Project archived', 'success');
    closeDetailPanel();
    loadProjects();
  } catch (e) { showToast('Failed to archive', 'error'); }
}

// Admin: Restore project
async function restoreProject(id) {
  if (!confirm('Restore this project?')) return;
  try {
    await api.post(`/projects/${id}/restore`);
    showToast('Project restored', 'success');
    closeDetailPanel();
    loadProjects();
  } catch (e) { showToast('Failed to restore', 'error'); }
}

// Admin: Delete project
async function deleteProject(id) {
  if (!confirm('Delete this project? All tasks and submissions inside it will also be permanently deleted.')) return;
  try {
    await api.delete(`/projects/${id}`);
    showToast('Project deleted successfully', 'success');
    closeDetailPanel();
    loadProjects();
  } catch (e) { showToast('Failed to delete project: ' + e.message, 'error'); }
}

// Admin: Bulk status update
async function bulkUpdateProjectStatus(ids, status) {
  try {
    await api.post('/projects/bulk-status', { ids, status });
    showToast('Projects updated', 'success');
    loadProjects();
  } catch (e) { showToast('Bulk update failed', 'error'); }
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-panel-overlay').style.display = 'none';
}

async function openEditProjectModal(id) {
  try {
    const p = await api.get(`/projects/${id}`);
    await loadFormOptions(); // ensure dropdowns are loaded

    // Copy options from create to edit manually since loadFormOptions populates main ones
    document.getElementById('edit-proj-leader').innerHTML = document.getElementById('proj-leader').innerHTML;
    document.getElementById('edit-proj-client').innerHTML = document.getElementById('proj-client').innerHTML;

    document.getElementById('edit-proj-id').value = p.id;
    document.getElementById('edit-proj-title').value = p.title;
    document.getElementById('edit-proj-desc').value = p.description || '';
    document.getElementById('edit-proj-status').value = p.status;
    document.getElementById('edit-proj-priority').value = p.priority;
    if (p.deadline) document.getElementById('edit-proj-deadline').value = p.deadline.split('T')[0];
    document.getElementById('edit-proj-leader').value = p.team_leader_id || '';
    document.getElementById('edit-proj-client').value = p.client_id || '';

    // Check boxes matching selected team members
    const curMembers = p.team_members || [];
    document.querySelectorAll('#edit-proj-team-members-container input[type="checkbox"]').forEach(cb => {
      const isChecked = curMembers.some(m => m.id === parseInt(cb.value));
      cb.checked = isChecked;
      cb.closest('.team-member-item')?.classList.toggle('checked', isChecked);
    });

    openModal('edit-project-modal');
  } catch (e) {
    showToast('Failed to load project details for editing', 'error');
  }
}

async function openNewProjectModal() {
  document.getElementById('new-project-form')?.reset();
  document.querySelectorAll('#proj-team-members-container input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.team-member-item')?.classList.remove('checked');
  });
  await loadFormOptions();
  openModal('new-project-modal');
}

window.initProjects = initProjects;
window.openNewProjectModal = openNewProjectModal;
window.openProjectDetail = openProjectDetail;
window.closeDetailPanel = closeDetailPanel;
window.archiveProject = archiveProject;
window.restoreProject = restoreProject;
window.deleteProject = deleteProject;
window.bulkUpdateProjectStatus = bulkUpdateProjectStatus;
window.openEditProjectModal = openEditProjectModal;
