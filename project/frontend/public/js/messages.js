let messageUsers = [];
let messageTeams = [];
let messageConversations = [];
let activeConversationId = null;
let selectedParticipantIds = new Set();
let eventSource = null;
let typingTimer = null;

function getUserAvatar(user) {
  if (user.avatar) return user.avatar;
  return typeof getInitialsAvatar === 'function' ? getInitialsAvatar(user.name, 40) : '';
}

function formatParticipantNames(participants = []) {
  return participants.map(participant => participant.name).join(', ');
}

async function initMessages() {
  bindComposerActions();
  await Promise.all([loadMessageUsers(), loadTeams(), loadConversations()]);
  renderSelectedSummary();
  initRealtimeStream();
}

function bindComposerActions() {
  const search = document.getElementById('user-search');
  const startBtn = document.getElementById('start-chat-btn');
  const clearBtn = document.getElementById('clear-selection-btn');
  const sendBtn = document.getElementById('send-message-btn');
  const messageInput = document.getElementById('message-input');
  const attachmentInput = document.getElementById('message-attachment');
  const chatTitle = document.getElementById('chat-title');
  const conversationSearch = document.getElementById('conversation-search');

  if (search) {
    search.addEventListener('input', () => {
      renderPeopleList(search.value.trim().toLowerCase());
      renderTeamList(search.value.trim().toLowerCase());
      renderConversationList(search.value.trim().toLowerCase());
    });
  }

  if (startBtn) {
    startBtn.onclick = startConversationFromSelection;
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      selectedParticipantIds.clear();
      if (chatTitle) chatTitle.value = '';
      renderPeopleList(search?.value.trim().toLowerCase() || '');
      renderSelectedSummary();
    };
  }

  if (sendBtn) {
    sendBtn.onclick = sendCurrentMessage;
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendCurrentMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      if (!activeConversationId) return;
      api.post(`/messages/conversations/${activeConversationId}/typing`, { isTyping: true }).catch(() => {});
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        api.post(`/messages/conversations/${activeConversationId}/typing`, { isTyping: false }).catch(() => {});
      }, 1200);
    });
  }

  if (conversationSearch) {
    conversationSearch.addEventListener('input', async () => {
      if (!activeConversationId) return;
      const q = conversationSearch.value.trim();
      if (!q) return openConversation(activeConversationId);
      try {
        const rows = await api.get(`/messages/conversations/${activeConversationId}/search?q=${encodeURIComponent(q)}`);
        renderMessages(rows);
      } catch (_) {}
    });
  }

  if (attachmentInput) {
    attachmentInput.value = '';
  }
}

function initRealtimeStream() {
  try {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    eventSource = new EventSource(`/api/messages/stream?token=${encodeURIComponent(auth.getToken() || '')}`);
    eventSource.addEventListener('message', async (event) => {
      const payload = JSON.parse(event.data || '{}');
      if (Number(payload.conversationId) === Number(activeConversationId)) {
        await openConversation(activeConversationId);
      } else {
        await loadConversations();
      }
    });
    eventSource.addEventListener('typing', (event) => {
      const payload = JSON.parse(event.data || '{}');
      if (Number(payload.conversationId) !== Number(activeConversationId)) return;
      if (Number(payload.userId) === Number(auth.getUser()?.id)) return;
      const meta = document.getElementById('active-chat-meta');
      if (!meta) return;
      if (payload.isTyping) {
        meta.textContent = `${payload.userName || 'Someone'} is typing...`;
      } else {
        const current = messageConversations.find(item => Number(item.id) === Number(activeConversationId));
        meta.textContent = current ? (current.participant_names || 'Participants') : 'Conversation loaded';
      }
    });
  } catch (_) {}
}

async function loadMessageUsers() {
  try {
    messageUsers = await api.get('/messages/users');
    renderPeopleList();
  } catch (err) {
    messageUsers = [];
    renderPeopleList();
    showToast(err.message, 'error');
  }
}

async function loadTeams() {
  try {
    messageTeams = await api.get('/teams');
    renderTeamList();
  } catch (err) {
    messageTeams = [];
    renderTeamList();
  }
}

async function loadConversations() {
  try {
    messageConversations = await api.get('/messages/conversations');
    renderConversationList();
    if (!activeConversationId && messageConversations.length > 0) {
      openConversation(messageConversations[0].id);
    }
  } catch (err) {
    messageConversations = [];
    renderConversationList();
  }
}

