const BUILTIN_ROLE_OPTIONS = [
  { value: 'writer', label: 'Writer' },
  { value: 'designer', label: 'Designer' },
  { value: 'team_leader', label: 'Team Leader' },
  { value: 'rnd', label: 'R&D' },
  { value: 'media_manager', label: 'Media Mgr' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'frontend_backend', label: 'Frontend + Backend' },
  { value: 'admin', label: 'Admin' }
];

const REMOVED_ROLES = new Set(['creator', 'client_handler', 'production']);

function getRoleOptions() {
  const combined = BUILTIN_ROLE_OPTIONS.filter(r => !REMOVED_ROLES.has(r.value));
  companyRoleOptions.forEach(role => {
    if (!REMOVED_ROLES.has(role.name) && !combined.some(option => option.value === role.name)) {
      combined.push({ value: role.name, label: role.name.replace(/_/g, ' ') });
    }
  });
  return combined;
}

const ROLE_ICONS = {
  admin: 'fa-crown',
  team_leader: 'fa-users-gear',
  rnd: 'fa-flask',
  writer: 'fa-pen-nib',
  designer: 'fa-palette',
  media_manager: 'fa-photo-film',
  frontend: 'fa-code',
  backend: 'fa-server',
  frontend_backend: 'fa-layer-group'
};

let editSelectedRoles = new Set();
let addSelectedRoles = new Set();

function renderSecondaryRolePills(gridId, selectedSet, countElementId) {
  const container = document.getElementById(gridId);
  if (!container) return;

  const roles = getRoleOptions();
  container.innerHTML = roles.map(r => {
    const isActive = selectedSet.has(r.value);
    const iconClass = ROLE_ICONS[r.value] || 'fa-tag';
    return `
      <div class="sec-role-pill ${isActive ? 'active' : ''}" id="pill-${gridId}-${r.value}" onclick="toggleSecRolePill('${r.value}', '${gridId}')">
        <div class="sec-role-pill-left">
          <i class="fas ${iconClass}"></i>
          <span>${r.label}</span>
        </div>
        <div class="sec-role-pill-check">
          <i class="fas fa-check"></i>
        </div>
      </div>
    `;
  }).join('');

  updateSecRoleCount(countElementId, selectedSet.size);
}

function toggleSecRolePill(role, gridId) {
  const isEdit = gridId === 'edit-sec-roles-grid';
  const selectedSet = isEdit ? editSelectedRoles : addSelectedRoles;
  const countId = isEdit ? 'edit-selected-count' : 'add-selected-count';

  if (selectedSet.has(role)) {
    selectedSet.delete(role);
  } else {
    selectedSet.add(role);
  }

  const pill = document.getElementById(`pill-${gridId}-${role}`);
  if (pill) {
    pill.classList.toggle('active', selectedSet.has(role));
  }

  updateSecRoleCount(countId, selectedSet.size);
}

function toggleAllEditSecRoles(selectAll) {
  const roles = getRoleOptions();
  if (selectAll) {
    roles.forEach(r => editSelectedRoles.add(r.value));
  } else {
    editSelectedRoles.clear();
  }
  renderSecondaryRolePills('edit-sec-roles-grid', editSelectedRoles, 'edit-selected-count');
}

function toggleAllAddSecRoles(selectAll) {
  const roles = getRoleOptions();
  if (selectAll) {
    roles.forEach(r => addSelectedRoles.add(r.value));
  } else {
    addSelectedRoles.clear();
  }
  renderSecondaryRolePills('add-sec-roles-grid', addSelectedRoles, 'add-selected-count');
}

function updateSecRoleCount(elementId, count) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = count;
}

