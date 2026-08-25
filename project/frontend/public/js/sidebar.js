function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const mobileToggle = document.getElementById('mobile-toggle');

  // Restore collapse state
  const isCollapsed = localStorage.getItem('tt_sidebar_collapsed') === 'true';
  if (isCollapsed && sidebar) sidebar.classList.add('collapsed');

  const sidebarHeader = document.querySelector('.sidebar-header');
  if (sidebarHeader && sidebar) {
    sidebarHeader.style.cursor = 'pointer';
    sidebarHeader.title = 'Toggle Sidebar';
    sidebarHeader.onclick = () => {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('tt_sidebar_collapsed', sidebar.classList.contains('collapsed'));
    };

    sidebarHeader.innerHTML = `
      <div class="sidebar-brand-wrapper">
        <div class="sidebar-logo-icon">
          <img src="assets/techturf-logo.png" alt="Tech Turf" class="sidebar-logo-img" />
        </div>
        <div class="sidebar-logo">
          <span class="brand-tech">TECH</span> <span class="brand-turf">TURF</span> <span class="brand-tag">CRM</span>
        </div>
      </div>
      <div class="sidebar-logo-short">
        <img src="assets/techturf-logo.png" alt="TT" class="sidebar-logo-img-short" />
      </div>
    `;
  }

  if (mobileToggle && sidebar) {
    mobileToggle.onclick = () => {
      sidebar.classList.toggle('mobile-open');
      if (sidebar.classList.contains('mobile-open')) {
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.onclick = () => {
          sidebar.classList.remove('mobile-open');
          overlay.remove();
        };
        document.body.appendChild(overlay);
      }
    };
  }

  // MASTER UNIFIED SIDEBAR TEMPLATE (Ensures NO pills are missing)
  const masterNavHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">CORE</div>
          <div class="menu-item" data-nav="dashboard.html" onclick="window.location.href='dashboard.html'">
            <i class="fas fa-th-large"></i><span class="menu-text">Dashboard</span>
          </div>
          <div class="menu-item" data-nav="projects.html" onclick="window.location.href='projects.html'">
            <i class="fas fa-project-diagram"></i><span class="menu-text">Projects</span>
          </div>
          <div class="menu-item" data-nav="tasks.html" onclick="window.location.href='tasks.html'">
            <i class="fas fa-tasks"></i><span class="menu-text">Tasks</span>
          </div>
          <div class="menu-item" data-nav="submissions.html" onclick="window.location.href='submissions.html'">
            <i class="fas fa-file-upload"></i><span class="menu-text">Submissions</span>
          </div>
          <div class="menu-item" data-nav="clients.html" onclick="window.location.href='clients.html'">
            <i class="fas fa-user-tie"></i><span class="menu-text">Clients</span>
          </div>
          <div class="menu-item" data-nav="client_reports.html" onclick="window.location.href='client_reports.html'">
            <i class="fas fa-chart-pie"></i><span class="menu-text">Client Reports</span>
          </div>
          <div class="menu-item" data-nav="announcements.html" onclick="window.location.href='announcements.html'">
            <i class="fas fa-bullhorn"></i><span class="menu-text">Announcements</span>
          </div>
          <div class="menu-item" data-nav="drive.html" onclick="window.location.href='drive.html'">
            <i class="fas fa-hdd"></i><span class="menu-text">Secure Drive</span>
          </div>
          <div class="menu-item" data-nav="messages.html" onclick="window.location.href='messages.html'">
            <i class="fas fa-comments messenger-icon"></i><span class="menu-text">Team Messenger</span>
          </div>
          <div class="menu-item" data-nav="nexus_chat.html" onclick="window.location.href='nexus_chat.html'">
            <i class="fas fa-robot nexus-icon"></i><span class="menu-text">Nexus AI Terminal</span>
          </div>
        </div>

        <hr class="sidebar-divider">

        <!-- Role-Based Control Centers -->
        <div class="sidebar-section admin-only">
          <div class="sidebar-section-title">ADMINISTRATION</div>
          <div class="sidebar-submenu">
            <div class="menu-item admin-only" data-nav="users.html" onclick="window.location.href='users.html'">
              <i class="fas fa-users-cog"></i><span class="menu-text">User Management</span>
            </div>
            <div class="menu-item admin-only" data-nav="database_viewer.html" id="dbadmin-link" onclick="window.location.href='database_viewer.html'">
              <i class="fas fa-database"></i><span class="menu-text">Database Viewer</span>
            </div>
            <div class="menu-item admin-only" data-nav="payments.html" id="payments-link" onclick="window.location.href='payments.html'">
              <i class="fas fa-money-check-alt"></i><span class="menu-text">Payments</span>
            </div>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-title">WORKSPACES</div>
          <div class="menu-item rnd-only" data-nav="nexus_lab.html" onclick="window.location.href='nexus_lab.html'">
            <i class="fas fa-flask"></i><span class="menu-text">Nexus Lab</span>
          </div>
          <div class="menu-item handler-only" data-nav="client_connect.html" onclick="window.location.href='client_connect.html'">
            <i class="fas fa-handshake"></i><span class="menu-text">Client Connect</span>
          </div>
          <div class="menu-item" data-nav="learning_hub.html" id="courses-link-global" onclick="window.location.href='learning_hub.html'">
            <i class="fas fa-graduation-cap"></i><span class="menu-text">Learning Hub</span>
          </div>
          <div class="menu-item" data-nav="workspace.html" onclick="window.location.href='workspace.html'">
            <i class="fas fa-paint-brush"></i><span class="menu-text">Creative Workspace</span>
          </div>
          <div class="menu-item" data-nav="help_center.html" onclick="window.location.href='help_center.html'">
            <i class="fas fa-circle-question"></i><span class="menu-text">Help Center Ops</span>
          </div>
        </div>

        <hr class="sidebar-divider">
        
        <div class="sidebar-section">
          <div class="sidebar-section-title">ACCOUNT</div>
          <div class="menu-item" data-nav="profile.html" onclick="window.location.href='profile.html'">
            <i class="fas fa-user-circle"></i><span class="menu-text">My Profile</span>
          </div>
        </div>
  `;

  function populateSidebar() {
    let nav = document.getElementById('main-sidebar-nav') || document.querySelector('.sidebar-menu');
    if (nav) {
      nav.id = 'main-sidebar-nav';
      nav.innerHTML = masterNavHTML;
      if (window.auth && auth.initNavbar) auth.initNavbar();
      updateActiveState();
    }
  }

  function updateActiveState() {
    const rawPath = window.location.pathname.split('/').pop() || 'dashboard.html';
    const currentPath = rawPath.replace('.html', '') + '.html';
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
      const href = item.getAttribute('data-nav');
      if (href && (href === currentPath || (currentPath === 'dashboard.html' && (href === 'dashboard.html' || href === '/')))) {
        item.classList.add('active');
      }
    });
  }

  populateSidebar();

  // Navigation Click Handler
  document.addEventListener('click', (e) => {
    if (e.target.closest('.db-modal-card') || e.target.closest('.modal-content') || e.target.closest('.close-modal') || e.target.closest('.close-icon')) return;

    const link = e.target.closest('[data-nav]') || e.target.closest('.menu-item') || e.target.closest('a');
    if (link) {
      if (link.id === 'logout-btn' || link.closest('#logout-btn')) return;

      const href = link.getAttribute('data-nav') || link.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.includes('://') && !link.target && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = href;
      }
    }
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.preventDefault();
      if (window.auth && auth.logout) auth.logout();
      else {
        localStorage.removeItem('tt_token');
        localStorage.removeItem('tt_user');
        window.location.href = '/index.html';
      }
    };
  }

  initNotificationSystem();
}

function initNotificationSystem() {
  const bell = document.getElementById('notification-bell');
  const dropdown = document.getElementById('notification-dropdown') || document.querySelector('.notification-dropdown') || document.querySelector('.notification-dropdown-container');

  if (bell && dropdown) {
    bell.onclick = (e) => {
      e.stopPropagation();
      const isVisible = dropdown.classList.contains('active') || dropdown.style.display === 'block';
      if (isVisible) {
        dropdown.classList.remove('active');
        dropdown.style.display = 'none';
      } else {
        dropdown.classList.add('active');
        dropdown.style.display = 'block';
        loadNotifications(true);
      }
    };

    document.addEventListener('click', (e) => {
      if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
        dropdown.style.display = 'none';
      }
    });
  }

  loadNotifications();
  setInterval(() => loadNotifications(false), 20000);
}

async function loadNotifications(renderDropdown = false) {
  try {
    if (!window.api || !api.get) return;
    const notifs = await api.get('/notifications');
    const list = Array.isArray(notifs) ? notifs : [];
    const badge = document.getElementById('notification-badge');
    const unreadCount = list.filter(n => !n.is_read).length;

    if (badge) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    const notifListEl = document.getElementById('notification-list');
    if (notifListEl && renderDropdown) {
      if (list.length === 0) {
        notifListEl.innerHTML = `
          <div style="padding: 28px 16px; text-align: center; color: var(--text-muted);">
            <i class="fas fa-bell-slash" style="font-size: 1.8rem; opacity: 0.35; margin-bottom: 8px; display: block;"></i>
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary);">All caught up!</div>
            <div style="font-size: 0.74rem; margin-top: 2px;">No new notifications right now.</div>
          </div>
        `;
      } else {
        notifListEl.innerHTML = list.slice(0, 20).map(n => {
          const isUnread = !n.is_read;
          const type = (n.type || 'info').toLowerCase();
          const icon = type.includes('task') ? 'fa-tasks' :
            (type.includes('project') ? 'fa-project-diagram' :
            (type.includes('submission') ? 'fa-file-upload' :
            (type.includes('payment') ? 'fa-money-check-alt' :
            (type.includes('announc') ? 'fa-bullhorn' : 'fa-bell'))));
          const iconColor = type.includes('task') ? '#2563eb' :
            (type.includes('project') ? '#8b5cf6' :
            (type.includes('submission') ? '#10b981' :
            (type.includes('payment') ? '#f59e0b' :
            (type.includes('announc') ? '#ec4899' : '#3b82f6'))));

          const timeStr = formatNotifTime(n.created_at || n.date);
          const safeMsg = (n.message || n.title || 'Notification').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          return `
            <div class="notif-card-item ${isUnread ? 'unread' : ''}" onclick="handleNotifClick(${n.id}, '${n.link || ''}')">
              <div class="notif-icon-badge" style="background:${iconColor}18; color:${iconColor};">
                <i class="fas ${icon}"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div class="notif-item-msg">${safeMsg}</div>
                <div class="notif-item-time"><i class="fas fa-clock" style="font-size:0.6rem;"></i> ${timeStr}</div>
              </div>
              ${isUnread ? `<button class="notif-read-btn" onclick="event.stopPropagation(); markNotifRead(${n.id})" title="Mark as read"><i class="fas fa-check"></i></button>` : ''}
            </div>
          `;
        }).join('');
      }
    }
  } catch (e) {
    // ignore
  }
}

async function markNotifRead(id) {
  try {
    await api.put(`/notifications/${id}/read`);
    await loadNotifications(true);
  } catch (e) { }
}

async function markAllNotificationsRead() {
  try {
    await api.put('/notifications/read-all');
    if (window.showToast) showToast('All notifications marked as read', 'success');
    await loadNotifications(true);
  } catch (e) { }
}

function handleNotifClick(id, link) {
  markNotifRead(id);
  if (link && link !== 'null' && link !== 'undefined' && link.trim() !== '') {
    window.location.href = link;
  }
}

function formatNotifTime(dateStr) {
  if (!dateStr) return 'Just now';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Recently';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Global Exports
window.initSidebar = initSidebar;
window.loadNotifications = loadNotifications;
window.markNotifRead = markNotifRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.handleNotifClick = handleNotifClick;

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
} else {
  initSidebar();
}
