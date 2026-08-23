// File: public/js/database_viewer.js
// Tech Turf Unified Database Studio & Viewer Logic

let allTables = [];
let activeTableName = null;
let currentTableData = {
  columns: [],
  rows: [],
  page: 1,
  limit: 50,
  total: 0,
  totalPages: 1
};
let currentSortBy = '';
let currentSortDir = 'ASC';
let activeInspectorRow = null;
let lastSqlResults = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check admin role & initialize topbar info
  if (window.auth && auth.getUser) {
    const user = auth.getUser();
    if (user) {
      if (user.role !== 'admin') {
        showToast('Admin privileges required for Database Viewer', 'error');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1500);
        return;
      }

      const nameEl = document.getElementById('nav-user-name');
      const roleEl = document.getElementById('nav-user-role');
      const badgeEl = document.getElementById('nav-avatar-badge');
      if (nameEl) nameEl.textContent = user.name || 'Admin';
      if (roleEl) roleEl.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Administrator';
      if (badgeEl) {
        const initials = (user.name || 'AD').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        badgeEl.textContent = initials || 'AD';
      }
    }
  }

  bindEvents();
  await loadTables();
});

function bindEvents() {
  // Table search filter
  const tableSearchInput = document.getElementById('tables-search-input');
  if (tableSearchInput) {
    tableSearchInput.addEventListener('input', () => {
      renderTablesList(tableSearchInput.value.trim().toLowerCase());
    });
  }

  // Refresh tables button
  const refreshTablesBtn = document.getElementById('refresh-tables-btn');
  if (refreshTablesBtn) {
    refreshTablesBtn.onclick = () => loadTables();
  }

  // Main Tab Pills (Data, Schema, SQL)
  document.querySelectorAll('.db-tab-pill[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.db-tab-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.dataset.tab;
      document.getElementById('view-data').style.display = tab === 'data' ? 'flex' : 'none';
      document.getElementById('view-schema').classList.toggle('active', tab === 'schema');
      document.getElementById('view-sql').classList.toggle('active', tab === 'sql');

      if (tab === 'schema' && activeTableName) {
        loadTableSchema(activeTableName);
      }
    });
  });

  // Row Search within table
  const rowSearchInput = document.getElementById('rows-search-input');
  let searchTimer = null;
  if (rowSearchInput) {
    rowSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentTableData.page = 1;
        loadActiveTableData();
      }, 300);
    });
  }

  // Page limit selector
  const limitSelect = document.getElementById('limit-select');
  if (limitSelect) {
    limitSelect.addEventListener('change', () => {
      currentTableData.limit = parseInt(limitSelect.value, 10) || 50;
      currentTableData.page = 1;
      loadActiveTableData();
    });
  }

  // Refresh data button
  const refreshDataBtn = document.getElementById('refresh-data-btn');
  if (refreshDataBtn) {
    refreshDataBtn.onclick = () => loadActiveTableData();
  }

  // Pagination navigation
  const btnFirst = document.getElementById('btn-page-first');
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  const btnLast = document.getElementById('btn-page-last');

  if (btnFirst) btnFirst.onclick = () => { if (currentTableData.page > 1) { currentTableData.page = 1; loadActiveTableData(); } };
  if (btnPrev) btnPrev.onclick = () => { if (currentTableData.page > 1) { currentTableData.page--; loadActiveTableData(); } };
  if (btnNext) btnNext.onclick = () => { if (currentTableData.page < currentTableData.totalPages) { currentTableData.page++; loadActiveTableData(); } };
  if (btnLast) btnLast.onclick = () => { if (currentTableData.page < currentTableData.totalPages) { currentTableData.page = currentTableData.totalPages; loadActiveTableData(); } };

  // Export buttons
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.onclick = exportCurrentTableCsv;

  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn) exportJsonBtn.onclick = exportCurrentTableJson;

  // SQL Console Runner
  const runSqlBtn = document.getElementById('run-sql-btn');
  if (runSqlBtn) runSqlBtn.onclick = executeSqlQuery;

  const sqlTextarea = document.getElementById('sql-query-input');
  if (sqlTextarea) {
    sqlTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeSqlQuery();
      }
    });
  }

  // Row detail modal
  const closeModalBtn = document.getElementById('close-row-modal-btn');
  const modalOverlay = document.getElementById('row-detail-modal');
  if (closeModalBtn && modalOverlay) {
    closeModalBtn.onclick = () => modalOverlay.classList.remove('active');
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }

  const copyJsonBtn = document.getElementById('copy-json-btn');
  if (copyJsonBtn) {
    copyJsonBtn.onclick = () => {
      if (activeInspectorRow) {
        navigator.clipboard.writeText(JSON.stringify(activeInspectorRow, null, 2)).then(() => {
          showToast('JSON copied to clipboard', 'success');
        });
      }
    };
  }

  const exportSqlResultsBtn = document.getElementById('export-sql-results-btn');
  if (exportSqlResultsBtn) {
    exportSqlResultsBtn.onclick = () => {
      if (lastSqlResults && lastSqlResults.rows && lastSqlResults.rows.length > 0) {
        exportArrayToCsv(lastSqlResults.rows, 'sql_results.csv');
      }
    };
  }
}