function onEditPrimaryRoleChange(role) {
  const subEl = document.getElementById('edit-user-display-sub');
  if (subEl) subEl.textContent = `Primary: ${typeof formatRole === 'function' ? formatRole(role) : role}`;
  const avatarEl = document.getElementById('edit-user-avatar');
  if (avatarEl) avatarEl.style.border = `2px solid ${typeof getRoleColor === 'function' ? getRoleColor(role) : 'var(--accent-primary)'}`;
}

function renderRoleOptionSelects() {
  const primarySelect = document.getElementById('user-role');
  if (primarySelect) {
    primarySelect.innerHTML = getRoleOptions().map(role => `<option value="${role.value}">${role.label}</option>`).join('');
  }

  renderSecondaryRolePills('add-sec-roles-grid', addSelectedRoles, 'add-selected-count');
}

async function loadCompanyRoles() {
  try {
    companyRoleOptions = await api.get('/admin/company-roles');
  } catch {
    companyRoleOptions = [];
  }
  renderRoleOptionSelects();
}

async function initUsers() {
  await loadCompanyRoles();
  loadRoleArchitect();
  loadUsers();
  initSearch();

  document.getElementById('add-user-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('user-name').value,
      email: document.getElementById('user-email').value,
      password: document.getElementById('user-password').value,
      role: document.getElementById('user-role').value,
      secondary_roles: Array.from(addSelectedRoles).join(',')
    };
    try {
      await api.post('/users', data);
      showToast('User created successfully', 'success');
      closeModal('add-user-modal');
      e.target.reset();
      addSelectedRoles.clear();
      renderSecondaryRolePills('add-sec-roles-grid', addSelectedRoles, 'add-selected-count');
      loadUsers();
      loadRoleArchitect();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const editForm = document.getElementById('edit-user-form');
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-user-id').value;
      const newName = document.getElementById('edit-user-name').value;
      const newRole = document.getElementById('edit-user-primary-role').value;
      const secondary_roles = Array.from(editSelectedRoles).join(',');
      try {
        await api.put(`/users/${id}`, { name: newName, role: newRole, secondary_roles });
        showToast('User updated successfully', 'success');
        closeModal('edit-user-modal');
        loadUsers();
        loadRoleArchitect();
      } catch (err) {
        showToast('Failed to update user: ' + err.message, 'error');
      }
    };
  }
}

