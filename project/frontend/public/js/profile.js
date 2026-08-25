async function initProfile() {
  setupAvatarFallbacks();
  bindProfileEditForm();
  loadProfileData();
}

function openProfileUrl(inputId, defaultPrefix) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let val = (input.value || '').trim();
  if (!val) {
    showToast('Please enter or paste your profile link first', 'info');
    input.focus();
    return;
  }
  if (val.startsWith('@')) {
    val = val.substring(1);
  }
  let url = val;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = defaultPrefix + val;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
window.openProfileUrl = openProfileUrl;

function setupAvatarFallbacks() {
  const setInitials = (id, name) => {
    const el = document.getElementById(id);
    if (el) {
      const initials = String(name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      el.textContent = initials;
    }
  };

  const name = auth.getUser()?.name || 'User';
  setInitials('nav-initials', name);
  setInitials('profile-initials', name);
  setInitials('preview-initials', name);
}

function getAvatarUrl(user, size = 120) {
  if (user && user.avatar && String(user.avatar).trim() !== '' && user.avatar !== 'null') {
    return user.avatar;
  }
  const name = (user && user.name) ? user.name : 'User';
  return getInitialsAvatar(name, size, user?.role);
}

function bindProfileEditForm() {
  const form = document.getElementById('profile-edit-form');
  const avatarInput = document.getElementById('profile-avatar-input');
  const avatarPreview = document.getElementById('profile-avatar-preview');
  if (!form) return;

  if (avatarInput && avatarPreview) {
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;

      const previewUrl = URL.createObjectURL(file);
      avatarPreview.src = previewUrl;
      avatarPreview.alt = 'Profile Preview';

      avatarPreview.onload = () => {
        if (avatarPreview.dataset.prevUrl) {
          URL.revokeObjectURL(avatarPreview.dataset.prevUrl);
        }
        avatarPreview.dataset.prevUrl = previewUrl;
        avatarPreview.classList.add('loaded');
      };
    });
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
      const payload = new FormData();
      payload.append('name', document.getElementById('edit-profile-name').value || '');
      payload.append('mobile', document.getElementById('edit-profile-mobile').value || '');
      payload.append('personal_email', document.getElementById('edit-profile-personal-email')?.value?.trim() || '');
      payload.append('github_link', document.getElementById('edit-profile-github').value || '');
      payload.append('linkedin_link', document.getElementById('edit-profile-linkedin').value || '');
      payload.append('instagram_link', document.getElementById('edit-profile-instagram').value || '');
      payload.append('bio', document.getElementById('edit-profile-bio').value || '');

      const avatarFile = document.getElementById('profile-avatar-input').files[0];
      if (avatarFile) payload.append('avatar', avatarFile);

      const updated = await api.upload('/users/me/profile', payload);
      if (updated && updated.user) {
        auth.setUser(updated.user);
      }

      showToast('Profile updated successfully', 'success');
      await loadProfileData();
      document.getElementById('profile-avatar-input').value = '';
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  };
}

