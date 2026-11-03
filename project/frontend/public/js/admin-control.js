async function initAdminControl() {
  loadAuditLogs();
  renderLinkNotes();
  await initRoleManagement();
  await initTeamManagement();
}

let companyRolesCache = [];
let teamUsersCache = [];
let teamsCache = [];
let editingRoleId = null;
let editingTeamId = null;

function normalizeRoleName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function getRoleLabel(name) {
  return String(name || '').replace(/_/g, ' ');
}

async function initRoleManagement() {
  const form = document.getElementById('company-role-form');
  const cancel = document.getElementById('company-role-cancel');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('company-role-name').value,
        description: document.getElementById('company-role-description').value,
        color: document.getElementById('company-role-color').value
      };
      try {
        if (editingRoleId) {
          await api.put(`/admin/company-roles/${editingRoleId}`, payload);
        } else {
          await api.post('/admin/company-roles', payload);
        }
        showToast('Role saved', 'success');
        resetRoleForm();
        await loadCompanyRoles();
        if (window.loadCompanyRoles) await window.loadCompanyRoles();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }
  if (cancel && !cancel.dataset.bound) {
    cancel.dataset.bound = '1';
    cancel.onclick = resetRoleForm;
  }
  await loadCompanyRoles();
}

function resetRoleForm() {
  editingRoleId = null;
  const id = document.getElementById('company-role-id');
  const name = document.getElementById('company-role-name');
  const description = document.getElementById('company-role-description');
  const color = document.getElementById('company-role-color');
  if (id) id.value = '';
  if (name) name.value = '';
  if (description) description.value = '';
  if (color) color.value = '#4f46e5';
}

