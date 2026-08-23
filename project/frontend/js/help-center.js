const walkthroughKeys = [
  { key: 'walkthrough.enabled', label: 'Enable walkthrough globally', hint: 'Master switch used across user onboarding.' },
  { key: 'walkthrough.dashboard', label: 'Dashboard tour', hint: 'Shows KPI and quick-action tour cards.' },
  { key: 'walkthrough.tasks', label: 'Task workflow tour', hint: 'Highlights status transitions and ownership.' },
  { key: 'walkthrough.projects', label: 'Project overview tour', hint: 'Introduces milestones and teams.' },
  { key: 'walkthrough.messages', label: 'Messenger tour', hint: 'Covers conversation, mentions, and read state.' }
];

let helpArticles = [];
let helpPolicies = [];

function isEnabledValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function policyEntry(key) {
  return helpPolicies.find(item => item.key === key);
}

async function savePolicy(key, value) {
  await api.put(`/enterprise/policies/${encodeURIComponent(key)}`, { value: String(value ?? '') });
}

function renderArticleList(searchText = '') {
  const list = document.getElementById('article-list');
  if (!list) return;

  const query = searchText.trim().toLowerCase();
  const filtered = query
    ? helpArticles.filter(item => (`${item.title} ${item.content}`).toLowerCase().includes(query))
    : helpArticles;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><div class="empty-title">No matching articles</div></div>';
    return;
  }

  list.innerHTML = filtered.map(item => `
    <div class="article-item">
      <div class="article-title">${item.title}</div>
      <div class="article-meta">${item.language || 'en'} | scope: ${item.role_scope || 'all'} | ${timeAgo(item.created_at)}</div>
      <div class="article-content">${item.content}</div>
    </div>
  `).join('');
}

function renderWalkthroughToggleList() {
  const container = document.getElementById('walkthrough-toggle-list');
  if (!container) return;

  container.innerHTML = walkthroughKeys.map(item => {
    const currentValue = policyEntry(item.key)?.value ?? (item.key === 'walkthrough.enabled' ? 'true' : 'false');
    return `
      <label class="toggle-row">
        <div>
          <div style="font-size:0.84rem; font-weight:700;">${item.label}</div>
          <small>${item.hint}</small>
        </div>
        <input type="checkbox" data-key="${item.key}" ${isEnabledValue(currentValue) ? 'checked' : ''}>
      </label>
    `;
  }).join('');
}

async function loadArticles() {
  const list = document.getElementById('article-list');
  if (list) list.innerHTML = '<div style="padding:20px; color:var(--text-muted);">Loading help articles...</div>';

  try {
    const language = document.getElementById('help-language')?.value?.trim() || 'en';
    helpArticles = await api.get(`/enterprise/help/articles?language=${encodeURIComponent(language)}`);
    renderArticleList(document.getElementById('article-search')?.value || '');
  } catch (err) {
    if (list) list.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><div class="empty-title">Failed to load articles</div></div>';
    showToast(err.message || 'Failed to load articles', 'error');
  }
}

async function loadPoliciesAndOnboarding() {
  try {
    helpPolicies = await api.get('/enterprise/policies');
  } catch {
    helpPolicies = [];
  }

  renderWalkthroughToggleList();

  const status = document.getElementById('onboarding-status');
  if (!status) return;

  try {
    const onboarding = await api.get('/enterprise/onboarding/me');
    const completed = onboarding?.is_completed ? 'completed' : 'not completed';
    status.textContent = `Current account walkthrough is ${completed} (version ${onboarding?.walkthrough_version || 'v1'}).`;
  } catch {
    status.textContent = 'Unable to read onboarding status for current account.';
  }
}

async function publishArticle(event) {
  event.preventDefault();
  const title = document.getElementById('help-title')?.value?.trim();
  const content = document.getElementById('help-content')?.value?.trim();
  const roleScope = document.getElementById('help-role-scope')?.value?.trim();
  const language = document.getElementById('help-language')?.value?.trim() || 'en';

  if (!title || !content) {
    showToast('Title and content are required', 'error');
    return;
  }

  try {
    await api.post('/enterprise/help/articles', {
      title,
      content,
      role_scope: roleScope,
      language
    });
    showToast('Help article published', 'success');
    document.getElementById('help-title').value = '';
    document.getElementById('help-content').value = '';
    await loadArticles();
  } catch (err) {
    showToast(err.message || 'Failed to publish article', 'error');
  }
}

