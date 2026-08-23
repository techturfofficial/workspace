// File: public/js/payments_hub.js
// Modern Payments & Financial Revenue Hub Logic for Tech Turf

let allPayments = [];
let filteredPayments = [];
let activePeriod = 30; // 7, 30, 90, 365, 'all'
let activeStatusFilter = 'all';
let clientsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Check user role
  if (window.auth && auth.getUser) {
    const user = auth.getUser();
    if (user) {
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

  // Set default date picker to today
  const dateInput = document.getElementById('pay-date-input');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  bindEvents();
  await loadClients();
  await loadPayments();
});

function bindEvents() {
  // Time period filter tabs
  document.querySelectorAll('.pay-filter-tab[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-filter-tab[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.period;
      activePeriod = val === 'all' ? 'all' : parseInt(val, 10);
      applyFilters();
    });
  });

  // Status filter tabs
  document.querySelectorAll('#status-filter-group .pay-filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#status-filter-group .pay-filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatusFilter = btn.dataset.status;
      applyFilters();
    });
  });

  // Search filter
  const searchInput = document.getElementById('payments-global-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyFilters();
    });
  }

  // Record modal open/close
  const openModalBtn = document.getElementById('open-record-modal-btn');
  const closeModalBtn = document.getElementById('close-record-modal-btn');
  const cancelBtn = document.getElementById('cancel-record-btn');
  const modalOverlay = document.getElementById('record-payment-modal');

  if (openModalBtn && modalOverlay) openModalBtn.onclick = () => modalOverlay.classList.add('active');
  if (closeModalBtn && modalOverlay) closeModalBtn.onclick = () => modalOverlay.classList.remove('active');
  if (cancelBtn && modalOverlay) cancelBtn.onclick = () => modalOverlay.classList.remove('active');

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }

  // Record payment form submit
  const recordForm = document.getElementById('record-payment-form');
  if (recordForm) {
    recordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleRecordPayment();
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('refresh-ledger-btn');
  if (refreshBtn) refreshBtn.onclick = () => loadPayments();

  // Export CSV
  const exportBtn = document.getElementById('export-csv-btn') || document.getElementById('export-ledger-csv');
  if (exportBtn) exportBtn.onclick = () => exportPaymentsCsv();
}

async function loadClients() {
  try {
    const clients = await api.get('/clients');
    clientsList = Array.isArray(clients) ? clients : [];
    const select = document.getElementById('pay-client-select');
    if (select) {
      select.innerHTML = '<option value="">-- Choose Client --</option>' +
        clientsList.map(c => `<option value="${c.id}">${escapeHtml(c.name || 'Client')} ${c.company ? `(${escapeHtml(c.company)})` : ''}</option>`).join('');
    }
  } catch (err) {
    console.error('Error loading clients:', err);
  }
}

async function loadPayments() {
  const tbody = document.getElementById('payment-ledger-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading financial records...</td></tr>';
  }

  try {
    const data = await api.get('/payments');
    allPayments = Array.isArray(data) ? data : [];
    applyFilters();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444;"><i class="fas fa-triangle-exclamation"></i> Error loading payments: ${err.message}</td></tr>`;
    }
  }
}

function applyFilters() {
  const search = document.getElementById('payments-global-search')?.value.trim().toLowerCase() || '';
  const now = new Date();

  filteredPayments = allPayments.filter(p => {
    // 1. Period filter
    if (activePeriod !== 'all') {
      const pDate = new Date(p.payment_date || p.created_at);
      if (!isNaN(pDate.getTime())) {
        const diffDays = (now - pDate) / (1000 * 60 * 60 * 24);
        if (diffDays > activePeriod) return false;
      }
    }

    // 2. Status filter
    const status = String(p.status || p.computed_status || 'pending').toLowerCase();
    if (activeStatusFilter !== 'all' && status !== activeStatusFilter) {
      return false;
    }

    // 3. Search filter
    if (search) {
      const matchClient = (p.client_name || '').toLowerCase().includes(search);
      const matchCompany = (p.client_company || '').toLowerCase().includes(search);
      const matchMethod = (p.method || '').toLowerCase().includes(search);
      const matchNotes = (p.notes || '').toLowerCase().includes(search);
      const matchId = String(p.id).includes(search);
      if (!matchClient && !matchCompany && !matchMethod && !matchNotes && !matchId) {
        return false;
      }
    }

    return true;
  });

  updateMetrics();
  renderRevenueChart();
  renderDonutChart();
  renderLedgerTable();
}

