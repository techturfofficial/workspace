const fs = require('fs');
const path = require('path');

const cleanNotifHtml = `          <div class="notification-bell" id="notification-bell">
            <i class="fas fa-bell"></i>
            <span class="notification-badge" id="notification-badge" style="display:none;">0</span>
            <div class="notification-dropdown glass-card" id="notification-dropdown">
              <div class="notification-header">
                <span class="notification-title">Notifications</span>
                <span class="notification-mark-read" onclick="markAllNotificationsRead()">Mark all read</span>
              </div>
              <div id="notification-list" class="notification-list-scroll"></div>
            </div>
          </div>`;

function standardizeNotifs(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith('.html') && f !== 'index.html' && f !== 'login.html') {
      const fullPath = path.join(dir, f);
      let content = fs.readFileSync(fullPath, 'utf8');

      // Replace <div class="notification-bell"...> ... </div> (including nested dropdown)
      const notifRegex = /<div\s+class=["']notification-bell["'][^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i;
      if (notifRegex.test(content)) {
        content = content.replace(notifRegex, cleanNotifHtml);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Standardized notifications in:', f);
      }
    }
  }
}

standardizeNotifs('project/frontend/public');
standardizeNotifs('project/frontend');
