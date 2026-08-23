const fs = require('fs');
const path = require('path');

function cleanupPopups(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.html')) {
      const fullPath = path.join(dir, file);
      let content = fs.readFileSync(fullPath, 'utf8');

      // Remove setupModal('dbadmin-link'...)
      content = content.replace(/setupModal\(['"]dbadmin-link['"][^;]*\);?/g, '');

      // Remove old modal div <div id="dbadmin-modal"...>...</div>
      content = content.replace(/<div\s+id=["']dbadmin-modal["'][\s\S]*?<\/div>\s*<\/div>/gi, '');

      fs.writeFileSync(fullPath, content, 'utf8');
      console.log('Cleaned db popups in:', file);
    }
  }
}

cleanupPopups('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public');
cleanupPopups('c:/LOKI/Techturf/TT_CRM_Update/project/frontend');

// Sync dbadmin.js
fs.copyFileSync('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public/js/dbadmin.js', 'c:/LOKI/Techturf/TT_CRM_Update/project/frontend/js/dbadmin.js');
console.log('Synced dbadmin.js to project/frontend/js/dbadmin.js');
