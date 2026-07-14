function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const mobileToggle = document.getElementById('mobile-toggle');

  // Restore collapse state
  const isCollapsed = localStorage.getItem('tt_sidebar_collapsed') === 'true';
  if (isCollapsed && sidebar) sidebar.classList.add('collapsed');

  if (collapseBtn && sidebar) {
    collapseBtn.onclick = () => {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('tt_sidebar_collapsed', sidebar.classList.contains('collapsed'));
    };
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

  // Dynamic population for all non-dashboard pages
  let nav = document.getElementById('main-sidebar-nav');
  if (!nav) nav = document.querySelector('.sidebar-menu');

  const isDashboard = window.location.pathname.endsWith('dashboard.html') || window.location.pathname === '/';

  if (nav && !isDashboard) {
    nav.id = 'main-sidebar-nav';
    nav.innerHTML = `
        <div class="menu-item" onclick="window.location.href='dashboard.html'">
          <i class="fas fa-th-large"></i>
          <span class="menu-text">Dashboard</span>
        </div>
        <div class="menu-item" onclick="window.location.href='projects.html'">
          <i class="fas fa-project-diagram"></i>
          <span class="menu-text">Projects</span>
        </div>
        <div class="menu-item" onclick="window.location.href='tasks.html'">
          <i class="fas fa-tasks"></i>
          <span class="menu-text">Tasks</span>
        </div>
        <div class="menu-item" onclick="window.location.href='submissions.html'">
          <i class="fas fa-file-upload"></i>
          <span class="menu-text">Submissions</span>
        </div>
        <div class="menu-item" onclick="window.location.href='clients.html'">
          <i class="fas fa-user-tie"></i>
          <span class="menu-text">Clients</span>
        </div>
        <div class="menu-item" onclick="window.location.href='announcements.html'">
          <i class="fas fa-bullhorn"></i>
          <span class="menu-text">Announcements</span>
        </div>
        <div class="menu-item" onclick="window.location.href='drive.html'">
          <i class="fas fa-hdd"></i>
          <span class="menu-text">Secure Drive</span>
        </div>

        <div class="menu-item" onclick="window.location.href='nexus_chat.html'">
          <i class="fas fa-robot" style="color:var(--accent-pink);"></i>
          <span class="menu-text">Nexus AI Terminal</span>
        </div>

        <hr style="border:0; border-top:1px solid var(--border); margin:10px 0; opacity:0.3;">
        
        <!-- Role-Based Control Centers -->
        <div class="menu-item admin-only" onclick="window.location.href='users.html'">
          <i class="fas fa-users-cog"></i>
          <span class="menu-text">User Management</span>
        </div>
        <div class="menu-item admin-only" onclick="window.location.href='admin_control.html'">
          <i class="fas fa-shield-alt"></i>
          <span class="menu-text">Admin Warp</span>
        </div>
        <div class="menu-item rnd-only" onclick="window.location.href='nexus_lab.html'">
          <i class="fas fa-flask"></i>
          <span class="menu-text">Nexus Lab</span>
        </div>
        <div class="menu-item handler-only" onclick="window.location.href='client_connect.html'">
          <i class="fas fa-handshake"></i>
          <span class="menu-text">Client Connect</span>
        </div>

        <hr style="border:0; border-top:1px solid var(--border); margin:10px 0; opacity:0.3;">
        
        <div class="menu-item" onclick="window.location.href='workspace.html'">
            <i class="fas fa-paint-brush"></i>
            <span class="menu-text">Creative Workspace</span>
        </div>

        <div class="menu-item admin-only" onclick="window.location.href='dashboard.html'" id="dbadmin-link-global">
            <i class="fas fa-database"></i>
            <span class="menu-text">Database Viewer</span>
        </div>
        <div class="menu-item" onclick="window.location.href='dashboard.html'" id="tickets-link-global">
            <i class="fas fa-ticket-alt"></i>
            <span class="menu-text">Tickets</span>
        </div>
        <div class="menu-item admin-only" onclick="window.location.href='dashboard.html?view=payments'" id="payments-link-global">
            <i class="fas fa-money-check-alt"></i>
            <span class="menu-text">Payments</span>
        </div>
        <div class="menu-item" onclick="window.location.href='learning_hub.html'" id="courses-link-global">
            <i class="fas fa-graduation-cap"></i>
            <span class="menu-text">Learning Hub</span>
        </div>

        <hr style="border:0; border-top:1px solid var(--border); margin:10px 0; opacity:0.3;">
        <div class="menu-item" onclick="window.location.href='profile.html'">
          <i class="fas fa-user-circle"></i>
          <span class="menu-text">My Profile</span>
        </div>
    `;
    // Re-trigger role hiding
    if (window.auth) auth.initNavbar();
  }

  // Active state
  const path = window.location.pathname;
  document.querySelectorAll('.menu-item').forEach(item => {
    const href = item.getAttribute('onclick')?.match(/'(.*?)'/)?.[1];
    if (href && (path.endsWith(href) || (path === '/' && href === 'dashboard.html'))) {
      item.classList.add('active');
    }
  });

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.onclick = () => auth.logout();

  // Notifications
  const notifBell = document.getElementById('notification-bell');
  const notifDropdown = document.getElementById('notification-dropdown');

  if (notifBell && notifDropdown) {
    notifBell.onclick = (e) => {
      e.stopPropagation();
      notifDropdown.style.display = notifDropdown.style.display === 'block' ? 'none' : 'block';
    };
    document.addEventListener('click', () => notifDropdown.style.display = 'none');
    notifDropdown.onclick = (e) => e.stopPropagation();
  }

  loadNotifications();
  setInterval(loadNotifications, 30000);
}

async function loadNotifications() {
  try {
    const notifs = await api.get('/notifications');
    const unreadCount = notifs.filter(n => !n.is_read).length;
    const badge = document.getElementById('notification-badge');
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const list = document.getElementById('notification-list');
    if (list) {
      if (notifs.length === 0) {
        list.innerHTML = '<div class="notif-empty">No notifications</div>';
        return;
      }
      list.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead(${n.id})">
          <div class="notif-icon ${n.type}"><i class="fas fa-info"></i></div>
          <div class="notif-content">
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${timeAgo(n.created_at)}</div>
          </div>
        </div>
      `).join('');
    }
  } catch (e) { }
}

async function markNotifRead(id) {
  try {
    await api.put(`/notifications/${id}/read`);
    loadNotifications();
  } catch (e) { }
}

window.initSidebar = initSidebar;
window.markNotifRead = markNotifRead;