async function loadTables() {
  const container = document.getElementById('db-tables-list');
  if (!container) return;

  container.innerHTML = '<div style="padding:30px 10px; text-align:center; color:var(--text-muted); font-size:0.8rem;"><i class="fas fa-spinner fa-spin"></i> Loading tables...</div>';

  try {
    const data = await api.get('/dbadmin/tables');
    allTables = Array.isArray(data) ? data : [];

    const tablesBadge = document.getElementById('db-total-tables-badge');
    if (tablesBadge) tablesBadge.textContent = `${allTables.length} Tables`;

    renderTablesList();

    // Auto-select first table if none active
    if (!activeTableName && allTables.length > 0) {
      selectTable(allTables[0].name);
    } else if (activeTableName) {
      selectTable(activeTableName);
    }
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; padding:16px; font-size:0.8rem;">Failed to load tables: ${err.message}</div>`;
  }
}

function renderTablesList(searchQuery = '') {
  const container = document.getElementById('db-tables-list');
  if (!container) return;

  let filtered = allTables;
  if (searchQuery) {
    filtered = allTables.filter(t => t.name.toLowerCase().includes(searchQuery));
  }

  if (!filtered.length) {
    container.innerHTML = '<div style="padding:20px 10px; text-align:center; color:var(--text-muted); font-size:0.78rem;">No matching tables</div>';
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isActive = t.name === activeTableName;
    return `
      <div class="db-table-item ${isActive ? 'active' : ''}" onclick="selectTable('${t.name}')">
        <div class="db-table-item-name">
          <i class="fas fa-table" style="font-size:0.8rem; opacity:0.8;"></i>
          <span>${t.name}</span>
        </div>
        <span class="db-table-rows-tag">${t.count.toLocaleString()}</span>
      </div>
    `;
  }).join('');
}

async function selectTable(tableName) {
  activeTableName = tableName;
  renderTablesList(document.getElementById('tables-search-input')?.value.trim().toLowerCase() || '');

  const titleEl = document.getElementById('active-table-name');
  if (titleEl) titleEl.textContent = tableName;

  currentTableData.page = 1;
  currentSortBy = '';
  currentSortDir = 'ASC';

  const activeTab = document.querySelector('.db-tab-pill.active')?.dataset.tab || 'data';
  if (activeTab === 'schema') {
    loadTableSchema(tableName);
  }

  await loadActiveTableData();
}

