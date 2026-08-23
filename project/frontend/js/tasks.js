/**
 * Tech Turf Tasks Controller
 * Handles loading, creation, and submission of tasks.
 * Supports multi-member assignment via chip-based picker.
 */

// ─── Multi-member picker state ───────────────────────────────────────────────
const pickerState = {
  new: { selected: [] },  // { id, name, role }
  edit: { selected: [] }
};
let allUsers = [];  // cached user list for pickers

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initTasks() {
  // Handle search parameter from URL (e.g. from Client Portfolio)
  const urlParams = new URLSearchParams(window.location.search);
  const searchVal = urlParams.get('search');
  const searchInput = document.getElementById('task-search');
  if (searchVal && searchInput) {
    searchInput.value = searchVal;
  }

  await loadFormOptions();
  loadTasks();
  initUpload();
  initSearch();
  initPickerCloseOnOutsideClick();

  // Create Task Form
  const newTaskForm = document.getElementById('new-task-form');
  if (newTaskForm) {
    newTaskForm.onsubmit = async (e) => {
      e.preventDefault();
      const memberIds = pickerState.new.selected.map(u => u.id);
      const data = {
        project_id: document.getElementById('task-project').value,
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-desc').value,
        task_members: memberIds,
        priority: document.getElementById('task-priority').value,
        deadline: document.getElementById('task-deadline').value
      };
      try {
        await api.post('/tasks', data);
        showToast('Task created successfully', 'success');
        closeModal('new-task-modal');
        loadTasks();
        newTaskForm.reset();
        clearPicker('new');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  const editTaskForm = document.getElementById('edit-task-form');
  if (editTaskForm) {
    editTaskForm.onsubmit = async (e) => {
      e.preventDefault();
      const taskId = document.getElementById('edit-task-id').value;
      const memberIds = pickerState.edit.selected.map(u => u.id);
      const data = {
        title: document.getElementById('edit-task-title').value,
        description: document.getElementById('edit-task-desc').value,
        task_members: memberIds,
        priority: document.getElementById('edit-task-priority').value,
        deadline: document.getElementById('edit-task-deadline').value || null,
        max_revisions: Number(document.getElementById('edit-task-max-revisions').value || 3)
      };
      try {
        await api.put(`/tasks/${taskId}`, data);
        showToast('Task updated successfully', 'success');
        closeModal('edit-task-modal');
        loadTasks();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // Work Submission Form
  const submitForm = document.getElementById('submit-form');
  if (submitForm) {
    submitForm.onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const taskId = document.getElementById('submit-task-id').value;
      const text = document.getElementById('submit-text').value;
      const file = document.getElementById('file-input').files[0];

      if (!text && !file) {
        showToast('Please provide content or a file', 'warning');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

      const formData = new FormData();
      formData.append('task_id', taskId);
      if (text) formData.append('content_text', text);
      if (file) formData.append('file', file);

      try {
        const sub = await api.upload('/submissions', formData);
        showToast('Work submitted! Nexus AI is evaluating...', 'info');
        const evalResult = await api.post('/nexus/evaluate', {
          submissionId: sub.id,
          roleType: auth.getUser().role,
          contentText: text
        });
        showNexusResult(evalResult);
        loadTasks();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = 'Submit for Review';
      }
    };
  }
}

// ─── Load Tasks ───────────────────────────────────────────────────────────────
async function loadTasks() {
  const project = document.getElementById('filter-project')?.value;
  const priority = document.getElementById('filter-priority')?.value;
  const statusFilter = document.getElementById('filter-status')?.value;
  const search = document.getElementById('task-search')?.value?.trim();

  let url = '/tasks?';
  if (project) url += `project_id=${project}&`;
  if (priority) url += `priority=${priority}&`;
  if (statusFilter) url += `status=${statusFilter}&`;
  if (search) url += `search=${encodeURIComponent(search)}&`;

  try {
    const tasks = await api.get(url);
    const tbody = document.getElementById('task-list-body');
    if (!tbody) return;

    if (tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="empty-state">
          <i class="fas fa-tasks"></i>
          <div class="empty-title">No tasks found</div>
          <div class="empty-action task-create-only"><button class="btn-primary" onclick="openModal('new-task-modal')">Create Task</button></div>
        </div>
      </td></tr>`;
      return;
    }

    const currentUserId = auth.getUser().id;
    const canEditTasks = ['admin', 'team_leader', 'backend', 'frontend_backend', 'production'].includes(auth.getUser().role);

    tbody.innerHTML = tasks.map(t => {
      // Render member avatars (stacked)
      const memberIds = Array.isArray(t.member_ids) ? t.member_ids : [];
      const memberNames = t.member_names || t.assignee_name || 'Unassigned';
      const memberAvatarsHtml = memberIds.length > 0
        ? `<div class="member-avatars">
            ${memberIds.slice(0, 4).map((uid, i) => {
          const names = memberNames.split(', ');
          const n = names[i] || '?';
          return `<img src="${getInitialsAvatar(n, 24)}" title="${n}" style="width:24px;height:24px;border-radius:50%;border:2px solid var(--border);margin-left:${i > 0 ? '-6px' : '0'};z-index:${4 - i};">`;
        }).join('')}
            ${memberIds.length > 4 ? `<span class="member-count-badge">+${memberIds.length - 4}</span>` : ''}
          </div><span style="font-size:0.75rem;color:var(--text-muted);margin-top:3px;display:block;">${memberNames.split(', ').slice(0, 2).join(', ')}${memberNames.split(', ').length > 2 ? '…' : ''}</span>`
        : `<div style="display:flex;align-items:center;gap:8px;">
            <img src="${getInitialsAvatar(t.assignee_name || '?', 24)}" style="width:24px;height:24px;border-radius:50%;border:2px solid var(--border);">
            <span>${t.assignee_name || 'Unassigned'}</span>
          </div>`;

      // Is the current user assigned (primary or member)?
      const isMember = t.assigned_to === currentUserId || memberIds.includes(currentUserId);

      return `
      <tr class="anim-fade-in">
        <td>
          <div class="task-title-cell">${t.title}</div>
          <div class="task-project-cell">${t.project_title || 'General'}</div>
        </td>
        <td>${memberAvatarsHtml}</td>
        <td><div class="badge badge-${t.priority}">${t.priority}</div></td>
        <td>
          ${canEditTasks ?
          `<select class="status-select-pill" data-status="${t.status}" onchange="this.dataset.status = this.value; updateTaskStatus(${t.id}, this.value)">
                <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="submitted" ${t.status === 'submitted' ? 'selected' : ''}>Submitted</option>
                <option value="approved" ${t.status === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="rejected" ${t.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                <option value="rework" ${t.status === 'rework' ? 'selected' : ''}>Rework</option>
            </select>` :
          `<div class="badge badge-${t.status}">${t.status.replace(/_/g, ' ')}</div>`
        }
        </td>
        <td>
          <div style="color:${isOverdue(t.deadline) ? 'var(--accent-secondary)' : 'inherit'}; font-family:var(--font-mono); font-size:0.8rem;">
            ${formatDate(t.deadline)}
          </div>
        </td>
        <td>
          <div style="display:flex; gap:8px;">
            ${(isMember && ['pending', 'in_progress', 'rework'].includes(t.status)) ?
          `<button class="btn-primary" style="padding:6px 12px; font-size:0.7rem;" onclick="openSubmitModal(${t.id}, '${t.title.replace(/'/g, "\\'")}')">SUBMIT</button>` : ''}
            ${(isMember && t.status === 'pending') ?
          `<button class="btn-secondary" style="padding:6px 12px; font-size:0.7rem;" onclick="startTask(${t.id})">START</button>` : ''}
            ${canEditTasks ? `<button class="btn-secondary" style="padding:6px 12px; font-size:0.7rem;" onclick="editTask(${t.id})"><i class="fas fa-edit"></i></button>` : ''}
            ${auth.getUser().role === 'admin' ? `<button class="btn-danger" style="padding:6px 12px; font-size:0.7rem;" onclick="deleteTask(${t.id})"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    showToast('Failed to load tasks', 'error');
  }
}

// ─── Load Form Options ────────────────────────────────────────────────────────
async function loadFormOptions() {
  try {
    const [projects, clients, users] = await Promise.all([
      api.get('/projects'),
      api.get('/clients'),
      api.get('/users?is_active=1')
    ]);
    allUsers = users || [];

    const filterProj = document.getElementById('filter-project');
    const taskProj = document.getElementById('task-project');

    let filterOptions = '<option value="">All Clients & Projects</option>';
    let taskOptions = '<option value="">Select Client</option>';

    if (clients && clients.length > 0) {
      taskOptions += clients.map(c => `<option value="client_${c.id}">${c.name}${c.company ? ' — ' + c.company : ''}</option>`).join('');
      filterOptions += clients.map(c => `<option value="client_${c.id}">${c.name}${c.company ? ' — ' + c.company : ''}</option>`).join('');
    }

    if (projects && projects.length > 0) {
      taskOptions += '<optgroup label="Projects">' +
        projects.map(p => `<option value="${p.id}">${p.title}${p.client_name ? ' (' + p.client_name + ')' : ''}</option>`).join('') +
        '</optgroup>';
      filterOptions += '<optgroup label="Projects">' +
        projects.map(p => `<option value="${p.id}">${p.title}${p.client_name ? ' (' + p.client_name + ')' : ''}</option>`).join('') +
        '</optgroup>';
    }

    if (filterProj) filterProj.innerHTML = filterOptions;
    if (taskProj) taskProj.innerHTML = taskOptions;

    // Populate both picker dropdowns with all users
    populatePickerDropdown('new-picker-dropdown', 'new');
    populatePickerDropdown('edit-picker-dropdown', 'edit');
  } catch (e) {
    console.error('Error loading form options:', e);
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
  populatePickerDropdown(pickerKey === 'new' ? 'new-picker-dropdown' : 'edit-picker-dropdown', pickerKey);
}

function renderChips(pickerKey) {
  const pickerId = pickerKey === 'new' ? 'new-member-picker' : 'edit-member-picker';
  const searchId = pickerKey === 'new' ? 'new-picker-search' : 'edit-picker-search';
  const picker = document.getElementById(pickerId);
  const searchInput = document.getElementById(searchId);
  if (!picker || !searchInput) return;

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
}

function removeMember(pickerKey, id) {
  const state = pickerState[pickerKey];
  state.selected = state.selected.filter(u => u.id !== id);
  renderChips(pickerKey);
  const dropdownId = pickerKey === 'new' ? 'new-picker-dropdown' : 'edit-picker-dropdown';
  populatePickerDropdown(dropdownId, pickerKey);
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
  const pickerKey = dropdownId.startsWith('new') ? 'new' : 'edit';
  populatePickerDropdown(dropdownId, pickerKey);
  openPickerDropdown(dropdownId);
}

function initPickerCloseOnOutsideClick() {
  document.addEventListener('click', (e) => {
    ['new-picker-dropdown', 'edit-picker-dropdown'].forEach(id => {
      const dropdown = document.getElementById(id);
      const picker = document.getElementById(id.replace('-dropdown', ''));
      if (dropdown && picker && !picker.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('task-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => loadTasks(), 200));
}

// ─── Upload ───────────────────────────────────────────────────────────────────
function initUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  const preview = document.getElementById('upload-preview');
  if (!zone || !input || !preview) return;

  zone.onclick = () => input.click();
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      updateUploadPreview();
    }
  };
  input.onchange = updateUploadPreview;

  function updateUploadPreview() {
    if (input.files.length) {
      const file = input.files[0];
      preview.style.display = 'flex';
      preview.style.alignItems = 'center';
      preview.style.gap = '10px';
      preview.innerHTML = `
        <i class="fas fa-file-alt" style="color:var(--accent-primary); font-size:1.2rem;"></i>
        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; font-weight:700; font-size:0.85rem;">${file.name}</div>
        <div style="font-size:0.7rem; color:var(--text-muted);">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
        <i class="fas fa-times" style="cursor:pointer; color:var(--accent-secondary);" onclick="clearUpload()"></i>
      `;
    } else {
      preview.style.display = 'none';
    }
  }
}

function clearUpload() {
  const input = document.getElementById('file-input');
  if (input) input.value = '';
  const preview = document.getElementById('upload-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

// ─── Task Actions ─────────────────────────────────────────────────────────────
async function updateTaskStatus(id, newStatus) {
  try {
    await api.put(`/tasks/${id}`, { status: newStatus });
    showToast('Task status updated inline', 'success');
    loadTasks();
  } catch (err) {
    showToast(err.message, 'error');
    loadTasks(); // revert visually
  }
}

async function deleteTask(id) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    await api.delete(`/tasks/${id}`);
    showToast('Task deleted successfully', 'success');
    loadTasks();
  } catch (e) {
    showToast('Failed to delete task', 'error');
  }
}

async function startTask(id) {
  try {
    await api.put(`/tasks/${id}/start`);
    showToast('Task moved to in progress', 'success');
    loadTasks();
  } catch (e) {
    showToast(e.message || 'Failed to start task', 'error');
  }
}

async function editTask(id) {
  try {
    const task = await api.get(`/tasks/${id}`);
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title').value = task.title || '';
    document.getElementById('edit-task-desc').value = task.description || '';
    document.getElementById('edit-task-priority').value = task.priority || 'normal';
    document.getElementById('edit-task-deadline').value = task.deadline || '';
    document.getElementById('edit-task-max-revisions').value = task.max_revisions || 3;

    // Pre-populate picker with existing task_members
    clearPicker('edit');
    if (task.task_members && task.task_members.length > 0) {
      pickerState.edit.selected = task.task_members.map(m => ({ id: m.id, name: m.name, role: m.role }));
    } else if (task.assigned_to && task.assignee_name) {
      // Fallback: old single-assignee task
      pickerState.edit.selected = [{ id: task.assigned_to, name: task.assignee_name, role: task.role_required || '' }];
    }
    renderChips('edit');
    populatePickerDropdown('edit-picker-dropdown', 'edit');

    openModal('edit-task-modal');
  } catch (e) {
    showToast('Failed to load task details', 'error');
  }
}

// ─── Submit Modal ─────────────────────────────────────────────────────────────
function openSubmitModal(id, title) {
  const taskIdInput = document.getElementById('submit-task-id');
  if (!taskIdInput) return;

  const info = document.getElementById('submit-task-info');
  if (info) {
    info.innerHTML = `
      <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px; letter-spacing:1px;">SUBMITTING PROGRESS FOR:</div>
      <div style="font-family:var(--font-display); font-weight:700; color:var(--accent-primary);">${title}</div>
    `;
  }

  const form = document.getElementById('submit-form');
  const result = document.getElementById('nexus-result');
  if (form) { form.reset(); form.style.display = 'block'; }
  if (result) result.style.display = 'none';
  clearUpload();
  taskIdInput.value = id;

  const btn = document.getElementById('submit-btn');
  if (btn) { btn.disabled = false; btn.innerHTML = 'Submit for Review'; }

  openModal('submit-modal');
}

function showNexusResult(res) {
  const form = document.getElementById('submit-form');
  const resultDiv = document.getElementById('nexus-result');
  if (form) form.style.display = 'none';
  if (resultDiv) resultDiv.style.display = 'block';

  const ringContainer = document.getElementById('nexus-ring-container');
  if (ringContainer && window.createScoreRing) createScoreRing(res.score, ringContainer);

  const feedback = res.feedback || {};
  const feedbackDiv = document.getElementById('nexus-feedback');
  if (feedbackDiv) {
    feedbackDiv.innerHTML = `
      <div style="margin-bottom:12px; background:rgba(67,233,123,0.05); padding:12px; border-radius:8px; border:2px solid rgba(67,233,123,0.2);">
        <span style="color:var(--accent-green); font-weight:700; display:block; margin-bottom:4px;">✅ WHAT WORKED:</span>
        <div style="color:var(--text-primary); font-size:0.85rem;">${feedback.what_worked || 'No feedback provided'}</div>
      </div>
      <div style="margin-bottom:12px; background:rgba(249,168,37,0.05); padding:12px; border-radius:8px; border:2px solid rgba(249,168,37,0.2);">
        <span style="color:var(--accent-orange); font-weight:700; display:block; margin-bottom:4px;">⚠️ IMPROVEMENTS:</span>
        <div style="color:var(--text-primary); font-size:0.85rem;">${feedback.improvements || 'No feedback provided'}</div>
      </div>
      <div style="background:rgba(16,42,150,0.05); padding:12px; border-radius:8px; border:2px solid rgba(16,42,150,0.2);">
        <span style="color:var(--accent-primary); font-weight:700; display:block; margin-bottom:4px;">🔧 SUGGESTIONS:</span>
        <div style="color:var(--text-primary); font-size:0.85rem;">${feedback.suggestions || 'No feedback provided'}</div>
      </div>
    `;
  }
}

function finishSubmissionReview() {
  closeModal('submit-modal');
  loadTasks();
}

function isOverdue(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date().setHours(0, 0, 0, 0);
}

async function openNewTaskModal() {
  const form = document.getElementById('new-task-form');
  if (form) form.reset();
  clearPicker('new');
  await loadFormOptions();
  openModal('new-task-modal');
}

// ─── Global Exports ───────────────────────────────────────────────────────────
window.initTasks = initTasks;
window.openNewTaskModal = openNewTaskModal;
window.loadTasks = loadTasks;
window.openSubmitModal = openSubmitModal;
window.clearUpload = clearUpload;
window.updateTaskStatus = updateTaskStatus;
window.deleteTask = deleteTask;
window.editTask = editTask;
window.startTask = startTask;
window.finishSubmissionReview = finishSubmissionReview;
window.togglePickerDropdown = togglePickerDropdown;
window.openPickerDropdown = openPickerDropdown;
window.filterPickerOptions = filterPickerOptions;
window.toggleMember = toggleMember;
window.removeMember = removeMember;