async function loadCompanyRoles() {
  const container = document.getElementById('company-roles-list');
  if (!container) return;

  try {
    companyRolesCache = await api.get('/admin/company-roles');
    if (companyRolesCache.length === 0) {
      container.innerHTML = '<div class="link-notes-empty">No company roles configured.</div>';
      return;
    }

    container.innerHTML = companyRolesCache.map(role => `
      <div class="admin-list-item">
        <div class="admin-list-top">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <span class="role-color-dot" style="background:${role.color || '#4f46e5'};"></span>
            <div>
              <div class="admin-list-title">${getRoleLabel(role.name)}</div>
              <div class="admin-list-meta">${role.description || 'No description'}<br>${role.user_count} user${role.user_count === 1 ? '' : 's'} assigned</div>
            </div>
          </div>
          <div class="badge ${role.is_system ? 'badge-approved' : 'badge-normal'}" style="font-size:0.6rem;">${role.is_system ? 'System' : 'Custom'}</div>
        </div>
        <div class="admin-list-actions">
          <button class="btn-secondary" style="font-size:0.65rem; padding:6px 10px;" onclick="editCompanyRole(${role.id})">Edit</button>
          ${role.is_system ? '' : `<button class="btn-danger" style="font-size:0.65rem; padding:6px 10px;" onclick="deleteCompanyRole(${role.id})">Delete</button>`}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="link-notes-empty">Failed to load company roles.</div>';
  }
}

window.editCompanyRole = function(id) {
  const role = companyRolesCache.find(item => Number(item.id) === Number(id));
  if (!role) return;
  editingRoleId = role.id;
  document.getElementById('company-role-id').value = role.id;
  document.getElementById('company-role-name').value = role.name;
  document.getElementById('company-role-description').value = role.description || '';
  document.getElementById('company-role-color').value = role.color || '#4f46e5';
};

window.deleteCompanyRole = async function(id) {
  if (!(await confirmDialog('Delete this custom role? Users assigned to it will lose that secondary role.'))) return;
  try {
    await api.delete(`/admin/company-roles/${id}`);
    showToast('Role deleted', 'success');
    resetRoleForm();
    await loadCompanyRoles();
    if (window.loadCompanyRoles) await window.loadCompanyRoles();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function initTeamManagement() {
  const form = document.getElementById('team-form');
  const cancel = document.getElementById('team-cancel');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.onsubmit = async (e) => {
      e.preventDefault();
      const memberSelect = document.getElementById('team-members');
      const payload = {
        name: document.getElementById('team-name').value,
        description: document.getElementById('team-description').value,
        leader_id: document.getElementById('team-leader').value || null,
        member_ids: Array.from(memberSelect.selectedOptions).map(opt => Number(opt.value)).filter(Boolean)
      };
      try {
        if (editingTeamId) {
          await api.put(`/teams/${editingTeamId}`, payload);
        } else {
          await api.post('/teams', payload);
        }
        showToast('Team saved', 'success');
        resetTeamForm();
        await loadTeams();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }
  if (cancel && !cancel.dataset.bound) {
    cancel.dataset.bound = '1';
    cancel.onclick = resetTeamForm;
  }

  await loadTeamUsers();
  await loadTeams();
}

function resetTeamForm() {
  editingTeamId = null;
  const id = document.getElementById('team-id');
  const name = document.getElementById('team-name');
  const description = document.getElementById('team-description');
  const leader = document.getElementById('team-leader');
  const members = document.getElementById('team-members');
  if (id) id.value = '';
  if (name) name.value = '';
  if (description) description.value = '';
  if (leader) leader.value = '';
  if (members) Array.from(members.options).forEach(option => { option.selected = false; });
}

async function loadTeamUsers() {
  try {
    teamUsersCache = await api.get('/users?is_active=1');
  } catch {
    teamUsersCache = [];
  }

  const leaderSelect = document.getElementById('team-leader');
  const memberSelect = document.getElementById('team-members');
  if (leaderSelect) {
    leaderSelect.innerHTML = '<option value="">Select leader</option>' + teamUsersCache.map(user => `<option value="${user.id}">${user.name} (${getRoleLabel(user.role)})</option>`).join('');
  }
  if (memberSelect) {
    memberSelect.innerHTML = teamUsersCache.map(user => `<option value="${user.id}">${user.name} (${getRoleLabel(user.role)})</option>`).join('');
  }
}

async function loadTeams() {
  const container = document.getElementById('teams-list');
  if (!container) return;

  try {
    const teams = await api.get('/teams');
    teamsCache = teams;
    if (teams.length === 0) {
      container.innerHTML = '<div class="link-notes-empty">No teams configured yet.</div>';
      return;
    }

    container.innerHTML = teams.map(team => `
      <div class="admin-list-item">
        <div class="admin-list-top">
          <div>
            <div class="admin-list-title">${team.name}</div>
            <div class="admin-list-meta">${team.description || 'No description'}<br>Leader: ${team.leader_name || 'Not assigned'}<br>${team.member_count || 0} member${(team.member_count || 0) === 1 ? '' : 's'}</div>
          </div>
          <div class="badge badge-normal" style="font-size:0.6rem;">TEAM</div>
        </div>
        <div class="admin-list-meta" style="margin-top:10px;">
          ${Array.isArray(team.members) && team.members.length > 0 ? team.members.map(member => `<span class="badge" style="margin-right:6px; margin-bottom:6px; display:inline-block; font-size:0.58rem;">${member.name}</span>`).join('') : 'No members assigned'}
        </div>
        <div class="admin-list-actions">
          <button class="btn-secondary" style="font-size:0.65rem; padding:6px 10px;" onclick="editTeam(${team.id})">Edit</button>
          <button class="btn-danger" style="font-size:0.65rem; padding:6px 10px;" onclick="deleteTeam(${team.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="link-notes-empty">Failed to load teams.</div>';
  }
}

window.editTeam = function(teamId) {
  const team = teamsCache.find(item => Number(item.id) === Number(teamId));
  if (!team) return;
  editingTeamId = team.id;
  document.getElementById('team-id').value = team.id;
  document.getElementById('team-name').value = team.name || '';
  document.getElementById('team-description').value = team.description || '';
  document.getElementById('team-leader').value = team.leader_id || '';

  const memberSelect = document.getElementById('team-members');
  const memberIds = new Set((team.members || []).map(member => Number(member.id)));
  if (memberSelect) {
    Array.from(memberSelect.options).forEach(option => {
      option.selected = memberIds.has(Number(option.value));
    });
  }
};

window.deleteTeam = async function(id) {
  if (!(await confirmDialog('Delete this team? Existing chat usage is not affected.'))) return;
  try {
    await api.delete(`/teams/${id}`);
    showToast('Team deleted', 'success');
    resetTeamForm();
    await loadTeams();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function loadAuditLogs() {
  const container = document.getElementById('audit-list');
  if (!container) return;

  try {
    const logs = await api.get('/admin/audit');
    if (logs.length === 0) {
      container.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">No snapshots available.</td></tr>';
      return;
    }

    container.innerHTML = logs.map(l => `
      <tr>
        <td style="font-size:0.65rem; font-family:var(--font-mono);">${timeAgo(l.created_at)}</td>
        <td style="font-weight:700;">${l.user_name}</td>
        <td><span class="badge ${l.action === 'DELETE' ? 'badge-urgent' : l.action === 'UPDATE' ? 'badge-normal' : 'badge-approved'}">${l.action}</span></td>
        <td style="font-size:0.75rem; text-transform:uppercase;">${l.table_name} [${l.record_id}]</td>
        <td>
          <button class="btn-secondary" style="font-size:0.6rem; padding:4px 10px;" onclick="initiateWarpRollback(${l.id})">WARP RESTORE</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to sync with Warp repository', 'error');
  }
}

async function initiateWarpRollback(id) {
  if (!(await confirmDialog('INITIATE TEMPORAL WARP?\n\nThis will overwrite current record data with the historical snapshot. Proceed?', { confirmText: 'Roll back' }))) return;

  try {
    const res = await api.post(`/admin/rollback/${id}`);
    showToast(res.message, 'success');
    loadAuditLogs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Link Notes (localStorage) ──────────────────────────────────────────────
const LINK_NOTES_KEY = 'tt_link_notes';

function getLinkNotes() {
  try { return JSON.parse(localStorage.getItem(LINK_NOTES_KEY)) || []; }
  catch { return []; }
}

function saveLinkNotes(notes) {
  localStorage.setItem(LINK_NOTES_KEY, JSON.stringify(notes));
}

function renderLinkNotes() {
  const container = document.getElementById('link-notes-list');
  if (!container) return;
  const notes = getLinkNotes();
  if (notes.length === 0) {
    container.innerHTML = '<div class="link-notes-empty"><i class="fas fa-bookmark" style="display:block;font-size:1.4rem;margin-bottom:8px;opacity:0.3;"></i>No links saved yet</div>';
    return;
  }
  container.innerHTML = notes.map((n, i) => `
    <div class="link-note-item">
      <i class="fas fa-link link-note-icon"></i>
      ${n.label ? `<span class="link-note-label">${n.label}</span>` : ''}
      <a class="link-note-url" href="${n.url}" target="_blank" rel="noopener" title="${n.url}">${n.url}</a>
      <button class="link-note-del" title="Remove" onclick="deleteLinkNote(${i})"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

function addLinkNote() {
  const labelEl = document.getElementById('link-note-label');
  const urlEl = document.getElementById('link-note-url');
  const url = urlEl.value.trim();
  if (!url) { showToast('Enter a URL first', 'error'); return; }
  // auto-prefix if missing scheme
  const finalUrl = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  const label = labelEl.value.trim();
  const notes = getLinkNotes();
  notes.unshift({ label, url: finalUrl });
  saveLinkNotes(notes);
  labelEl.value = '';
  urlEl.value = '';
  renderLinkNotes();
  showToast('Link saved', 'success');
}

function deleteLinkNote(idx) {
  const notes = getLinkNotes();
  notes.splice(idx, 1);
  saveLinkNotes(notes);
  renderLinkNotes();
}

window.initAdminControl = initAdminControl;
window.initiateWarpRollback = initiateWarpRollback;
window.addLinkNote = addLinkNote;
window.deleteLinkNote = deleteLinkNote;
