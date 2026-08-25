// File: public/js/auth.js
const auth = {
  TOKEN_KEY: 'tt_token',
  USER_KEY: 'tt_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY));
    } catch {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  hasRole(...roles) {
    const user = this.getUser();
    if (!user) return false;
    const userRoles = [user.role, ...(user.secondary_roles ? user.secondary_roles.split(',').map(r => r.trim()) : [])];
    return roles.some(r => userRoles.includes(r));
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.href = '/index.html';
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      if (window.location.pathname !== '/index.html' && !window.location.pathname.endsWith('index.html')) {
        window.location.href = '/index.html';
      }
    }
  },

  requireRole(...roles) {
    if (!this.hasRole(...roles)) {
      showToast('You do not have permission to access this.', 'error');
      setTimeout(() => window.location.href = '/dashboard.html', 1500);
    }
  },

  initNavbar() {
    const user = this.getUser();
    if (!user) return;
    const r = String(user.role || '').toLowerCase().trim();
    let themeClass = 'role-theme-blue';
    if (['writer', 'media_manager', 'rnd', 'designer'].includes(r)) {
      themeClass = 'role-theme-orange';
    } else if (['admin', 'team_leader'].includes(r)) {
      themeClass = 'role-theme-admin';
    }

    const header = document.querySelector('header.navbar') || document.querySelector('header');
    if (header) {
      header.classList.remove('role-theme-blue', 'role-theme-orange', 'role-theme-admin');
      header.classList.add(themeClass);
    }

    const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
    if (sidebar) {
      sidebar.classList.remove('role-theme-blue', 'role-theme-orange', 'role-theme-admin');
      sidebar.classList.add(themeClass);
    }

    document.body.classList.remove('role-theme-blue', 'role-theme-orange', 'role-theme-admin');
    document.body.classList.add(themeClass);

    const avatar = document.getElementById('nav-avatar');
    const badge = document.getElementById('nav-avatar-badge');
    const name = document.getElementById('nav-user-name');
    const role = document.getElementById('nav-user-role');

    if (name) name.textContent = user.name || 'Admin';
    if (role) role.textContent = formatRole(user.role || 'admin');

    const initials = (user.name || 'Admin').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'A';

    const setBadgeStyle = () => {
      if (!badge) return;
      badge.textContent = initials;
      badge.style.display = 'flex';
      const rStyle = typeof getRoleAvatarStyle === 'function' ? getRoleAvatarStyle(user.role) : null;
      if (rStyle) {
        const bg = rStyle.cssBackground || rStyle.color || '#102a96';
        badge.style.setProperty('background', bg, 'important');
        if (rStyle.border) {
          badge.style.setProperty('border-color', rStyle.border, 'important');
        }
        badge.style.setProperty('color', '#ffffff', 'important');
      }
    };

    if (avatar) {
      if (user.avatar && user.avatar.trim() !== '' && user.avatar !== 'null') {
        avatar.src = user.avatar;
        avatar.style.display = 'block';
        if (badge) badge.style.display = 'none';
      } else {
        avatar.style.display = 'none';
        setBadgeStyle();
      }
    } else if (badge) {
      setBadgeStyle();
    }

    const toggleVisibility = (selector, ...roles) => {
      const allowed = this.hasRole(...roles);
      document.querySelectorAll(selector).forEach(el => {
        if (!allowed) {
          el.style.display = 'none';
        } else {
          if (el.dataset.display) {
            el.style.display = el.dataset.display;
          } else if (el.classList.contains('help-card') || el.classList.contains('glass-card') || el.classList.contains('card') || el.tagName === 'SECTION') {
            el.style.display = 'block';
          } else if (el.classList.contains('menu-item') || el.classList.contains('user-profile-nav') || el.classList.contains('sidebar-section')) {
            el.style.display = 'flex';
          } else {
            el.style.display = 'block';
          }
        }
      });
    };

    toggleVisibility('.admin-only', 'admin');
    toggleVisibility('.admin-tl-only', 'admin', 'team_leader');
    toggleVisibility('.tl-only', 'team_leader');
    toggleVisibility('.rnd-only', 'rnd');
    toggleVisibility('.writer-only', 'writer');
    toggleVisibility('.designer-only', 'designer');
    toggleVisibility('.media-only', 'media_manager');
    toggleVisibility('.creator-only', 'creator');
    toggleVisibility('.handler-only', 'client_handler');
    toggleVisibility('.task-create-only', 'admin', 'team_leader', 'frontend_backend', 'production');
    toggleVisibility('.project-create-only', 'admin', 'team_leader');
    toggleVisibility('.announce-manage-only', 'admin', 'media_manager', 'production');
    toggleVisibility('.admin-tl-create', 'admin', 'team_leader');
  }
};

window.auth = auth;

// Immediate Theme Initialization to prevent flicker
(function applyImmediateRoleTheme() {
  try {
    const raw = localStorage.getItem('tt_user');
    if (!raw) return;
    const u = JSON.parse(raw);
    if (!u || !u.role) return;
    const r = String(u.role).toLowerCase().trim();
    let themeClass = 'role-theme-blue';
    if (['writer', 'media_manager', 'rnd', 'designer'].includes(r)) {
      themeClass = 'role-theme-orange';
    } else if (['admin', 'team_leader'].includes(r)) {
      themeClass = 'role-theme-admin';
    }
    if (document.body) {
      document.body.classList.remove('role-theme-blue', 'role-theme-orange', 'role-theme-admin');
      document.body.classList.add(themeClass);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.remove('role-theme-blue', 'role-theme-orange', 'role-theme-admin');
        document.body.classList.add(themeClass);
      });
    }
  } catch (e) {}
})();
