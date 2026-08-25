// Resilient FontAwesome Loader for Microsoft Edge and Restricted Browsers
(function ensureFontAwesome() {
  if (typeof document === 'undefined') return;
  const linkId = 'fa-resilient-cdn';
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
})();

// ============================================================
// DRAGGABLE MODAL SYSTEM — Universal drag-to-reposition
// ============================================================

/**
 * Makes a modal's inner content panel freely draggable by its header.
 * Automatically called for every .modal on the page.
 * @param {HTMLElement} modal - The outer .modal overlay element
 */
function makeDraggableModal(modal) {
  if (modal.classList.contains('modal-drawer')) return;
  const panel = modal.querySelector('.modal-content');
  if (!panel || panel._draggable) return; // already applied
  panel._draggable = true;

  // Find or create a drag handle (the modal-header)
  let handle = panel.querySelector('.modal-header');
  if (!handle) {
    // Fallback: make the whole top 48px the handle
    handle = document.createElement('div');
    handle.className = 'modal-drag-handle-fallback';
    handle.style.cssText = 'height:48px; width:100%; position:absolute; top:0; left:0; cursor:grab;';
    panel.style.position = 'relative';
    panel.prepend(handle);
  }

  // Style the handle
  handle.style.cursor = 'grab';
  handle.title = 'Drag to move';

  let isDragging = false;
  let startX, startY, startLeft, startTop;

  function onMouseDown(e) {
    // Ignore clicks on close buttons or form elements
    if (e.target.closest('.close-modal') || e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    e.preventDefault();
    isDragging = true;

    // Switch modal to absolute-position mode (detach from flex centering)
    if (!panel._positionInit) {
      const rect = panel.getBoundingClientRect();
      // Remove from flex flow, place absolutely at current position
      modal.style.alignItems = 'flex-start';
      modal.style.justifyContent = 'flex-start';
      panel.style.position = 'fixed';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.margin = '0';
      panel._positionInit = true;
    }

    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(panel.style.left) || 0;
    startTop = parseInt(panel.style.top) || 0;

    handle.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Clamp to viewport so panel can't go off-screen
    const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop + dy));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  function onMouseUp() {
    isDragging = false;
    handle.style.cursor = 'grab';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  // Touch support
  function onTouchStart(e) {
    if (e.target.closest('.close-modal') || e.target.tagName === 'BUTTON') return;
    const touch = e.touches[0];
    if (!panel._positionInit) {
      const rect = panel.getBoundingClientRect();
      modal.style.alignItems = 'flex-start';
      modal.style.justifyContent = 'flex-start';
      panel.style.position = 'fixed';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.margin = '0';
      panel._positionInit = true;
    }
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = parseInt(panel.style.left) || 0;
    startTop = parseInt(panel.style.top) || 0;
    isDragging = true;
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop + dy));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  function onTouchEnd() {
    isDragging = false;
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }

  // Reset position when modal is closed and re-opened
  const observer = new MutationObserver(() => {
    if (modal.style.display === 'none' || modal.style.display === '') {
      // Reset to center for next open
      panel.style.position = '';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.margin = '';
      panel._positionInit = false;
      modal.style.alignItems = '';
      modal.style.justifyContent = '';
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['style'] });

  handle.addEventListener('mousedown', onMouseDown);
  handle.addEventListener('touchstart', onTouchStart, { passive: true });
}

/**
 * Apply draggable to all .modal elements currently in the DOM
 */
function initAllDraggableModals() {
  document.querySelectorAll('.modal').forEach(makeDraggableModal);
}

// Modal utility functions
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('show');
      makeDraggableModal(modal); // ensure drag is applied
    }, 10);
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
    const delay = modal.classList.contains('modal-drawer') ? 350 : 200;
    setTimeout(() => { modal.style.display = 'none'; }, delay);
    document.body.style.overflow = '';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? 'fa-check-circle' :
    type === 'error' ? 'fa-exclamation-circle' :
      type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';

  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <div class="toast-message">${message}</div>
    <i class="fas fa-times toast-close" style="margin-left:auto; cursor:pointer; opacity:0.5;"></i>
  `;

  container.appendChild(toast);

  const removeToast = () => {
    toast.style.transform = 'translateX(110%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').onclick = removeToast;
  setTimeout(removeToast, 3500);
}

function getRoleAvatarStyle(role, ctx = null, size = 120) {
  const r = String(role || '').toLowerCase().trim();

  // 1. Tech Turf Blue Roles: Backend, Front / Frontend, Frontend+Backend
  if (['backend', 'frontend', 'frontend_backend', 'front'].includes(r)) {
    return {
      type: 'solid',
      color: '#102a96', // Tech Turf Blue
      border: '#102a96',
      cssBackground: '#102a96',
      badgeBg: 'rgba(16, 42, 150, 0.15)',
      badgeColor: '#102a96'
    };
  }

  // 2. Orange Roles: Writer, Media Manager, R&D, Designer
  if (['writer', 'media_manager', 'rnd', 'designer'].includes(r)) {
    return {
      type: 'solid',
      color: '#ff6a00', // Orange
      border: '#ff6a00',
      cssBackground: '#ff6a00',
      badgeBg: 'rgba(255, 106, 0, 0.15)',
      badgeColor: '#ff6a00'
    };
  }

  // 3. Tech Turf Blue and Orange: Admin and Team Leaders
  if (['admin', 'team_leader'].includes(r)) {
    if (ctx && size) {
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#102a96'); // Tech Turf Blue
      grad.addColorStop(1, '#ff6a00'); // Tech Turf Orange
      return {
        type: 'gradient',
        fill: grad,
        color: '#102a96',
        border: '#102a96',
        cssBackground: 'linear-gradient(135deg, #102a96 0%, #ff6a00 100%)',
        badgeBg: 'linear-gradient(135deg, rgba(16,42,150,0.15), rgba(255,106,0,0.15))',
        badgeColor: '#102a96'
      };
    }
    return {
      type: 'gradient',
      cssBackground: 'linear-gradient(135deg, #102a96 0%, #ff6a00 100%)',
      color: '#102a96',
      border: '#102a96',
      badgeBg: 'rgba(16, 42, 150, 0.15)',
      badgeColor: '#102a96'
    };
  }

  // Fallback (e.g. unassigned, client, custom roles)
  return {
    type: 'solid',
    color: '#102a96',
    border: '#102a96',
    cssBackground: '#102a96',
    badgeBg: 'rgba(16, 42, 150, 0.12)',
    badgeColor: '#102a96'
  };
}

function getInitialsAvatar(name, size = 120, role = null) {
  const initials = String(name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'U';

  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    const style = getRoleAvatarStyle(role, ctx, size);
    if (style.type === 'gradient' && style.fill) {
      ctx.fillStyle = style.fill;
    } else {
      ctx.fillStyle = style.color || '#102a96';
    }
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(size * 0.38)}px "Orbitron", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2);

    return canvas.toDataURL('image/png');
  } catch (e) {
    const style = getRoleAvatarStyle(role);
    const bgHex = (style.color || '102a96').replace('#', '');
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${bgHex}&color=fff&size=${size}&font-size=0.4&bold=true`;
  }
}

function parseUtcDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  let s = String(dateStr).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = parseUtcDate(dateStr);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const parsed = parseUtcDate(dateStr);
  if (!parsed) return '';
  const seconds = Math.floor((new Date() - parsed) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return "just now";
}

function formatRole(role) {
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getRoleColor(role) {
  const style = getRoleAvatarStyle(role);
  return style.border || style.color || '#102a96';
}

function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch { }
  if (url.startsWith('/')) return url;
  return '#';
}

function initSharedToolForms() {
  const ticketsForm = document.getElementById('tickets-add-form');
  if (ticketsForm && !ticketsForm.dataset.bound) {
    ticketsForm.dataset.bound = 'true';
    ticketsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.post('/tickets', {
          title: document.getElementById('ticket-title')?.value,
          description: document.getElementById('ticket-desc')?.value,
          priority: document.getElementById('ticket-priority')?.value || 'normal'
        });
        showToast('Ticket created', 'success');
        ticketsForm.reset();
        const link = document.getElementById('tickets-link');
        if (link) link.click();
      } catch (err) {
        showToast(err.message || 'Failed to create ticket', 'error');
      }
    });
  }

  const paymentsForm = document.getElementById('payments-add-form');
  if (paymentsForm && !paymentsForm.dataset.bound) {
    paymentsForm.dataset.bound = 'true';
    paymentsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.post('/payments', {
          user_id: Number(document.getElementById('payment-user-id')?.value),
          amount: Number(document.getElementById('payment-amount')?.value),
          currency: document.getElementById('payment-currency')?.value || 'USD',
          method: document.getElementById('payment-method')?.value || ''
        });
        showToast('Payment recorded', 'success');
        paymentsForm.reset();
        const link = document.getElementById('payments-link');
        if (link) link.click();
      } catch (err) {
        showToast(err.message || 'Failed to record payment', 'error');
      }
    });
  }
}

