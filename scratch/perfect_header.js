const fs = require('fs');

const headerCss = `
/* ============================================================
   PIXEL-PERFECT HEADER & NAVBAR DESIGN SYSTEM
   ============================================================ */
.navbar {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  height: 68px !important;
  padding: 0 28px !important;
  background: #ffffff !important;
  border-bottom: 1.5px solid rgba(16, 42, 150, 0.08) !important;
  position: sticky !important;
  top: 0 !important;
  z-index: 100 !important;
  box-sizing: border-box !important;
  gap: 20px !important;
}

body.dark-mode .navbar {
  background: #0f172a !important;
  border-bottom-color: rgba(255, 255, 255, 0.08) !important;
}

.nav-left {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  flex: 1 !important;
  max-width: 520px !important;
}

.nav-search {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  background: #ffffff !important;
  border: 1.5px solid rgba(16, 42, 150, 0.18) !important;
  border-radius: 999px !important;
  padding: 0 16px !important;
  height: 42px !important;
  width: 100% !important;
  max-width: 420px !important;
  box-sizing: border-box !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  box-shadow: 0 2px 5px rgba(16, 42, 150, 0.02) !important;
}

body.dark-mode .nav-search {
  background: #1e293b !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
}

.nav-search:focus-within {
  border-color: #102a96 !important;
  box-shadow: 0 0 0 3px rgba(16, 42, 150, 0.12) !important;
}

.nav-search i,
.nav-search .fa-search {
  color: #102a96 !important;
  font-size: 0.92rem !important;
  flex-shrink: 0 !important;
}

body.dark-mode .nav-search i {
  color: #38bdf8 !important;
}

.nav-search input {
  background: transparent !important;
  border: none !important;
  outline: none !important;
  font-family: inherit !important;
  font-size: 0.88rem !important;
  font-weight: 500 !important;
  color: #0f172a !important;
  width: 100% !important;
  height: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
}

body.dark-mode .nav-search input {
  color: #f8fafc !important;
}

.nav-search input::placeholder {
  color: #94a3b8 !important;
  font-weight: 450 !important;
  font-size: 0.86rem !important;
}

.nav-actions {
  display: flex !important;
  align-items: center !important;
  gap: 16px !important;
  flex-shrink: 0 !important;
}

/* Notification Bell Circle */
.notification-bell {
  position: relative !important;
  cursor: pointer !important;
  width: 42px !important;
  height: 42px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #ffffff !important;
  border: 1.5px solid rgba(16, 42, 150, 0.16) !important;
  color: #334155 !important;
  font-size: 1.05rem !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  box-sizing: border-box !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03) !important;
}

body.dark-mode .notification-bell {
  background: #1e293b !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #94a3b8 !important;
}

.notification-bell:hover {
  background: #ffffff !important;
  color: #102a96 !important;
  border-color: #102a96 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(16, 42, 150, 0.12) !important;
}

.notification-badge {
  position: absolute !important;
  top: -4px !important;
  right: -4px !important;
  background: #ff5722 !important;
  color: #ffffff !important;
  font-size: 0.65rem !important;
  font-weight: 800 !important;
  min-width: 19px !important;
  height: 19px !important;
  border-radius: 10px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border: 2px solid #ffffff !important;
  padding: 0 4px !important;
  box-sizing: border-box !important;
  line-height: 1 !important;
}

body.dark-mode .notification-badge {
  border-color: #0f172a !important;
}

/* User Profile Pill */
.user-profile-nav {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 3px 6px 3px 18px !important;
  height: 42px !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  border: 1.5px solid rgba(16, 42, 150, 0.16) !important;
  cursor: pointer !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  box-sizing: border-box !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03) !important;
  text-decoration: none !important;
}

body.dark-mode .user-profile-nav {
  background: #1e293b !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

.user-profile-nav:hover {
  background: #ffffff !important;
  border-color: #102a96 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 14px rgba(16, 42, 150, 0.1) !important;
}

.user-nav-text {
  text-align: right !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
}

.user-nav-name {
  font-weight: 800 !important;
  font-size: 0.88rem !important;
  color: #0f172a !important;
  line-height: 1.1 !important;
}

body.dark-mode .user-nav-name {
  color: #f8fafc !important;
}

.user-nav-role {
  font-size: 0.72rem !important;
  color: #64748b !important;
  font-weight: 600 !important;
  line-height: 1.1 !important;
  margin-top: 1px !important;
}

body.dark-mode .user-nav-role {
  color: #94a3b8 !important;
}

.user-avatar {
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  border: 2px solid #102a96 !important;
  object-fit: cover !important;
  flex-shrink: 0 !important;
}

.avatar-fallback-badge {
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  background: linear-gradient(135deg, #ff6584, #f43f5e) !important;
  color: #ffffff !important;
  font-weight: 800 !important;
  font-size: 0.85rem !important;
  font-family: 'Orbitron', var(--font-display), sans-serif !important;
  border: 2px solid #102a96 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
}
`;

// Append or replace in CSS files
['project/frontend/public/css/main.css', 'project/frontend/css/main.css'].forEach(p => {
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('/* ============================================================\n   PIXEL-PERFECT HEADER & NAVBAR DESIGN SYSTEM')) {
    c = c.replace(/\/\* ============================================================\s+PIXEL-PERFECT HEADER & NAVBAR DESIGN SYSTEM[\s\S]*$/, headerCss);
  } else {
    c += '\n' + headerCss;
  }
  fs.writeFileSync(p, c, 'utf8');
  console.log('Updated header CSS in', p);
});

// Update auth.js to guarantee fallback avatar rendering
const authJsContent = `// File: public/js/auth.js
const auth = {
  TOKEN_KEY: 'tt_token',
  USER_KEY: 'tt_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
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
`;

fs.writeFileSync('project/frontend/public/js/auth.js', authJsContent, 'utf8');
fs.writeFileSync('project/frontend/js/auth.js', authJsContent, 'utf8');
console.log('Updated auth.js across public/ and frontend/');