function updateMetrics() {
  let totalRev = 0;
  let paidCount = 0;
  let paidTotal = 0;
  let pendingCount = 0;
  let pendingTotal = 0;
  let overdueCount = 0;
  let overdueTotal = 0;

  filteredPayments.forEach(p => {
    const amt = Number(p.amount || 0);
    const status = String(p.status || p.computed_status || 'pending').toLowerCase();
    totalRev += amt;

    if (status === 'paid' || status === 'completed' || status === 'recorded') {
      paidCount++;
      paidTotal += amt;
    } else if (status === 'overdue') {
      overdueCount++;
      overdueTotal += amt;
    } else {
      pendingCount++;
      pendingTotal += amt;
    }
  });

  const avgDeal = filteredPayments.length > 0 ? (totalRev / filteredPayments.length) : 0;

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setTxt('metric-revenue', formatCurrency(totalRev));
  setTxt('metric-revenue-sub', `${filteredPayments.length} recorded payments`);

  setTxt('metric-paid', paidCount.toLocaleString());
  setTxt('metric-paid-amount', `${formatCurrency(paidTotal)} settled`);

  setTxt('metric-pending', pendingCount.toLocaleString());
  setTxt('metric-pending-amount', `${formatCurrency(pendingTotal)} awaiting`);

  setTxt('metric-overdue', overdueCount.toLocaleString());
  setTxt('metric-overdue-amount', `${formatCurrency(overdueTotal)} needs follow-up`);

  setTxt('metric-average', formatCurrency(avgDeal));
  setTxt('legend-total-count', `${filteredPayments.length} Invoices`);
}

function renderRevenueChart() {
  const container = document.getElementById('revenue-chart-container');
  if (!container) return;

  // Group payments by time buckets (e.g. 6 periods)
  const buckets = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6'];
  const bucketTotals = [0, 0, 0, 0, 0, 0];

  if (filteredPayments.length > 0) {
    const sorted = [...filteredPayments].sort((a, b) => new Date(a.payment_date || a.created_at) - new Date(b.payment_date || b.created_at));
    const step = Math.max(1, Math.ceil(sorted.length / 6));
    sorted.forEach((p, idx) => {
      const bucketIdx = Math.min(Math.floor(idx / step), 5);
      bucketTotals[bucketIdx] += Number(p.amount || 0);
    });
  }

  const maxVal = Math.max(...bucketTotals, 1000);
  const width = 720;
  const height = 240;
  const paddingX = 40;
  const paddingY = 30;

  const points = bucketTotals.map((val, i) => {
    const x = paddingX + (i * ((width - (paddingX * 2)) / 5));
    const y = (height - paddingY) - ((val / maxVal) * (height - (paddingY * 2)));
    return { x, y, val };
  });

  // Build SVG Path with smooth Bezier curve
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const areaPath = `${d} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:100%; overflow:visible;">
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2563eb" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#2563eb" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Background Grid lines -->
      <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="rgba(0,0,0,0.06)" stroke-dasharray="4" />
      <line x1="${paddingX}" y1="${height / 2}" x2="${width - paddingX}" y2="${height / 2}" stroke="rgba(0,0,0,0.06)" stroke-dasharray="4" />
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(0,0,0,0.1)" />

      <!-- Gradient Area -->
      <path d="${areaPath}" fill="url(#chartGradient)" />

      <!-- Glowing Line -->
      <path d="${d}" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Data Points & Labels -->
      ${points.map((pt, i) => `
        <circle cx="${pt.x}" cy="${pt.y}" r="5" fill="#ffffff" stroke="#2563eb" stroke-width="3" />
        <text x="${pt.x}" y="${height - 10}" font-size="11" font-weight="700" fill="var(--text-muted)" text-anchor="middle">
          ${buckets[i]}
        </text>
        <text x="${pt.x}" y="${pt.y - 12}" font-size="10.5" font-weight="800" fill="#2563eb" text-anchor="middle">
          ${pt.val > 0 ? formatShortCurrency(pt.val) : ''}
        </text>
      `).join('')}
    </svg>
  `;
}

