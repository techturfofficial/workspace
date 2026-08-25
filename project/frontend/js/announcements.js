async function initAnnouncements() {
  loadAnnouncements();
  initSearch();

  document.getElementById('new-announcement-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('ann-title').value,
      body: document.getElementById('ann-body').value,
      pinned: document.getElementById('ann-pinned').checked
    };
    try {
      await api.post('/announcements', data);
      showToast('Announcement posted', 'success');
      closeModal('new-announcement-modal');
      e.target.reset();
      loadAnnouncements();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Admin broadcast form
  const broadcastForm = document.getElementById('broadcast-form');
  if (broadcastForm) {
    broadcastForm.onsubmit = async (e) => {
      e.preventDefault();
      const body = document.getElementById('broadcast-body').value;
      if (!body.trim()) {
        showToast('Message cannot be empty', 'error');
        return;
      }
      try {
        await api.post('/announcements/broadcast', { body });
        showToast('Broadcast sent to all users', 'success');
        closeModal('broadcast-modal');
        e.target.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }
}

async function loadAnnouncements() {
  try {
    const items = await api.get('/announcements');
    const container = document.getElementById('announcements-list');
    const search = document.getElementById('announcement-search')?.value?.trim().toLowerCase() || '';
    const filtered = !search ? items : items.filter((item) => {
      return [item.title, item.body, item.author_name].some((value) => (value || '').toLowerCase().includes(search));
    });
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-bullhorn"></i>
          <div class="empty-title">No announcements yet</div>
          <div class="empty-desc">There are no announcements to display.</div>
        </div>
      `;
      return;
    }
        container.innerHTML = filtered.map(a => `
      <div class="glass-card announcement-card anim-fade-up${a.pinned ? ' pinned' : ''}">
        ${a.pinned ? '<i class="fas fa-thumbtack pin-icon"></i>' : ''}
        <div class="announcement-header">
          <img src="${getInitialsAvatar(a.author_name, 48, a.author_role || 'admin')}" class="announcement-author-avatar">
          <div>
            <div style="font-weight:700; font-size:1.1rem;">${a.author_name || 'Admin'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${timeAgo(a.created_at)}</div>
          </div>
        </div>
        <div class="announcement-title">${a.title}</div>
        <div class="announcement-body">${a.body}</div>
        <div class="announcement-footer">
          <span>Tech Turf Internal Feed</span>
          ${['admin', 'media_manager', 'production'].includes(auth.getUser().role) ? `
            <div style="display:flex; gap:16px;">
              <span style="cursor:pointer; color:var(--accent-primary);" onclick="togglePin(${a.id},${a.pinned ? 0 : 1})">${a.pinned ? 'Unpin' : 'Pin'}</span>
              <span style="cursor:pointer; color:var(--accent-secondary);" onclick="deleteAnnouncement(${a.id})">Delete</span>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

  } catch (e) {
    showToast('Failed to load announcements', 'error');
  }
}

async function togglePin(id, pin) {
  try {
    await api.put(`/announcements/${id}/pin`, { pinned: pin });
    loadAnnouncements();
  } catch (e) {}
}

function initSearch() {
  const input = document.getElementById('announcement-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => loadAnnouncements(), 200));
}

async function deleteAnnouncement(id) {
  if (!confirm('Are you sure you want to delete this announcement?')) return;
  try {
    await api.delete(`/announcements/${id}`);
    showToast('Announcement deleted', 'success');
    loadAnnouncements();
  } catch (e) {}
}

window.initAnnouncements = initAnnouncements;
window.togglePin = togglePin;
window.deleteAnnouncement = deleteAnnouncement;