async function saveWalkthroughToggles() {
  const checkboxes = Array.from(document.querySelectorAll('#walkthrough-toggle-list input[type="checkbox"]'));
  try {
    await Promise.all(checkboxes.map(cb => savePolicy(cb.dataset.key, cb.checked ? 'true' : 'false')));
    showToast('Walkthrough toggles updated', 'success');
    await loadPoliciesAndOnboarding();
  } catch (err) {
    showToast(err.message || 'Failed to save walkthrough toggles', 'error');
  }
}

async function resetMyOnboarding() {
  try {
    const version = policyEntry('onboarding.walkthrough_version')?.value || 'v2-enterprise';
    await api.put('/enterprise/onboarding/me', {
      is_completed: false,
      walkthrough_version: String(version)
    });
    showToast('Your walkthrough state has been reset', 'success');
    await loadPoliciesAndOnboarding();
  } catch (err) {
    showToast(err.message || 'Failed to reset walkthrough', 'error');
  }
}

let helpTickets = [];

function setupTicketImageAttachment() {
  const fileInput = document.getElementById('ticket-image-input');
  const filenameSpan = document.getElementById('ticket-image-filename');
  const removeBtn = document.getElementById('ticket-image-remove');
  const previewContainer = document.getElementById('ticket-image-preview-container');
  const previewImg = document.getElementById('ticket-image-preview');

  if (!fileInput || fileInput.dataset.bound) return;
  fileInput.dataset.bound = 'true';

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      if (filenameSpan) filenameSpan.textContent = file.name;
      if (removeBtn) removeBtn.style.display = 'inline-block';
      if (previewContainer && previewImg) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    } else {
      clearTicketImage();
    }
  });

  if (removeBtn && !removeBtn.dataset.bound) {
    removeBtn.dataset.bound = 'true';
    removeBtn.addEventListener('click', clearTicketImage);
  }
}

function clearTicketImage() {
  const fileInput = document.getElementById('ticket-image-input');
  const filenameSpan = document.getElementById('ticket-image-filename');
  const removeBtn = document.getElementById('ticket-image-remove');
  const previewContainer = document.getElementById('ticket-image-preview-container');
  const previewImg = document.getElementById('ticket-image-preview');

  if (fileInput) fileInput.value = '';
  if (filenameSpan) filenameSpan.textContent = 'No image attached';
  if (removeBtn) removeBtn.style.display = 'none';
  if (previewContainer) previewContainer.style.display = 'none';
  if (previewImg) previewImg.src = '';
}

