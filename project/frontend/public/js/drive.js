const drive = {
    currentParentId: null,
    history: [],
    users: [],
    sharingItemId: null,
    selectedUserIds: new Set(),
    userSearchFilter: '',

    async init() {
        this.loadItems();
        this.setupEventListeners();
        if (auth.hasRole('admin')) {
            this.loadUsers();
        }
    },

    async loadItems(parentId = null) {
        this.currentParentId = parentId;
        const grid = document.getElementById('drive-items-grid');
        const emptyState = document.getElementById('drive-empty-state');
        
        grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:50px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
        
        try {
            const items = await api.get(`/drive/items?parentId=${parentId || ''}`);
            grid.innerHTML = '';
            
            // The empty state uses the `.hidden` class (display:none !important), so it must be
            // toggled via the class - an inline style.display can't override it.
            if (!items || items.length === 0) {
                emptyState.classList.remove('hidden');
                emptyState.style.display = 'block';
                this.updateBreadcrumbs();
                return;
            }
            emptyState.classList.add('hidden');
            emptyState.style.display = 'none';

            items.forEach(item => {
                const card = this.createItemCard(item);
                grid.appendChild(card);
            });
            
            this.updateBreadcrumbs();
        } catch (e) {
            showToast('Failed to load drive items', 'error');
            grid.innerHTML = '';
        }
    },

    createItemCard(item) {
        const div = document.createElement('div');
        div.className = `drive-item ${item.type} ${this.getFileClass(item.name)}`;
        
        const isFolder = item.type === 'folder';
        const icon = isFolder ? 'fa-folder' : this.getFileIcon(item.name);
        const meta = isFolder ? '' : this.formatSize(item.file_size);
        const safeName = this.esc(item.name);

        div.innerHTML = `
            <div class="drive-item-actions">
                ${auth.hasRole('admin') ? `<div class="action-btn" data-action="share"><i class="fas fa-share-alt"></i></div>` : ''}
                ${!isFolder ? `<div class="action-btn" data-action="download"><i class="fas fa-download"></i></div>` : ''}
                ${auth.hasRole('admin') ? `<div class="action-btn delete" data-action="delete"><i class="fas fa-trash-alt"></i></div>` : ''}
            </div>
            <i class="fas ${icon} drive-item-icon"></i>
            <div class="drive-item-name" title="${safeName}">${safeName}</div>
            <div class="drive-item-meta">${meta}</div>
        `;
        // Bound in JS rather than inline onclick strings so item names can't break out of the markup.
        div.querySelectorAll('[data-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'share') this.openShareModal(item.id, item.name);
                else if (action === 'download') this.downloadFile(item.id);
                else if (action === 'delete') this.deleteItem(item.id);
            };
        });

        div.onclick = () => {
            if (isFolder) {
                this.history.push({ id: item.id, name: item.name });
                this.loadItems(item.id);
            } else {
                this.openPreviewTab(item);
            }
        };

        return div;
    },

    updateBreadcrumbs() {
        const bread = document.getElementById('drive-breadcrumbs');
        let html = '<span class="breadcrumb-part" onclick="drive.navigateTo(null)">Root</span>';

        this.history.forEach((h, idx) => {
            html += ` <i class="fas fa-chevron-right" style="font-size:0.7rem; opacity:0.3;"></i> `;
            if (idx === this.history.length - 1) {
                html += `<span class="breadcrumb-part active">${this.esc(h.name)}</span>`;
            } else {
                html += `<span class="breadcrumb-part" onclick="drive.navigateTo(${Number(h.id)}, ${idx})">${this.esc(h.name)}</span>`;
            }
        });
        
        bread.innerHTML = html;
    },

    navigateTo(id, historyIdx = -1) {
        if (id === null) {
            this.history = [];
        } else if (historyIdx !== -1) {
            this.history = this.history.slice(0, historyIdx + 1);
        }
        this.loadItems(id);
    },

    async loadUsers() {
        try {
            const raw = await api.get('/users');
            this.users = (raw || []).filter(u => Number(u.is_active) === 1);
            this.renderUserSelection();
        } catch (e) {
            console.error('Failed to load users for drive sharing:', e);
        }
    },

    renderUserSelection() {
        const container = document.getElementById('share-members-container');
        if (!container) return;

        const filter = (this.userSearchFilter || '').toLowerCase().trim();
        const filteredUsers = this.users.filter(u => {
            if (!filter) return true;
            const name = (u.name || '').toLowerCase();
            const role = (u.role || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(filter) || role.includes(filter) || email.includes(filter);
        });

        if (filteredUsers.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; font-size:0.8rem; color:var(--text-muted);">No matching employees found</div>';
            this.updateSelectionCount();
            return;
        }

        container.innerHTML = filteredUsers.map(u => {
            const isChecked = this.selectedUserIds.has(u.id);
            const avatarSrc = u.avatar || (typeof getInitialsAvatar === 'function' ? getInitialsAvatar(u.name, 28, u.role) : '');
            return `
                <label class="team-member-item ${isChecked ? 'checked' : ''}" id="share-tm-${u.id}" onclick="drive.toggleUserSelection(${u.id}, event)">
                    <div class="team-member-label-left">
                        <input type="checkbox" value="${u.id}" class="team-member-cb" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); drive.toggleUserSelection(${u.id}, event)">
                        <img src="${avatarSrc}" alt="${u.name}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; flex-shrink:0;">
                        <span style="font-weight:600;">${u.name}</span>
                    </div>
                    <span class="team-member-role-badge">${typeof formatRole === 'function' ? formatRole(u.role) : u.role}</span>
                </label>
            `;
        }).join('');

        this.updateSelectionCount();
    },

    toggleUserSelection(userId, event) {
        if (event && event.target && event.target.tagName !== 'INPUT') {
            // handled via label click
        }
        if (this.selectedUserIds.has(userId)) {
            this.selectedUserIds.delete(userId);
        } else {
            this.selectedUserIds.add(userId);
        }
        
        const label = document.getElementById(`share-tm-${userId}`);
        if (label) {
            const isChecked = this.selectedUserIds.has(userId);
            label.classList.toggle('checked', isChecked);
            const cb = label.querySelector('.team-member-cb');
            if (cb) cb.checked = isChecked;
        }
        this.updateSelectionCount();
    },

    selectAllUsers(selectAll = true) {
        const filter = (this.userSearchFilter || '').toLowerCase().trim();
        const targetUsers = this.users.filter(u => {
            if (!filter) return true;
            const name = (u.name || '').toLowerCase();
            const role = (u.role || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(filter) || role.includes(filter) || email.includes(filter);
        });

        if (selectAll) {
            targetUsers.forEach(u => this.selectedUserIds.add(u.id));
        } else {
            if (filter) {
                targetUsers.forEach(u => this.selectedUserIds.delete(u.id));
            } else {
                this.selectedUserIds.clear();
            }
        }
        this.renderUserSelection();
    },

    filterUsers(text) {
        this.userSearchFilter = text;
        this.renderUserSelection();
    },

    updateSelectionCount() {
        const countSpan = document.getElementById('selected-share-count');
        if (countSpan) countSpan.textContent = this.selectedUserIds.size;

        const submitBtn = document.getElementById('share-submit-btn');
        if (submitBtn) {
            submitBtn.textContent = this.selectedUserIds.size > 0 
                ? `GRANT ACCESS (${this.selectedUserIds.size})` 
                : 'GRANT ACCESS';
        }
    },

    openFolderModal() {
        const folderForm = document.getElementById('create-folder-form');
        if (folderForm) folderForm.reset();
        const alertBox = document.getElementById('create-folder-alert');
        if (alertBox) alertBox.style.display = 'none';
        const submitBtn = document.getElementById('create-folder-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'CREATE FOLDER';
        }
        openModal('folder-modal');
        setTimeout(() => {
            const input = document.getElementById('folder-name');
            if (input) input.focus();
        }, 150);
    },

    setupEventListeners() {
        const folderForm = document.getElementById('create-folder-form');
        if (folderForm) {
            folderForm.onsubmit = async (e) => {
                e.preventDefault();
                const nameInput = document.getElementById('folder-name');
                const submitBtn = document.getElementById('create-folder-submit-btn');
                const alertBox = document.getElementById('create-folder-alert');
                const alertMsg = document.getElementById('create-folder-alert-msg');

                const name = (nameInput ? nameInput.value : '').trim();
                if (!name) {
                    if (alertBox && alertMsg) {
                        alertMsg.textContent = 'Please enter a valid folder name';
                        alertBox.style.display = 'flex';
                    }
                    if (nameInput) nameInput.focus();
                    showToast('Please enter a valid folder name', 'warning');
                    return;
                }

                if (alertBox) alertBox.style.display = 'none';
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CREATING...';
                }

                try {
                    const parentId = (this.currentParentId && this.currentParentId !== 'null' && this.currentParentId !== 'undefined') ? Number(this.currentParentId) : null;
                    await api.post('/drive/folder', { name, parentId });
                    showToast(`Folder "${name}" created successfully`, 'success');
                    closeModal('folder-modal');
                    folderForm.reset();
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'CREATE FOLDER';
                    }
                    await this.loadItems(this.currentParentId);
                } catch (err) {
                    console.error('Create folder error:', err);
                    const errorText = err.message || 'Failed to create folder. Please try again.';
                    if (alertBox && alertMsg) {
                        alertMsg.textContent = errorText;
                        alertBox.style.display = 'flex';
                    }
                    showToast(errorText, 'error');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'CREATE FOLDER';
                    }
                }
            };
        }

        const shareForm = document.getElementById('share-form');
        if (shareForm) {
            shareForm.onsubmit = async (e) => {
                e.preventDefault();
                const itemId = this.sharingItemId;
                const userIds = Array.from(this.selectedUserIds);
                if (userIds.length === 0) {
                    showToast('Please select at least one employee to share with', 'error');
                    return;
                }
                const accessLevel = document.getElementById('share-access-level').value;
                try {
                    await api.post('/drive/share', { itemId, userIds, accessLevel });
                    showToast(`Access granted to ${userIds.length} employee(s)`, 'success');
                    this.selectedUserIds.clear();
                    this.renderUserSelection();
                    this.renderPermissions(itemId);
                } catch (err) {
                    showToast(err.message, 'error');
                }
            };
        }
    },

    async openShareModal(itemId, itemName) {
        this.sharingItemId = itemId;
        this.selectedUserIds.clear();
        this.userSearchFilter = '';
        const searchInput = document.getElementById('share-member-search');
        if (searchInput) searchInput.value = '';

        const itemInfo = document.getElementById('share-item-info');
        if (itemInfo) {
            itemInfo.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-file-alt" style="font-size:1.1rem; color:var(--accent-primary);"></i>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <span style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; display:block;">Sharing Item</span>
                        <strong style="font-size:0.95rem; color:var(--text-primary);">${typeof escapeHtml === 'function' ? escapeHtml(itemName) : itemName}</strong>
                    </div>
                </div>
            `;
        }

        if (!this.users || this.users.length === 0) {
            await this.loadUsers();
        } else {
            this.renderUserSelection();
        }

        this.renderPermissions(itemId);
        openModal('share-modal');
    },

    async renderPermissions(itemId) {
        const list = document.getElementById('current-permissions-list');
        const countBadge = document.getElementById('active-perms-count');
        if (!list) return;

        list.innerHTML = '<div style="text-align:center; padding:16px;"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const perms = await api.get(`/drive/permissions/${itemId}`);
            if (countBadge) countBadge.textContent = `${perms ? perms.length : 0} users`;

            if (!perms || perms.length === 0) {
                list.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:12px; text-align:center; background:#f8fafc; border-radius:8px; border:1px dashed var(--border);">No specific employee access granted yet.</div>';
                return;
            }
            list.innerHTML = perms.map(p => {
                const avatar = typeof getInitialsAvatar === 'function' ? getInitialsAvatar(p.user_name, 28, p.user_role) : '';
                return `
                <div class="perm-user-item">
                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <img src="${avatar}" alt="${p.user_name}" style="width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0;">
                        <div style="min-width:0;">
                            <div style="font-weight:700; font-size:0.85rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.user_name}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted);">${p.user_email || ''} • ${typeof formatRole === 'function' ? formatRole(p.user_role || '') : (p.user_role || '')}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <span class="badge ${p.access_level === 'editor' ? 'badge-primary' : 'badge-info'}" style="font-size:0.65rem; text-transform:uppercase;">${p.access_level}</span>
                        <button type="button" class="perm-revoke-btn" title="Revoke Access" onclick="drive.revokeAccess(${p.user_id})">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `}).join('');
        } catch {
            list.innerHTML = '<div style="font-size:0.8rem; color:var(--accent-secondary); padding:8px;">Error loading permissions.</div>';
        }
    },

    async revokeAccess(userId) {
        if (!confirm('Revoke access for this employee?')) return;
        try {
            await api.delete(`/drive/share/${this.sharingItemId}/${userId}`);
            showToast('Access revoked', 'success');
            this.renderPermissions(this.sharingItemId);
        } catch (e) {
            showToast(e.message || 'Failed to revoke access', 'error');
        }
    },

    openPreviewTab(item) {
        const url = `drive_preview.html?id=${encodeURIComponent(item.id)}`;
        const popup = window.open(url, '_blank', 'noopener,noreferrer');
        if (!popup) {
            showToast('Popup blocked. Please allow popups for preview tabs.', 'error');
        }
    },

    async deleteItem(id) {
        if (!confirm('Permanently delete this item? This cannot be undone.')) return;
        try {
            await api.delete(`/drive/${id}`);
            showToast('Item deleted', 'success');
            this.loadItems(this.currentParentId);
        } catch (e) {
            showToast(e.message, 'error');
        }
    },

    esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // "Upload File" - one or many files into the current folder.
    async handleFileUpload(event) {
        const input = event.target;
        const files = Array.from(input.files || []);
        input.value = ''; // allow choosing the same file again later
        if (!files.length) return;
        await this.runUploads(files.map(file => ({ file, parentId: this.currentParentId })));
    },

    // "Upload Folder" - recreates the selected folder (and its sub-folders) in the current folder.
    async handleFolderUpload(event) {
        const input = event.target;
        const files = Array.from(input.files || []);
        input.value = '';
        if (!files.length) {
            showToast('The selected folder is empty', 'warning');
            return;
        }

        const dirOf = (file) => {
            const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
            const parts = rel.split('/');
            parts.pop();
            return parts.join('/');
        };
        const dirs = Array.from(new Set(files.map(dirOf).filter(Boolean)));

        let folders = {};
        if (dirs.length) {
            try {
                const res = await api.post('/drive/folders/ensure', { parentId: this.currentParentId, paths: dirs });
                folders = (res && res.folders) || {};
            } catch (err) {
                showToast(err.message || 'Failed to create folders', 'error');
                return;
            }
        }

        const jobs = files.map(file => {
            const dir = dirOf(file);
            return { file, parentId: dir ? folders[dir] : this.currentParentId };
        });
        await this.runUploads(jobs, { label: 'folder' });
    },

    // Uploads jobs ({ file, parentId }) a few at a time with one combined progress bar.
    async runUploads(jobs, { label = 'file' } = {}) {
        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        const cancelBtn = document.getElementById('upload-cancel-btn');

        const totalBytes = jobs.reduce((sum, j) => sum + (j.file.size || 0), 0) || 1;
        const loadedByJob = new Map();
        let done = 0, failed = 0, lastError = '';
        const state = { cancelled: false, xhrs: new Set() };

        const render = () => {
            let loaded = 0;
            loadedByJob.forEach(v => { loaded += v; });
            const percent = Math.min(100, Math.round((loaded / totalBytes) * 100));
            progressBar.style.width = percent + '%';
            progressText.textContent = jobs.length > 1
                ? `${done + failed}/${jobs.length} · ${percent}%`
                : `${percent}%`;
        };

        // `.hidden` is display:none !important, so toggle the class (inline styles can't win).
        progressContainer.classList.remove('hidden');
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        render();
        cancelBtn.disabled = false;
        cancelBtn.style.opacity = 1;
        cancelBtn.onclick = () => {
            state.cancelled = true;
            state.xhrs.forEach(x => x.abort());
        };

        let index = 0;
        const worker = async () => {
            while (!state.cancelled && index < jobs.length) {
                const jobIndex = index++;
                const job = jobs[jobIndex];
                try {
                    await this.uploadOne(job.file, job.parentId, state, (loaded) => {
                        loadedByJob.set(jobIndex, loaded);
                        render();
                    });
                    loadedByJob.set(jobIndex, job.file.size);
                    done++;
                } catch (err) {
                    if (state.cancelled) return;
                    failed++;
                    lastError = `${job.file.name}: ${err.message || 'upload failed'}`;
                    console.error('Drive upload failed:', lastError);
                }
                render();
            }
        };
        const CONCURRENCY = 3;
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

        cancelBtn.disabled = true;
        cancelBtn.style.opacity = 0.5;
        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressContainer.style.display = 'none';
        }, 800);

        if (state.cancelled) {
            showToast(done ? `Upload canceled (${done} uploaded before cancel)` : 'Upload canceled', 'error');
        } else if (failed === 0) {
            const what = label === 'folder' ? 'Folder uploaded' : (jobs.length > 1 ? `${done} files uploaded` : 'Upload successful');
            showToast(label === 'folder' ? `${what} (${done} file${done === 1 ? '' : 's'})` : what, 'success');
        } else {
            showToast(`${done} uploaded, ${failed} failed. ${lastError}`, 'error');
        }
        this.loadItems(this.currentParentId);
    },

    // Uploads one file. Files > CHUNK_SIZE (or any file the proxy rejects with 413, e.g. the
    // nginx default 1 MB body limit) are sent in chunks, shrinking the chunk size on 413.
    async uploadOne(file, parentId, state, onProgress) {
        const CHUNK_SIZE = 8 * 1024 * 1024;
        const MIN_CHUNK = 256 * 1024;
        if (file.size <= CHUNK_SIZE) {
            try {
                return await this.uploadSimple(file, parentId, state, onProgress);
            } catch (err) {
                if (err.status !== 413 || file.size <= MIN_CHUNK) throw err;
            }
        }
        // Big files start at 8 MB chunks; a small file that hit 413 retries in 512 KB chunks.
        let chunkSize = file.size > CHUNK_SIZE ? CHUNK_SIZE : 512 * 1024;
        while (true) {
            try {
                return await this.uploadChunked(file, parentId, chunkSize, state, onProgress);
            } catch (err) {
                if (err.status !== 413 || chunkSize <= MIN_CHUNK) throw err;
                chunkSize = Math.max(MIN_CHUNK, Math.floor(chunkSize / 4));
            }
        }
    },

    sendXhr(url, body, headers, state, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            state.xhrs.add(xhr);
            xhr.open('POST', url, true);
            const token = auth.getToken();
            if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
            xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded); };
            const finish = (fn) => { state.xhrs.delete(xhr); fn(); };
            xhr.onload = () => finish(() => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    let data = {};
                    try { data = JSON.parse(xhr.responseText); } catch {}
                    return resolve(data);
                }
                if (xhr.status === 401) { auth.logout(); }
                let msg = '';
                try { const d = JSON.parse(xhr.responseText); msg = d.error || d.message || ''; } catch {}
                if (!msg) {
                    msg = xhr.status === 413 ? 'File too large for the server'
                        : xhr.status === 429 ? 'Too many requests, please wait a moment'
                        : `Upload failed (HTTP ${xhr.status})`;
                }
                const err = new Error(msg);
                err.status = xhr.status;
                reject(err);
            });
            xhr.onerror = () => finish(() => reject(new Error('Network error during upload')));
            xhr.onabort = () => finish(() => reject(new Error('Upload canceled')));
            xhr.send(body);
        });
    },

    uploadSimple(file, parentId, state, onProgress) {
        const formData = new FormData();
        formData.append('parentId', parentId || '');
        formData.append('file', file);
        return this.sendXhr(api.BASE + '/drive/upload', formData, {}, state, onProgress);
    },

    async uploadChunked(file, parentId, chunkSize, state, onProgress) {
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        const uploadId = Math.random().toString(36).substring(2) + Date.now();
        let uploaded = 0;
        let result = null;
        for (let chunk = 0; chunk < totalChunks; chunk++) {
            if (state.cancelled) throw new Error('Upload canceled');
            const start = chunk * chunkSize;
            const blob = file.slice(start, Math.min(file.size, start + chunkSize));
            result = await this.sendXhr(api.BASE + '/drive/upload-chunk', blob, {
                'x-chunk-number': chunk,
                'x-total-chunks': totalChunks,
                'x-file-name': encodeURIComponent(file.name),
                'x-upload-id': uploadId,
                'x-parent-id': parentId || ''
            }, state, (loaded) => onProgress && onProgress(uploaded + loaded));
            uploaded += blob.size;
            if (onProgress) onProgress(uploaded);
        }
        return result;
    },

    downloadFile(id) {
        const token = auth.getToken();
        if (!token || token === 'null' || token === 'undefined') {
            showToast('Security session missing. Please log out and back in.', 'error');
            return;
        }
        const url = `${api.BASE}/drive/download/${id}?token=${encodeURIComponent(token)}`;
        // Create hidden link to trigger download
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.click();
    },

    getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'fa-file-image';
        if (['pdf'].includes(ext)) return 'fa-file-pdf';
        if (['zip', 'rar', '7z', 'gz'].includes(ext)) return 'fa-file-archive';
        if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
        if (['xls', 'xlsx'].includes(ext)) return 'fa-file-excel';
        if (['mp4', 'mkv', 'avi'].includes(ext)) return 'fa-file-video';
        if (['mp3', 'wav'].includes(ext)) return 'fa-file-audio';
        return 'fa-file-alt';
    },

    getFileClass(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
        return '';
    },

    formatSize(bytes) {
        if (!bytes) return '';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }
};

window.drive = drive;
window.initDrive = () => drive.init();
window.handleFileUpload = (e) => drive.handleFileUpload(e);
window.handleFolderUpload = (e) => drive.handleFolderUpload(e);
window.navigateTo = (id) => drive.navigateTo(id);
window.openFolderModal = () => drive.openFolderModal();
