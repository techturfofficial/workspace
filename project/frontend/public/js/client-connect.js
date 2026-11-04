let allClients = [];

async function initClientConnect() {
  loadSummary();
  loadClientsRapport();

  const logForm = document.getElementById('interaction-form');
  if (logForm) {
    logForm.onsubmit = async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('log-client-id').value;
      const type = document.getElementById('log-type').value;
      const sentiment = document.getElementById('log-sentiment').value;
      const notes = document.getElementById('log-notes').value;

      try {
        await api.post('/client-connect/interactions', { client_id: clientId, type, sentiment, notes });
        showToast('Interaction logged successfully', 'success');
        closeModal('modal-interaction');
        logForm.reset();
        runNexusPulse(clientId); // Re-calculate pulse
        loadSummary(); // Re-calculate overall stats
      } catch (err) {
        showToast('Failed to log interaction', 'error');
      }
    };
  }
}

async function loadSummary() {
  try {
    const stats = await api.get('/client-connect/summary');
    document.getElementById('stat-active-clients').textContent = stats.activeClients || 0;
    document.getElementById('stat-active-passes').textContent = stats.activePasses || 0;
    document.getElementById('stat-recent-interactions').textContent = stats.recentTalks || 0;
  } catch (e) { }
}

async function loadClientsRapport() {
  const container = document.getElementById('client-list');
  if (!container) return;

  try {
    allClients = await api.get('/clients');
    renderClients(allClients);
  } catch (e) {
    container.innerHTML = '<div class="empty-state">Secure link with database interrupted</div>';
  }
}

function renderClients(clients) {
  const container = document.getElementById('client-list');
  if (clients.length === 0) {
    container.innerHTML = '<div class="empty-state">No client relationships found</div>';
    return;
  }

  container.innerHTML = clients.map(c => `
      <div class="glass-card dash-card client-card anim-fade-up">
        <div class="card-pulse-sec">
          <div class="pulse-ring"></div>
          <div id="pulse-value-${c.id}" class="pulse-value">--</div>
          <div id="pulse-label-${c.id}" class="pulse-label">Connecting...</div>
        </div>
        <div class="client-info-strip">
          <div class="client-name">${escapeHtml(c.name)}</div>
          <div class="client-meta">${escapeHtml(c.email || 'N/A')} • Active Projects: ${Number(c.active_projects) || 0}</div>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
            <button class="btn-primary" style="font-size:0.65rem;" onclick="openLogInteraction(${c.id})">LOG CALL</button>
            <button class="btn-secondary" style="font-size:0.65rem;" onclick="openHistory(${c.id})">HISTORY</button>
          </div>
          
          <div style="border-top:  2px solid var(--border); padding-top:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="font-size:0.6rem; color:var(--text-muted); font-weight:700;">PORTAL PASS HUD</span>
            </div>
            <button class="btn-secondary w-100" style="font-size:0.65rem; border-color:var(--accent-secondary); color:var(--accent-secondary);" onclick="generatePortalPass(${c.id})">GENERATE SECURE LINK</button>
            <div id="pass-history-${c.id}" class="pass-list"></div>
          </div>
        </div>
      </div>
    `).join('');

  // Kick off background pulses
  clients.forEach(c => {
    runNexusPulse(c.id);
    loadPassHistory(c.id);
  });
}

function filterClients() {
  const term = document.getElementById('client-search').value.toLowerCase();
  const filtered = allClients.filter(c => c.name.toLowerCase().includes(term) || (c.email && c.email.toLowerCase().includes(term)));
  renderClients(filtered);
}

async function runNexusPulse(id) {
  try {
    const res = await api.post('/client-connect/nexus-pulse', { client_id: id });
    const scoreVal = document.getElementById(`pulse-value-${id}`);
    const scoreLab = document.getElementById(`pulse-label-${id}`);
    if (scoreVal && scoreLab) {
      scoreVal.textContent = res.satisfactionScore + '%';
      scoreLab.textContent = res.primarySentiment;
      scoreLab.style.color = res.satisfactionScore > 75 ? 'var(--accent-primary)' : (res.satisfactionScore > 50 ? 'var(--accent-orange)' : 'var(--accent-secondary)');
    }
  } catch (e) { }
}

async function openLogInteraction(id) {
  document.getElementById('log-client-id').value = id;
  openModal('modal-interaction');
}

async function openHistory(id) {
  const container = document.getElementById('history-body');
  container.innerHTML = '<div style="text-align:center; padding:20px;">Fetching from Ledger...</div>';
  openModal('modal-history');

  try {
    const history = await api.get(`/client-connect/interactions/${id}`);
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state">No interaction records found</div>';
      return;
    }

    container.innerHTML = history.map(h => `
            <div class="log-item">
                <div class="log-meta">
                    <span style="font-weight:700; color:var(--accent-primary);">${escapeHtml(String(h.type || '').toUpperCase())}</span>
                    <span>By ${escapeHtml(h.handler_name || 'Unknown')} • ${timeAgo(h.created_at)}</span>
                </div>
                <div style="font-size:0.8rem; line-height:1.4;">${escapeHtml(h.notes || 'No detailed notes provided.')}</div>
                <div style="font-size:0.6rem; color:var(--text-muted); margin-top:8px;">Sentiment Captured: <span style="color:var(--accent-primary);">${escapeHtml(h.sentiment)}</span></div>
            </div>
        `).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state">Secure vault error during retrieval</div>';
  }
}

async function generatePortalPass(id) {
  try {
    const res = await api.post('/client-connect/portal-pass', { client_id: id, hours: 24 });
    const link = prompt('SECURE PORTAL PASS GENERATED. Copy the one-time link below:', res.passLink);
    loadPassHistory(id);
    loadSummary();
  } catch (e) {
    showToast('Vault rejected request', 'error');
  }
}

async function loadPassHistory(id) {
  try {
    const passes = await api.get(`/client-connect/passes/${id}`);
    const container = document.getElementById(`pass-history-${id}`);
    if (container) {
      container.innerHTML = passes.length === 0 ? '' :
        `<div style="margin-top:10px;">` +
        passes.slice(0, 1).map(p => {
          const valid = new Date(p.expires_at) > new Date();
          return `
            <div class="pass-item">
                <span>${valid ? 'Active' : 'Last'} Token: ${escapeHtml(String(p.token).substring(0, 8))}...</span>
                <span style="color:${valid ? 'var(--accent-primary)' : 'var(--text-muted)'};">${valid ? 'VALID' : 'EXPIRED'}</span>
            </div>
         `;
        }).join('') +
        `</div>`;
    }
  } catch (e) { }
}

window.initClientConnect = initClientConnect;
window.runNexusPulse = runNexusPulse;
window.generatePortalPass = generatePortalPass;
window.openLogInteraction = openLogInteraction;
window.openHistory = openHistory;
window.filterClients = filterClients;
window.clearManualQueue = () => { }; // Stub for sidebar.js if needed