function renderDonutChart() {
  const container = document.getElementById('donut-chart-container');
  if (!container) return;

  let paid = 0;
  let pending = 0;
  let overdue = 0;

  filteredPayments.forEach(p => {
    const status = String(p.status || p.computed_status || 'pending').toLowerCase();
    if (status === 'paid' || status === 'completed' || status === 'recorded') paid++;
    else if (status === 'overdue') overdue++;
    else pending++;
  });

  const total = paid + pending + overdue || 1;
  const paidPct = Math.round((paid / total) * 100);
  const pendingPct = Math.round((pending / total) * 100);
  const overduePct = Math.round((overdue / total) * 100);

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  // Update Legend Labels
  setTxt('legend-paid-count', `${paid} (${paidPct}%)`);
  setTxt('legend-pending-count', `${pending} (${pendingPct}%)`);
  setTxt('legend-overdue-count', `${overdue} (${overduePct}%)`);
  setTxt('legend-total-count', `${filteredPayments.length} Invoices`);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  const paidStroke = (paid / total) * circumference;
  const pendingStroke = (pending / total) * circumference;
  const overdueStroke = (overdue / total) * circumference;

  container.innerHTML = `
    <div style="position:relative; width:190px; height:190px; display:flex; align-items:center; justify-content:center;">
      <svg class="pay-donut-svg" viewBox="0 0 160 160" style="width:100%; height:100%; transform:rotate(-90deg);">
        <!-- Base track -->
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="16" />
        <!-- Paid slice (Green) -->
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#10b981" stroke-width="16"
          stroke-dasharray="${paidStroke} ${circumference}" stroke-dashoffset="0" />
        <!-- Pending slice (Amber) -->
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#f59e0b" stroke-width="16"
          stroke-dasharray="${pendingStroke} ${circumference}" stroke-dashoffset="${-paidStroke}" />
        <!-- Overdue slice (Red) -->
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#ef4444" stroke-width="16"
          stroke-dasharray="${overdueStroke} ${circumference}" stroke-dashoffset="${-(paidStroke + pendingStroke)}" />
      </svg>
      <div style="position:absolute; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
        <span style="font-size:1.6rem; font-weight:900; font-family:var(--font-display, 'Orbitron', sans-serif); color:var(--text-primary); line-height:1;">${filteredPayments.length}</span>
        <span style="font-size:0.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-top:2px;">Invoices</span>
      </div>
    </div>
  `;
}

