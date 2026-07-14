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
    sidebarHeader.onclick = () => {
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

  // MASTER UNIFIED SIDEBAR TEMPLATE (Ensures NO pills are missing)
  const masterNavHTML = `
      <div class="menu-item" data-nav="dashboard.html">
        <i class="fas fa-th-large"></i><span class="menu-text">Dashboard</span>
      </div>
      <div class="menu-item" data-nav="projects.html">
        <i class="fas fa-project-diagram"></i><span class="menu-text">Projects</span>
      </div>
      <div class="menu-item" data-nav="tasks.html">
        <i class="fas fa-tasks"></i><span class="menu-text">Tasks</span>
      </div>
      <div class="menu-item" data-nav="submissions.html">
        <i class="fas fa-file-upload"></i><span class="menu-text">Submissions</span>
      </div>
      <div class="menu-item" data-nav="clients.html">
        <i class="fas fa-user-tie"></i><span class="menu-text">Clients</span>
      </div>
      <div class="menu-item" data-nav="announcements.html">
        <i class="fas fa-bullhorn"></i><span class="menu-text">Announcements</span>
      </div>
      <div class="menu-item" data-nav="drive.html">
        <i class="fas fa-hdd"></i><span class="menu-text">Secure Drive</span>
      </div>
      <div class="menu-item" data-nav="messages.html">
        <i class="fas fa-comments"></i><span class="menu-text">Team Messenger</span>
      </div>
      <div class="menu-item" data-nav="nexus_chat.html">
        <i class="fas fa-robot"></i><span class="menu-text">Nexus AI Terminal</span>
      </div>

      <hr class="sidebar-divider">

      <!-- Role-Based Control Centers -->
      <div class="sidebar-section admin-only">
        <div class="sidebar-section-title">User Management</div>
        <div class="sidebar-submenu">
          <div class="menu-item admin-only" data-nav="users.html">
            <i class="fas fa-users-viewfinder"></i><span class="menu-text">User Management</span>
          </div>
          <div class="menu-item admin-only nav-pill-orange" data-nav="admin_control.html">
            <i class="fas fa-shield-alt"></i><span class="menu-text">Admin Warp</span>
          </div>
          <div class="menu-item admin-only" data-nav="policy_center.html">
            <i class="fas fa-scale-balanced"></i><span class="menu-text">Policy Center</span>
          </div>
          <div class="menu-item admin-only" data-nav="help_center.html">
            <i class="fas fa-circle-question"></i><span class="menu-text">Help Center Ops</span>
          </div>
        </div>
      </div>
      <div class="menu-item rnd-only" data-nav="nexus_lab.html">
        <i class="fas fa-flask"></i><span class="menu-text">Nexus Lab</span>
      </div>
      <div class="menu-item handler-only" data-nav="client_connect.html">
        <i class="fas fa-handshake"></i><span class="menu-text">Client Connect</span>
      </div>
      <div class="menu-item" data-nav="learning_hub.html" id="courses-link-global">
        <i class="fas fa-graduation-cap"></i><span class="menu-text">Learning Hub</span>
      </div>

      <hr class="sidebar-divider">
      
      <div class="menu-item" data-nav="workspace.html">
        <i class="fas fa-pencil-alt"></i><span class="menu-text">Creative Workspace</span>
      </div>
      
      <div class="menu-item admin-only" id="dbadmin-link">
        <i class="fas fa-database"></i><span class="menu-text">Database Viewer</span>
      </div>

      <div class="menu-item admin-only" id="payments-link">
        <i class="fas fa-money-check-alt"></i><span class="menu-text">Payments</span>
      </div>

      <div class="menu-item" id="tickets-link">
        <i class="fas fa-ticket-alt"></i><span class="menu-text">Tickets</span>
      </div>

      <hr class="sidebar-divider">
      
      <div class="menu-item" data-nav="profile.html">
        <i class="fas fa-user-circle"></i><span class="menu-text">My Profile</span>
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
    const url = window.location.href;
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
      const href = item.getAttribute('data-nav');
      if (href && (url.includes(href) || (url.endsWith('/') && href === 'dashboard.html'))) {
        item.classList.add('active');
      }
    });
  }

  populateSidebar();

  // Use full page navigation so each page boots cleanly.
  function loadPage(url) {
    if (!url) return;
    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(url, window.location.href);

    if (currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search) {
      return;
    }

    window.location.href = targetUrl.href;
  }

  document.addEventListener('click', (e) => {
    // Ignore internal clicks in modals
    if (e.target.closest('.modal-content') || e.target.closest('.close-modal') || e.target.closest('.close-icon')) return;

    const link = e.target.closest('.menu-item') || e.target.closest('[data-nav]') || e.target.closest('a');
    if (link) {
      const href = link.getAttribute('data-nav') || link.getAttribute('href');
      // Only intercept internal relative links
      if (href && !href.startsWith('#') && !href.includes('://') && !link.target && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        loadPage(href);
      }
    }
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.onclick = () => auth.logout();

  // Handle browser back/forward
  window.onpopstate = () => loadPage(window.location.pathname + window.location.search);

  loadNotifications();
  setInterval(loadNotifications, 30000);
}

async function loadNotifications() {
  try {
    const notifs = await api.get('/notifications');
    const badge = document.getElementById('notification-badge');
    const unreadCount = (notifs || []).filter(n => !n.is_read).length;
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
  } catch (e) { }
}

// Global Exports
window.initSidebar = initSidebar;
window.loadPage = loadPage;

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
} else {
  initSidebar();
}
