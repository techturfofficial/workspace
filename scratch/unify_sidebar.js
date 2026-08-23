const fs = require('fs');
const path = require('path');

const masterNavHTML = `        <div class="menu-item" data-nav="dashboard.html" onclick="window.location.href='dashboard.html'">
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

        <hr class="sidebar-divider">

        <!-- Role-Based Control Centers -->
        <div class="sidebar-section admin-only">
          <div class="sidebar-section-title">USER MANAGEMENT</div>
          <div class="sidebar-submenu">
            <div class="menu-item admin-only" data-nav="users.html" onclick="window.location.href='users.html'">
              <i class="fas fa-users-cog"></i><span class="menu-text">User Management</span>
            </div>
            <div class="menu-item admin-only" data-nav="help_center.html" onclick="window.location.href='help_center.html'">
              <i class="fas fa-circle-question"></i><span class="menu-text">Help Center Ops</span>
            </div>
          </div>
        </div>
        <div class="menu-item rnd-only" data-nav="nexus_lab.html" onclick="window.location.href='nexus_lab.html'">
          <i class="fas fa-flask"></i><span class="menu-text">Nexus Lab</span>
        </div>
        <div class="menu-item handler-only" data-nav="client_connect.html" onclick="window.location.href='client_connect.html'">
          <i class="fas fa-handshake"></i><span class="menu-text">Client Connect</span>
        </div>
        <div class="menu-item" data-nav="learning_hub.html" id="courses-link-global" onclick="window.location.href='learning_hub.html'">
          <i class="fas fa-graduation-cap"></i><span class="menu-text">Learning Hub</span>
        </div>

        <hr class="sidebar-divider">
        
        <div class="menu-item" data-nav="workspace.html" onclick="window.location.href='workspace.html'">
          <i class="fas fa-paint-brush"></i><span class="menu-text">Creative Workspace</span>
        </div>
        
        <div class="menu-item admin-only" data-nav="database_viewer.html" id="dbadmin-link" onclick="window.location.href='database_viewer.html'">
          <i class="fas fa-database"></i><span class="menu-text">Database Viewer</span>
        </div>

        <div class="menu-item admin-only" data-nav="payments.html" id="payments-link" onclick="window.location.href='payments.html'">
          <i class="fas fa-money-check-alt"></i><span class="menu-text">Payments</span>
        </div>

        <hr class="sidebar-divider">
        
        <div class="menu-item" data-nav="profile.html" onclick="window.location.href='profile.html'">
          <i class="fas fa-user-circle"></i><span class="menu-text">My Profile</span>
        </div>`;

// 1. Update all HTML files in a directory
function processHtmlFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.html') && file !== 'index.html' && file !== 'login.html') {
      const fullPath = path.join(dir, file);
      let content = fs.readFileSync(fullPath, 'utf8');

      // Replace <nav class="sidebar-menu"...> ... </nav>
      const navRegex = /<nav\s+class=["']sidebar-menu["'][^>]*>([\s\S]*?)<\/nav>/i;
      if (navRegex.test(content)) {
        content = content.replace(navRegex, `<nav class="sidebar-menu" id="main-sidebar-nav">\n${masterNavHTML}\n      </nav>`);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated sidebar in:', file);
      }
    }
  }
}

processHtmlFiles('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public');
processHtmlFiles('c:/LOKI/Techturf/TT_CRM_Update/project/frontend');

// 2. Update sidebar.js
const sidebarJsContent = `function initSidebar() {
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
  const masterNavHTML = \`
${masterNavHTML}
  \`;

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
    // Ignore clicks inside open modal overlays
    if (e.target.closest('.db-modal-card') || e.target.closest('.modal-content') || e.target.closest('.close-modal') || e.target.closest('.close-icon')) return;

    const link = e.target.closest('[data-nav]') || e.target.closest('.menu-item') || e.target.closest('a');
    if (link) {
      // Don't intercept logout
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

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
} else {
  initSidebar();
}
`;

fs.writeFileSync('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public/js/sidebar.js', sidebarJsContent, 'utf8');
fs.writeFileSync('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/js/sidebar.js', sidebarJsContent, 'utf8');
console.log('Updated sidebar.js across public/ and root frontend/');
