(function () {
  // No hardcoded fallback — payments are loaded from the DB only

  let paymentState = [];
  let activePeriodDays = 30;

  function money(amount, currency = 'INR') {
    const symbol = currency === 'USD' ? '$' : '₹';
    return symbol + Number(amount || 0).toLocaleString('en-IN');
  }

  function normalizePayment(row, index) {
    return {
      id: row.id || row.payment_id || `PAY-${String(index + 1).padStart(4, '0')}`,
      user: row.client_name || row.client_company || row.user_name || row.client_name || row.user || row.client || row.user_id || 'Client',
      amount: Number(row.amount || row.total || 0),
      currency: row.currency || 'INR',
      method: row.method || row.payment_method || 'UPI',
      status: String(row.status || row.computed_status || 'pending').toLowerCase(),
      date: row.date || row.payment_date || row.created_at || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      source: row.source || 'employee_portal',
      client_id: row.client_id || null
    };
  }

  function parsePaymentDate(value) {
    if (!value) return new Date();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const match = String(value).match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
    if (!match) return new Date();

    const months = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };
    const month = months[match[2].toLowerCase()];
    return month === undefined ? new Date() : new Date(Number(match[3]), month, Number(match[1]));
  }

  function isWithinActivePeriod(payment) {
    const paymentDate = parsePaymentDate(payment.date);
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - activePeriodDays + 1);
    return paymentDate >= cutoff && paymentDate <= now;
  }

  function closeOldPaymentModal() {
    document.querySelectorAll('.modal, .modal-overlay, [id*="payment"], [class*="payment"]').forEach((el) => {
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('add payment') && text.includes('amount') && text.includes('method')) {
        el.remove();
      }
    });
    document.body.style.overflow = '';
  }

  function styles() {
    if (document.getElementById('payment-dashboard-style')) return;
    const style = document.createElement('style');
    style.id = 'payment-dashboard-style';
    style.textContent = `
      .payment-dashboard-page { padding: 34px 28px 42px; background:#f8fafc; min-height:calc(100vh - 78px); color:#111827; }
      .payment-title-row { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:28px; }
      .payment-kicker { color:#94a3b8; font-size:.92rem; font-weight:700; margin-bottom:6px; }
      .payment-title { margin:0; font-size:2rem; line-height:1.05; font-weight:900; letter-spacing:0; }
      .payment-tabs { display:inline-flex; background:#fff; border:2px solid rgba(16,42,150,.12); border-radius:8px; overflow:hidden; }
      .payment-tabs button { border:0; background:transparent; padding:11px 14px; font-weight:800; color:#64748b; cursor:pointer; }
      .payment-tabs button.active { background:#102a96; color:#fff; }
      .payment-metrics { display:grid; grid-template-columns:repeat(5,minmax(150px,1fr)); gap:12px; margin-bottom:28px; }
      .payment-metric { background:#fff; border:2px solid rgba(16,42,150,.08); border-radius:8px; padding:16px; min-height:110px; box-sizing:border-box; position:relative; overflow:hidden; }
      .payment-metric::after { content:""; position:absolute; right:14px; bottom:12px; width:54px; height:54px; border-radius:50%; background:rgba(16,42,150,.06); }
      .payment-metric.revenue { background:#fff6ed; } .payment-metric.paid { background:#eefdf3; } .payment-metric.pending { background:#fff8e8; } .payment-metric.overdue { background:#fff1f2; }
      .payment-label { color:#475569; font-weight:800; margin-bottom:8px; }
      .payment-value { font-size:2rem; font-weight:900; color:#0f172a; line-height:1; margin-bottom:10px; }
      .payment-sub { color:#64748b; font-size:.88rem; font-weight:650; }
      .payment-grid { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(320px,.8fr); gap:18px; margin-bottom:18px; }
      .payment-lower { display:grid; grid-template-columns:minmax(360px,1fr) minmax(320px,.8fr); gap:18px; }
      .payment-panel { background:#fff; border:2px solid rgba(16,42,150,.08); border-radius:8px; padding:20px; box-sizing:border-box; overflow:hidden; }
      .payment-panel-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:14px; }
      .payment-panel-title { margin:0; font-size:1.15rem; font-weight:900; color:#0f766e; }
      .payment-note { color:#94a3b8; font-size:.85rem; font-weight:700; }
      .payment-chart { height:310px; position:relative; border-top:2px solid #e5e7eb; padding-top:16px; }
      .payment-chart svg { width:100%; height:100%; display:block; }
      .payment-donut-wrap { display:grid; place-items:center; min-height:310px; }
      .payment-donut { width:220px; height:220px; border-radius:50%; background:conic-gradient(#16a34a 0 62%, #f59e0b 62% 84%, #ef4444 84% 100%); display:grid; place-items:center; }
      .payment-donut-inner { width:128px; height:128px; background:#fff; border-radius:50%; display:grid; place-items:center; text-align:center; font-weight:900; }
      .payment-legend { display:grid; gap:10px; width:100%; margin-top:14px; }
      .payment-legend-row { display:flex; align-items:center; justify-content:space-between; color:#475569; font-weight:750; }
      .payment-dot { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:8px; }
      .payment-table { width:100%; border-collapse:collapse; }
      .payment-table th,.payment-table td { padding:14px 12px; border-bottom:1px solid #e5e7eb; text-align:left; vertical-align:middle; }
      .payment-table th { color:#64748b; font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; }
      .payment-table td { font-weight:750; color:#0f172a; }
      .payment-pill { display:inline-flex; align-items:center; justify-content:center; min-width:76px; border-radius:999px; padding:7px 10px; font-size:.72rem; font-weight:900; text-transform:uppercase; }
      .payment-pill.paid { color:#15803d; background:#dcfce7; } .payment-pill.pending { color:#b45309; background:#fef3c7; } .payment-pill.overdue { color:#b91c1c; background:#fee2e2; }
      .payment-form { display:grid; gap:12px; }
      .payment-form input,.payment-form select { width:100%; min-height:42px; border:2px solid rgba(16,42,150,.12); border-radius:8px; padding:0 12px; box-sizing:border-box; outline:0; font-size:.95rem; }
      .payment-form input:focus,.payment-form select:focus { border-color:#102a96; }
      .payment-btn { border:0; border-radius:8px; min-height:42px; padding:0 16px; display:inline-flex; align-items:center; justify-content:center; gap:9px; font-weight:900; cursor:pointer; color:#fff; background:#102a96; box-shadow:0 14px 28px rgba(16,42,150,.2); }
      .payment-bars { display:grid; gap:14px; margin-top:16px; }
      .payment-bar-row { display:grid; grid-template-columns:82px 1fr 56px; gap:12px; align-items:center; color:#475569; font-weight:800; }
      .payment-track { height:12px; border-radius:999px; background:#eef2ff; overflow:hidden; }
      .payment-fill { height:100%; border-radius:inherit; background:linear-gradient(90deg,#102a96,#3b82f6); display:block; }
      @media(max-width:1100px){ .payment-metrics{grid-template-columns:repeat(2,minmax(0,1fr));} .payment-grid,.payment-lower{grid-template-columns:1fr;} }
      @media(max-width:640px){ .payment-dashboard-page{padding:24px 16px;} .payment-title-row{align-items:flex-start; flex-direction:column;} .payment-metrics{grid-template-columns:1fr;} .payment-table{min-width:680px;} .payment-table-scroll{overflow-x:auto;} }
    `;
    document.head.appendChild(style);
  }

  function dashboardHtml() {
    return `
      <section class="payment-dashboard-page">
        <div class="payment-title-row">
          <div>
            <div class="payment-kicker">Workspace / Finance</div>
            <h1 class="payment-title">PAYMENT DASHBOARD</h1>
          </div>
          <div class="payment-tabs" aria-label="Payment period">
            <button type="button" data-days="7">7 Days</button>
            <button type="button" data-days="30" class="active">30 Days</button>
            <button type="button" data-days="90">Quarter</button>
          </div>
        </div>
        <div class="payment-metrics">
          <div class="payment-metric revenue"><div class="payment-label">Revenue</div><div class="payment-value" id="metric-revenue">₹0</div><div class="payment-sub">0.0% since last period</div></div>
          <div class="payment-metric paid"><div class="payment-label">Paid Invoices</div><div class="payment-value" id="metric-paid">0</div><div class="payment-sub">Closed records</div></div>
          <div class="payment-metric pending"><div class="payment-label">Pending</div><div class="payment-value" id="metric-pending">0</div><div class="payment-sub">Awaiting confirmation</div></div>
          <div class="payment-metric overdue"><div class="payment-label">Overdue</div><div class="payment-value" id="metric-overdue">0</div><div class="payment-sub">Needs follow-up</div></div>
          <div class="payment-metric"><div class="payment-label">Average Deal</div><div class="payment-value" id="metric-average">₹0</div><div class="payment-sub">Per payment</div></div>
        </div>
        <div class="payment-grid">
          <section class="payment-panel">
            <div class="payment-panel-head"><h2 class="payment-panel-title">Revenue by Month</h2><span class="payment-note">Payments trend</span></div>
            <div class="payment-chart">
              <svg viewBox="0 0 760 300" aria-label="Revenue line chart">
                <defs><linearGradient id="paymentArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#3b82f6" stop-opacity=".28"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
                <g stroke="#e5e7eb" stroke-width="1"><line x1="46" y1="28" x2="740" y2="28"/><line x1="46" y1="82" x2="740" y2="82"/><line x1="46" y1="136" x2="740" y2="136"/><line x1="46" y1="190" x2="740" y2="190"/><line x1="46" y1="244" x2="740" y2="244"/></g>
                <path d="M46 244 C160 190 210 212 286 150 C366 84 448 116 520 74 C610 24 660 70 740 42 L740 270 L46 270 Z" fill="url(#paymentArea)"/>
                <path d="M46 244 C160 190 210 212 286 150 C366 84 448 116 520 74 C610 24 660 70 740 42" fill="none" stroke="#102a96" stroke-width="5" stroke-linecap="round"/>
                <g fill="#ff6b00"><circle cx="46" cy="244" r="5"/><circle cx="286" cy="150" r="5"/><circle cx="520" cy="74" r="5"/><circle cx="740" cy="42" r="5"/></g>
                <g fill="#64748b" font-size="13" font-weight="700"><text x="42" y="292">Week 1</text><text x="260" y="292">Week 2</text><text x="500" y="292">Week 3</text><text x="704" y="292">Week 4</text></g>
              </svg>
            </div>
          </section>
          <section class="payment-panel">
            <div class="payment-panel-head"><h2 class="payment-panel-title">Collection Mix</h2><span class="payment-note">Status split</span></div>
            <div class="payment-donut-wrap"><div class="payment-donut"><div class="payment-donut-inner"><div><div id="donut-total" style="font-size:1.6rem;">0</div><div style="font-size:.72rem;color:#64748b;">Payments</div></div></div></div>
              <div class="payment-legend">
                <div class="payment-legend-row"><span><i class="payment-dot" style="background:#16a34a;"></i>Paid</span><strong id="legend-paid">0</strong></div>
                <div class="payment-legend-row"><span><i class="payment-dot" style="background:#f59e0b;"></i>Pending</span><strong id="legend-pending">0</strong></div>
                <div class="payment-legend-row"><span><i class="payment-dot" style="background:#ef4444;"></i>Overdue</span><strong id="legend-overdue">0</strong></div>
              </div>
            </div>
          </section>
        </div>
        <div class="payment-lower">
          <section class="payment-panel">
            <div class="payment-panel-head"><h2 class="payment-panel-title">Payment Ledger</h2><span class="payment-note" id="ledger-count">0 records</span></div>
            <div class="payment-table-scroll"><table class="payment-table"><thead><tr><th>ID</th><th>Client / User</th><th>Amount</th><th>Method</th><th>Status</th><th>Source</th><th>Date</th></tr></thead><tbody id="payment-rows"></tbody></table></div>
          </section>
          <aside class="payment-panel">
            <div class="payment-panel-head"><h2 class="payment-panel-title">Add Payment</h2><span class="payment-note">Fast entry</span></div>
            <form class="payment-form" id="payment-form">
              <input id="pay-user" type="text" placeholder="Client or User ID">
              <select id="pay-client" title="Client"><option value="">No Client (Internal)</option></select>
              <input id="pay-amount" type="number" min="0" step="0.01" placeholder="Amount">
              <select id="pay-currency" title="Currency"><option value="INR">INR</option><option value="USD">USD</option></select>
              <select id="pay-method" title="Method"><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option><option value="Card">Card</option><option value="Cash">Cash</option></select>
              <select id="pay-status" title="Status"><option value="paid">Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select>
              <button class="payment-btn" type="submit"><i class="fas fa-check"></i> Record Payment</button>
            </form>
            <div class="payment-bars">
              <div class="payment-bar-row"><span>UPI</span><span class="payment-track"><span class="payment-fill" style="width:74%;"></span></span><strong>74%</strong></div>
              <div class="payment-bar-row"><span>Bank</span><span class="payment-track"><span class="payment-fill" style="width:58%;background:linear-gradient(90deg,#16a34a,#86efac);"></span></span><strong>58%</strong></div>
              <div class="payment-bar-row"><span>Card</span><span class="payment-track"><span class="payment-fill" style="width:36%;background:linear-gradient(90deg,#ff6b00,#fdba74);"></span></span><strong>36%</strong></div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  function mountDashboard() {
    closeOldPaymentModal();
    styles();
    const host = document.querySelector('main') || document.querySelector('.main-content') || document.body;
    host.innerHTML = dashboardHtml();
    bindDashboard();
    loadClients();
    loadPayments();
  }

  async function loadClients() {
    try {
      const token = localStorage.getItem('tt_token') || localStorage.getItem('token') || localStorage.getItem('authToken');
      const res = await fetch('/api/clients', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return;
      const clients = await res.json();
      const select = document.getElementById('pay-client');
      if (!select || !Array.isArray(clients)) return;
      clients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name || c.company || 'Client'} (${c.company || 'N/A'})`;
        select.appendChild(opt);
      });
    } catch { /* non-critical */ }
  }


  function renderPayments() {
    const search = document.getElementById('payment-search')?.value?.trim().toLowerCase() || '';
    const rows = paymentState.filter(p => isWithinActivePeriod(p) && [p.id, p.user, p.method, p.status].some(v => String(v).toLowerCase().includes(search)));
    const paid = rows.filter(p => p.status === 'paid');
    const pending = rows.filter(p => p.status === 'pending');
    const overdue = rows.filter(p => p.status === 'overdue');
    const revenue = paid.reduce((sum, p) => sum + p.amount, 0);
    const average = rows.length ? revenue / rows.length : 0;
    document.getElementById('metric-revenue').textContent = money(revenue);
    document.getElementById('metric-paid').textContent = paid.length;
    document.getElementById('metric-pending').textContent = pending.length;
    document.getElementById('metric-overdue').textContent = overdue.length;
    document.getElementById('metric-average').textContent = money(average);
    document.getElementById('donut-total').textContent = rows.length;
    document.getElementById('legend-paid').textContent = paid.length;
    document.getElementById('legend-pending').textContent = pending.length;
    document.getElementById('legend-overdue').textContent = overdue.length;
    document.getElementById('ledger-count').textContent = `${rows.length} records`;
    document.getElementById('payment-rows').innerHTML = rows.map(p => {
      const sourceBadge = p.source === 'client_portal' 
        ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.68rem;font-weight:800;color:#7c3aed;background:#ede9fe;border-radius:999px;padding:4px 8px;">🔗 Client Portal</span>'
        : '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.68rem;font-weight:800;color:#64748b;background:#f1f5f9;border-radius:999px;padding:4px 8px;">Staff</span>';
      return `
      <tr><td>${p.id}</td><td>${p.user}</td><td>${money(p.amount, p.currency)}</td><td>${p.method}</td><td><span class="payment-pill ${p.status}">${p.status}</span></td><td>${sourceBadge}</td><td>${String(p.date).slice(0, 12)}</td></tr>
    `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">No payments found</td></tr>';
  }

  async function loadPayments() {
    try {
      const token = localStorage.getItem('tt_token') || localStorage.getItem('token') || localStorage.getItem('authToken');
      const res = await fetch('/api/payments', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Payments API unavailable');
      const data = await res.json();
      paymentState = (Array.isArray(data) ? data : data.payments || []).map(normalizePayment);
    } catch {
      paymentState = [];
    }
    renderPayments();
  }

  function bindDashboard() {
    document.getElementById('payment-search')?.addEventListener('input', renderPayments);
    document.querySelectorAll('.payment-tabs button').forEach((button) => {
      button.addEventListener('click', () => {
        activePeriodDays = Number(button.dataset.days || 30);
        document.querySelectorAll('.payment-tabs button').forEach((tab) => tab.classList.toggle('active', tab === button));
        renderPayments();
      });
    });
    document.getElementById('payment-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payment = {
        id: `PAY-${Math.floor(1000 + Math.random() * 9000)}`,
        user: document.getElementById('pay-user').value.trim() || 'Client',
        amount: Number(document.getElementById('pay-amount').value || 0),
        currency: document.getElementById('pay-currency').value,
        method: document.getElementById('pay-method').value,
        status: document.getElementById('pay-status').value,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        source: 'employee_portal',
        client_id: document.getElementById('pay-client')?.value || null
      };
      try {
        const token = localStorage.getItem('tt_token') || localStorage.getItem('token') || localStorage.getItem('authToken');
        await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            user_id: null,
            client_id: payment.client_id || null,
            amount: payment.amount,
            currency: payment.currency,
            payment_date: new Date().toISOString(),
            method: payment.method,
            notes: '',
            status: payment.status,
            description: ''
          })
        });
      } catch { }
      paymentState.unshift(payment);
      event.target.reset();
      renderPayments();
    });
  }

  window.openPayments = mountDashboard;
  window.openPaymentsModal = mountDashboard;
  window.showPaymentsModal = mountDashboard;
  window.initPayments = mountDashboard;

  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('payments.html')) mountDashboard();
  });
})();