async function loadActiveTableData() {
  if (!activeTableName) return;

  const gridWrap = document.getElementById('db-grid-wrap');
  if (gridWrap) {
    gridWrap.innerHTML = '<div style="padding:60px 20px; text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:8px; font-size:0.8rem;">Loading records...</div></div>';
  }

  const search = document.getElementById('rows-search-input')?.value.trim() || '';
  const page = currentTableData.page;
  const limit = currentTableData.limit;

  let url = `/dbadmin/table/${encodeURIComponent(activeTableName)}?page=${page}&limit=${limit}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (currentSortBy) url += `&sortBy=${encodeURIComponent(currentSortBy)}&sortDir=${currentSortDir}`;

  try {
    const res = await api.get(url);
    currentTableData = res;

    // Update stats header
    const recordsBadge = document.getElementById('active-table-records');
    const colsBadge = document.getElementById('active-table-columns');
    if (recordsBadge) recordsBadge.textContent = `${res.total.toLocaleString()} records`;
    if (colsBadge) colsBadge.textContent = `${res.columns ? res.columns.length : 0} cols`;

    renderDataGrid(res);
    updatePaginationControls(res);
  } catch (err) {
    if (gridWrap) {
      gridWrap.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;"><i class="fas fa-triangle-exclamation fa-2x"></i><div style="margin-top:8px; font-weight:700;">Error: ${err.message}</div></div>`;
    }
  }
}

function renderDataGrid(data) {
  const gridWrap = document.getElementById('db-grid-wrap');
  if (!gridWrap) return;

  if (!data.rows || data.rows.length === 0) {
    gridWrap.innerHTML = `
      <div style="padding:60px 20px; text-align:center; color:var(--text-muted);">
        <i class="fas fa-box-open fa-3x" style="opacity:0.3; margin-bottom:12px; display:block;"></i>
        <div style="font-weight:700; font-size:0.95rem;">No records found</div>
        <div style="font-size:0.78rem; margin-top:4px;">This table is currently empty or no rows match your search filter.</div>
      </div>
    `;
    return;
  }

  const columns = data.columns || [];

  let html = `
    <table class="db-table">
      <thead>
        <tr>
          <th style="width:40px; text-align:center; cursor:default;">#</th>
          ${columns.map(col => {
            const isSorted = currentSortBy === col.name;
            const icon = isSorted 
              ? (currentSortDir === 'ASC' ? '<i class="fas fa-arrow-up-short-wide sort-icon" style="color:#3b82f6;"></i>' : '<i class="fas fa-arrow-down-wide-short sort-icon" style="color:#3b82f6;"></i>')
              : '<i class="fas fa-sort sort-icon"></i>';
            return `
              <th onclick="toggleSort('${col.name}')" title="Click to sort by ${col.name}">
                ${escapeHtml(col.name)}
                ${col.pk ? '<span class="db-pk-badge">PK</span>' : ''}
                ${icon}
              </th>
            `;
          }).join('')}
          <th style="width:50px; text-align:center; cursor:default;">View</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.rows.forEach((row, idx) => {
    const rowNum = ((data.page - 1) * data.limit) + (idx + 1);
    html += `<tr>`;
    html += `<td style="text-align:center; color:var(--text-muted); font-size:0.72rem; font-weight:700;">${rowNum}</td>`;

    columns.forEach(col => {
      const val = row[col.name];
      let displayHtml = '';

      if (val === null || val === undefined) {
        displayHtml = '<span class="db-null-value">NULL</span>';
      } else if (typeof val === 'boolean') {
        displayHtml = val ? '<span style="color:#10b981; font-weight:700;">TRUE</span>' : '<span style="color:#ef4444; font-weight:700;">FALSE</span>';
      } else {
        const str = String(val);
        displayHtml = escapeHtml(str);
      }

      html += `<td title="${escapeHtml(String(val !== null ? val : 'NULL'))}">${displayHtml}</td>`;
    });

    html += `
      <td class="action-cell">
        <button class="db-inspect-btn" onclick="inspectRowIndex(${idx})" title="Inspect full row data">
          <i class="fas fa-magnifying-glass"></i>
        </button>
      </td>
    `;
    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>
  `;

  gridWrap.innerHTML = html;
}

