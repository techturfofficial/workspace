/**
 * Tech Turf Submissions Review Controller
 * Handles work review, approval, rework, and rejection.
 */

let allSubmissions = [];
let manualFilesQueue = [];

async function initSubmissions() {
  loadSubmissions();
  initManualUpload();
}

async function loadSubmissions() {
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('client');
  const status = document.getElementById('filter-status')?.value;

  let url = '/submissions';
  let params = [];
  if (status) params.push(`status=${status}`);
  if (clientId) params.push(`client_id=${clientId}`);

  if (params.length > 0) url += `?${params.join('&')}`;

  try {
    const subs = await api.get(url);
    allSubmissions = subs;
    const container = document.getElementById('submissions-list');
    if (!container) return;

    if (subs.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <i class="fas fa-inbox"></i>
          <div class="empty-title">No submissions found</div>
          <div class="empty-desc">There are no submissions matching your current filters.</div>
        </div>
      `;
      return;
    }

    const currentUser = (window.auth && auth.getUser) ? auth.getUser() : { id: 0, role: 'member' };
    const currentRole = currentUser.role;
    const isTeamLeader = currentRole === 'team_leader';
    const isAdmin = currentRole === 'admin';

    const getWorkflowState = (s) => {
      if (s.leader_status === 'rejected' || s.admin_status === 'rejected') return 'rejected';
      if (s.leader_status === 'rework' || s.admin_status === 'rework') return 'rework';
      if (s.leader_status === 'approved' && s.admin_status === 'approved') return 'approved';
      if (s.leader_status === 'approved' && s.admin_status === 'pending') return 'awaiting_admin';
      return 'pending';
    };

    const getBadgeLabel = (s) => {
      const state = getWorkflowState(s);
      if (state === 'awaiting_admin') return 'AWAITING ADMIN';
      if (state === 'approved') return 'APPROVED';
      if (state === 'rework') return 'REWORK';
      if (state === 'rejected') return 'REJECTED';
      return 'PENDING LEADER';
    };

    container.innerHTML = subs.map(s => {
      const feedback = s.nexus_feedback || {};
      const workflowState = getWorkflowState(s);
      const statusClass = workflowState === 'approved' ? 'success' :
        workflowState === 'awaiting_admin' ? 'warning' :
          workflowState === 'rework' ? 'warning' :
            workflowState === 'rejected' ? 'danger' : 'pending';

      const isOwner = s.submitted_by === currentUser.id;
      const canDelete = isAdmin || isOwner;

      let actionsHtml = '';
      if (isTeamLeader && s.leader_status === 'pending') {
        actionsHtml = `
          <div class="submission-actions">
            <button class="btn-primary" style="background:var(--accent-green); flex:1;" onclick="event.stopPropagation(); reviewSubmission(${s.id}, 'approved')">APPROVE</button>
            <button class="btn-secondary" style="background:var(--accent-orange); flex:1;" onclick="event.stopPropagation(); reviewSubmission(${s.id}, 'rework')">REWORK</button>
            <button class="btn-danger" style="flex:1;" onclick="event.stopPropagation(); reviewSubmission(${s.id}, 'rejected')">REJECT</button>
            ${canDelete ? `<button class="btn-danger" style="flex:0.35;" onclick="event.stopPropagation(); deleteSubmission(${s.id})" title="Delete Submission"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        `;
      } else if (isAdmin && s.leader_status === 'approved' && s.admin_status !== 'approved') {
        actionsHtml = `
          <div class="submission-actions">
            <button class="btn-primary" style="background:var(--accent-green); flex:1;" onclick="event.stopPropagation(); adminReviewSubmission(${s.id}, 'approved')">FINAL APPROVE</button>
            <button class="btn-secondary" style="background:var(--accent-orange); flex:1;" onclick="event.stopPropagation(); adminReviewSubmission(${s.id}, 'rework')">SEND BACK</button>
            <button class="btn-danger" style="flex:1;" onclick="event.stopPropagation(); adminReviewSubmission(${s.id}, 'rejected')">REJECT</button>
            ${canDelete ? `<button class="btn-danger" style="flex:0.35;" onclick="event.stopPropagation(); deleteSubmission(${s.id})" title="Delete Submission"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="submission-actions" style="opacity:0.95;">
            <button class="btn-secondary" style="flex:1;" disabled>${workflowState === 'approved' ? 'Approved' : (workflowState === 'rejected' ? 'Rejected' : (workflowState === 'rework' ? 'Needs Rework' : 'In Review'))}</button>
            ${canDelete ? `<button class="btn-danger" style="flex:0.35;" onclick="event.stopPropagation(); deleteSubmission(${s.id})" title="Delete Submission"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        `;
      }

      const displayTitle = s.project_name || s.task_title || 'Work Submission';
      const isWeeklyReport = (s.project_name && s.project_name.toLowerCase().includes('weekly')) || (s.content_text && s.content_text.includes('WEEKLY PROGRESS REPORT'));

      let attachedFiles = [];
      try {
        attachedFiles = typeof s.file_path === 'string' ? JSON.parse(s.file_path) : (s.file_path || []);
      } catch {
        if (s.file_path) attachedFiles = [s.file_path];
      }
      const pdfPath = attachedFiles.find(f => typeof f === 'string' && f.toLowerCase().endsWith('.pdf'));

      return `
        <div class="glass-card submission-card anim-fade-up sub-card-clickable" onclick="viewSubmissionDetails(${s.id})">
          <div class="submission-header">
            <div style="flex:1; min-width:0;">
              <div class="submission-title" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85%;">${displayTitle}</span>
                ${isWeeklyReport ? '<span class="badge" style="background:rgba(255,107,0,0.1); color:#ff6b00; border:1px solid rgba(255,107,0,0.25); font-size:0.6rem; font-weight:800; padding:2px 6px;"><i class="fas fa-file-invoice" style="margin-right:3px;"></i>TT 2.0</span>' : ''}
              </div>
              <div class="submission-project">${s.project_title || s.project_name || 'General Operations'} • v${s.version}</div>
            </div>
            <div class="badge badge-${statusClass}" style="font-size:0.65rem; padding:3px 8px; flex-shrink:0;">${getBadgeLabel(s)}</div>
          </div>

          <div class="submitter-info">
            <img src="${getInitialsAvatar(s.submitter_name || '?', 28, s.submitter_role)}" style="width:28px; height:28px; border-radius:50%; border:1.5px solid var(--border);">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; font-size:0.8rem; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.submitter_name || 'Unknown'}</div>
              <div style="font-size:0.65rem; color:var(--text-muted);">${formatRole(s.submitter_role || 'member')} • ${timeAgo(s.submitted_at)}</div>
            </div>
          </div>

          ${s.content_text ? `
            <div class="sub-summary-box">
              ${escapeHtml(s.content_text.substring(0, 160))}
            </div>
          ` : ''}

          ${pdfPath ? `
            <button type="button" onclick="event.stopPropagation(); window.open('${pdfPath}', '_blank')" class="sub-btn-pdf">
              <i class="fas fa-file-pdf"></i><span>View PDF Report</span>
            </button>
          ` : (s.file_path || s.external_link ? `
            <button type="button" onclick="event.stopPropagation(); viewWorkAssets(${s.id})" class="btn-secondary" style="font-size:0.72rem; padding:6px 10px; height:32px; display:flex; align-items:center; justify-content:center; gap:6px;">
              <i class="fas fa-cubes"></i><span>Review Assets</span>
            </button>
          ` : '')}

          ${actionsHtml}
        </div>
      `;
    }).join('');

    // Initialize individual score rings after rendering
    subs.forEach(s => {
      if (s.nexus_score !== null && window.createScoreRing) {
        const ringEl = document.getElementById(`ring-${s.id}`);
        if (ringEl) createScoreRing(s.nexus_score, ringEl);
      }
    });

  } catch (e) {
    showToast('Failed to load submissions', 'error');
  }
}

