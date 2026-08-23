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
            
            if (!items || items.length === 0) {
                emptyState.style.display = 'block';
                this.updateBreadcrumbs();
                return;
            }
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

        div.innerHTML = `
            <div class="drive-item-actions">
                ${auth.hasRole('admin') ? `<div class="action-btn" onclick="event.stopPropagation(); drive.openShareModal(${item.id}, '${item.name.replace(/'/g, "\\'")}')"><i class="fas fa-share-alt"></i></div>` : ''}
                ${!isFolder ? `<div class="action-btn" onclick="event.stopPropagation(); drive.downloadFile(${item.id})"><i class="fas fa-download"></i></div>` : ''}
                ${auth.hasRole('admin') ? `<div class="action-btn delete" onclick="event.stopPropagation(); drive.deleteItem(${item.id})"><i class="fas fa-trash-alt"></i></div>` : ''}
            </div>
            <i class="fas ${icon} drive-item-icon"></i>
            <div class="drive-item-name" title="${item.name}">${item.name}</div>
            <div class="drive-item-meta">${meta}</div>
        `;

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
                html += `<span class="breadcrumb-part active">${h.name}</span>`;
            } else {
                html += `<span class="breadcrumb-part" onclick="drive.navigateTo(${h.id}, ${idx})">${h.name}</span>`;
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
            const avatarSrc = u.avatar || (typeof getInitialsAvatar === 'function' ? getInitialsAvatar(u.name, 28) : '');
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

    setupEventListeners() {
        const folderForm = document.getElementById('create-folder-form');
        if (folderForm) {
            folderForm.onsubmit = async (e) => {
                e.preventDefault();
                const name = document.getElementById('folder-name').value;
                try {
                    await api.post('/drive/folder', { name, parentId: this.currentParentId });
                    showToast('Folder created', 'success');
                    closeModal('folder-modal');
                    this.loadItems(this.currentParentId);
                    folderForm.reset();
                } catch (err) {
                    showToast(err.message, 'error');
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
                const avatar = typeof getInitialsAvatar === 'function' ? getInitialsAvatar(p.user_name, 28) : '';
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

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        const cancelBtn = document.getElementById('upload-cancel-btn');
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        progressContainer.style.display = 'block';

        let cancelRequested = false;
        let currentXhr = null;
        cancelBtn.disabled = false;
        cancelBtn.style.opacity = 1;
        cancelBtn.onclick = () => {
            cancelRequested = true;
            if (currentXhr) currentXhr.abort();
            progressContainer.style.display = 'none';
            showToast('Upload canceled', 'error');
        };

        // Use chunked upload for files > 10MB
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > CHUNK_SIZE) {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const uploadId = Math.random().toString(36).substring(2) + Date.now();
            let uploaded = 0;
            for (let chunk = 0; chunk < totalChunks; chunk++) {
                if (cancelRequested) break;
                const start = chunk * CHUNK_SIZE;
                const end = Math.min(file.size, start + CHUNK_SIZE);
                const blob = file.slice(start, end);
                await new Promise((resolveChunk, rejectChunk) => {
                    const xhr = new XMLHttpRequest();
                    currentXhr = xhr;
                    xhr.open('POST', api.BASE + '/drive/upload-chunk', true);
                    const token = auth.getToken();
                    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                    xhr.setRequestHeader('x-chunk-number', chunk);
                    xhr.setRequestHeader('x-total-chunks', totalChunks);
                    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
                    xhr.setRequestHeader('x-upload-id', uploadId);
                    xhr.upload.onprogress = function (e) {
                        if (e.lengthComputable) {
                            const percent = Math.round(((uploaded + e.loaded) / file.size) * 100);
                            progressBar.style.width = percent + '%';
                            progressText.textContent = percent + '%';
                        }
                    };
                    xhr.onload = () => {
                        uploaded += blob.size;
                        const percent = Math.round((uploaded / file.size) * 100);
                        progressBar.style.width = percent + '%';
                        progressText.textContent = percent + '%';
                        resolveChunk();
                    };
                    xhr.onerror = () => {
                        if (!cancelRequested) {
                            showToast('Chunk upload failed', 'error');
                        }
                        progressContainer.style.display = 'none';
                        rejectChunk();
                    };
                    xhr.onabort = () => {
                        // No toast here, handled by cancelBtn
                        resolveChunk();
                    };
                    xhr.send(blob);
                });
            }
            if (!cancelRequested) {
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
                setTimeout(() => { progressContainer.style.display = 'none'; }, 800);
                showToast('Upload successful', 'success');
                this.loadItems(this.currentParentId);
            }
            cancelBtn.disabled = true;
            cancelBtn.style.opacity = 0.5;
            return;
        }

        // Fallback to normal upload for small files
        const formData = new FormData();
        formData.append('file', file);
        formData.append('parentId', this.currentParentId || '');
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            currentXhr = xhr;
            xhr.open('POST', api.BASE + '/drive/upload', true);
            const token = auth.getToken();
            if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = percent + '%';
                    progressText.textContent = percent + '%';
                }
            };
            xhr.onload = () => {
                progressBar.style.width = '100%';
                progressText.textContent = '100%';
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 800);
                if (xhr.status >= 200 && xhr.status < 300) {
                    showToast('Upload successful', 'success');
                    this.loadItems(this.currentParentId);
                    resolve();
                } else {
                    let msg = 'Upload failed';
                    try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
                    showToast(msg, 'error');
                    resolve();
                }
                cancelBtn.disabled = true;
                cancelBtn.style.opacity = 0.5;
            };
            xhr.onerror = () => {
                if (!cancelRequested) {
                    showToast('Upload failed', 'error');
                }
                progressContainer.style.display = 'none';
                resolve();
                cancelBtn.disabled = true;
                cancelBtn.style.opacity = 0.5;
            };
            xhr.onabort = () => {
                // No toast here, handled by cancelBtn
                resolve();
                cancelBtn.disabled = true;
                cancelBtn.style.opacity = 0.5;
            };
            xhr.send(formData);
        });
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
window.navigateTo = (id) => drive.navigateTo(id);