function updatePaginationControls(data) {
  const info = document.getElementById('pagination-info');
  const label = document.getElementById('current-page-label');
  const btnFirst = document.getElementById('btn-page-first');
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  const btnLast = document.getElementById('btn-page-last');

  const start = data.total === 0 ? 0 : ((data.page - 1) * data.limit) + 1;
  const end = Math.min(data.page * data.limit, data.total);

  if (info) info.textContent = `Showing ${start.toLocaleString()} to ${end.toLocaleString()} of ${data.total.toLocaleString()} records`;
  if (label) label.textContent = `Page ${data.page} of ${data.totalPages || 1}`;

  if (btnFirst) btnFirst.disabled = data.page <= 1;
  if (btnPrev) btnPrev.disabled = data.page <= 1;
  if (btnNext) btnNext.disabled = data.page >= data.totalPages;
  if (btnLast) btnLast.disabled = data.page >= data.totalPages;
}

function toggleSort(colName) {
  if (currentSortBy === colName) {
    currentSortDir = currentSortDir === 'ASC' ? 'DESC' : 'ASC';
  } else {
    currentSortBy = colName;
    currentSortDir = 'ASC';
  }
  loadActiveTableData();
}

function inspectRowIndex(idx) {
  if (!currentTableData.rows || !currentTableData.rows[idx]) return;
  const row = currentTableData.rows[idx];
  activeInspectorRow = row;

  const modalTitle = document.getElementById('modal-record-title');
  if (modalTitle) modalTitle.textContent = `${activeTableName} Record Details`;

  const tbody = document.getElementById('modal-record-tbody');
  if (tbody) {
    tbody.innerHTML = Object.entries(row).map(([key, val]) => {
      let formattedVal = '';
      if (val === null || val === undefined) {
        formattedVal = '<span class="db-null-value">NULL</span>';
      } else {
        formattedVal = escapeHtml(String(val));
      }
      return `
        <tr>
          <th>${escapeHtml(key)}</th>
          <td>${formattedVal}</td>
        </tr>
      `;
    }).join('');
  }

  const modalOverlay = document.getElementById('row-detail-modal');
  if (modalOverlay) modalOverlay.classList.add('active');
}

