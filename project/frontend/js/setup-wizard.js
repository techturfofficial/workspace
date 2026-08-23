let setupPolicies = [];

function isTrueValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function policyValue(key, fallback = '') {
  const item = setupPolicies.find(row => row.key === key);
  return item ? String(item.value ?? '') : fallback;
}

async function putPolicy(key, value) {
  return api.put(`/enterprise/policies/${encodeURIComponent(key)}`, { value: String(value ?? '') });
}

async function loadPoliciesIntoWizard() {
  try {
    setupPolicies = await api.get('/enterprise/policies');
  } catch {
    setupPolicies = [];
  }

  const orgName = document.getElementById('org-name');
  const orgLanguage = document.getElementById('org-language');
  const orgTimezone = document.getElementById('org-timezone');
  const orgWorkday = document.getElementById('org-workday');
  const securityOtp = document.getElementById('security-admin-otp');
  const securityPwd = document.getElementById('security-strong-password');
  const onboardingEnabled = document.getElementById('onboarding-enabled');
  const onboardingVersion = document.getElementById('onboarding-version');

  if (orgName) orgName.value = policyValue('org.name', 'Tech Turf');
  if (orgLanguage) orgLanguage.value = policyValue('org.default_language', 'en');
  if (orgTimezone) orgTimezone.value = policyValue('org.default_timezone', 'Asia/Kolkata');
  if (orgWorkday) orgWorkday.value = policyValue('org.workday_start', '09:00');
  if (securityOtp) securityOtp.checked = isTrueValue(policyValue('security.admin_otp_required', 'true'));
  if (securityPwd) securityPwd.checked = isTrueValue(policyValue('security.force_strong_password', 'true'));
  if (onboardingEnabled) onboardingEnabled.checked = isTrueValue(policyValue('walkthrough.enabled', 'true'));
  if (onboardingVersion) onboardingVersion.value = policyValue('onboarding.walkthrough_version', 'v2-enterprise');
}

function renderReadinessList(payload, monitoring) {
  const list = document.getElementById('readiness-list');
  const summary = document.getElementById('monitoring-summary');
  if (!list || !summary) return;

  const checks = [
    { label: 'Database writable', value: payload?.dbWritable, healthyText: 'OK', warnText: 'NOT WRITABLE' },
    { label: 'Uploads writable', value: payload?.uploadsWritable, healthyText: 'OK', warnText: 'CHECK STORAGE' },
    {
      label: 'JWT secret present',
      value: (payload?.envStatus || []).every(item => item.present),
      healthyText: 'CONFIGURED',
      warnText: 'MISSING ENV'
    }
  ];

  list.innerHTML = checks.map(item => `
    <div class="step-item">
      <span>${item.label}</span>
      <span class="${item.value ? 'status-ok' : 'status-warn'}">${item.value ? item.healthyText : item.warnText}</span>
    </div>
  `).join('');

  if (!monitoring || monitoring.message) {
    summary.textContent = 'Monitoring summary unavailable for current permission scope.';
    return;
  }

  summary.textContent = `Active users: ${monitoring.users} | Open tasks: ${monitoring.tasksPending} | Pending submissions: ${monitoring.submissionsPending} | Unread notifications: ${monitoring.unreadNotifications}`;
}

async function refreshReadiness() {
  try {
    const [health, monitoring] = await Promise.all([
      api.get('/enterprise/health'),
      api.get('/enterprise/monitoring/summary').catch(err => ({ message: err.message }))
    ]);

    renderReadinessList(health, monitoring);
  } catch (err) {
    const list = document.getElementById('readiness-list');
    if (list) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><div class="empty-title">Failed to load readiness checks</div></div>';
    }
    showToast(err.message || 'Failed to load readiness checks', 'error');
  }
}

async function applyWizard() {
  const updates = [
    ['org.name', document.getElementById('org-name')?.value || 'Tech Turf'],
    ['org.default_language', document.getElementById('org-language')?.value || 'en'],
    ['org.default_timezone', document.getElementById('org-timezone')?.value || 'Asia/Kolkata'],
    ['org.workday_start', document.getElementById('org-workday')?.value || '09:00'],
    ['security.admin_otp_required', document.getElementById('security-admin-otp')?.checked ? 'true' : 'false'],
    ['security.force_strong_password', document.getElementById('security-strong-password')?.checked ? 'true' : 'false'],
    ['walkthrough.enabled', document.getElementById('onboarding-enabled')?.checked ? 'true' : 'false'],
    ['onboarding.walkthrough_version', document.getElementById('onboarding-version')?.value || 'v2-enterprise']
  ];

  try {
    for (const [key, value] of updates) {
      await putPolicy(key, value);
    }
    showToast('Enterprise baseline applied', 'success');
    await loadPoliciesIntoWizard();
  } catch (err) {
    showToast(err.message || 'Failed to apply setup baseline', 'error');
  }
}

async function runSlaCheck() {
  try {
    const result = await api.post('/enterprise/sla/check', {});
    showToast(`SLA check completed. Escalations: ${result.escalations || 0}`, 'success');
  } catch (err) {
    showToast(err.message || 'SLA check failed', 'error');
  }
}

async function initSetupWizard() {
  const applyBtn = document.getElementById('apply-wizard-btn');
  const refreshBtn = document.getElementById('refresh-readiness-btn');
  const slaBtn = document.getElementById('run-sla-btn');
  const openPolicyBtn = document.getElementById('open-policy-center-btn');
  const openHelpBtn = document.getElementById('open-help-center-btn');

  if (applyBtn && !applyBtn.dataset.bound) {
    applyBtn.dataset.bound = 'true';
    applyBtn.onclick = applyWizard;
  }

  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.onclick = refreshReadiness;
  }

  if (slaBtn && !slaBtn.dataset.bound) {
    slaBtn.dataset.bound = 'true';
    slaBtn.onclick = runSlaCheck;
  }

  if (openHelpBtn && !openHelpBtn.dataset.bound) {
    openHelpBtn.dataset.bound = 'true';
    openHelpBtn.onclick = () => { window.location.href = 'help_center.html'; };
  }

  await Promise.all([loadPoliciesIntoWizard(), refreshReadiness()]);
}

window.initSetupWizard = initSetupWizard;
