const fs = require('fs');
const path = require('path');

const targetUserNav = `          <div class="user-profile-nav" data-nav="profile.html">
            <div class="user-nav-text">
              <div id="nav-user-name" class="user-nav-name">Admin</div>
              <div id="nav-user-role" class="user-nav-role">Admin</div>
            </div>
            <img id="nav-avatar" class="user-avatar" src="" alt="Avatar" style="display:none;" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
            <div class="avatar-fallback-badge" id="nav-avatar-badge">A</div>
          </div>`;

function syncNavbarMarkup(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith('.html') && f !== 'index.html' && f !== 'login.html') {
      const fullPath = path.join(dir, f);
      let content = fs.readFileSync(fullPath, 'utf8');

      // Replace <div class="user-profile-nav"...> ... </div>
      const regex = /<div\s+class=["']user-profile-nav["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/i;
      if (regex.test(content)) {
        content = content.replace(regex, targetUserNav);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Synced user-profile-nav markup in', f);
      }
    }
  }
}

syncNavbarMarkup('project/frontend/public');
syncNavbarMarkup('project/frontend');