async function loadTableSchema(tableName) {
  const sqlBox = document.getElementById('schema-sql-definition');
  const tbody = document.getElementById('schema-columns-tbody');
  const title = document.getElementById('schema-table-title');

  if (title) title.textContent = `${tableName} Schema & Constraints`;
  if (sqlBox) sqlBox.textContent = '-- Loading schema...';
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i></td></tr>';

  try {
    const res = await api.get(`/dbadmin/schema/${encodeURIComponent(tableName)}`);
    if (sqlBox) sqlBox.textContent = res.sql || '-- No SQL definition available';

    if (tbody && res.columns) {
      tbody.innerHTML = res.columns.map((c, i) => `
        <tr>
          <td style="color:var(--text-muted);">${i + 1}</td>
          <td style="font-weight:700; color:var(--text-primary);">${escapeHtml(c.name)} ${c.pk ? '<span class="db-pk-badge">PRIMARY KEY</span>' : ''}</td>
          <td style="color:#3b82f6; font-weight:700;">${escapeHtml(c.type || 'TEXT')}</td>
          <td>${c.notnull ? '<span style="color:#ef4444; font-weight:700;">YES</span>' : '<span style="color:var(--text-muted);">NO</span>'}</td>
          <td style="font-family:var(--font-mono);">${c.dflt_value !== null ? escapeHtml(String(c.dflt_value)) : '<span class="db-null-value">NULL</span>'}</td>
          <td>${c.pk ? '<i class="fas fa-key" style="color:#f59e0b;"></i>' : '-'}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    if (sqlBox) sqlBox.textContent = `-- Error: ${err.message}`;
  }
}

// SQL Query Console Runner
async function executeSqlQuery() {
  const textarea = document.getElementById('sql-query-input');
  const sql = textarea ? textarea.value.trim() : '';

  if (!sql) {
    showToast('Please enter a SQL query', 'error');
    return;
  }

  const resultsGrid = document.getElementById('sql-results-grid');
  const resultsMeta = document.getElementById('sql-results-meta');
  const exportBtn = document.getElementById('export-sql-results-btn');

  if (resultsGrid) {
    resultsGrid.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:8px;">Executing query...</div></div>';
  }

  try {
    const res = await api.post('/dbadmin/query', { sql });
    lastSqlResults = res;

    if (resultsMeta) {
      resultsMeta.innerHTML = `<span style="color:#10b981;"><i class="fas fa-circle-check"></i> Query Executed in ${res.executionTimeMs} ms</span> — ${res.type === 'select' ? `${res.rowCount} rows returned` : `${res.changes} rows affected`}`;
    }

    if (res.type === 'select') {
      if (exportBtn) exportBtn.style.display = res.rows && res.rows.length > 0 ? 'inline-flex' : 'none';

      if (!res.rows || res.rows.length === 0) {
        if (resultsGrid) resultsGrid.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-muted);">Query returned 0 rows.</div>';
        return;
      }

      const cols = res.columns || Object.keys(res.rows[0] || {});
      let html = `
        <table class="db-table">
          <thead>
            <tr>
              ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${res.rows.map(row => `
              <tr>
                ${cols.map(c => `<td title="${escapeHtml(String(row[c] !== null ? row[c] : 'NULL'))}">${row[c] !== null ? escapeHtml(String(row[c])) : '<span class="db-null-value">NULL</span>'}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      if (resultsGrid) resultsGrid.innerHTML = html;
    } else {
      if (exportBtn) exportBtn.style.display = 'none';
      if (resultsGrid) {
        resultsGrid.innerHTML = `
          <div style="padding:40px; text-align:center;">
            <i class="fas fa-check-circle fa-3x" style="color:#10b981; margin-bottom:12px; display:block;"></i>
            <div style="font-weight:800; font-size:1.1rem; color:var(--text-primary);">Mutation Succeeded</div>
            <div style="color:var(--text-secondary); margin-top:6px; font-family:var(--font-mono); font-size:0.85rem;">Rows Affected: ${res.changes} | Last Row ID: ${res.lastInsertRowid || '-'}</div>
          </div>
        `;
      }
      await loadTables();
    }
  } catch (err) {
    if (resultsMeta) resultsMeta.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-triangle-exclamation"></i> Query Failed</span>`;
    if (exportBtn) exportBtn.style.display = 'none';
    if (resultsGrid) {
      resultsGrid.innerHTML = `<div style="padding:30px; color:#ef4444; font-family:var(--font-mono); font-size:0.85rem; line-height:1.6;">${escapeHtml(err.message || 'Execution error')}</div>`;
    }
  }
}

window.setSqlQuery = function(sql) {
  const input = document.getElementById('sql-query-input');
  if (input) {
    input.value = sql;
    input.focus();
  }
};

// Export Helpers
function exportCurrentTableCsv() {
  if (!currentTableData.rows || currentTableData.rows.length === 0) {
    showToast('No rows available to export', 'error');
    return;
  }
  exportArrayToCsv(currentTableData.rows, `${activeTableName || 'table'}_export.csv`);
}

function exportCurrentTableJson() {
  if (!currentTableData.rows || currentTableData.rows.length === 0) {
    showToast('No rows available to export', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(currentTableData.rows, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${activeTableName || 'table'}_export.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON exported successfully', 'success');
}

function exportArrayToCsv(rows, filename) {
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvRows = [];

  csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

  rows.forEach(r => {
    const values = headers.map(h => {
      const val = r[h];
      if (val === null || val === undefined) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully', 'success');
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
