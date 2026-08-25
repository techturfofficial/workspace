let messageUsers = [];
let messageClients = [];
let messageTeams = [];
let messageConversations = [];
let activeConversationId = null;
let activeFilter = 'all';
let selectedGroupMembers = new Set();
let eventSource = null;
let typingTimer = null;
let pendingAttachmentFile = null;

function getUserAvatar(user) {
  if (user && user.avatar) return user.avatar;
  return '';
}

function getInitials(name) {
  if (!name) return 'TT';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function parseUtcDate(dateString) {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  let s = String(dateString).trim();
  if (!s) return null;
  // If string is SQLite "YYYY-MM-DD HH:MM:SS" without timezone indicator, treat as UTC
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatWhatsAppTime(dateString) {
  if (!dateString) return '';
  const d = parseUtcDate(dateString);
  if (!d) return '';

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const timeStr = `${hours % 12 || 12}:${minutes} ${ampm}`;

  if (isToday) return timeStr;
  if (isYesterday) return 'Yesterday';

  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }

  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${month}/${day}/${d.getFullYear().toString().slice(-2)}`;
}

function formatMessageDateDivider(dateString) {
  if (!dateString) return 'Today';
  const d = parseUtcDate(dateString);
  if (!d) return 'Today';

  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

async function initMessages() {
  bindUIEvents();
  await Promise.all([
    loadConversations(),
    loadMessageUsers(),
    loadClients(),
    loadTeams()
  ]);
  initRealtimeStream();
}

function bindUIEvents() {
  // Search input
  const searchInput = document.getElementById('chat-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderConversationsList(searchInput.value.trim().toLowerCase());
    });
  }

  // Filter Pill Tabs (All, Teams, Employees, Clients)
  document.querySelectorAll('.wa-filter-pill[data-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.wa-filter-pill[data-filter]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.filter || 'all';
      renderConversationsList(searchInput?.value.trim().toLowerCase() || '');
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('refresh-chats-btn');
  if (refreshBtn) {
    refreshBtn.onclick = () => loadConversations();
  }

  // New Chat Modal Triggers
  const openModalBtn = document.getElementById('open-new-chat-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const modal = document.getElementById('new-chat-modal');

  if (openModalBtn && modal) {
    openModalBtn.onclick = async () => {
      modal.classList.add('active');
      renderModalViews();
      await Promise.all([loadMessageUsers(), loadClients()]);
      renderModalViews();
    };
  }

  if (closeModalBtn && modal) {
    closeModalBtn.onclick = () => modal.classList.remove('active');
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  window.openNewChatWithTab = async function(tabName) {
    if (!modal) return;
    modal.classList.add('active');
    renderModalViews();
    await Promise.all([loadMessageUsers(), loadClients()]);
    renderModalViews();
    const targetTab = document.querySelector(`.modal-tab-btn[data-tab="${tabName}"]`);
    if (targetTab) targetTab.click();
  };

  // Modal Sub-Tabs
  bindModalTabs();

  // Composer Input
  const textarea = document.getElementById('message-text-input');
  const sendBtn = document.getElementById('wa-send-btn');
  const attachInput = document.getElementById('message-attachment-file');
  const attachRemove = document.getElementById('wa-attach-remove');
  const clearActiveChatBtn = document.getElementById('clear-active-chat-btn');

  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCurrentMessage();
      }
    });

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';

      if (!activeConversationId) return;
      api.post(`/messages/conversations/${activeConversationId}/typing`, { isTyping: true }).catch(() => {});
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        api.post(`/messages/conversations/${activeConversationId}/typing`, { isTyping: false }).catch(() => {});
      }, 1200);
    });
  }

  if (sendBtn) {
    sendBtn.onclick = sendCurrentMessage;
  }

  if (attachInput) {
    attachInput.addEventListener('change', () => {
      const file = attachInput.files && attachInput.files[0];
      if (file) {
        pendingAttachmentFile = file;
        const previewBox = document.getElementById('wa-attach-preview-box');
        const filename = document.getElementById('wa-attach-filename');
        if (filename) filename.textContent = file.name;
        if (previewBox) previewBox.style.display = 'inline-flex';
      }
    });
  }

  if (attachRemove) {
    attachRemove.onclick = () => {
      pendingAttachmentFile = null;
      if (attachInput) attachInput.value = '';
      const previewBox = document.getElementById('wa-attach-preview-box');
      if (previewBox) previewBox.style.display = 'none';
    };
  }

  if (clearActiveChatBtn) {
    clearActiveChatBtn.onclick = () => closeActiveChat();
  }

  const mobileBackBtn = document.getElementById('mobile-back-btn');
  if (mobileBackBtn) {
    mobileBackBtn.onclick = () => closeActiveChat();
  }

  // 3-Dot Action Menu Dropdown
  const chatMenuBtn = document.getElementById('chat-menu-btn');
  const chatActionMenu = document.getElementById('chat-action-menu');

  if (chatMenuBtn && chatActionMenu) {
    chatMenuBtn.onclick = (e) => {
      e.stopPropagation();
      chatActionMenu.classList.toggle('active');
    };

    document.addEventListener('click', (e) => {
      if (!chatActionMenu.contains(e.target) && e.target !== chatMenuBtn) {
        chatActionMenu.classList.remove('active');
      }
    });
  }

  // Clear Chat History
  const clearChatBtn = document.getElementById('menu-clear-chat-btn');
  if (clearChatBtn) {
    clearChatBtn.onclick = () => {
      chatActionMenu?.classList.remove('active');
      if (activeConversationId) {
        clearChatHistory(activeConversationId);
      }
    };
  }

  // Delete Conversation
  const deleteChatBtn = document.getElementById('menu-delete-chat-btn');
  if (deleteChatBtn) {
    deleteChatBtn.onclick = () => {
      chatActionMenu?.classList.remove('active');
      if (activeConversationId) {
        const current = messageConversations.find(c => Number(c.id) === activeConversationId);
        const title = current ? (current.display_title || current.title || 'this conversation') : 'this conversation';
        deleteConversationById(activeConversationId, title);
      }
    };
  }

  // Delete Team Channel
  const deleteTeamBtn = document.getElementById('menu-delete-team-btn');
  if (deleteTeamBtn) {
    deleteTeamBtn.onclick = () => {
      chatActionMenu?.classList.remove('active');
      if (activeConversationId) {
        const current = messageConversations.find(c => Number(c.id) === activeConversationId);
        const title = current ? (current.display_title || current.title || 'this team') : 'this team';
        if (current?.team_id) {
          deleteTeamGroup(current.team_id, title);
        } else {
          deleteConversationById(activeConversationId, title);
        }
      }
    };
  }

  // Delete Client Contact
  const deleteContactBtn = document.getElementById('menu-delete-contact-btn');
  if (deleteContactBtn) {
    deleteContactBtn.onclick = () => {
      chatActionMenu?.classList.remove('active');
      if (activeConversationId) {
        const current = messageConversations.find(c => Number(c.id) === activeConversationId);
        const title = current ? (current.client_name || current.display_title || 'this client') : 'this client';
        if (current?.client_id) {
          deleteClientContact(current.client_id, title);
        } else {
          deleteConversationById(activeConversationId, title);
        }
      }
    };
  }

  // Search inside active chat
  const convSearch = document.getElementById('conversation-search');
  if (convSearch) {
    convSearch.addEventListener('input', debounce(async () => {
      if (!activeConversationId) return;
      const q = convSearch.value.trim();
      if (!q) return loadMessagesForActiveConversation(activeConversationId);
      try {
        const rows = await api.get(`/messages/conversations/${activeConversationId}/search?q=${encodeURIComponent(q)}`);
        renderMessages(rows);
      } catch (_) {}
    }, 200));
  }
}

function bindModalTabs() {
  const tabEmp = document.getElementById('modal-tab-employees');
  const tabCli = document.getElementById('modal-tab-clients');
  const tabGrp = document.getElementById('modal-tab-group');

  const viewEmp = document.getElementById('modal-view-employees');
  const viewCli = document.getElementById('modal-view-clients');
  const viewGrp = document.getElementById('modal-view-group');

  function selectTab(tab, view) {
    [tabEmp, tabCli, tabGrp].forEach(t => t?.classList.remove('active'));
    [viewEmp, viewCli, viewGrp].forEach(v => { if (v) v.style.display = 'none'; });
    tab?.classList.add('active');
    if (view) view.style.display = 'flex';
  }

  if (tabEmp) tabEmp.onclick = () => { selectTab(tabEmp, viewEmp); renderModalEmployeesList(searchEmp?.value.trim().toLowerCase() || ''); };
  if (tabCli) tabCli.onclick = () => { selectTab(tabCli, viewCli); renderModalClientsList(searchCli?.value.trim().toLowerCase() || ''); };
  if (tabGrp) tabGrp.onclick = () => { selectTab(tabGrp, viewGrp); renderModalGroupParticipantsList(); };

  const searchEmp = document.getElementById('modal-search-employees');
  if (searchEmp) {
    searchEmp.addEventListener('input', () => {
      renderModalEmployeesList(searchEmp.value.trim().toLowerCase());
    });
  }

  const searchCli = document.getElementById('modal-search-clients');
  if (searchCli) {
    searchCli.addEventListener('input', () => {
      renderModalClientsList(searchCli.value.trim().toLowerCase());
    });
  }

  const createGroupBtn = document.getElementById('create-group-submit-btn');
  if (createGroupBtn) {
    createGroupBtn.onclick = handleCreateGroupSubmit;
  }
}

async function loadConversations() {
  try {
    const data = await api.get('/messages/conversations');
    const list = Array.isArray(data) ? data : [];

    messageConversations = list.map(c => {
      const isClient = Boolean(c.client_id || c.category === 'clients' || (c.title && /client/i.test(c.title)) || (c.client_name));
      const isTeam = Boolean(!isClient && (c.category === 'teams' || c.team_id || c.is_group || (c.title && /team|group|channel/i.test(c.title)) || Number(c.participant_count) > 2));
      
      const category = isClient ? 'clients' : (isTeam ? 'teams' : 'employees');
      const display_title = c.display_title || c.title || (isClient ? (c.client_name ? `${c.client_name} (${c.client_company || 'Client'})` : 'Client Chat') : (isTeam ? (c.title || 'Team Group') : (c.other_name || 'Direct Message')));
      
      return {
        ...c,
        category,
        display_title
      };
    });

    updateFilterCounts();
    renderConversationsList(document.getElementById('chat-search-input')?.value.trim().toLowerCase() || '');
  } catch (err) {
    messageConversations = [];
    renderConversationsList();
  }
}

async function loadMessageUsers() {
  try {
    messageUsers = await api.get('/messages/users');
  } catch (_) {
    messageUsers = [];
  }
}

async function loadClients() {
  try {
    const raw = await api.get('/messages/clients');
    messageClients = Array.isArray(raw) && raw.length > 0 ? raw : await api.get('/clients');
  } catch (_) {
    try {
      messageClients = await api.get('/clients');
    } catch {
      messageClients = [];
    }
  }
}

async function loadTeams() {
  try {
    messageTeams = await api.get('/teams');
  } catch (_) {
    messageTeams = [];
  }
}

function updateFilterCounts() {
  const teams = messageConversations.filter(c => c.category === 'teams').length;
  const employees = messageConversations.filter(c => c.category === 'employees').length;
  const clients = messageConversations.filter(c => c.category === 'clients').length;

  const tCount = document.getElementById('teams-count');
  const eCount = document.getElementById('employees-count');
  const cCount = document.getElementById('clients-count');

  if (tCount) tCount.textContent = teams;
  if (eCount) eCount.textContent = employees;
  if (cCount) cCount.textContent = clients;
}

function renderConversationsList(searchQuery = '') {
  const list = document.getElementById('wa-chat-list');
  if (!list) return;

  let filtered = messageConversations;

  // Filter by category tab
  if (activeFilter !== 'all') {
    filtered = filtered.filter(c => c.category === activeFilter);
  }

  // Filter by search query
  if (searchQuery) {
    filtered = filtered.filter(c => {
      const name = (c.display_title || c.title || c.other_name || c.client_name || '').toLowerCase();
      const lastMsg = (c.last_message || '').toLowerCase();
      const parts = (c.participant_names || '').toLowerCase();
      return name.includes(searchQuery) || lastMsg.includes(searchQuery) || parts.includes(searchQuery);
    });
  }

  if (!filtered.length) {
    const emptyLabels = {
      all: 'No conversations found',
      teams: 'No team chats yet',
      employees: 'No employee messages yet',
      clients: 'No client chats yet'
    };
    list.innerHTML = `
      <div style="padding:40px 20px; text-align:center; color:var(--text-muted);">
        <i class="far fa-comments" style="font-size:1.8rem; margin-bottom:8px; opacity:0.5; display:block;"></i>
        <div style="font-size:0.85rem; font-weight:700;">${emptyLabels[activeFilter] || 'No chats'}</div>
        <div style="font-size:0.75rem; margin-top:4px;">Click + to start a new chat</div>
      </div>
    `;
    return;
  }

  const currentUser = (window.auth && auth.getUser) ? auth.getUser() : { id: 0 };

  list.innerHTML = filtered.map(c => {
    const isActive = Number(c.id) === Number(activeConversationId);
    const title = (c.category === 'clients') 
      ? (c.client_name || (c.title !== 'Client Chat Thread' ? c.title : 'Client'))
      : (c.display_title || c.title || c.other_name || 'Conversation');
    const timeStr = formatWhatsAppTime(c.last_message_at || c.updated_at);
    const preview = c.last_message ? c.last_message : (c.participant_names ? `With: ${c.participant_names}` : 'No messages yet');
    const unread = Number(c.unread_count || 0);

    const categoryBadgeClass = c.category === 'teams' ? 'wa-category-teams' : (c.category === 'clients' ? 'wa-category-clients' : 'wa-category-employees');
    const categoryLabel = c.category === 'teams' ? 'Team' : (c.category === 'clients' ? 'Client' : 'Staff');

    const avatarUrl = c.other_avatar || (c.category === 'clients' ? c.client_avatar : '');
    const initials = getInitials(title);

    return `
      <div class="wa-chat-item ${isActive ? 'active' : ''}" onclick="selectConversation(${c.id})">
        <div class="wa-avatar-wrap">
          ${avatarUrl ? `
            <img src="${avatarUrl}" class="wa-avatar" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="wa-avatar-fallback ${categoryBadgeClass}" style="display:none;">${initials}</div>
          ` : `
            <div class="wa-avatar-fallback ${categoryBadgeClass}">${initials}</div>
          `}
          <div class="wa-status-dot"></div>
        </div>

        <div class="wa-chat-info">
          <div class="wa-chat-row-top">
            <span class="wa-chat-name" title="${title}">${title}</span>
            <span class="wa-chat-time">${timeStr}</span>
          </div>

          <div class="wa-chat-row-bottom">
            <span class="wa-chat-preview" title="${preview}">
              ${c.last_message && c.last_sender_id === currentUser.id ? `<i class="fas fa-check-double" style="color:#38bdf8; font-size:0.68rem; margin-right:3px;"></i>` : ''}
              ${preview}
            </span>
            <div class="wa-chat-meta-right">
              <span class="wa-category-badge ${categoryBadgeClass}">${categoryLabel}</span>
              ${unread > 0 ? `<span class="wa-unread-badge">${unread}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function selectConversation(conversationId) {
  activeConversationId = Number(conversationId);
  document.querySelector('.wa-container')?.classList.add('has-active-chat');
  renderConversationsList(document.getElementById('chat-search-input')?.value.trim().toLowerCase() || '');

  const emptyView = document.getElementById('wa-empty-view');
  const activeView = document.getElementById('wa-active-view');
  if (emptyView) emptyView.style.display = 'none';
  if (activeView) activeView.style.display = 'flex';

  const current = messageConversations.find(c => Number(c.id) === activeConversationId);
  if (current) {
    const title = (current.category === 'clients')
      ? (current.client_name || (current.title !== 'Client Chat Thread' ? current.title : 'Client'))
      : (current.display_title || current.title || current.other_name || 'Conversation');
    const headerName = document.getElementById('active-chat-name');
    const headerMeta = document.getElementById('active-chat-meta');
    const avatarWrap = document.getElementById('active-avatar-wrap');
    const avatarUrl = current.other_avatar || (current.category === 'clients' ? current.client_avatar : '');
    const categoryBadgeClass = current.category === 'teams' ? 'wa-category-teams' : (current.category === 'clients' ? 'wa-category-clients' : 'wa-category-employees');

    if (headerName) headerName.textContent = title;
    if (avatarWrap) {
      avatarWrap.innerHTML = avatarUrl ? `
        <img src="${avatarUrl}" class="wa-avatar" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="wa-avatar-fallback ${categoryBadgeClass}" style="display:none;">${getInitials(title)}</div>
      ` : `
        <div class="wa-avatar-fallback ${categoryBadgeClass}">${getInitials(title)}</div>
      `;
    }

    if (headerMeta) {
      if (current.category === 'teams') {
        headerMeta.textContent = `${current.participant_count || 'Team'} members • ${current.participant_names || ''}`;
      } else if (current.category === 'clients') {
        headerMeta.textContent = `Client Account • ${current.client_company || 'Active Client'}`;
      } else {
        headerMeta.textContent = current.other_role ? formatRole(current.other_role) : 'Direct Message';
      }
    }

    // Configure 3-dot dropdown menu items based on context
    const deleteTeamItem = document.getElementById('menu-delete-team-btn');
    const deleteContactItem = document.getElementById('menu-delete-contact-btn');
    const contextDivider = document.getElementById('menu-context-divider');

    if (current.category === 'teams') {
      if (deleteTeamItem) deleteTeamItem.style.display = 'flex';
      if (deleteContactItem) deleteContactItem.style.display = 'none';
      if (contextDivider) contextDivider.style.display = 'block';
    } else if (current.category === 'clients') {
      if (deleteTeamItem) deleteTeamItem.style.display = 'none';
      if (deleteContactItem) deleteContactItem.style.display = 'flex';
      if (contextDivider) contextDivider.style.display = 'block';
    } else {
      if (deleteTeamItem) deleteTeamItem.style.display = 'none';
      if (deleteContactItem) deleteContactItem.style.display = 'none';
      if (contextDivider) contextDivider.style.display = 'none';
    }
  }

  await loadMessagesForActiveConversation(activeConversationId);
}

async function loadMessagesForActiveConversation(conversationId) {
  const stream = document.getElementById('wa-messages-stream');
  if (stream) stream.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';

  try {
    const messages = await api.get(`/messages/conversations/${conversationId}/messages`);
    renderMessages(messages);
    api.put(`/messages/conversations/${conversationId}/read`, {}).catch(() => {});
  } catch (err) {
    if (stream) stream.innerHTML = '<div class="empty-state-lite">Failed to load messages</div>';
  }
}

function renderMessages(messages = []) {
  const stream = document.getElementById('wa-messages-stream');
  if (!stream) return;

  if (!messages.length) {
    stream.innerHTML = '<div class="wa-date-divider">No messages yet. Say hello! 👋</div>';
    return;
  }

  const currentUser = (window.auth && auth.getUser) ? auth.getUser() : { id: 0 };
  let lastDateStr = null;
  let html = '';

  messages.forEach(msg => {
    const isSelf = Number(msg.sender_id) === Number(currentUser.id);
    const msgDate = new Date(msg.created_at);
    const dateDivider = formatMessageDateDivider(msg.created_at);

    if (dateDivider !== lastDateStr) {
      html += `<div class="wa-date-divider">${dateDivider}</div>`;
      lastDateStr = dateDivider;
    }

    const timeStr = formatWhatsAppTime(msg.created_at);

    const attachList = (Array.isArray(msg.attachments) && msg.attachments.length > 0)
      ? msg.attachments
      : (msg.attachment ? [{ file_path: msg.attachment, file_name: 'Attachment' }] : []);

    const attachHtml = attachList.map(att => {
      const path = att.file_path || att.url || '';
      const name = att.file_name || 'Attachment';
      if (isImageFile(path)) {
        return `
          <div class="wa-bubble-attachment">
            <a href="${path}" target="_blank" rel="noopener noreferrer">
              <img src="${path}" alt="${escapeHtml(name)}">
            </a>
          </div>
        `;
      } else {
        return `
          <div class="wa-bubble-attachment">
            <a href="${path}" target="_blank" rel="noopener noreferrer" style="color:inherit; display:flex; align-items:center; gap:6px; font-size:0.75rem;">
              <i class="fas fa-file-download"></i>
              <span>${escapeHtml(name)}</span>
            </a>
          </div>
        `;
      }
    }).join('');

    html += `
      <div class="wa-bubble ${isSelf ? 'wa-bubble-outgoing' : 'wa-bubble-incoming'}">
        ${!isSelf && msg.sender_name ? `<div class="wa-bubble-sender">${escapeHtml(msg.sender_name)}</div>` : ''}
        ${msg.message ? `<div class="wa-bubble-text">${escapeHtml(msg.message)}</div>` : ''}
        ${attachHtml}
        <div class="wa-bubble-meta">
          <span>${timeStr}</span>
          ${isSelf ? `<i class="fas fa-check-double" style="color:#67e8f9; font-size:0.65rem; margin-left:2px;"></i>` : ''}
        </div>
      </div>
    `;
  });

  stream.innerHTML = html;
  stream.scrollTop = stream.scrollHeight;
}

function isImageFile(url = '') {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(url);
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendCurrentMessage() {
  if (!activeConversationId) return;

  const textarea = document.getElementById('message-text-input');
  const messageText = textarea ? textarea.value.trim() : '';

  if (!messageText && !pendingAttachmentFile) return;

  const formData = new FormData();
  if (messageText) formData.append('message', messageText);
  if (pendingAttachmentFile) formData.append('attachment', pendingAttachmentFile);

  const sendBtn = document.getElementById('wa-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const token = localStorage.getItem('tt_token');
    const res = await fetch(`/api/messages/conversations/${activeConversationId}/messages`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to send message');
    }

    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    pendingAttachmentFile = null;
    const attachInput = document.getElementById('message-attachment-file');
    if (attachInput) attachInput.value = '';
    const previewBox = document.getElementById('wa-attach-preview-box');
    if (previewBox) previewBox.style.display = 'none';

    await loadMessagesForActiveConversation(activeConversationId);
    await loadConversations();
  } catch (err) {
    showToast(err.message || 'Failed to send', 'error');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function closeActiveChat() {
  activeConversationId = null;
  const emptyView = document.getElementById('wa-empty-view');
  const activeView = document.getElementById('wa-active-view');
  if (emptyView) emptyView.style.display = 'flex';
  if (activeView) activeView.style.display = 'none';
  renderConversationsList(document.getElementById('chat-search-input')?.value.trim().toLowerCase() || '');
}

async function clearChatHistory(convId) {
  if (!confirm('Are you sure you want to clear all messages in this chat?')) {
    return;
  }
  try {
    await api.delete(`/messages/conversations/${convId}/clear`);
    showToast('Chat history cleared', 'success');
    await loadMessagesForActiveConversation(convId);
    await loadConversations();
  } catch (err) {
    showToast(err.message || 'Failed to clear chat history', 'error');
  }
}

async function deleteConversationById(id, title = 'this chat') {
  if (!confirm(`Are you sure you want to delete "${title}"? All chat history will be permanently deleted.`)) {
    return;
  }
  try {
    await api.delete(`/messages/conversations/${id}`);
    showToast('Conversation deleted', 'success');
    if (Number(activeConversationId) === Number(id)) {
      closeActiveChat();
    }
    await loadConversations();
  } catch (err) {
    showToast(err.message || 'Failed to delete chat', 'error');
  }
}

async function deleteClientContact(clientId, name = 'this client') {
  if (!confirm(`Are you sure you want to delete client contact "${name}"?`)) {
    return;
  }
  try {
    await api.delete(`/clients/${clientId}`);
    showToast('Client contact deleted', 'success');
    await loadClients();
    renderModalClientsList(document.getElementById('modal-search-clients')?.value.trim().toLowerCase() || '');
    await loadConversations();
  } catch (err) {
    showToast(err.message || 'Failed to delete client', 'error');
  }
}

async function deleteTeamGroup(teamId, name = 'this team') {
  if (!confirm(`Are you sure you want to delete team channel "${name}"?`)) {
    return;
  }
  try {
    await api.delete(`/teams/${teamId}`);
    showToast('Team channel deleted', 'success');
    await loadTeams();
    await loadConversations();
    closeActiveChat();
  } catch (err) {
    showToast(err.message || 'Failed to delete team', 'error');
  }
}

function initRealtimeStream() {
  try {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    const token = localStorage.getItem('tt_token') || '';
    eventSource = new EventSource(`/api/messages/stream?token=${encodeURIComponent(token)}`);

    eventSource.addEventListener('message', async (event) => {
      const payload = JSON.parse(event.data || '{}');
      if (Number(payload.conversationId) === Number(activeConversationId)) {
        await loadMessagesForActiveConversation(activeConversationId);
      }
      await loadConversations();
    });

    eventSource.addEventListener('typing', (event) => {
      const payload = JSON.parse(event.data || '{}');
      if (Number(payload.conversationId) !== Number(activeConversationId)) return;
      const currentUser = (window.auth && auth.getUser) ? auth.getUser() : { id: 0 };
      if (Number(payload.userId) === Number(currentUser.id)) return;

      const meta = document.getElementById('active-chat-meta');
      if (!meta) return;

      if (payload.isTyping) {
        meta.textContent = `${payload.userName || 'Contact'} is typing...`;
      } else {
        const current = messageConversations.find(c => Number(c.id) === Number(activeConversationId));
        if (current) {
          meta.textContent = current.category === 'teams' ? `${current.participant_count} members` : 'online';
        }
      }
    });
  } catch (_) {}
}

// Modal Views: Employees, Clients, New Team Group
function renderModalViews() {
  renderModalEmployeesList();
  renderModalClientsList();
  renderModalGroupParticipantsList();
}

function renderModalEmployeesList(q = '') {
  const container = document.getElementById('modal-employees-list');
  if (!container) return;

  const filtered = q ? messageUsers.filter(u => (`${u.name} ${u.role}`).toLowerCase().includes(q)) : messageUsers;

  if (!filtered.length) {
    container.innerHTML = '<div style="padding:24px; text-align:center; color:#94a3b8; font-size:0.82rem;"><i class="fas fa-user-slash" style="margin-right:6px;"></i> No employees found</div>';
    return;
  }

  container.innerHTML = filtered.map(u => `
    <div class="wa-contact-card" onclick="startDirectEmployeeChat(${u.id})">
      <div class="wa-card-avatar emp">${getInitials(u.name)}</div>
      <div class="wa-card-info">
        <div class="wa-card-name">${u.name}</div>
        <div class="wa-card-meta">
          <span class="wa-card-role-tag">${formatRole(u.role)}</span>
        </div>
      </div>
      <div class="wa-card-action">
        <i class="fas fa-comment-dots"></i>
      </div>
    </div>
  `).join('');
}

async function renderModalClientsList(q = '') {
  const container = document.getElementById('modal-clients-list');
  if (!container) return;

  if (!messageClients.length && !q) {
    container.innerHTML = '<div style="padding:24px; text-align:center; color:#94a3b8; font-size:0.82rem;"><i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Loading client directory...</div>';
    await loadClients();
  }

  const filtered = q ? messageClients.filter(c => (`${c.name || ''} ${c.company || ''}`).toLowerCase().includes(q)) : messageClients;

  if (!filtered.length) {
    container.innerHTML = '<div style="padding:24px; text-align:center; color:#94a3b8; font-size:0.82rem;"><i class="fas fa-briefcase" style="margin-right:6px;"></i> No clients found</div>';
    return;
  }

  container.innerHTML = filtered.map(c => `
    <div class="wa-contact-card" onclick="startDirectClientChat(${c.id})">
      <div class="wa-card-avatar cli">${getInitials(c.name || c.company)}</div>
      <div class="wa-card-info">
        <div class="wa-card-name">${c.name}</div>
        <div class="wa-card-meta">
          <span class="wa-card-role-tag" style="color:#fbbf24; background:rgba(245, 158, 11, 0.15); border-color:rgba(245, 158, 11, 0.3);">${c.company || 'Client Account'}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button type="button" class="wa-contact-delete-btn" onclick="event.stopPropagation(); deleteClientContact(${c.id}, '${escapeHtml(c.name)}')" title="Delete client contact">
          <i class="fas fa-trash-alt"></i>
        </button>
        <div class="wa-card-action">
          <i class="fas fa-comment-dots"></i>
        </div>
      </div>
    </div>
  `).join('');
}

function renderModalGroupParticipantsList() {
  const container = document.getElementById('modal-group-participants-list');
  if (!container) return;

  container.innerHTML = messageUsers.map(u => `
    <label class="wa-contact-card" style="cursor:pointer; user-select:none;">
      <input type="checkbox" value="${u.id}" ${selectedGroupMembers.has(u.id) ? 'checked' : ''} onchange="toggleGroupMember(${u.id}, this.checked)" style="margin-right:4px; accent-color:#2563eb; width:16px; height:16px; cursor:pointer;">
      <div class="wa-card-avatar emp" style="width:34px; height:34px; font-size:0.75rem;">${getInitials(u.name)}</div>
      <div class="wa-card-info">
        <div class="wa-card-name" style="font-size:0.86rem;">${u.name}</div>
        <div class="wa-card-meta">
          <span class="wa-card-role-tag">${formatRole(u.role)}</span>
        </div>
      </div>
    </label>
  `).join('');
}

window.toggleGroupMember = function(userId, isChecked) {
  if (isChecked) selectedGroupMembers.add(Number(userId));
  else selectedGroupMembers.delete(Number(userId));
};

async function startDirectEmployeeChat(userId) {
  try {
    const res = await api.post('/messages/conversations', {
      participant_ids: [Number(userId)],
      is_group: false
    });
    document.getElementById('new-chat-modal')?.classList.remove('active');
    await loadConversations();
    if (res.conversation) {
      selectConversation(res.conversation.id);
    }
  } catch (err) {
    showToast(err.message || 'Failed to start chat', 'error');
  }
}

async function startDirectClientChat(clientId) {
  try {
    const res = await api.post(`/messages/conversations/client/${clientId}`, {});
    document.getElementById('new-chat-modal')?.classList.remove('active');
    await loadConversations();
    if (res.conversation) {
      selectConversation(res.conversation.id);
    }
  } catch (err) {
    showToast(err.message || 'Failed to start client chat', 'error');
  }
}

async function handleCreateGroupSubmit() {
  const titleInput = document.getElementById('group-title-input');
  const title = titleInput ? titleInput.value.trim() : '';

  if (!title) {
    showToast('Please provide a group name', 'error');
    return;
  }

  if (selectedGroupMembers.size < 1) {
    showToast('Please select at least 1 team member', 'error');
    return;
  }

  try {
    const res = await api.post('/messages/conversations', {
      title,
      is_group: true,
      participant_ids: Array.from(selectedGroupMembers)
    });

    document.getElementById('new-chat-modal')?.classList.remove('active');
    selectedGroupMembers.clear();
    if (titleInput) titleInput.value = '';

    await loadConversations();
    if (res.conversation) {
      selectConversation(res.conversation.id);
    }
    showToast('Team group created successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to create group', 'error');
  }
}

window.initMessages = initMessages;
window.selectConversation = selectConversation;
window.startDirectEmployeeChat = startDirectEmployeeChat;
window.startDirectClientChat = startDirectClientChat;
window.deleteConversationById = deleteConversationById;
window.deleteClientContact = deleteClientContact;
window.deleteTeamGroup = deleteTeamGroup;
window.clearChatHistory = clearChatHistory;

