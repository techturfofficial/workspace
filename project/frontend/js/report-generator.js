/**
 * Tech Turf 2.0 - Weekly Progress Report Generator
 * High-fidelity Friday Reporting Engine matching the Official Tech Turf PDF Template
 */

// Helper to escape HTML characters
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Helper to calculate ISO week number
function getISOWeekNumber(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// Add dynamic point row to a section
function addReportPoint(section, initialVal = '') {
  const list = document.getElementById(`report-${section}-list`);
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'report-point-row';
  row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px;';
  row.innerHTML = `
    <span style="color:#102a96; font-size:1.1rem; font-weight:900; line-height:1; user-select:none;">•</span>
    <input class="form-control report-point-input" placeholder="Describe task or progress point..." value="${escapeHtml(initialVal)}" style="flex:1;" required>
    <button type="button" class="btn-danger" onclick="this.closest('.report-point-row').remove()" style="padding:6px 10px; font-size:0.75rem; border-radius:6px; flex-shrink:0;" title="Remove point"><i class="fas fa-times"></i></button>
  `;
  list.appendChild(row);
}

// Helper to get points from a container
function getReportPoints(section) {
  const list = document.getElementById(`report-${section}-list`);
  if (!list) return [];
  const inputs = list.querySelectorAll('.report-point-input');
  return Array.from(inputs).map(inp => inp.value.trim()).filter(v => v.length > 0);
}

// Open and prefill Weekly Report Modal
function openWeeklyReportModal() {
  const modal = document.getElementById('weekly-report-modal');
  if (!modal) return;

  const user = (window.auth && auth.getUser) ? auth.getUser() : { name: 'Employee', role: 'member' };
  const today = new Date();
  const weekNum = getISOWeekNumber(today);
  const monthName = today.toLocaleString('default', { month: 'short' });
  const year = today.getFullYear();

  // Prefill metadata
  const weekInput = document.getElementById('report-week');
  if (weekInput && !weekInput.value) weekInput.value = `Week ${weekNum} (${monthName} ${year})`;

  const dateInput = document.getElementById('report-date');
  if (dateInput && !dateInput.value) dateInput.value = today.toISOString().split('T')[0];

  const ownerInput = document.getElementById('report-owner');
  if (ownerInput && !ownerInput.value) ownerInput.value = user.name || 'Team Member';

  const workstreamInput = document.getElementById('report-workstream');
  if (workstreamInput && !workstreamInput.value) {
    const roleMap = {
      'frontend': 'Frontend Engineering',
      'backend': 'Backend & Cloud Infrastructure',
      'frontend_backend': 'Full-Stack Development',
      'designer': 'UI/UX & Visual Design',
      'writer': 'Content Strategy & Technical Writing',
      'media_manager': 'Digital Media & Broadcasting',
      'rnd': 'R&D / Nexus Intelligence',
      'client_handler': 'Client Success & Operations',
      'team_leader': 'Engineering Team Leadership',
      'admin': 'Executive & Mission Operations'
    };
    workstreamInput.value = roleMap[user.role] || (typeof formatRole === 'function' ? formatRole(user.role) + ' Workstream' : 'General Operations');
  }

  // Initialize point lists if empty
  const sections = [
    { key: 'completed', defaults: ['Completed scheduled milestones and tasks'] },
    { key: 'inprogress', defaults: ['In-progress development and testing'] },
    { key: 'blocked', defaults: ['None'] },
    { key: 'nextweek', defaults: ['Sprint commitments and deployment'] }
  ];

  sections.forEach(sec => {
    const list = document.getElementById(`report-${sec.key}-list`);
    if (list && list.children.length === 0) {
      sec.defaults.forEach(def => addReportPoint(sec.key, def));
    }
  });

  modal.style.display = 'flex';
}

function closeWeeklyReportModal() {
  const modal = document.getElementById('weekly-report-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Compiles the Tech Turf 2.0 Weekly Progress Report PDF matching the exact template layout
 */
async function buildWeeklyReportPDF(data) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    throw new Error('jsPDF library is not loaded. Please refresh the page.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - (margin * 2);

  // --- BRANDING HEADER ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  
  const techText = 'TECH ';
  const turfText = 'TURF';
  const techWidth = doc.getTextWidth(techText);
  const turfWidth = doc.getTextWidth(turfText);
  const totalLogoWidth = techWidth + turfWidth;
  const logoStartX = (pageWidth - totalLogoWidth) / 2;

  // Blue TECH
  doc.setTextColor(16, 42, 150); // #102a96
  doc.text(techText, logoStartX, 52);

  // Orange TURF
  doc.setTextColor(255, 107, 0); // #ff6b00
  doc.text(turfText, logoStartX + techWidth, 52);

  // Subtitle: TT 2.0 — Weekly Progress Report
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.setFont('helvetica', 'bold');
  doc.text('TT 2.0 — Weekly Progress Report', pageWidth / 2, 78, { align: 'center' });

  // Italic subheader: Friday reporting template
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // #64748b
  doc.text('Friday reporting template', pageWidth / 2, 94, { align: 'center' });

  // --- 2-ROW METADATA GRID (Prevents any text collision) ---
  let curY = 124;
  const col1X = margin;
  const col2X = margin + (contentWidth / 2) + 12;
  const fieldWidth = (contentWidth / 2) - 16;

  const drawUnderlinedField = (label, val, x, y, maxW) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(label, x, y);
    const labelW = doc.getTextWidth(label);

    doc.setFont('helvetica', 'normal');
    const displayVal = String(val || '').trim();
    doc.text(displayVal, x + labelW + 4, y);

    doc.setDrawColor(180, 190, 205);
    doc.setLineWidth(0.75);
    doc.line(x + labelW + 4, y + 2, x + maxW, y + 2);
  };

  // Row 1: Week & Date
  drawUnderlinedField('Week: ', data.week, col1X, curY, fieldWidth);
  drawUnderlinedField('Date: ', data.date, col2X, curY, fieldWidth);

  curY += 18;

  // Row 2: Workstream & Owner/Lead
  drawUnderlinedField('Workstream: ', data.workstream, col1X, curY, fieldWidth);
  drawUnderlinedField('Owner/Lead: ', data.owner, col2X, curY, fieldWidth);

  curY += 24;

  // Helper to render standard bullet sections with crisp vector circles
  const renderSection = (title, items) => {
    if (curY > pageHeight - 110) {
      doc.addPage();
      curY = 50;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(16, 42, 150); // Tech Turf Blue
    doc.text(title, margin, curY);
    curY += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);

    const validItems = Array.isArray(items) ? items.filter(Boolean) : [];

    if (validItems.length === 0) {
      doc.setTextColor(148, 163, 184);
      doc.text('None reported', margin + 14, curY);
      curY += 15;
    } else {
      validItems.forEach(item => {
        const cleanText = String(item).replace(/^[•●\-\*\s]+/, '').trim();
        if (!cleanText) return;

        const splitLines = doc.splitTextToSize(cleanText, contentWidth - 22);
        splitLines.forEach((line, idx) => {
          if (curY > pageHeight - 60) {
            doc.addPage();
            curY = 50;
          }
          if (idx === 0) {
            // Draw crisp vector circle bullet (No unicode encoding issues)
            doc.setFillColor(16, 42, 150);
            doc.circle(margin + 5, curY - 3, 2, 'F');
          }
          doc.setTextColor(30, 41, 59);
          doc.text(line, margin + 14, curY);
          curY += 13.5;
        });
      });
      curY += 3;
    }
    curY += 7;
  };

  // Section 1: Completed
  renderSection('1. Completed', data.completed);

  // Section 2: In Progress
  renderSection('2. In Progress', data.inProgress);

  // Section 3: Blocked / Risks
  renderSection('3. Blocked / Risks', data.blocked);

  // Section 4: Next Week Commitments
  renderSection('4. Next Week Commitments', data.nextWeek);

  // --- SECTION 5: KPI / Evidence Table ---
  if (curY > pageHeight - 160) {
    doc.addPage();
    curY = 50;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 42, 150);
  doc.text('5. KPI / Evidence', margin, curY);
  curY += 10;

  const kpiTableData = [
    [
      'Key deliverables',
      data.kpiDeliverablesTarget || '100% on-time',
      data.kpiDeliverablesActual || '100% complete',
      data.kpiDeliverablesEvidence || 'PR #42 merged'
    ],
    [
      'Quality / bugs',
      data.kpiQualityTarget || '0 critical bugs',
      data.kpiQualityActual || '0 open bugs',
      data.kpiQualityEvidence || 'QA pass report'
    ],
    [
      'Milestone progress',
      data.kpiMilestoneTarget || 'Sprint Milestone',
      data.kpiMilestoneActual || 'On Schedule',
      data.kpiMilestoneEvidence || 'Task Board'
    ],
    [
      'Other relevant KPI',
      data.kpiOtherTarget || 'Team Velocity',
      data.kpiOtherActual || 'Exceeded',
      data.kpiOtherEvidence || 'Analytics Log'
    ]
  ];

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: curY,
      head: [['Metric', 'Target', 'Actual', 'Evidence / Link']],
      body: kpiTableData,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [16, 42, 150],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      styles: {
        fontSize: 8.5,
        textColor: [30, 41, 59],
        cellPadding: 5,
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    curY = doc.lastAutoTable.finalY + 16;
  } else {
    curY += 90;
  }

  // --- SECTION 6: Decisions / Support Needed ---
  if (curY > pageHeight - 110) {
    doc.addPage();
    curY = 50;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 42, 150);
  doc.text('6. Decisions / Support Needed', margin, curY);
  curY += 15;

  drawUnderlinedField('Decision or support required: ', data.decisionRequired || 'None', margin, curY, contentWidth);
  curY += 18;

  const halfW = (contentWidth / 2) - 16;
  drawUnderlinedField('Owner / approver: ', data.decisionOwner || 'Admin', margin, curY, halfW);
  drawUnderlinedField('Needed by: ', data.decisionNeededBy || 'Next Monday', margin + (contentWidth / 2) + 12, curY, halfW);
  curY += 24;

  // --- SECTION 7: Overall Status ---
  if (curY > pageHeight - 80) {
    doc.addPage();
    curY = 50;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 42, 150);
  doc.text('7. Overall Status', margin, curY);
  curY += 16;

  const statusVal = data.overallStatus || 'On Track';
  const statusOptions = [
    { label: 'On Track', color: [34, 197, 94] },
    { label: 'At Risk', color: [245, 158, 11] },
    { label: 'Blocked', color: [239, 68, 68] }
  ];

  let statusX = margin;
  statusOptions.forEach(opt => {
    const isSelected = opt.label.toLowerCase() === statusVal.toLowerCase();
    
    doc.setFillColor(...opt.color);
    doc.circle(statusX + 5, curY - 3.5, 4.5, isSelected ? 'F' : 'D');

    doc.setFont('helvetica', isSelected ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(isSelected ? 15 : 100, isSelected ? 23 : 116, isSelected ? 42 : 139);
    doc.text(opt.label, statusX + 14, curY);

    if (isSelected) {
      doc.setDrawColor(...opt.color);
      doc.setLineWidth(1.2);
      doc.line(statusX + 14, curY + 2, statusX + 14 + doc.getTextWidth(opt.label), curY + 2);
    }

    statusX += 90;
  });

  // --- FOOTERS ON ALL PAGES ---
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Tech Turf • Internal Document • Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 24, { align: 'center' });
  }

  return doc;
}

// Collect form input data into a clean object
function getWeeklyReportFormData() {
  return {
    week: document.getElementById('report-week')?.value?.trim() || 'Current Week',
    workstream: document.getElementById('report-workstream')?.value?.trim() || 'Operations',
    owner: document.getElementById('report-owner')?.value?.trim() || 'Team Member',
    date: document.getElementById('report-date')?.value?.trim() || new Date().toISOString().split('T')[0],
    completed: getReportPoints('completed'),
    inProgress: getReportPoints('inprogress'),
    blocked: getReportPoints('blocked'),
    nextWeek: getReportPoints('nextweek'),
    kpiDeliverablesTarget: document.getElementById('report-kpi-deliv-target')?.value?.trim() || '100% on-time',
    kpiDeliverablesActual: document.getElementById('report-kpi-deliv-actual')?.value?.trim() || '100% complete',
    kpiDeliverablesEvidence: document.getElementById('report-kpi-deliv-evidence')?.value?.trim() || 'PR #42 merged',
    kpiQualityTarget: document.getElementById('report-kpi-quality-target')?.value?.trim() || '0 critical bugs',
    kpiQualityActual: document.getElementById('report-kpi-quality-actual')?.value?.trim() || '0 open bugs',
    kpiQualityEvidence: document.getElementById('report-kpi-quality-evidence')?.value?.trim() || 'QA pass report',
    kpiMilestoneTarget: document.getElementById('report-kpi-milestone-target')?.value?.trim() || 'Sprint Milestone',
    kpiMilestoneActual: document.getElementById('report-kpi-milestone-actual')?.value?.trim() || 'On Schedule',
    kpiMilestoneEvidence: document.getElementById('report-kpi-milestone-evidence')?.value?.trim() || 'Task Board',
    kpiOtherTarget: document.getElementById('report-kpi-other-target')?.value?.trim() || 'Team Velocity',
    kpiOtherActual: document.getElementById('report-kpi-other-actual')?.value?.trim() || 'Exceeded',
    kpiOtherEvidence: document.getElementById('report-kpi-other-evidence')?.value?.trim() || 'Analytics Log',
    decisionRequired: document.getElementById('report-decision')?.value?.trim() || 'None',
    decisionOwner: document.getElementById('report-decision-owner')?.value?.trim() || 'Admin',
    decisionNeededBy: document.getElementById('report-decision-date')?.value?.trim() || 'Next Monday',
    overallStatus: document.querySelector('input[name="report-overall-status"]:checked')?.value || 'On Track'
  };
}

// Download PDF directly for the user
async function downloadWeeklyReportPDF() {
  const data = getWeeklyReportFormData();
  try {
    const doc = await buildWeeklyReportPDF(data);
    const fileName = `TechTurf_Weekly_Report_${(data.week || 'Week').replace(/[^a-zA-Z0-9]/g, '_')}_${(data.owner || 'User').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(fileName);
    showToast('Report PDF downloaded successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to download PDF', 'error');
  }
}

// Preview PDF in modal or new tab
async function previewWeeklyReportPDF() {
  const data = getWeeklyReportFormData();
  try {
    const doc = await buildWeeklyReportPDF(data);
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    window.open(blobUrl, '_blank');
  } catch (err) {
    showToast(err.message || 'Failed to preview PDF', 'error');
  }
}

// Submit Weekly Report to Admin via Submissions API as a PDF file
async function submitWeeklyReportToAdmin(event) {
  if (event) event.preventDefault();

  const data = getWeeklyReportFormData();
  if (data.completed.length === 0 && data.inProgress.length === 0) {
    showToast('Please add at least one Completed or In-Progress point.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('submit-report-btn');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Generating & Uploading PDF...</span>';
  }

  try {
    // 1. Build client-side PDF document
    const doc = await buildWeeklyReportPDF(data);
    const pdfBlob = doc.output('blob');
    const fileName = `Weekly_Report_${(data.week || 'Week').replace(/[^a-zA-Z0-9]/g, '_')}_${(data.owner || 'User').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    // 2. Prepare submission payload
    const completedText = data.completed.map(p => `• ${p}`).join('\n');
    const inProgressText = data.inProgress.map(p => `• ${p}`).join('\n');
    const blockedText = data.blocked.map(p => `• ${p}`).join('\n');
    const nextWeekText = data.nextWeek.map(p => `• ${p}`).join('\n');

    const formData = new FormData();
    formData.append('project_name', `Weekly Progress Report - ${data.week}`);
    formData.append('content_text', `📋 WEEKLY PROGRESS REPORT (${data.week})\n• Status: ${data.overallStatus}\n• Workstream: ${data.workstream}\n• Owner: ${data.owner}\n• Date: ${data.date}\n\n1. Completed:\n${completedText || 'None'}\n\n2. In Progress:\n${inProgressText || 'None'}\n\n3. Blocked / Risks:\n${blockedText || 'None'}\n\n4. Next Week Commitments:\n${nextWeekText || 'Standard workflow'}\n\n6. Decisions Needed:\n${data.decisionRequired || 'None'}`);
    formData.append('files', pdfFile);

    // 3. Post to submissions endpoint
    const token = localStorage.getItem('tt_token');
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || 'Failed to submit weekly report');
    }

    showToast('🎉 Weekly Progress Report PDF submitted successfully to Admin!', 'success');
    closeWeeklyReportModal();
    
    // Reload recent reports section on dashboard
    loadRecentWeeklyReports();
  } catch (err) {
    showToast(err.message || 'Submission failed', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

// Load and render user's recently submitted weekly reports on dashboard
async function loadRecentWeeklyReports() {
  const container = document.getElementById('recent-weekly-reports-list');
  if (!container) return;

  try {
    const raw = await api.get('/submissions?mine=1');
    const reports = (Array.isArray(raw) ? raw : []).filter(s => 
      (s.project_name && s.project_name.toLowerCase().includes('weekly')) ||
      (s.content_text && s.content_text.includes('WEEKLY PROGRESS REPORT'))
    );

    if (!reports || reports.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:18px 12px; color:var(--text-muted); font-size:0.8rem;">
          <i class="fas fa-file-invoice" style="font-size:1.6rem; opacity:0.4; display:block; margin-bottom:6px;"></i>
          No weekly reports submitted yet. Click <strong>"Create Weekly Progress Report"</strong> above to generate and submit your Friday report.
        </div>
      `;
      return;
    }

    container.innerHTML = reports.slice(0, 5).map(r => {
      let files = [];
      try {
        files = typeof r.file_path === 'string' ? JSON.parse(r.file_path) : (r.file_path || []);
      } catch {
        if (r.file_path) files = [r.file_path];
      }
      const pdfFile = files.find(f => typeof f === 'string' && f.toLowerCase().endsWith('.pdf')) || files[0];

      const statusBadge = r.admin_status === 'approved' ? '<span class="badge badge-approved">APPROVED BY ADMIN</span>' :
        r.admin_status === 'rejected' ? '<span class="badge badge-rejected">REJECTED</span>' :
        r.admin_status === 'rework' ? '<span class="badge badge-rework">NEEDS REWORK</span>' :
        '<span class="badge badge-pending">PENDING ADMIN REVIEW</span>';

      return `
        <div class="report-history-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.7); border:1.5px solid var(--border); padding:12px 16px; border-radius:12px; margin-bottom:10px; transition:all 0.2s;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:8px; background:rgba(16,42,150,0.08); color:var(--accent-primary); display:flex; align-items:center; justify-content:center; font-size:1.1rem;">
              <i class="fas fa-file-pdf"></i>
            </div>
            <div>
              <div style="font-weight:700; font-size:0.88rem; color:var(--text-primary);">${r.project_name || 'Weekly Progress Report'}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">Submitted ${typeof timeAgo === 'function' ? timeAgo(r.submitted_at) : (r.submitted_at || '')}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${statusBadge}
            ${pdfFile ? `
              <a href="${pdfFile}" target="_blank" class="btn-secondary" style="padding:6px 12px; font-size:0.75rem; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                <i class="fas fa-eye"></i><span>View PDF</span>
              </a>
            ` : ''}
            <button type="button" class="btn-danger" onclick="deleteWeeklyReport(${r.id}, event)" style="padding:6px 10px; font-size:0.75rem; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;" title="Delete Report">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; padding:10px;">Unable to load recent reports.</div>';
  }
}

// Delete a submitted weekly report
async function deleteWeeklyReport(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Are you sure you want to delete this weekly report?')) return;

  try {
    await api.delete(`/submissions/${id}`);
    showToast('Weekly report deleted successfully', 'success');
    loadRecentWeeklyReports();
  } catch (err) {
    showToast(err.message || 'Failed to delete report', 'error');
  }
}

window.addReportPoint = addReportPoint;
window.openWeeklyReportModal = openWeeklyReportModal;
window.closeWeeklyReportModal = closeWeeklyReportModal;
window.downloadWeeklyReportPDF = downloadWeeklyReportPDF;
window.previewWeeklyReportPDF = previewWeeklyReportPDF;
window.submitWeeklyReportToAdmin = submitWeeklyReportToAdmin;
window.loadRecentWeeklyReports = loadRecentWeeklyReports;
window.deleteWeeklyReport = deleteWeeklyReport;