async function loadUsers() {
  try {
    const search = document.getElementById('user-search')?.value?.trim();
    const users = await api.get('/users' + (search ? `?search=${encodeURIComponent(search)}` : ''));
    const tbody = document.getElementById('users-list-body');
      if (users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5">
              <div class="empty-state">
                <i class="fas fa-user-slash"></i>
                <div class="empty-title">No users found</div>
                <div class="empty-desc">There are no users to display.</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }
      const allRoles = getRoleOptions().map(role => ({ val: role.value, label: role.label }));

      tbody.innerHTML = users.map(u => {
        const secRoles = (u.secondary_roles || '').split(',').filter(r => r.trim());
        const primaryRole = allRoles.find(role => role.val === u.role);
        const roleColor = typeof getRoleColor === 'function' ? getRoleColor(u.role) : 'var(--accent-primary)';
        const secBadges = secRoles.map(r => {
          const found = allRoles.find(ar => ar.val === r);
          return found ? `<span class="table-sec-badge">${found.label}</span>` : '';
        }).join(' ');
        return `
        <tr onclick="openUserPerformance(${u.id})">
          <td>
            <div class="user-cell">
              <img src="${getInitialsAvatar(u.name, 38)}" class="user-avatar-img" style="border: 2px solid ${roleColor};">
              <div>
                <div class="user-name-text">${u.name}</div>
                <div class="user-email-text">${u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center; justify-content:center;">
              ${primaryRole ? `<div class="table-role-badge">${primaryRole.label}</div>` : '—'}
              ${secBadges ? `<div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:center; margin-top:2px;">${secBadges}</div>` : ''}
            </div>
          </td>
          <td><div class="points-cell">${u.points}</div></td>
          <td>
            <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <label class="switch">
                <input type="checkbox" ${u.is_active ? 'checked' : ''} onchange="toggleUserActive(${u.id}, this.checked); event.stopPropagation();">
                <span class="slider round"></span>
              </label>
              <span class="badge badge-${u.is_active ? 'approved' : 'rejected'}" style="font-size:0.65rem; font-weight:700; padding:4px 10px; border-radius:12px;">${u.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
          </td>
          <td>
            <div class="table-actions-cell">
              ${auth.hasRole('admin') ? `
                <i class="fas fa-edit-user fas fa-edit" title="Edit User" style="color:var(--accent-primary);" onclick="event.stopPropagation(); editUser(${u.id}, '${u.name}', '${u.role}', '${u.secondary_roles || ''}')"></i>
                <i class="fas fa-key" title="Reset Password" style="color:var(--text-muted);" onclick="event.stopPropagation(); resetUserPassword(${u.id}, '${u.email}')"></i>
                <i class="fas fa-user-slash" title="Deactivate Account" style="color:var(--accent-secondary);" onclick="event.stopPropagation(); deactivateUser(${u.id})"></i>
                <i class="fas fa-trash-alt" title="Permanent Delete" style="color:var(--accent-danger);" onclick="event.stopPropagation(); deleteUser(${u.id})"></i>
              ` : `
                <i class="fas fa-lock" title="Permission Required" style="color:var(--text-muted); opacity:0.5;"></i>
              `}
            </div>
          </td>
        </tr>`;
      }).join('');

  } catch (e) {
    console.error('loadUsers error:', e);
    showToast('Failed to load users', 'error');
  }
}

function initSearch() {
  const input = document.getElementById('user-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => loadUsers(), 200));
}

async function loadRoleArchitect() {
  const container = document.getElementById('role-list');
  if (!container) return;

  try {
    const rawData = await api.get('/admin/roles-users');
    const data = (Array.isArray(rawData) ? rawData : []).filter(group => !REMOVED_ROLES.has(group.role));
    container.innerHTML = data.map((group, idx) => {
      const activeUsers = (group.users || []).filter(u => 
        u.name !== '[Deleted User]' && 
        !u.email?.startsWith('deleted_') && 
        u.is_active !== -1
      );
      const activeCount = activeUsers.filter(u => u.is_active === 1).length;

      return `
      <div class="role-accordion" id="role-acc-${idx}">
        <div class="role-acc-header" onclick="toggleRoleDropdown(${idx})">
          <div class="role-acc-info">
            <div class="role-acc-name">${group.role.replace(/_/g, ' ')}</div>
            <div class="role-acc-count">${activeCount} ACTIVE</div>
          </div>
          <div class="role-acc-right">
            <i class="fas fa-users role-acc-icon"></i>
            <i class="fas fa-chevron-down role-acc-chevron" id="chevron-${idx}"></i>
          </div>
        </div>
        <div class="role-acc-body" id="role-body-${idx}">
          ${activeUsers.length === 0
            ? `<div class="role-acc-empty"><i class="fas fa-ghost"></i> No users assigned</div>`
            : activeUsers.map(user => `
              <div class="role-acc-user" onclick="openUserPerformance(${user.id})">
                <div class="role-acc-avatar">${(user.name || 'U').charAt(0).toUpperCase()}</div>
                <div class="role-acc-details">
                  <div class="role-acc-uname">${user.name}</div>
                  <div class="role-acc-email">${user.email}</div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="role-acc-empty">Failed to load roles.</div>';
  }
}

function toggleRoleDropdown(idx) {
  const body = document.getElementById(`role-body-${idx}`);
  const chevron = document.getElementById(`chevron-${idx}`);
  const acc = document.getElementById(`role-acc-${idx}`);
  if (!body || !chevron || !acc) return;
  const isOpen = body.classList.contains('open');

  body.classList.toggle('open', !isOpen);
  chevron.classList.toggle('rotated', !isOpen);
  acc.classList.toggle('active', !isOpen);
}

// Change user primary role
window.changeUserRole = async function(id, role) {
  try {
    await api.put(`/users/${id}`, { role });
    showToast('Role updated', 'success');
    loadUsers();
    loadRoleArchitect();
  } catch (e) {
    showToast('Failed to update role', 'error');
  }
};

// Toggle user active status
window.toggleUserActive = async function(id, isActive) {
  try {
    await api.put(`/users/${id}`, { is_active: isActive ? 1 : 0 });
    showToast('User status updated', 'success');
    loadUsers();
    loadRoleArchitect();
  } catch (e) {
    showToast('Failed to update status', 'error');
  }
};

// Reset password
window.resetUserPassword = async function(id, email) {
  const newPassword = prompt(`Enter a new password for ${email}:`);
  if (!newPassword || newPassword.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  try {
    await api.put(`/users/${id}/password`, { password: newPassword });
    showToast('Password reset successfully', 'success');
  } catch (e) {
    showToast('Failed to reset password', 'error');
  }
};

// Delete user (permanent soft-delete)
window.deleteUser = async function(id) {
  if (!confirm('CRITICAL: Permanently purge this user data? This will archive all associations.')) return;
  try {
    const res = await api.delete(`/users/${id}`);
    showToast(res.message || 'User data purged successfully', 'success');
    loadUsers();
    loadRoleArchitect();
  } catch (e) { 
    console.error('Purge error:', e);
    showToast('Purge Failed: ' + e.message, 'error'); 
  }
};

// Edit user in a modern side drawer modal
window.editUser = function(id, name, primaryRole, secondaryRolesStr) {
  const allRoleOptions = getRoleOptions();
  const secRoles = (secondaryRolesStr || '').split(',').map(r => r.trim()).filter(Boolean);

  const idInput = document.getElementById('edit-user-id');
  const nameInput = document.getElementById('edit-user-name');
  const primSelect = document.getElementById('edit-user-primary-role');
  const avatarEl = document.getElementById('edit-user-avatar');
  const displayNameEl = document.getElementById('edit-user-display-name');
  const displaySubEl = document.getElementById('edit-user-display-sub');

  if (idInput) idInput.value = id;
  if (nameInput) nameInput.value = name;
  if (displayNameEl) displayNameEl.textContent = name || 'User';
  if (displaySubEl) displaySubEl.textContent = `Primary: ${typeof formatRole === 'function' ? formatRole(primaryRole || '') : (primaryRole || '')}`;
  if (avatarEl) {
    avatarEl.textContent = (name || 'U').charAt(0).toUpperCase();
    avatarEl.style.border = `2px solid ${typeof getRoleColor === 'function' ? getRoleColor(primaryRole) : 'var(--accent-primary)'}`;
  }

  if (primSelect) {
    primSelect.innerHTML = allRoleOptions.map(r => `<option value="${r.value}" ${r.value === primaryRole ? 'selected' : ''}>${r.label}</option>`).join('');
  }

  // Populate secondary roles set and render interactive pills
  editSelectedRoles.clear();
  secRoles.forEach(role => {
    if (allRoleOptions.some(opt => opt.value === role)) {
      editSelectedRoles.add(role);
    }
  });
  renderSecondaryRolePills('edit-sec-roles-grid', editSelectedRoles, 'edit-selected-count');

  openModal('edit-user-modal');
};

async function openUserPerformance(id) {
  try {
    const perf = await api.get(`/users/${id}/performance`);
    const user = await api.get(`/users/${id}`);
    let logins = [];
    try {
      logins = await api.get(`/users/${id}/logins`);
    } catch {}
    const panel = document.getElementById('detail-panel');
    const overlay = document.getElementById('detail-panel-overlay');
    
    document.getElementById('panel-title').textContent = user.name;
    document.getElementById('panel-body').innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:32px;">
        <div class="glass-card" style="padding:12px; text-align:center;">
          <div style="font-size:0.6rem; color:var(--text-muted); margin-bottom:4px;">AVG SCORE</div>
          <div style="font-family:var(--font-mono); font-weight:700; color:var(--accent-secondary);">${Math.round(perf.stats.avg_score || 0)}</div>
        </div>
        <div class="glass-card" style="padding:12px; text-align:center;">
          <div style="font-size:0.6rem; color:var(--text-muted); margin-bottom:4px;">APPROVED</div>
          <div style="font-family:var(--font-mono); font-weight:700; color:var(--accent-green);">${perf.stats.approved || 0}</div>
        </div>
        <div class="glass-card" style="padding:12px; text-align:center;">
          <div style="font-size:0.6rem; color:var(--text-muted); margin-bottom:4px;">REJECTED</div>
          <div style="font-family:var(--font-mono); font-weight:700; color:var(--accent-secondary);">${perf.stats.rejected || 0}</div>
        </div>
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-bottom:16px;">RECENT SUBMISSIONS</div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:32px;">
        ${perf.submissions.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No submissions yet.</div>' : perf.submissions.map(s => `
          <div style="padding:12px; background:var(--bg-hover); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; font-size:0.85rem;">${s.task_title}</div>
              <div style="font-size:0.65rem; color:var(--text-muted);">Score: ${s.nexus_score || '—'} • ${timeAgo(s.submitted_at)}</div>
            </div>
            <div class="badge badge-${s.leader_status}">${s.leader_status}</div>
          </div>
        `).join('')}
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-bottom:16px;">PERFORMANCE LOG</div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:32px;">
        ${perf.logs.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No activity logged.</div>' : perf.logs.map(l => `
          <div style="font-size:0.75rem; display:flex; justify-content:space-between; color:var(--text-secondary);">
            <span>${l.action} ${l.score ? `<span style="color:var(--accent-green);">+${l.score}</span>` : ''}</span>
            <span style="color:var(--text-muted);">${timeAgo(l.logged_at)}</span>
          </div>
        `).join('')}
      </div>

      <div style="font-family:var(--font-display); font-size:0.9rem; margin-bottom:16px;">LOGIN HISTORY</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${logins.length === 0 ? '<div style="color:var(--text-muted); font-size:0.8rem;">No logins recorded.</div>' : logins.map(l => `
          <div style="font-size:0.75rem; display:flex; justify-content:space-between; color:var(--text-secondary);">
            <span>${l.ip || 'IP'} | ${l.user_agent ? l.user_agent.substring(0, 32) + (l.user_agent.length > 32 ? '...' : '') : ''}</span>
            <span style="color:var(--text-muted);">${timeAgo(l.login_at)}</span>
          </div>
        `).join('')}
      </div>
    `;
    
    panel.classList.add('open');
    overlay.style.display = 'block';
    overlay.onclick = closeDetailPanel;
  } catch (e) {
    showToast('Failed to load performance data', 'error');
  }
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-panel-overlay').style.display = 'none';
}

async function deactivateUser(id) {
  if (!confirm('Are you sure you want to deactivate this user?')) return;
  try {
    await api.put(`/users/${id}`, { is_active: 0 });
    showToast('User deactivated', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.initUsers = initUsers;
window.openUserPerformance = openUserPerformance;
window.closeDetailPanel = closeDetailPanel;
window.deactivateUser = deactivateUser;
window.loadCompanyRoles = loadCompanyRoles;
window.toggleRoleDropdown = toggleRoleDropdown;
window.toggleSecRolePill = toggleSecRolePill;
window.toggleAllEditSecRoles = toggleAllEditSecRoles;
window.toggleAllAddSecRoles = toggleAllAddSecRoles;
window.onEditPrimaryRoleChange = onEditPrimaryRoleChange;
