const fs = require('fs');
const path = require('path');

function getHeaderHtml(placeholder = 'Search...') {
  return `      <header class="navbar">
        <div class="nav-left">
          <button id="mobile-toggle" class="mobile-hamburger"><i class="fas fa-bars"></i></button>
          <div class="nav-search">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="${placeholder}">
          </div>
        </div>
        <div class="nav-actions">
          <div class="notification-bell" id="notification-bell">
            <i class="fas fa-bell"></i>
            <span class="notification-badge" id="notification-badge" style="display:none;">0</span>
            <div class="notification-dropdown glass-card" id="notification-dropdown">
              <div class="notification-header">
                <span class="notification-title">Notifications</span>
                <span class="notification-mark-read" onclick="markAllNotificationsRead()">Mark all read</span>
              </div>
              <div id="notification-list" class="notification-list-scroll"></div>
            </div>
          </div>

          <div class="user-profile-nav" data-nav="profile.html">
            <div class="user-nav-text">
              <div id="nav-user-name" class="user-nav-name">Admin</div>
              <div id="nav-user-role" class="user-nav-role">Admin</div>
            </div>
            <img id="nav-avatar" class="user-avatar" src="" alt="Avatar" style="display:none;" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
            <div class="avatar-fallback-badge" id="nav-avatar-badge">A</div>
          </div>
        </div>
      </header>`;
}

function fixHeadersInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith('.html') && f !== 'index.html' && f !== 'login.html') {
      const fullPath = path.join(dir, f);
      let content = fs.readFileSync(fullPath, 'utf8');

      let placeholder = 'Search...';
      if (f === 'messages.html') placeholder = 'Search team chats, messages...';
      else if (f === 'payments.html') placeholder = 'Search invoices, clients, payment refs...';
      else if (f === 'users.html') placeholder = 'Search team members, emails...';
      else if (f === 'projects.html') placeholder = 'Search projects, clients...';
      else if (f === 'tasks.html') placeholder = 'Search tasks, assignees...';
      else if (f === 'drive.html') placeholder = 'Search files, folders...';

      // Match the entire navbar from <header class="navbar"> to </header>
      const navbarRegex = /<header\s+class=["']navbar["']>[\s\S]*?<\/header>/i;
      if (navbarRegex.test(content)) {
        content = content.replace(navbarRegex, getHeaderHtml(placeholder));
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed header in:', f);
      }
    }
  }
}

fixHeadersInDir('project/frontend/public');
fixHeadersInDir('project/frontend');
console.log('Completed fixing all navbar headers.');