async function loadSharedTickets() {
  const list = document.getElementById('tickets-list');
  if (!list) return;
  list.innerHTML = '<div class="text-muted">Loading tickets...</div>';
  try {
    const data = await api.get('/tickets');
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="text-muted">No tickets found.</p>';
      return;
    }
    list.innerHTML = data.map(t => `
      <div class="glass-card" style="margin-bottom:10px; padding:12px;">
        <div style="display:flex; justify-content:space-between;">
          <b>${t.title}</b>
          <span class="badge badge-${t.status}">${t.status}</span>
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:5px;">${t.description || ''}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-danger">Failed to load tickets.</p>';
  }
}

async function loadSharedPayments() {
  const list = document.getElementById('payments-list');
  if (!list) return;
  list.innerHTML = '<div class="text-muted">Loading payments...</div>';
  try {
    const data = await api.get('/payments');
    list.innerHTML = `<table class="table-report"><thead><tr><th>ID</th><th>User</th><th>Amount</th><th>Status</th></tr></thead><tbody>
      ${data.map(p => `<tr><td>${p.id}</td><td>${p.user_name || p.user_id}</td><td>${p.amount} ${p.currency}</td><td>${p.status}</td></tr>`).join('')}
    </tbody></table>`;
  } catch (err) {
    list.innerHTML = '<p class="text-danger">Failed to load payments.</p>';
  }
}

async function loadSharedCourses() {
  const list = document.getElementById('courses-list');
  if (!list) return;
  list.innerHTML = '<div class="text-muted">Loading courses...</div>';
  try {
    const data = await api.get('/courses');
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="text-muted">No courses found.</p>';
      return;
    }
    list.innerHTML = data.map(c => {
      const previewUrl = safeUrl(c.video_url || '');
      const courseUrl = safeUrl(c.link || '');
      const videoFrame = previewUrl && previewUrl !== '#' ? `
        <div style="margin-top:12px; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:#000;">
          <iframe
            src="${previewUrl}"
            title="${escapeHtml(c.title)} preview"
            style="width:100%; aspect-ratio:16/9; border:0;"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
          </iframe>
        </div>
      ` : '';

      return `
      <div class="glass-card" style="margin-bottom:10px; padding:15px;">
        <div style="display:flex; justify-content:space-between; gap:14px; align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:700;">${escapeHtml(c.title)}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(c.description || '')}</div>
          </div>
          ${courseUrl && courseUrl !== '#' ? `<a href="${courseUrl}" target="_blank" rel="noopener" class="btn-secondary" style="padding:5px 15px; white-space:nowrap;">Open Link</a>` : ''}
        </div>
        ${videoFrame}
      </div>
    `;
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-danger">Failed to load courses.</p>';
  }
}

function initSharedToolLinks() {
  const linkConfigs = [
    { id: 'payments-link', loader: loadSharedPayments }
  ];

  linkConfigs.forEach(({ id, loader }) => {
    const link = document.getElementById(id);
    if (!link || link.dataset.bound) return;
    link.dataset.bound = 'true';
    link.addEventListener('click', () => {
      loader();
    });
  });
}

window.showToast = showToast;
window.getInitialsAvatar = getInitialsAvatar;
window.getRoleAvatarStyle = getRoleAvatarStyle;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.formatRole = formatRole;
window.getRoleColor = getRoleColor;
window.openModal = openModal;
window.closeModal = closeModal;
window.debounce = debounce;
window.escapeHtml = escapeHtml;
window.safeUrl = safeUrl;

// Universal Password Visibility Toggle System
function togglePasswordVisibility(target, btn) {
  let input = null;
  if (typeof target === 'string') {
    input = document.getElementById(target);
  } else if (target instanceof HTMLElement) {
    input = target;
  }
  if (!input && btn) {
    input = btn.closest('.input-wrapper-icon, .input-wrap, .password-input-wrap, .form-group, .pass-input-group')?.querySelector('input');
  }
  if (!input) return;

  const isPassword = input.getAttribute('type') === 'password';
  input.setAttribute('type', isPassword ? 'text' : 'password');

  const icon = btn?.querySelector('i') || (btn?.tagName === 'I' ? btn : null);
  if (icon) {
    if (isPassword) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
      btn.setAttribute('title', 'Hide password');
      btn.setAttribute('aria-label', 'Hide password');
    } else {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
      btn.setAttribute('title', 'Show password');
      btn.setAttribute('aria-label', 'Show password');
    }
  }
}

function initPasswordToggles() {
  document.querySelectorAll('input[type="password"], input[data-pwd-toggle="true"]').forEach(input => {
    if (input.dataset.pwdToggleInit) return;
    input.dataset.pwdToggleInit = 'true';

    const parent = input.parentElement;
    if (!parent) return;

    let existingBtn = parent.querySelector('.password-toggle-btn');
    if (existingBtn) {
      existingBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePasswordVisibility(input, existingBtn);
      };
      return;
    }

    const computedPos = window.getComputedStyle(parent).position;
    if (computedPos === 'static') {
      parent.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle-btn';
    btn.title = 'Show password';
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = '<i class="fas fa-eye"></i>';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePasswordVisibility(input, btn);
    };

    input.style.paddingRight = '42px';
    parent.appendChild(btn);
  });
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.initPasswordToggles = initPasswordToggles;

document.addEventListener('DOMContentLoaded', () => {
  initSharedToolForms();
  initSharedToolLinks();
  // Apply draggable to all modals present at page load
  initAllDraggableModals();
  // Initialize password toggle buttons across all forms
  initPasswordToggles();

  // Watch for dynamically injected modals and password inputs
  const bodyObserver = new MutationObserver(() => {
    initAllDraggableModals();
    initPasswordToggles();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
});

window.makeDraggableModal = makeDraggableModal;
window.initAllDraggableModals = initAllDraggableModals;