async function loadProfileData() {
  try {
    const user = await api.get('/auth/me');
    const perf = await api.get(`/users/${user.id}/performance`);
    const allUsers = await api.get('/users');

    // Sidebar info
    const profileAvatarEl = document.getElementById('profile-avatar');
    if (profileAvatarEl) {
      profileAvatarEl.onload = () => profileAvatarEl.classList.add('loaded');
      profileAvatarEl.src = getAvatarUrl(user, 120);
    }
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;

    // Sidebar personal email
    const personalEmailWrap = document.getElementById('profile-personal-email-wrap');
    const personalEmailEl = document.getElementById('profile-personal-email');
    if (personalEmailWrap && personalEmailEl) {
      if (user.personal_email && String(user.personal_email).trim()) {
        personalEmailEl.textContent = user.personal_email.trim();
        personalEmailWrap.style.display = 'block';
      } else {
        personalEmailWrap.style.display = 'none';
      }
    }

    document.getElementById('profile-points').textContent = user.points || 0;
    document.getElementById('profile-role-badge').innerHTML = `<div class="badge" style="background:rgba(16,42,150,0.1); color:var(--accent-primary); border:2px solid var(--accent-primary)44;">${formatRole(user.role)}</div>`;

    const navAvatar = document.getElementById('nav-avatar');
    if (navAvatar) {
      navAvatar.onload = () => navAvatar.classList.add('loaded');
      navAvatar.src = getAvatarUrl(user, 40);
    }

    const avatarPreview = document.getElementById('profile-avatar-preview');
    if (avatarPreview) {
      avatarPreview.onload = () => avatarPreview.classList.add('loaded');
      avatarPreview.src = getAvatarUrl(user, 64);
    }

    const nameInput = document.getElementById('edit-profile-name');
    const mobileInput = document.getElementById('edit-profile-mobile');
    const personalEmailInput = document.getElementById('edit-profile-personal-email');
    const githubInput = document.getElementById('edit-profile-github');
    const linkedinInput = document.getElementById('edit-profile-linkedin');
    const instagramInput = document.getElementById('edit-profile-instagram');
    const bioInput = document.getElementById('edit-profile-bio');

    if (nameInput) nameInput.value = user.name || '';
    if (mobileInput) mobileInput.value = user.mobile || '';
    if (personalEmailInput) personalEmailInput.value = user.personal_email || '';
    if (githubInput) githubInput.value = user.github_link || '';
    if (linkedinInput) linkedinInput.value = user.linkedin_link || '';
    if (instagramInput) instagramInput.value = user.instagram_link || '';
    if (bioInput) bioInput.value = user.bio || '';

    // Render clickable Social Badges on Left Card
    const socialLinksEl = document.getElementById('profile-social-links');
    if (socialLinksEl) {
      let socialHtml = '';
      if (user.github_link) {
        const ghUrl = user.github_link.startsWith('http') ? user.github_link : `https://github.com/${user.github_link}`;
        socialHtml += `<a href="${ghUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-btn github" title="Visit GitHub Profile"><i class="fab fa-github"></i></a>`;
      }
      if (user.linkedin_link) {
        const liUrl = user.linkedin_link.startsWith('http') ? user.linkedin_link : `https://linkedin.com/in/${user.linkedin_link}`;
        socialHtml += `<a href="${liUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-btn linkedin" title="Visit LinkedIn Profile"><i class="fab fa-linkedin"></i></a>`;
      }
      if (user.instagram_link) {
        const igUser = user.instagram_link.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
        const igUrl = user.instagram_link.startsWith('http') ? user.instagram_link : `https://instagram.com/${igUser}`;
        socialHtml += `<a href="${igUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-btn instagram" title="Visit Instagram Profile"><i class="fab fa-instagram"></i></a>`;
      }
      socialLinksEl.innerHTML = socialHtml;
      socialLinksEl.style.display = socialHtml ? 'flex' : 'none';
    }

    if (user.badge) {
      document.getElementById('profile-badge-display').innerHTML = `
        <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Active Badge</div>
        <div class="badge badge-approved" style="padding:8px 16px; font-size:0.8rem;"><i class="fas fa-medal"></i> ${user.badge}</div>
      `;
    }

    // Stats
    document.getElementById('stat-total').textContent = (perf && perf.stats) ? (perf.stats.total || 0) : 0;
    document.getElementById('stat-approved').textContent = (perf && perf.stats) ? (perf.stats.approved || 0) : 0;
    document.getElementById('stat-avg').textContent = (perf && perf.stats) ? Math.round(perf.stats.avg_score || 0) : 0;

    if (Array.isArray(allUsers)) {
      const sorted = allUsers.sort((a, b) => (b.points || 0) - (a.points || 0));
      const rank = sorted.findIndex(u => u.id === user.id) + 1;
      document.getElementById('stat-rank').textContent = rank > 0 ? `#${rank}` : '#—';
    }

    // Activity
    const activityList = document.getElementById('profile-activity-list');
    if (activityList) {
      if (!perf || !perf.logs || perf.logs.length === 0) {
        activityList.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">No recent activity</div>';
      } else {
        activityList.innerHTML = perf.logs.map(l => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:2px solid var(--border);">
            <div style="font-size:0.85rem;">
              <span style="color:var(--text-primary); font-weight:700;">${l.action}</span>
              ${l.score ? `<span style="color:var(--accent-green); margin-left:8px;">+${l.score} pts</span>` : ''}
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${timeAgo(l.logged_at)}</div>
          </div>
        `).join('');
      }
    }

    // Score History Chart
    const chartCanvas = document.getElementById('profile-score-chart');
    if (chartCanvas && perf && perf.score_history && perf.score_history.length > 0) {
      const labels = perf.score_history.map(e => formatDate(e.date));
      const data = perf.score_history.map(e => e.score);
      if (window.profileScoreChart) window.profileScoreChart.destroy();
      window.profileScoreChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Score',
            data,
            borderColor: 'rgba(16,42,150,1)',
            backgroundColor: 'rgba(16,42,150,0.1)',
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: 'var(--accent-primary)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // Submissions
    const subsList = document.getElementById('profile-subs-list');
    if (subsList) {
      if (!perf || !perf.submissions || perf.submissions.length === 0) {
        subsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">No submissions yet</div>';
      } else {
        subsList.innerHTML = perf.submissions.map(s => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:2px solid var(--border);">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${s.task_title || 'Untitled Task'}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${s.notes || 'No notes'}</div>
            </div>
            <div style="text-align:right;">
              <div class="badge badge-${s.status}">${s.status}</div>
              <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px;">${timeAgo(s.submitted_at)}</div>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading profile:', err);
  }
}
