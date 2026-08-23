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
    const avatar = document.getElementById('nav-avatar');
    const badge = document.getElementById('nav-avatar-badge');
    const name = document.getElementById('nav-user-name');
    const role = document.getElementById('nav-user-role');

    if (name) name.textContent = user.name || 'Admin';
    if (role) role.textContent = formatRole(user.role || 'admin');

    const initials = (user.name || 'Admin').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'A';

    if (avatar) {
      if (user.avatar && user.avatar.trim() !== '' && user.avatar !== 'null') {
        avatar.src = user.avatar;
        avatar.style.display = 'block';
        if (badge) badge.style.display = 'none';
      } else {
        avatar.style.display = 'none';
        if (badge) {
          badge.textContent = initials;
          badge.style.display = 'flex';
        }
      }
    } else if (badge) {
      badge.textContent = initials;
      badge.style.display = 'flex';
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
