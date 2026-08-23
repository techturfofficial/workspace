/**
 * Tech Turf Dashboard Controller
 * Handles loading of all dashboard modules and statistics.
 */

async function initDashboard() {
    try {
        console.log("Initializing Dashboard...");
        const user = auth.getUser();
        if (!user) return;

        // Load common modules for all users
        loadMyTasks();
        loadProjectProgress();
        loadNexusLatest();
        loadAnnouncements();
        loadNotifications(); // Initial call

        // Load specialized modules based on role
        loadRoleHub();

        if (['admin', 'team_leader'].includes(user.role)) {
            loadTopPerformers();
        }

        if (user.role === 'admin') {
            loadAnalyticsSummary();
            loadIntegrations();

            // Setup static UI listeners
            setupExportButtons();
            setupCustomReport();
        }
    } catch (e) {
        console.error('Dashboard init error:', e);
    }
}

// --- MODULES ---

async function loadMyTasks() {
    const container = document.getElementById('dash-tasks-list');
    if (!container) return;
    try {
        const tasks = await api.get('/tasks?status=pending,in_progress');
        if (!tasks || tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tasks"></i>
                    <div class="empty-title">No active tasks</div>
                    <div class="empty-action"><button class="btn-primary" onclick="window.location.href='tasks.html'">View All Tasks</button></div>
                </div>
            `;
            return;
        }
        container.innerHTML = tasks.slice(0, 2).map(t => `
            <div class="dashboard-list-item">
                <div>
                    <div class="item-title">${t.title}</div>
                    <div class="item-subtitle">${t.project_title || 'General'}</div>
                </div>
                <div class="badge badge-${t.priority}">${t.priority}</div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div class="error-text">Error loading tasks</div>';
    }
}

async function loadProjectProgress() {
    const container = document.getElementById('dash-projects-list');
    if (!container) return;
    try {
        const projects = await api.get('/projects?status=active');
        if (!projects || projects.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-project-diagram"></i>
                    <div class="empty-title">No active projects</div>
                    <div class="empty-action"><button class="btn-primary" onclick="window.location.href='projects.html'">View Projects</button></div>
                </div>
            `;
            return;
        }
        container.innerHTML = projects.slice(0, 2).map(p => {
            const pct = p.task_count > 0 ? Math.round((p.completed_tasks / p.task_count) * 100) : 0;
            const color = pct > 80 ? 'var(--accent-green)' : pct > 50 ? 'var(--accent-orange)' : 'var(--accent-secondary)';
            return `
                <div class="progress-item">
                    <div class="progress-labels">
                        <span class="progress-title">${p.title}</span>
                        <span class="progress-percent" style="color:${color}">${pct}%</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width:${pct}%; background:${color};"></div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<div class="error-text">Error loading projects</div>';
    }
}

async function loadNexusLatest() {
    const container = document.getElementById('dash-nexus-list');
    if (!container) return;
    try {
        const subs = await api.get('/submissions');
        if (!subs || subs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-upload"></i>
                    <div class="empty-title">No submissions yet</div>
                    <div class="empty-action"><button class="btn-primary" onclick="window.location.href='submissions.html'">Submit Work</button></div>
                </div>
            `;
            return;
        }
        container.innerHTML = '';
        subs.slice(0, 2).forEach(s => {
            const wrap = document.createElement('div');
            wrap.className = 'nexus-card';

            const title = document.createElement('div');
            title.className = 'nexus-card-title';
            title.textContent = s.task_title;
            wrap.appendChild(title);

            const ringContainer = document.createElement('div');
            wrap.appendChild(ringContainer);
            container.appendChild(wrap);

            if (s.nexus_score !== null) {
                if (window.createScoreRing) {
                    createScoreRing(s.nexus_score, ringContainer);
                } else {
                    ringContainer.innerHTML = `<div class="score-text">Score: ${s.nexus_score}</div>`;
                }
            } else {
                ringContainer.innerHTML = '<div class="evaluation-pending">Evaluation pending...</div>';
            }
        });
    } catch (e) {
        container.innerHTML = '<div class="error-text">Error loading nexus updates</div>';
    }
}

async function loadAnnouncements() {
    const container = document.getElementById('dash-announcements-list');
    if (!container) return;
    try {
        const items = await api.get('/announcements');
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bullhorn"></i>
                    <div class="empty-title">No announcements</div>
                </div>
            `;
            return;
        }
        container.innerHTML = items.slice(0, 3).map(a => `
            <div class="announcement-item">
                <div class="announcement-header">
                    ${a.pinned ? '<i class="fas fa-thumbtack pinned-icon"></i>' : ''}
                    <span class="announcement-title">${a.title}</span>
                </div>
                <div class="announcement-meta">
                    <span>By ${a.author_name || 'System'}</span>
                    <span>${window.timeAgo ? timeAgo(a.created_at) : a.created_at}</span>
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div class="error-text">Error loading announcements</div>';
    }
}

function draw3DIsometricBarChart(canvas, users, hoveredIndex = -1) {
    if (!canvas || !users || users.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement?.clientWidth || 560;
    const height = rect.height || 380;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const N = Math.min(users.length, 4);
    const displayedUsers = users.slice(0, N);
    const maxPoints = Math.max(...displayedUsers.map(u => u.points || 0), 10);

    const colWidth = width / N;
    const prismWidth = Math.min(68, Math.max(38, colWidth * 0.48));
    const dy = prismWidth * 0.28; // Isometric tilt depth
    const topMargin = 58; // Space for score text
    const bottomMargin = 96; // Space for pill badge + subtitle
    const availableHeight = height - topMargin - bottomMargin;
    const baseY = height - bottomMargin;

    displayedUsers.forEach((u, i) => {
        const cx = colWidth * (i + 0.5);
        const points = u.points || 0;
        const ratio = maxPoints > 0 ? (points / maxPoints) : 0;
        // Base pedestal height + proportional height
        const pillarHeight = 36 + ratio * (availableHeight - 36);
        const topY = baseY - pillarHeight;

        const isHovered = (hoveredIndex === i);
        const isOrange = (i % 2 === 1); // Criss-cross alternating: 0=Dark Blue, 1=Orange, 2=Dark Blue, 3=Orange

        let topGrad, leftGrad, rightGrad, glowColor, textColor, pillBg, strokeLight;

        if (!isOrange) {
            // Tech Turf Dark Blue Theme
            topGrad = ctx.createLinearGradient(cx - prismWidth / 2, topY - dy, cx + prismWidth / 2, topY + dy);
            topGrad.addColorStop(0, '#60a5fa');
            topGrad.addColorStop(1, '#2563eb');

            leftGrad = ctx.createLinearGradient(cx - prismWidth / 2, topY, cx, baseY + dy);
            leftGrad.addColorStop(0, isHovered ? '#3b82f6' : '#2563eb');
            leftGrad.addColorStop(0.5, isHovered ? '#2563eb' : '#1d4ed8');
            leftGrad.addColorStop(1, '#102a96');

            rightGrad = ctx.createLinearGradient(cx, topY + dy, cx + prismWidth / 2, baseY);
            rightGrad.addColorStop(0, '#1d4ed8');
            rightGrad.addColorStop(1, '#091a61');

            glowColor = 'rgba(16, 42, 150, 0.45)';
            textColor = '#102a96';
            pillBg = '#102a96';
            strokeLight = '#93c5fd';
        } else {
            // Tech Turf Electric Orange Theme
            topGrad = ctx.createLinearGradient(cx - prismWidth / 2, topY - dy, cx + prismWidth / 2, topY + dy);
            topGrad.addColorStop(0, '#ffb066');
            topGrad.addColorStop(1, '#ff6b00');

            leftGrad = ctx.createLinearGradient(cx - prismWidth / 2, topY, cx, baseY + dy);
            leftGrad.addColorStop(0, isHovered ? '#ffa14d' : '#ff8f3d');
            leftGrad.addColorStop(0.5, isHovered ? '#ff7714' : '#ff6b00');
            leftGrad.addColorStop(1, '#d95700');

            rightGrad = ctx.createLinearGradient(cx, topY + dy, cx + prismWidth / 2, baseY);
            rightGrad.addColorStop(0, '#ea580c');
            rightGrad.addColorStop(1, '#8c3300');

            glowColor = 'rgba(255, 107, 0, 0.45)';
            textColor = '#ea580c';
            pillBg = '#ff6b00';
            strokeLight = '#ffd0a6';
        }

        // 1. Subtle soft pedestal shadow under the column
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, baseY + dy + 8, prismWidth * 0.65, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
        ctx.fill();
        ctx.restore();

        // 2. Left Front Face (Parallelogram)
        ctx.save();
        if (isHovered) {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 18;
        }
        ctx.beginPath();
        ctx.moveTo(cx - prismWidth / 2, topY);
        ctx.lineTo(cx, topY + dy);
        ctx.lineTo(cx, baseY + dy);
        ctx.lineTo(cx - prismWidth / 2, baseY);
        ctx.closePath();
        ctx.fillStyle = leftGrad;
        ctx.fill();
        ctx.restore();

        // 3. Right Front Face (Parallelogram)
        ctx.beginPath();
        ctx.moveTo(cx, topY + dy);
        ctx.lineTo(cx + prismWidth / 2, topY);
        ctx.lineTo(cx + prismWidth / 2, baseY);
        ctx.lineTo(cx, baseY + dy);
        ctx.closePath();
        ctx.fillStyle = rightGrad;
        ctx.fill();

        // 4. Top Diamond Facet (Isometric Cap)
        ctx.beginPath();
        ctx.moveTo(cx, topY - dy);
        ctx.lineTo(cx + prismWidth / 2, topY);
        ctx.lineTo(cx, topY + dy);
        ctx.lineTo(cx - prismWidth / 2, topY);
        ctx.closePath();
        ctx.fillStyle = topGrad;
        ctx.fill();
        ctx.strokeStyle = strokeLight;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // 5. Vertical Center Seam Highlight
        ctx.beginPath();
        ctx.moveTo(cx, topY + dy);
        ctx.lineTo(cx, baseY + dy);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 6. Top Value Floating Number
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '900 22px "Rajdhani", "Orbitron", sans-serif';
        ctx.fillStyle = textColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isHovered ? 12 : 6;
        ctx.fillText(`${points}`, cx, topY - dy - 14);

        ctx.font = '700 11px "Rajdhani", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.shadowBlur = 0;
        ctx.fillText('PTS', cx, topY - dy - 2);
        ctx.restore();

        // 7. Bottom Pill Badge (Name)
        const pillWidth = Math.min(colWidth - 10, 114);
        const pillHeight = 28;
        const pillX = cx - pillWidth / 2;
        const pillY = baseY + dy + 16;
        const pillRadius = 14;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillRadius);
        ctx.fillStyle = pillBg;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.fill();
        ctx.restore();

        // Text inside Pill
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 11px "Rajdhani", "Inter", sans-serif';
        ctx.fillStyle = '#ffffff';
        let displayName = u.name || `User ${i + 1}`;
        if (displayName.length > 12) displayName = displayName.slice(0, 11) + '…';
        ctx.fillText(displayName, cx, pillY + pillHeight / 2);
        ctx.restore();

        // 8. Subtext (Role & Rank)
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '700 10.5px "Rajdhani", sans-serif';
        ctx.fillStyle = '#1e293b';
        const roleStr = (u.role || 'Member').toUpperCase();
        ctx.fillText(roleStr.length > 14 ? roleStr.slice(0, 13) + '…' : roleStr, cx, pillY + pillHeight + 15);

        ctx.font = '700 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`RANK #0${i + 1}`, cx, pillY + pillHeight + 28);
        ctx.restore();
    });
}

async function loadTopPerformers() {
    const chartCanvas = document.getElementById('top-performers-chart');
    if (!chartCanvas) return;
    try {
        const users = await api.get('/users');
        if (!users) return;
        const sorted = users.sort((a, b) => b.points - a.points).slice(0, 4);
        window.topPerformersData = sorted;

        // Draw 3D Isometric Bar Chart
        draw3DIsometricBarChart(chartCanvas, sorted);

        // Attach interactive mouse move listener for hover effects
        if (!chartCanvas.dataset.hoverAttached) {
            chartCanvas.dataset.hoverAttached = 'true';
            chartCanvas.addEventListener('mousemove', (e) => {
                const rect = chartCanvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const N = Math.min(window.topPerformersData?.length || 4, 4);
                const colWidth = rect.width / N;
                const hoveredIdx = Math.floor(mouseX / colWidth);
                draw3DIsometricBarChart(chartCanvas, window.topPerformersData, hoveredIdx);
            });

            chartCanvas.addEventListener('mouseleave', () => {
                draw3DIsometricBarChart(chartCanvas, window.topPerformersData, -1);
            });
        }
    } catch (e) {
        console.error('Error loading performers 3D graph:', e);
    }
}

// Window resize handler for crisp 3D isometric chart scaling
window.addEventListener('resize', () => {
    const canvas = document.getElementById('top-performers-chart');
    if (canvas && window.topPerformersData) {
        draw3DIsometricBarChart(canvas, window.topPerformersData);
    }
});

// --- ADMIN MODULES ---

async function loadAnalyticsSummary() {
    const container = document.getElementById('dash-analytics-summary');
    if (!container) return;
    try {
        const stats = await api.get('/analytics/summary');
        if (!stats) return;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item"><b>Active Users:</b> ${stats.users || 0}</div>
                <div class="stat-item"><b>Projects:</b> ${stats.projects || 0}</div>
                <div class="stat-item"><b>Tasks:</b> ${stats.tasks || 0}</div>
                <div class="stat-item"><b>Submissions:</b> ${stats.submissions || 0}</div>
                <div class="stat-item"><b>Logins (30d):</b> ${stats.logins || 0}</div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<div class="error-text">Unable to load analytics summary.</div>';
    }
}

async function loadIntegrations() {
    const container = document.getElementById('dash-integrations');
    if (!container) return;
    try {
        const data = await api.get('/integrations/status');
        if (!data || !data.integrations?.length) {
            container.innerHTML = '<span class="text-muted">No integrations found.</span>';
            return;
        }
        container.innerHTML = data.integrations.map(i => `
            <div class="integration-item">
                <b>${i.name}:</b> 
                <span style="color:${i.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-orange)'};">${i.status}</span>
            </div>
        `).join('');
    } catch {
        container.innerHTML = '<span class="text-muted">Integrations unavailable.</span>';
    }
}

// --- UTILS & HANDLERS ---

function setupExportButtons() {
    const usersBtn = document.getElementById('export-users-btn');
    const projectsBtn = document.getElementById('export-projects-btn');
    const tasksBtn = document.getElementById('export-tasks-btn');

    if (usersBtn) usersBtn.onclick = () => downloadCSV('/api/export/users', 'users.csv');
    if (projectsBtn) projectsBtn.onclick = () => downloadCSV('/api/export/projects', 'projects.csv');
    if (tasksBtn) tasksBtn.onclick = () => downloadCSV('/api/export/tasks', 'tasks.csv');
}

async function downloadCSV(apiPath, filename) {
    try {
        const response = await fetch(apiPath, {
            headers: { 'Authorization': auth.getToken() ? 'Bearer ' + auth.getToken() : '' }
        });
        if (!response.ok) throw new Error('Export failed');
        const csv = await response.text();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    } catch (e) {
        if (window.showToast) showToast('Export failed: ' + e.message, 'error');
    }
}

function setupCustomReport() {
    const form = document.getElementById('custom-report-form');
    const tableDiv = document.getElementById('custom-report-table');
    const downloadBtn = document.getElementById('download-report-csv');
    let lastParams = null;

    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const type = document.getElementById('report-type').value;
        const from = document.getElementById('report-from').value;
        const to = document.getElementById('report-to').value;
        const status = document.getElementById('report-status').value;

        let url = `/api/reports/${type}?format=json`;
        if (from) url += `&from=${encodeURIComponent(from)}`;
        if (to) url += `&to=${encodeURIComponent(to)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;

        lastParams = { type, from, to, status };
        tableDiv.innerHTML = '<span class="text-muted">Loading report...</span>';

        try {
            const rows = await api.get(url);
            if (!rows || !rows.length) {
                tableDiv.innerHTML = '<span class="text-muted">No data found matching criteria.</span>';
                return;
            }
            const keys = Object.keys(rows[0]);
            let html = '<table class="table-report"><thead><tr>' + keys.map(k => `<th>${k}</th>`).join('') + '</tr></thead><tbody>';
            html += rows.map(r => '<tr>' + keys.map(k => `<td>${r[k] ?? ''}</td>`).join('') + '</tr>').join('');
            html += '</tbody></table>';
            tableDiv.innerHTML = html;
        } catch {
            tableDiv.innerHTML = '<span class="text-danger">Failed to generate report.</span>';
        }
    };

    if (downloadBtn) {
        downloadBtn.onclick = () => {
            if (!lastParams) {
                if (window.showToast) showToast('Please run a report first', 'info');
                return;
            }
            const { type, from, to, status } = lastParams;
            let downloadUrl = `/api/reports/${type}?format=csv`;
            if (from) downloadUrl += `&from=${encodeURIComponent(from)}`;
            if (to) downloadUrl += `&to=${encodeURIComponent(to)}`;
            if (status) downloadUrl += `&status=${encodeURIComponent(status)}`;
            downloadCSV(downloadUrl, `${type}-report.csv`);
        };
    }
}

// Export to window
async function loadRoleHub() {
    const container = document.getElementById('role-hub-injection');
    if (container) container.innerHTML = '';
}

window.initDashboard = initDashboard;
window.loadNotifications = async function () {
    // Basic placeholder if not defined elsewhere
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');
    if (!badge || !list) return;
    try {
        const user = auth.getUser();
        if (!user) return;
        const notifs = await api.get('/notifications');
        const unread = notifs.filter(n => !n.is_read).length;
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'block' : 'none';

        if (notifs.length === 0) {
            list.innerHTML = '<div class="text-muted p-2">No notifications</div>';
            return;
        }
        list.innerHTML = notifs.map(n => `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" style="padding:10px; border-bottom:1px solid var(--border); font-size:0.85rem;">
                <div style="margin-bottom:4px;">${n.message}</div>
                <div style="font-size:0.7rem; color:var(--text-muted);">${window.timeAgo ? timeAgo(n.created_at) : ''}</div>
            </div>
        `).join('');
    } catch { }
};