async function reviewSubmission(id, status) {
  const note = prompt(`Reviewing ${status.toUpperCase()}. Enter optional feedback for the employee:`, '');
  if (note === null) return; // User cancelled

  try {
    await api.put(`/submissions/${id}/leader-review`, { status, note });
    showToast(`Team leader review ${status} successfully`, 'success');
    loadSubmissions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function adminReviewSubmission(id, status) {
  const note = prompt(`Admin ${status.toUpperCase()} review note (optional):`, '');
  if (note === null) return;

  try {
    await api.put(`/submissions/${id}/admin-review`, { status, note });
    showToast(`Admin review ${status} successfully`, 'success');
    loadSubmissions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function reEvaluateSubmission(id) {
  if (!confirm('Re-opening review will reset the current approval status. Continue?')) return;
  reviewSubmission(id, 'pending');
}

let cachedManualTasks = [];
let cachedManualClients = [];

async function loadManualFormOptions() {
  const taskSelect = document.getElementById('manual-task-id');
  const clientSelect = document.getElementById('manual-client-id');
  if (!taskSelect) return;

  taskSelect.innerHTML = '<option value="">Loading tasks...</option>';

  try {
    const [tasks, clients] = await Promise.all([
      api.get('/tasks'),
      api.get('/clients').catch(() => [])
    ]);

    cachedManualTasks = tasks || [];
    cachedManualClients = clients || [];

    if (cachedManualTasks.length === 0) {
      taskSelect.innerHTML = '<option value="">No tasks found (Optional)</option>';
    } else {
      taskSelect.innerHTML = '<option value="">Select a task...</option>' +
        cachedManualTasks.map(t => `<option value="${t.id}">${t.title} [${t.project_title || 'General'}]</option>`).join('');
    }

    if (clientSelect) {
      if (cachedManualClients.length === 0) {
        clientSelect.innerHTML = '<option value="">No clients found</option>';
      } else {
        clientSelect.innerHTML = '<option value="">Select a client...</option>' +
          cachedManualClients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
    }
  } catch (e) {
    console.error('Error loading manual upload form options:', e);
    taskSelect.innerHTML = '<option value="">Failed to load tasks</option>';
  }
}

async function openManualSubmissionModal() {
  const form = document.getElementById('manual-submission-form');
  if (form) form.reset();
  clearManualQueue();
  await loadManualFormOptions();
  openModal('manual-submission-modal');
}

async function initManualUpload() {
  const form = document.getElementById('manual-submission-form');
  const taskSelect = document.getElementById('manual-task-id');
  if (!form || !taskSelect) return;

  await loadManualFormOptions();

  taskSelect.onchange = () => {
    const selectedId = Number(taskSelect.value);
    if (!selectedId) return;
    const task = cachedManualTasks.find(t => t.id === selectedId);
    if (task) {
      const projInput = document.getElementById('manual-project-name');
      if (projInput && task.project_title && !projInput.value) {
        projInput.value = task.project_title;
      }
      if (task.client_id) {
        const clientSelect = document.getElementById('manual-client-id');
        if (clientSelect) clientSelect.value = task.client_id;
      }
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const taskId = document.getElementById('manual-task-id').value;
    const clientId = document.getElementById('manual-client-id')?.value;
    const projectName = document.getElementById('manual-project-name')?.value;
    const text = document.getElementById('manual-text').value;
    const externalLink = document.getElementById('manual-external-link')?.value;

    if (!taskId && (!clientId || !projectName)) {
      return showToast('Please select a target task OR provide a client and project name', 'warning');
    }
    if (!text && manualFilesQueue.length === 0 && !externalLink) return showToast('Please provide content, a file, or an external link', 'warning');

    const formData = new FormData();
    if (taskId) formData.append('task_id', taskId);
    if (clientId) formData.append('client_id', clientId);
    if (projectName) formData.append('project_name', projectName);
    if (text) formData.append('content_text', text);
    if (externalLink) formData.append('external_link', externalLink);
    for (let i = 0; i < manualFilesQueue.length; i++) {
      formData.append('files', manualFilesQueue[i]);
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    try {
      await api.upload('/submissions', formData);
      showToast('Manual submission uploaded successfully', 'success');
      closeModal('manual-submission-modal');
      form.reset();
      clearManualQueue();
      loadSubmissions();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Upload Submission';
    }
  };
}

function addFilesToManualQueue(input) {
  if (!input.files || input.files.length === 0) return;

  for (let f of input.files) {
    manualFilesQueue.push(f);
  }

  updateManualQueueUI();
}

function clearManualQueue() {
  manualFilesQueue = [];
  const input = document.getElementById('manual-file');
  if (input) input.value = '';
  updateManualQueueUI();
}

function removeFromManualQueue(index) {
  manualFilesQueue.splice(index, 1);
  updateManualQueueUI();
}

function updateManualQueueUI() {
  const preview = document.getElementById('manual-file-preview');
  if (!preview) return;

  if (manualFilesQueue.length === 0) {
    preview.style.display = 'none';
    return;
  }

  preview.style.display = 'block';
  preview.style.background = 'rgba(0,0,0,0.3)';
  preview.style.padding = '12px';
  preview.style.borderRadius = '10px';
  preview.style.marginTop = '10px';
  preview.style.border = '2px solid var(--border)';

  preview.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:700; font-size:0.75rem; color:var(--accent-primary); letter-spacing:0.5px;">📂 QUEUED ASSETS: ${manualFilesQueue.length}</div>
            <button type="button" onclick="clearManualQueue()" style="background:none; border:none; color:var(--accent-orange); font-size:0.65rem; cursor:pointer; font-weight:700; text-transform:uppercase;">CLEAR ALL</button>
        </div>
        <div style="max-height:120px; overflow-y:auto; overflow-x:hidden; padding-right:5px;">
            ${manualFilesQueue.map((f, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; background:rgba(255,255,255,0.03); padding:6px 10px; border-radius:5px; border:2px solid rgba(255,255,255,0.05);">
                    <div style="font-size:0.7rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85%;">📎 ${f.name}</div>
                    <i class="fas fa-times" onclick="removeFromManualQueue(${i})" style="color:var(--accent-secondary); font-size:0.7rem; cursor:pointer; opacity:0.7; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Remove file"></i>
                </div>
            `).join('')}
        </div>
    `;
}

async function viewSubmissionDetails(id) {
  const s = allSubmissions.find(x => x.id === id);
  if (!s) return;

  const container = document.getElementById('submission-detail-body');
  const isWeeklyReport = (s.project_name && s.project_name.toLowerCase().includes('weekly')) || (s.content_text && s.content_text.includes('WEEKLY PROGRESS REPORT'));

  let paths = [];
  if (s.file_path) {
    if (typeof s.file_path === 'string' && s.file_path.startsWith('[')) {
      try { paths = JSON.parse(s.file_path); } catch (e) { paths = [s.file_path]; }
    } else {
      paths = Array.isArray(s.file_path) ? s.file_path : [s.file_path];
    }
  }
  const pdfPath = paths.find(f => typeof f === 'string' && f.toLowerCase().endsWith('.pdf')) || paths[0];
  const currentRole = (window.auth && auth.getUser) ? auth.getUser().role : 'member';
  const isAdmin = currentRole === 'admin';
  if (isWeeklyReport) {
    const isOwner = s.submitted_by === (window.auth && auth.getUser ? auth.getUser().id : 0);
    container.innerHTML = `
      <div class="drawer-meta-grid">
        <div class="drawer-meta-tile">
          <div class="drawer-meta-title"><i class="fas fa-user" style="color:var(--accent-primary); margin-right:4px;"></i>Submitted By</div>
          <div class="drawer-meta-value">${escapeHtml(s.submitter_name)}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${formatRole(s.submitter_role || 'member')}</div>
        </div>
        <div class="drawer-meta-tile">
          <div class="drawer-meta-title"><i class="fas fa-file-alt" style="color:#ff6b00; margin-right:4px;"></i>Report Title</div>
          <div class="drawer-meta-value" title="${escapeHtml(s.project_name || 'Weekly Progress Report')}">${escapeHtml(s.project_name || 'Weekly Progress Report')}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">Version ${s.version}</div>
        </div>
        <div class="drawer-meta-tile">
          <div class="drawer-meta-title"><i class="fas fa-shield-alt" style="color:#22c55e; margin-right:4px;"></i>Admin Status</div>
          <div class="drawer-meta-value">
            <span class="badge ${s.admin_status === 'approved' ? 'badge-approved' : (s.admin_status === 'rejected' ? 'badge-rejected' : 'badge-pending')}" style="font-size:0.7rem; padding:2px 8px;">
              ${(s.admin_status || 'pending').toUpperCase()}
            </span>
          </div>
        </div>
        <div class="drawer-meta-tile">
          <div class="drawer-meta-title"><i class="fas fa-clock" style="color:#6366f1; margin-right:4px;"></i>Submitted Time</div>
          <div class="drawer-meta-value">${timeAgo(s.submitted_at)}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${(s.submitted_at || '').substring(0, 10)}</div>
        </div>
      </div>

      ${pdfPath ? `
        <div class="drawer-pdf-container">
          <div class="drawer-pdf-toolbar">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:30px; height:30px; border-radius:8px; background:rgba(255,107,0,0.12); color:#ff6b00; display:flex; align-items:center; justify-content:center; font-size:1rem;">
                <i class="fas fa-file-pdf"></i>
              </div>
              <div>
                <div style="font-weight:800; font-size:0.88rem; color:#102a96;">Weekly Progress Report (Official PDF)</div>
                <div style="font-size:0.68rem; color:var(--text-muted);">Rendered in High-Fidelity A4 Document Mode</div>
              </div>
            </div>
            <a href="${pdfPath}" target="_blank" class="btn-primary" style="padding:6px 14px; font-size:0.72rem; text-decoration:none; display:inline-flex; align-items:center; gap:6px; border-radius:8px; font-weight:700;">
              <i class="fas fa-external-link-alt"></i><span>Open Fullscreen</span>
            </a>
          </div>
          <iframe src="${pdfPath}" class="drawer-pdf-iframe"></iframe>
        </div>
      ` : ''}

      <div style="margin-top:14px;">
        <div style="font-size:0.75rem; font-weight:800; color:#102a96; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
          <i class="fas fa-align-left" style="color:var(--accent-primary); margin-right:4px;"></i>Report Summary
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:0.78rem; color:#334155; line-height:1.45; white-space:pre-wrap; max-height:140px; overflow-y:auto;">${escapeHtml(s.content_text || 'No text summary provided.')}</div>
      </div>

      <div class="drawer-sticky-footer">
        ${isAdmin && s.admin_status !== 'approved' ? `
          <div style="display:flex; gap:6px; flex:1;">
            <button class="btn-primary" style="background:var(--accent-green); flex:1; height:36px; font-weight:800; font-size:0.72rem; border-radius:8px;" onclick="adminReviewSubmission(${s.id}, 'approved'); closeModal('submission-detail-modal');">
              <i class="fas fa-check" style="margin-right:4px;"></i>FINAL APPROVE
            </button>
            <button class="btn-secondary" style="background:var(--accent-orange); flex:1; height:36px; font-weight:800; font-size:0.72rem; border-radius:8px;" onclick="adminReviewSubmission(${s.id}, 'rework'); closeModal('submission-detail-modal');">
              <i class="fas fa-redo" style="margin-right:4px;"></i>SEND BACK
            </button>
            <button class="btn-danger" style="flex:1; height:36px; font-weight:800; font-size:0.72rem; border-radius:8px;" onclick="adminReviewSubmission(${s.id}, 'rejected'); closeModal('submission-detail-modal');">
              <i class="fas fa-times" style="margin-right:4px;"></i>REJECT
            </button>
          </div>
        ` : '<div></div>'}
        ${(isAdmin || isOwner) ? `
          <button type="button" class="btn-danger" style="padding:8px 14px; font-weight:800; font-size:0.72rem; height:36px; display:inline-flex; align-items:center; gap:6px; border-radius:8px;" onclick="deleteSubmission(${s.id}); closeModal('submission-detail-modal');" title="Delete Report">
            <i class="fas fa-trash-alt"></i><span>DELETE REPORT</span>
          </button>
        ` : ''}
      </div>
    `;

    openModal('submission-detail-modal');
    return;
  }

  const feedback = s.nexus_feedback || {};

  container.innerHTML = `
    <div class="detail-grid">
      <div class="detail-meta-box">
        <div class="detail-meta-title">Submitted By</div>
        <div class="detail-meta-value">${s.submitter_name}</div>
      </div>
      <div class="detail-meta-box">
        <div class="detail-meta-title">Task / Project</div>
        <div class="detail-meta-value">${s.task_title || s.project_name || 'General Task'}</div>
      </div>
      <div class="detail-meta-box">
        <div class="detail-meta-title">Leader Status</div>
        <div class="detail-meta-value">${(s.leader_status || 'pending').toUpperCase()}</div>
      </div>
      <div class="detail-meta-box">
        <div class="detail-meta-title">Admin Status</div>
        <div class="detail-meta-value">${(s.admin_status || 'pending').toUpperCase()}</div>
      </div>
      <div class="detail-meta-box">
        <div class="detail-meta-title">Time Reference</div>
        <div class="detail-meta-value">${timeAgo(s.submitted_at)}</div>
      </div>
    </div>

    <div class="detail-section">
      <span class="detail-label">Evaluation: Nexus Core</span>
      <div class="feedback-box" style="display:block; margin-bottom:15px;">
        <div class="feedback-item">
          <span class="feedback-label" style="color:var(--accent-green);">WHAT WORKED</span>
          <div style="font-size:0.85rem;">${feedback.what_worked || 'Evaluation in progress...'}</div>
        </div>
        <div class="feedback-item" style="margin-top:10px;">
          <span class="feedback-label" style="color:var(--accent-orange);">AREAS FOR IMPROVEMENT</span>
          <div style="font-size:0.85rem;">${feedback.improvements || 'No critical issues.'}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <span class="detail-label">Work Summary / Content</span>
      <div class="detail-bubble" style="white-space:pre-wrap;">${s.content_text || 'No text content provided.'}</div>
    </div>

    <div class="detail-section">
      <span class="detail-label">Relics & External Links</span>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${s.file_path || s.external_link ? `
          <button onclick="viewWorkAssets(${s.id})" class="btn-primary" style="flex:1; display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="fas fa-cubes"></i> Open Assets Bundle
          </button>
        ` : '<div class="text-muted" style="font-size:0.8rem;">No external assets attached.</div>'}
      </div>
    </div>
  `;

  openModal('submission-detail-modal');
}

async function viewWorkAssets(id) {
  const s = allSubmissions.find(x => x.id === id);
  if (!s) return;

  const container = document.getElementById('work-assets-body');
  let html = '';

  const categorizeFile = (path) => {
    if (!path) return null;
    const ext = path.split('.').pop().toLowerCase();
    const imgs = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const vids = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
    if (imgs.includes(ext)) return 'images';
    if (vids.includes(ext)) return 'videos';
    return 'files';
  };

  const categories = {
    links: s.external_link ? [{ name: 'Project External Link', url: s.external_link, icon: 'fa-external-link-alt' }] : [],
    images: [],
    videos: [],
    files: []
  };

  // Extract file paths (could be single string or JSON array)
  let paths = [];
  if (s.file_path) {
    if (s.file_path.startsWith('[')) {
      try { paths = JSON.parse(s.file_path); } catch (e) { paths = [s.file_path]; }
    } else {
      paths = [s.file_path];
    }
  }

  paths.forEach(path => {
    const cat = categorizeFile(path);
    if (cat) {
      categories[cat].push({
        name: path.split('/').pop(),
        url: path,
        icon: cat === 'images' ? 'fa-image' : (cat === 'videos' ? 'fa-video' : 'fa-file-alt')
      });
    }
  });

  const renderSection = (title, icon, items, type) => {
    if (items.length === 0) return '';
    return `
      <div class="asset-category-sec">
        <div class="asset-category-title"><i class="fas ${icon}"></i> ${title}</div>
        <div class="asset-item-list">
          ${items.map(item => `
            <div>
              <div class="asset-item-row">
                <div class="asset-item-main">
                  <i class="fas ${item.icon} asset-item-icon"></i>
                  <div class="asset-item-info">
                    <div class="asset-item-name">${item.name}</div>
                    <div class="asset-item-meta">${type === 'links' ? 'Cloud Resource' : 'Local Archive'}</div>
                  </div>
                </div>
                <a href="${item.url}" target="_blank" class="btn-secondary" style="padding: 6px 12px; font-size: 0.7rem;">
                  <i class="fas ${type === 'links' ? 'fa-link' : 'fa-download'}"></i> ${type === 'links' ? 'OPEN' : 'GET'}
                </a>
              </div>
              ${type === 'images' ? `
                <div class="asset-preview-container">
                  <img src="${item.url}" class="asset-preview" alt="Preview">
                </div>
              ` : ''}
              ${type === 'videos' ? `
                <div class="asset-preview-container">
                  <video controls class="asset-video-preview">
                    <source src="${item.url}" type="video/mp4">
                    Your browser does not support the video tag.
                  </video>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  html += renderSection('RELEVANT LINKS', 'fa-link', categories.links, 'links');
  html += renderSection('VISUAL ASSETS (IMAGES)', 'fa-images', categories.images, 'images');
  html += renderSection('MOTION GRAPHICS (VIDEOS)', 'fa-film', categories.videos, 'videos');
  html += renderSection('DOCUMENTS & ARCHIVES', 'fa-file-archive', categories.files, 'files');

  if (!html) html = '<div class="text-muted" style="text-align:center; padding:40px;">No assets found in bundle.</div>';

  container.innerHTML = html;
  openModal('work-assets-modal');
}

async function deleteSubmission(id) {
  if (!confirm('DESTRUCTIVE ACTION: Permanently remove this submission from the system?')) return;
  try {
    await api.delete(`/submissions/${id}`);
    showToast('Submission purged', 'success');
    loadSubmissions();
  } catch (e) {
    showToast('Failed to purge submission', 'error');
  }
}

// Global Exports
window.initSubmissions = initSubmissions;
window.loadSubmissions = loadSubmissions;
window.reviewSubmission = reviewSubmission;
window.reEvaluateSubmission = reEvaluateSubmission;
window.deleteSubmission = deleteSubmission;
window.viewSubmissionDetails = viewSubmissionDetails;
window.viewWorkAssets = viewWorkAssets;
window.addFilesToManualQueue = addFilesToManualQueue;
window.clearManualQueue = clearManualQueue;
window.removeFromManualQueue = removeFromManualQueue;
window.openManualSubmissionModal = openManualSubmissionModal;
window.loadManualFormOptions = loadManualFormOptions;
