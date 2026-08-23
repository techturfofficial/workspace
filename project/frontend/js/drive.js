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

        // Show progress bar
        let progressBar = document.getElementById('drive-upload-progress');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'drive-upload-progress';
            progressBar.style = 'width: 100%; background: #222; border-radius: 8px; margin: 10px 0; height: 24px; position: relative; overflow: hidden;';
            progressBar.innerHTML = '<div id="drive-upload-bar" style="height:100%;width:0;background:#4f46e5;transition:width 0.2s;"></div>' +
                '<span id="drive-upload-label" style="position:absolute;left:50%;top:0;transform:translateX(-50%);color:#fff;font-size:0.9rem;line-height:24px;">0%</span>' +
                '<button id="drive-upload-cancel" style="position:absolute;right:8px;top:2px;background:#e53e3e;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.8rem;">Cancel</button>' +
                '<button id="drive-upload-resume" style="display:none;position:absolute;right:80px;top:2px;background:#38a169;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.8rem;">Resume Upload</button>';
            document.getElementById('drive-items-grid').parentElement.insertBefore(progressBar, document.getElementById('drive-items-grid'));
        }
        document.getElementById('drive-upload-bar').style.width = '0%';
        document.getElementById('drive-upload-label').textContent = '0%';
        document.getElementById('drive-upload-resume').style.display = 'none';
        progressBar.style.display = '';

        // Chunked upload for files > 5MB
        const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB
        if (file.size > 5 * 1024 * 1024) {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            // Use a deterministic uploadId for resume support (hash of name+size or similar)
            const uploadId = (
                (file.name + '_' + file.size + '_' + file.lastModified)
            ).replace(/[^a-zA-Z0-9_]/g, '');
            let canceled = false;
            document.getElementById('drive-upload-cancel').onclick = () => {
                canceled = true;
                showToast('Upload canceled', 'error');
                document.getElementById('drive-upload-resume').style.display = '';
                document.getElementById('drive-upload-cancel').style.display = 'none';
            };
            // Resume button logic
            document.getElementById('drive-upload-resume').onclick = () => {
                // Show file picker to select the same file
                const input = document.createElement('input');
                input.type = 'file';
                input.style.display = 'none';
                document.body.appendChild(input);
                input.onchange = (e) => {
                    const selected = e.target.files[0];
                    if (selected && selected.name === file.name && selected.size === file.size) {
                        document.getElementById('drive-upload-cancel').style.display = '';
                        document.getElementById('drive-upload-resume').style.display = 'none';
                        this.handleFileUpload({ target: { files: [selected] } });
                    } else {
                        showToast('Please select the same file to resume.', 'error');
                    }
                    document.body.removeChild(input);
                };
                input.click();
            };

            // Resume support: check which chunks are already uploaded
            let uploadedChunks = [];
            try {
                const resp = await fetch(`/api/drive/upload-chunk/status?uploadId=${encodeURIComponent(uploadId)}&totalChunks=${totalChunks}`, {
                    headers: { 'Authorization': `Bearer ${auth.getToken()}` }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    uploadedChunks = data.uploaded || [];
                }
            } catch {}

            // Parallel upload settings
            const MAX_PARALLEL = 4;
            let inProgress = 0;
            let nextChunk = 0;
            let completedChunks = uploadedChunks.length;
            let totalLoaded = completedChunks * CHUNK_SIZE;
            let chunkStatus = Array(totalChunks).fill(false);
            uploadedChunks.forEach(i => chunkStatus[i] = true);

            function updateProgressBar() {
                const pct = Math.min(100, Math.round((totalLoaded / file.size) * 100));
                document.getElementById('drive-upload-bar').style.width = pct + '%';
                document.getElementById('drive-upload-label').textContent = pct + '%';
            }

            await new Promise((resolve, reject) => {
                function uploadNext() {
                    if (canceled) return reject('canceled');
                    // All chunks done
                    if (completedChunks === totalChunks) return resolve();
                    // Start new uploads if slots available
                    while (inProgress < MAX_PARALLEL && nextChunk < totalChunks) {
                        if (chunkStatus[nextChunk]) { nextChunk++; continue; }
                        const i = nextChunk++;
                        inProgress++;
                        const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', '/api/drive/upload-chunk', true);
                        xhr.setRequestHeader('x-chunk-number', i);
                        xhr.setRequestHeader('x-total-chunks', totalChunks);
                        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
                        xhr.setRequestHeader('x-upload-id', uploadId);
                        xhr.setRequestHeader('Authorization', `Bearer ${auth.getToken()}`);
                        xhr.setRequestHeader('x-parent-id', this.currentParentId || '');
                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                // Estimate total loaded
                                const loadedNow = (completedChunks * CHUNK_SIZE) + e.loaded;
                                const pct = Math.min(100, Math.round((loadedNow / file.size) * 100));
                                document.getElementById('drive-upload-bar').style.width = pct + '%';
                                document.getElementById('drive-upload-label').textContent = pct + '%';
                            }
                        };
                        xhr.onload = () => {
                            inProgress--;
                            if (xhr.status >= 200 && xhr.status < 300) {
                                chunkStatus[i] = true;
                                completedChunks++;
                                totalLoaded += chunk.size || (CHUNK_SIZE);
                                updateProgressBar();
                                uploadNext();
                            } else {
                                reject(new Error(xhr.responseText || 'Upload failed'));
                            }
                        };
                        xhr.onerror = () => { inProgress--; reject(new Error('Network error')); };
                        xhr.send(chunk);
                    }
                }
                uploadNext();
            });
            if (!canceled) {
                document.getElementById('drive-upload-bar').style.width = '100%';
                document.getElementById('drive-upload-label').textContent = '100%';
                showToast('Upload successful', 'success');
                setTimeout(() => { progressBar.style.display = 'none'; }, 1000);
                this.loadItems(this.currentParentId);
            }
        } else {
            // Small file: simple upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('parentId', this.currentParentId || '');
            try {
                await api.upload('/drive/upload', formData);
                showToast('Upload successful', 'success');
                progressBar.style.display = 'none';
                this.loadItems(this.currentParentId);
            } catch (e) {
                showToast(e.message, 'error');
                progressBar.style.display = 'none';
            }
        }
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
