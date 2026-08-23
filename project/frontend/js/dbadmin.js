// File: public/js/dbadmin.js
// Admin Database Viewer UI logic

const dbadmin = {
  async tables() {
    return api.get('/dbadmin/tables');
  },
  async table(name, offset = 0, limit = 100) {
    return api.get(`/dbadmin/table/${encodeURIComponent(name)}?offset=${offset}&limit=${limit}`);
  },
  async renderViewer() {
    const container = document.getElementById('dbadmin-content');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
    
    try {
      const tables = await this.tables();
      
      let html = `
        <div style="display:flex; height:100%; gap: 16px;">
          <div style="width:200px; border-right:2px solid var(--border-color); padding-right:16px; display:flex; flex-direction:column; gap:8px; overflow-y:auto;">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px; font-weight:bold;">Tables</div>
            ${tables.map(t => `<div class="db-table-btn" style="padding:10px; border-radius:8px; cursor:pointer; background:var(--bg-hover); color:var(--text-primary); transition:all 0.2s;" onclick="dbadmin.loadTable('${t}')"><i class="fas fa-table" style="color:var(--accent-primary); width:20px;"></i> ${t}</div>`).join('')}
          </div>
          <div id="db-table-container" style="flex:1; overflow:hidden; display:flex; flex-direction:column;">
            <div style="padding:40px; text-align:center; color:var(--text-muted); flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column;">
              <i class="fas fa-database fa-3x" style="margin-bottom:16px; opacity:0.2;"></i>
              <div>Select a table from the left to view data</div>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = html;
      
      // Auto-load first table if exists
      if(tables.length > 0) {
        this.loadTable(tables[0]);
      }
    } catch(err) {
      container.innerHTML = `<div style="color:var(--accent-danger); padding:20px;">Error loading database definitions: ${err.message}</div>`;
    }
  },
  
  async loadTable(name) {
    const container = document.getElementById('db-table-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted); flex:1; display:flex; align-items:center; justify-content:center;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
    
    // Highlight active button
    document.querySelectorAll('.db-table-btn').forEach(b => {
      if(b.textContent.trim() === name) {
        b.style.background = 'var(--accent-primary)';
        b.style.color = '#102a96';
        b.querySelector('i').style.color = '#102a96';
      } else {
        b.style.background = 'var(--bg-hover)';
        b.style.color = 'var(--text-primary)';
        b.querySelector('i').style.color = 'var(--accent-primary)';
      }
    });

    try {
      const data = await this.table(name);
      if(!data || data.length === 0) {
        container.innerHTML = `
          <div style="padding-bottom:16px; border-bottom:2px solid var(--border-color); margin-bottom:16px;">
            <h3 style="margin:0; font-family:var(--font-display);">${name}</h3>
          </div>
          <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">Table is empty</div>
        `;
        return;
      }
      
      const columns = Object.keys(data[0]);
      
      let html = `
        <div style="padding-bottom:16px; border-bottom:2px solid var(--border-color); margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-family:var(--font-display);">${name} <span style="font-size:0.7rem; background:var(--bg-hover); padding:2px 8px; border-radius:10px; color:var(--text-muted); vertical-align:middle; margin-left:8px;">${data.length} records</span></h3>
        </div>
        <div style="flex:1; overflow:auto; border-radius:8px; border:2px solid var(--border-color);">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
            <thead style="background:var(--bg-hover); position:sticky; top:0; z-index:10;">
              <tr>
                ${columns.map(c => `<th style="padding:12px; border-bottom:2px solid var(--border-color); color:var(--text-muted); font-weight:600; white-space:nowrap;">${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr style="border-bottom:2px solid var(--border-color);">
                  ${columns.map(c => `<td style="padding:12px; white-space:nowrap; max-width:200px; overflow:hidden; text-overflow:ellipsis;" title="${String(row[c]).replace(/"/g, '&quot;')}">${row[c] !== null ? String(row[c]).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<i style="color:var(--text-muted)">NULL</i>'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div style="color:var(--accent-danger); padding:20px;">Error loading table data: ${err.message}</div>`;
    }
  }
};

window.dbadmin = dbadmin;

// Open Event Hook - Redirects cleanly to database_viewer.html
document.addEventListener('DOMContentLoaded', () => {
  const dbLinks = document.querySelectorAll('#dbadmin-link, [onclick*="dbadmin-modal"]');
  dbLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'database_viewer.html';
    });
  });
});