function renderLedgerTable() {
  const tbody = document.getElementById('payment-ledger-tbody');
  if (!tbody) return;

  if (filteredPayments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">
          <i class="fas fa-receipt fa-2x" style="opacity:0.3; margin-bottom:8px; display:block;"></i>
          <div style="font-weight:700;">No payment records found</div>
          <div style="font-size:0.78rem; margin-top:4px;">Click "Record Payment" above to add your first transaction.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredPayments.map((p, idx) => {
    const status = String(p.status || p.computed_status || 'pending').toLowerCase();
    const isPaid = status === 'paid' || status === 'completed' || status === 'recorded';
    const isOverdue = status === 'overdue';
    const statusClass = isPaid ? 'paid' : (isOverdue ? 'overdue' : 'pending');
    const statusLabel = isPaid ? 'PAID' : (isOverdue ? 'OVERDUE' : 'PENDING');

    const method = p.method || 'UPI';
    const methodIcon = method.toLowerCase().includes('bank') ? 'fa-building-columns' :
      (method.toLowerCase().includes('card') ? 'fa-credit-card' :
      (method.toLowerCase().includes('cash') ? 'fa-money-bill-wave' : 'fa-mobile-screen-button'));

    const dateStr = p.payment_date || p.created_at || 'Today';
    const clientName = p.client_name || p.user_name || 'Direct Client';
    const company = p.client_company ? `<span style="font-size:0.75rem; color:var(--text-muted); display:block;">${escapeHtml(p.client_company)}</span>` : '';

    return `
      <tr>
        <td>
          <span style="font-family:var(--font-mono, monospace); font-weight:800; color:#3b82f6; font-size:0.8rem;">#INV-${String(p.id).padStart(4, '0')}</span>
        </td>
        <td>
          <div style="font-weight:750; color:var(--text-primary);">${escapeHtml(clientName)}</div>
          ${company}
        </td>
        <td>
          <span style="font-family:var(--font-display, 'Orbitron', sans-serif); font-weight:900; font-size:0.95rem; color:var(--text-primary);">${formatCurrency(p.amount, p.currency)}</span>
        </td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:6px; font-weight:600; color:var(--text-secondary); font-size:0.82rem;">
            <i class="fas ${methodIcon}" style="color:#3b82f6;"></i>
            <span>${escapeHtml(method)}</span>
          </span>
        </td>
        <td style="color:var(--text-secondary); font-size:0.82rem;">
          ${escapeHtml(dateStr)}
        </td>
        <td>
          <span class="pay-badge ${statusClass}">
            <i class="fas ${isPaid ? 'fa-check-circle' : (isOverdue ? 'fa-circle-exclamation' : 'fa-clock')}"></i>
            <span>${statusLabel}</span>
          </span>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; align-items:center; gap:6px;">
            ${!isPaid ? `<button class="btn-secondary" onclick="markPaymentPaid(${p.id})" title="Mark as Paid" style="height:28px; padding:0 8px; font-size:0.72rem; color:#10b981;"><i class="fas fa-check"></i> Paid</button>` : ''}
            <button class="btn-secondary" onclick="deletePaymentRecord(${p.id})" title="Delete Record" style="height:28px; padding:0 8px; font-size:0.72rem; color:#ef4444;"><i class="fas fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleRecordPayment() {
  const clientSelect = document.getElementById('pay-client-select');
  const amountInput = document.getElementById('pay-amount-input');
  const currencySelect = document.getElementById('pay-currency-select');
  const methodSelect = document.getElementById('pay-method-select');
  const statusSelect = document.getElementById('pay-status-select');
  const dateInput = document.getElementById('pay-date-input');
  const notesInput = document.getElementById('pay-notes-input');

  const clientId = clientSelect ? clientSelect.value : '';
  const amount = amountInput ? amountInput.value : '';
  const currency = currencySelect ? currencySelect.value : 'INR';
  const method = methodSelect ? methodSelect.value : 'UPI';
  const status = statusSelect ? statusSelect.value : 'paid';
  const date = dateInput ? dateInput.value : '';
  const notes = notesInput ? notesInput.value : '';

  if (!clientId || !amount) {
    if (window.showToast) showToast('Please select a client and enter amount', 'error');
    return;
  }

  try {
    await api.post('/payments', {
      client_id: parseInt(clientId, 10),
      amount: parseFloat(amount),
      currency,
      method,
      status,
      payment_date: date || new Date().toISOString().split('T')[0],
      notes
    });

    if (window.showToast) showToast('Payment recorded successfully', 'success');
    const modal = document.getElementById('record-payment-modal');
    if (modal) modal.classList.remove('active');
    const form = document.getElementById('record-payment-form');
    if (form) form.reset();
    await loadPayments();
  } catch (err) {
    if (window.showToast) showToast(`Failed to record payment: ${err.message}`, 'error');
  }
}

async function markPaymentPaid(id) {
  try {
    await api.put(`/payments/${id}`, { status: 'paid' });
    if (window.showToast) showToast('Payment marked as PAID', 'success');
    await loadPayments();
  } catch (err) {
    if (window.showToast) showToast(`Update error: ${err.message}`, 'error');
  }
}

async function deletePaymentRecord(id) {
  if (!confirm('Are you sure you want to delete this payment record?')) return;
  try {
    await api.delete(`/payments/${id}`);
    if (window.showToast) showToast('Payment record removed', 'success');
    await loadPayments();
  } catch (err) {
    if (window.showToast) showToast(`Delete error: ${err.message}`, 'error');
  }
}

function exportPaymentsCsv() {
  if (!filteredPayments || filteredPayments.length === 0) {
    if (window.showToast) showToast('No payment records to export', 'error');
    return;
  }

  const headers = ['Invoice ID', 'Client Name', 'Company', 'Amount', 'Currency', 'Method', 'Date', 'Status', 'Notes'];
  const rows = filteredPayments.map(p => [
    `#INV-${String(p.id).padStart(4, '0')}`,
    p.client_name || p.user_name || 'Client',
    p.client_company || '',
    p.amount,
    p.currency || 'INR',
    p.method || 'UPI',
    p.payment_date || p.created_at || '',
    p.status || 'pending',
    p.notes || ''
  ]);

  let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
  rows.forEach(r => {
    csvContent += r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payments_report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  if (window.showToast) showToast('Payments CSV exported successfully', 'success');
}

// Formatting helpers
function formatCurrency(amount, currency = 'INR') {
  const sym = currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '₹'));
  return sym + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatShortCurrency(amount) {
  const n = Number(amount || 0);
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + n;
}

function escapeHtml(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Global exports
window.loadPayments = loadPayments;
window.markPaymentPaid = markPaymentPaid;
window.deletePaymentRecord = deletePaymentRecord;
