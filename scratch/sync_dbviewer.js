const fs = require('fs');

function syncSidebar(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/id=["']dbadmin-link["']/g, 'data-nav="database_viewer.html" id="dbadmin-link"');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated sidebar in:', filePath);
  }
}

syncSidebar('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public/js/sidebar.js');
syncSidebar('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/js/sidebar.js');

fs.copyFileSync('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public/database_viewer.html', 'c:/LOKI/Techturf/TT_CRM_Update/project/frontend/database_viewer.html');
fs.copyFileSync('c:/LOKI/Techturf/TT_CRM_Update/project/frontend/public/js/database_viewer.js', 'c:/LOKI/Techturf/TT_CRM_Update/project/frontend/js/database_viewer.js');
console.log('Synced database viewer files to project/frontend successfully.');