async function loadHelpTickets() {
  const list = document.getElementById('help-tickets-list');
  const countBadge = document.getElementById('ticket-badge-count');
  if (list) list.innerHTML = '<div style="padding:14px; text-align:center; font-size:0.75rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Loading tickets...</div>';

  try {
    const raw = await api.get('/tickets');
    helpTickets = Array.isArray(raw) ? raw : [];
    if (countBadge) {
      countBadge.textContent = `${helpTickets.length} TICKET${helpTickets.length !== 1 ? 'S' : ''}`;
    }

    if (!list) return;

    if (!helpTickets.length) {
      list.innerHTML = '<div style="padding:16px; text-align:center; font-size:0.78rem; color:var(--text-muted);"><i class="fas fa-inbox" style="display:block; font-size:1.4rem; margin-bottom:6px; opacity:0.6;"></i>No support tickets recorded</div>';
      return;
    }

    const currentUser = (window.auth && auth.getUser) ? auth.getUser() : { id: 0, role: 'user' };
    const isAdmin = currentUser.role === 'admin' || (currentUser.secondary_roles || '').split(',').includes('admin');

    list.innerHTML = helpTickets.map(t => {
      const priorityClass = t.priority === 'urgent' ? 'badge-urgent' : (t.priority === 'low' ? 'badge-low' : 'badge-normal');
      const statusClass = t.status === 'resolved' || t.status === 'closed' ? 'badge-approved' : (t.status === 'open' ? 'badge-in_progress' : 'badge-pending');
      const isOwner = t.created_by === currentUser.id;

      return `
        <div class="ticket-item-help anim-fade-in" id="ticket-item-${t.id}">
          <div class="ticket-item-header">
            <span class="ticket-item-title">${t.title}</span>
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="badge ${priorityClass}">${(t.priority || 'normal').toUpperCase()}</span>
              ${isAdmin ? `
                <select class="form-control" style="font-size:0.7rem; padding:2px 6px; height:auto; width:auto;" onchange="updateHelpTicketStatus(${t.id}, this.value)">
                  <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>Pending</option>
                  <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
                  <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                  <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
              ` : `
                <span class="badge ${statusClass}">${(t.status || 'pending').toUpperCase()}</span>
              `}
            </div>
          </div>
          ${t.description ? `<div class="ticket-item-desc">${t.description}</div>` : ''}
          ${t.image ? `
            <div style="margin: 8px 0;">
              <a href="${t.image}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:8px; background:rgba(16,42,150,0.08); padding:6px 12px; border-radius:8px; border:1px solid rgba(16,42,150,0.25); text-decoration:none; color:var(--accent-primary,#102a96); font-size:0.75rem; font-weight:600; transition:all 0.2s;">
                <i class="fas fa-image"></i>
                <span>View Attached Screenshot</span>
                <i class="fas fa-external-link-alt" style="font-size:0.65rem; opacity:0.7;"></i>
              </a>
            </div>
          ` : ''}
          <div class="ticket-item-footer">
            <span>
              <i class="fas fa-user" style="margin-right:4px;"></i>${t.creator_name || 'User'} 
              ${t.category ? `• <span style="color:var(--accent-primary); font-weight:600;">${t.category}</span>` : ''}
            </span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span><i class="fas fa-clock" style="margin-right:4px;"></i>${typeof timeAgo === 'function' ? timeAgo(t.created_at) : (t.created_at || '')}</span>
              ${(isAdmin || isOwner) ? `
                <button type="button" class="btn-danger" style="padding:2px 6px; font-size:0.65rem;" onclick="deleteHelpTicket(${t.id})" title="Delete Ticket">
                  <i class="fas fa-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    if (list) list.innerHTML = '<div style="padding:12px; color:var(--text-danger); font-size:0.75rem;">Failed to load tickets.</div>';
  }
}

async function raiseHelpTicket(event) {
  event.preventDefault();
  const title = document.getElementById('ticket-title-input')?.value?.trim();
  const priority = document.getElementById('ticket-priority-select')?.value || 'normal';
  const category = document.getElementById('ticket-category-select')?.value || 'General';
  const description = document.getElementById('ticket-desc-input')?.value?.trim();
  const fileInput = document.getElementById('ticket-image-input');

  if (!title || !description) {
    showToast('Subject and description are required', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('priority', priority);
  formData.append('category', category);

  if (fileInput && fileInput.files && fileInput.files[0]) {
    formData.append('image', fileInput.files[0]);
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Submitting...</span>';
  }

  try {
    const token = localStorage.getItem('tt_token');
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || 'Failed to raise ticket');
    }

    showToast('Support ticket raised successfully', 'success');
    document.getElementById('ticket-title-input').value = '';
    document.getElementById('ticket-desc-input').value = '';
    clearTicketImage();
    await loadHelpTickets();
  } catch (err) {
    showToast(err.message || 'Failed to raise ticket', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
  }
}

window.updateHelpTicketStatus = async function(id, status) {
  try {
    await api.put(`/tickets/${id}`, { status });
    showToast('Ticket status updated', 'success');
    await loadHelpTickets();
  } catch (err) {
    showToast(err.message || 'Failed to update ticket', 'error');
  }
};

window.deleteHelpTicket = async function(id) {
  if (!confirm('Are you sure you want to delete this ticket?')) return;
  try {
    await api.delete(`/tickets/${id}`);
    showToast('Ticket deleted', 'success');
    await loadHelpTickets();
  } catch (err) {
    showToast(err.message || 'Failed to delete ticket', 'error');
  }
};

window.loadHelpTickets = loadHelpTickets;

async function initHelpCenterOps() {
  const form = document.getElementById('help-article-form');
  const refreshBtn = document.getElementById('refresh-articles-btn');
  const searchInput = document.getElementById('article-search');
  const saveWalkthroughBtn = document.getElementById('save-walkthrough-btn');
  const resetOnboardingBtn = document.getElementById('reset-my-onboarding-btn');
  const ticketForm = document.getElementById('help-ticket-form');

  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', publishArticle);
  }

  if (ticketForm && !ticketForm.dataset.bound) {
    ticketForm.dataset.bound = 'true';
    ticketForm.addEventListener('submit', raiseHelpTicket);
  }

  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.onclick = () => loadArticles();
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', debounce((event) => {
      renderArticleList(event.target.value || '');
    }, 200));
  }

  if (saveWalkthroughBtn && !saveWalkthroughBtn.dataset.bound) {
    saveWalkthroughBtn.dataset.bound = 'true';
    saveWalkthroughBtn.onclick = saveWalkthroughToggles;
  }

  if (resetOnboardingBtn && !resetOnboardingBtn.dataset.bound) {
    resetOnboardingBtn.dataset.bound = 'true';
    resetOnboardingBtn.onclick = resetMyOnboarding;
  }

  setupTicketImageAttachment();

  await Promise.all([loadArticles(), loadPoliciesAndOnboarding(), loadHelpTickets()]);
}

window.initHelpCenterOps = initHelpCenterOps;