function renderPeopleList(filter = '') {
  const container = document.getElementById('people-list');
  if (!container) return;

  const filtered = messageUsers.filter(user => {
    const haystack = `${user.name} ${user.email} ${user.role}`.toLowerCase();
    return haystack.includes(filter);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state-lite">No people match your search.</div>';
    return;
  }

  container.innerHTML = filtered.map(user => {
    const active = selectedParticipantIds.has(Number(user.id));
    return `
      <div class="select-item ${active ? 'active' : ''}" onclick="toggleMessageUser(${user.id})">
        <img class="select-avatar" src="${getUserAvatar(user)}" alt="${user.name}">
        <div class="select-meta">
          <div class="select-name">${escapeHtml(user.name)}</div>
          <div class="select-subtitle">${escapeHtml(user.email)} • ${escapeHtml(String(user.role).replace(/_/g, ' '))}</div>
        </div>
        <button type="button" class="select-action text" onclick="event.stopPropagation(); startDirectMessage(${user.id})">Text</button>
      </div>
    `;
  }).join('');
}

function renderTeamList(filter = '') {
  const container = document.getElementById('teams-list');
  if (!container) return;

  const filtered = messageTeams.filter(team => {
    const haystack = `${team.name} ${team.description || ''} ${team.leader_name || ''}`.toLowerCase();
    return haystack.includes(filter);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state-lite">No teams available.</div>';
    return;
  }

  container.innerHTML = filtered.map(team => `
    <div class="select-item" onclick="selectTeamChat(${team.id})">
      <div class="select-avatar" style="display:flex;align-items:center;justify-content:center;background:rgba(90,115,255,0.2);color:var(--accent-primary);">
        <i class="fas fa-users"></i>
      </div>
      <div class="select-meta">
        <div class="select-name">${escapeHtml(team.name)}</div>
        <div class="select-subtitle">${team.member_count || 0} members • ${escapeHtml(team.leader_name || 'No leader')}</div>
      </div>
      <div class="badge badge-normal" style="font-size:0.58rem;">Chat</div>
    </div>
  `).join('');
}

function renderConversationList(filter = '') {
  const container = document.getElementById('conversations-list');
  if (!container) return;

  const filtered = messageConversations.filter(conversation => {
    const haystack = `${conversation.title || ''} ${conversation.participant_names || ''} ${conversation.last_message || ''}`.toLowerCase();
    return haystack.includes(filter);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state-lite">No conversations yet.</div>';
    return;
  }

  container.innerHTML = filtered.map(conversation => {
    const clientBadge = conversation.client_id 
      ? '<span style="display:inline-flex;align-items:center;gap:3px;font-size:.55rem;font-weight:800;color:#7c3aed;background:#ede9fe;border-radius:999px;padding:2px 7px;margin-left:6px;">🔗 Client</span>' 
      : '';
    const displayName = conversation.is_group 
      ? (conversation.title || 'Group Chat') 
      : (conversation.participant_names || 'Direct Message');
    const subtitle = conversation.client_id && conversation.client_name
      ? `Client: ${escapeHtml(conversation.client_name)} (${escapeHtml(conversation.client_company || '')})`
      : (escapeHtml(conversation.participant_names || 'Participants'));
    return `
    <div class="select-item ${Number(conversation.id) === Number(activeConversationId) ? 'active' : ''}" onclick="openConversation(${conversation.id})">
      <div class="select-avatar" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);">
        <i class="fas ${conversation.client_id ? 'fa-user-tie' : 'fa-comment-dots'}"></i>
      </div>
      <div class="select-meta">
        <div class="select-name">${escapeHtml(displayName)}${clientBadge}</div>
        <div class="select-subtitle">${subtitle}${conversation.last_message ? ' • ' + escapeHtml(conversation.last_message) : ''}</div>
      </div>
    </div>
  `;
  }).join('');
}

function renderSelectedSummary() {
  const container = document.getElementById('selected-summary');
  if (!container) return;

  const selectedUsers = messageUsers.filter(user => selectedParticipantIds.has(Number(user.id)));
  if (selectedUsers.length === 0) {
    container.innerHTML = '<span class="badge badge-normal" style="font-size:0.58rem;">No participants selected</span>';
    return;
  }

  container.innerHTML = selectedUsers.map(user => `
    <span class="team-chip active" onclick="toggleMessageUser(${user.id})">${user.name}</span>
  `).join('');
}

window.toggleMessageUser = function(userId) {
  const id = Number(userId);
  if (selectedParticipantIds.has(id)) {
    selectedParticipantIds.delete(id);
  } else {
    selectedParticipantIds.add(id);
  }
  const search = document.getElementById('user-search')?.value.trim().toLowerCase() || '';
  renderPeopleList(search);
  renderSelectedSummary();
};

window.selectTeamChat = function(teamId) {
  const team = messageTeams.find(item => Number(item.id) === Number(teamId));
  if (!team) return;
  selectedParticipantIds.clear();
  (team.members || []).forEach(member => selectedParticipantIds.add(Number(member.id)));
  const title = document.getElementById('chat-title');
  if (title && !title.value.trim()) {
    title.value = `Team: ${team.name}`;
  }
  renderSelectedSummary();
  const search = document.getElementById('user-search')?.value.trim().toLowerCase() || '';
  renderPeopleList(search);
};

window.startDirectMessage = async function(userId) {
  const user = messageUsers.find(item => Number(item.id) === Number(userId));
  if (!user) return;

  try {
    const response = await api.post('/messages/conversations', {
      participant_ids: [Number(user.id)],
      is_group: false
    });
    await loadConversations();
    if (response.conversation?.id) {
      await openConversation(response.conversation.id);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function startConversationFromSelection() {
  const participantIds = Array.from(selectedParticipantIds);
  if (participantIds.length === 0) {
    showToast('Select at least one person or team first.', 'error');
    return;
  }

  const title = document.getElementById('chat-title')?.value.trim() || '';
  try {
    const response = await api.post('/messages/conversations', {
      participant_ids: participantIds,
      title,
      is_group: participantIds.length > 1 || !!title
    });
    await loadConversations();
    if (response.conversation?.id) {
      await openConversation(response.conversation.id);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openConversation(conversationId) {
  activeConversationId = Number(conversationId);
  const conversation = messageConversations.find(item => Number(item.id) === activeConversationId) || null;
  const titleEl = document.getElementById('active-chat-title');
  const metaEl = document.getElementById('active-chat-meta');
  const stream = document.getElementById('chat-stream');
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-message-btn');
  const badge = document.getElementById('active-chat-badge');

  if (titleEl) titleEl.textContent = conversation ? (conversation.is_group ? (conversation.title || 'Group Chat') : (conversation.participant_names || 'Direct Message')) : 'Conversation';
  if (metaEl) metaEl.textContent = conversation ? (conversation.participant_names || 'Participants') : 'Conversation loaded';
  if (badge) {
    badge.style.display = 'inline-flex';
    badge.textContent = conversation?.is_group ? 'GROUP' : 'DIRECT';
  }
  if (input) input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  if (stream) {
    stream.innerHTML = '<div class="empty-state-lite">Loading messages...</div>';
  }

  const filter = document.getElementById('user-search')?.value.trim().toLowerCase() || '';
  renderConversationList(filter);

  try {
    const messages = await api.get(`/messages/conversations/${activeConversationId}/messages`);
    renderMessages(messages);
    await api.put(`/messages/conversations/${activeConversationId}/read`);
    await loadConversations();
  } catch (err) {
    if (stream) {
      stream.innerHTML = `<div class="empty-state-lite">${err.message}</div>`;
    }
  }
}

function renderMessages(messages) {
  const stream = document.getElementById('chat-stream');
  if (!stream) return;

  if (!messages || messages.length === 0) {
    stream.innerHTML = '<div class="empty-state-lite">No messages yet. Send the first message.</div>';
    return;
  }

  stream.innerHTML = messages.map(message => {
    const isClientMessage = message.sender_client_id && !message.sender_id;
    const isSelf = !isClientMessage && Number(message.sender_id) === Number(auth.getUser()?.id);
    const senderLabel = isClientMessage
      ? `Client: ${escapeHtml(message.sender_client_name || 'Client Portal User')}`
      : escapeHtml(isSelf ? 'You' : message.sender_name || 'Teammate');
    const attachmentHtml = Array.isArray(message.attachments) && message.attachments.length > 0
      ? `<div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">${message.attachments.map(a => `<a href="${a.file_path}" target="_blank" style="font-size:0.72rem; color:${isSelf ? '#102a96' : 'var(--accent-primary)'}; text-decoration:underline;">📎 ${escapeHtml(a.file_name || 'Attachment')}</a>`).join('')}</div>`
      : '';
    const readCount = Array.isArray(message.read_receipts) ? message.read_receipts.length : 0;
    const bubbleClass = isClientMessage ? 'other client-message' : (isSelf ? 'self' : 'other');
    return `
      <div class="message-bubble ${bubbleClass}">
        <div style="font-weight:700; font-size:0.78rem; margin-bottom:4px;${isClientMessage ? ' color:#7c3aed;' : ''}">${senderLabel}</div>
        <div>${escapeHtml(message.message)}</div>
        ${attachmentHtml}
        <div class="message-meta">${timeAgo(message.created_at)}${isSelf ? ` • Seen by ${readCount}` : ''}</div>
      </div>
    `;
  }).join('');

  stream.scrollTop = stream.scrollHeight;
}

async function sendCurrentMessage() {
  if (!activeConversationId) {
    showToast('Open or create a conversation first.', 'error');
    return;
  }

  const input = document.getElementById('message-input');
  const attachmentInput = document.getElementById('message-attachment');
  const text = input?.value.trim();
  const hasAttachment = attachmentInput?.files && attachmentInput.files.length > 0;
  if (!text && !hasAttachment) return;

  try {
    const formData = new FormData();
    if (text) formData.append('message', text);
    if (hasAttachment) {
      Array.from(attachmentInput.files).forEach(file => formData.append('attachments', file));
    }
    await api.request('POST', `/messages/conversations/${activeConversationId}/messages`, formData, true);
    if (input) input.value = '';
    if (attachmentInput) attachmentInput.value = '';
    await loadConversations();
    await openConversation(activeConversationId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.initMessages = initMessages;
window.openConversation = openConversation;
window.sendCurrentMessage = sendCurrentMessage;
