// ===== State =====
let chats = [];
let currentChatId = null;
let isMainTyping = false;
let isMiniTyping = false;
let isDeepResearchEnabled = false;

// ...
const expandActionsBtn = document.getElementById('expandActionsBtn');
const extraActions = document.getElementById('extraActions');
if (expandActionsBtn && extraActions) {
  expandActionsBtn.addEventListener('click', () => {
    expandActionsBtn.classList.toggle('open');
    extraActions.classList.toggle('show');
  });
}

const deepResearchToggle = document.getElementById('deepResearchToggle');
if (deepResearchToggle) {
  deepResearchToggle.addEventListener('click', () => {
    isDeepResearchEnabled = !isDeepResearchEnabled;
    deepResearchToggle.classList.toggle('active', isDeepResearchEnabled);
    showToast(isDeepResearchEnabled ? 'Deep Research Enabled' : 'Standard Mode Enabled');
    // Auto-close after selection for better UX
    setTimeout(() => {
      expandActionsBtn.classList.remove('open');
      extraActions.classList.remove('show');
    }, 1500);
  });
}
let currentUser = null;
let settings = {
  enterToSend: true,
  fontSize: 'medium',
  customInstructions: '',
  currentModel: 'smart-ai-1',
  theme: 'light',
  unrestrictedMode: false,
  truthMode: false
};

// ===== DOM Elements =====
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOpenBtn = document.getElementById('sidebarOpenBtn');
const topbar = document.getElementById('topbar');
const newChatBtn = document.getElementById('newChatBtn');
const topbarNewChat = document.getElementById('topbarNewChat');
const chatList = document.getElementById('chatList');
const chatArea = document.getElementById('chatArea');
const welcomeScreen = document.getElementById('welcomeScreen');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const miniChatToggle = document.getElementById('miniChatToggle');
const miniChat = document.getElementById('miniChat');
const miniChatClose = document.getElementById('miniChatClose');
const miniChatMessages = document.getElementById('miniChatMessages');
const miniMessageInput = document.getElementById('miniMessageInput');
const miniSendBtn = document.getElementById('miniSendBtn');
const contextMenu = document.getElementById('contextMenu');
const renameChatBtn = document.getElementById('renameChat');
const deleteChatBtn = document.getElementById('deleteChat');
const searchInput = document.getElementById('searchChats');

// Modals
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const settingsClose = document.getElementById('settingsClose');
const clearAllChatsBtn = document.getElementById('clearAllChats');
const loginModal = document.getElementById('loginModal');
const loginClose = document.getElementById('loginClose');
const loginSubmit = document.getElementById('loginSubmit');
const loginGuest = document.getElementById('loginGuest');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');

// Confirm dialog
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancel = document.getElementById('confirmCancel');
const confirmDeleteBtn = document.getElementById('confirmDelete');
let confirmCallback = null;

let contextMenuChatId = null;

// New elements
const toast = document.getElementById('toast');
const modelSelectorBtn = document.getElementById('modelSelectorBtn');
const modelDropdown = document.getElementById('modelDropdown');
const modelName = document.getElementById('modelName');
const fontSizeSelect = document.getElementById('fontSizeSelect');
const enterToSendToggle = document.getElementById('enterToSend');
const themeSelect = document.getElementById('themeSelect');
const customInstructionsInput = document.getElementById('customInstructions');
const exportDataBtn = document.getElementById('exportData');
const securityModeContainer = document.getElementById('securityModeContainer');
const unrestrictedModeToggle = document.getElementById('unrestrictedMode');
const truthModeContainer = document.getElementById('truthModeContainer');
const truthModeToggle = document.getElementById('truthModeToggle');

// ===== API Calls =====
const API = {
  async getChats() {
    const res = await fetch('/api/chats');
    return res.json();
  },
  async createChat() {
    const res = await fetch('/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    return res.json();
  },
  async deleteChat(id) {
    const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  },
  async renameChat(id, title) {
    const res = await fetch(`/api/chats/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!res.ok) throw new Error('Rename failed');
    return res.json();
  },
  async pinChat(id) {
    const res = await fetch(`/api/chats/${id}/pin`, { method: 'PUT' });
    return res.json();
  },
  async getMessages(chatId) {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    return res.json();
  },
  async sendMessage(chatId, content, model, customInstructions, unrestrictedMode, truthMode, deepResearch) {
    const res = await fetch(`/api/chats/${chatId}/messages`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ content, model, customInstructions, unrestrictedMode, truthMode, deepResearch }) 
    });
    if (res.status === 403) {
      const data = await res.json();
      throw new Error(data.message || 'Daily limit reached');
    }
    return res.json();
  },
  async getMiniMessages(chatId) {
    const res = await fetch(`/api/chats/${chatId}/mini-messages`);
    return res.json();
  },
  async sendMiniMessage(chatId, content, unrestrictedMode, truthMode) {
    const res = await fetch(`/api/chats/${chatId}/mini-messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, unrestrictedMode, truthMode }) });
    return res.json();
  },
  async uploadFiles(files) {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    return res.json();
  },
  async clearAllChats() {
    const res = await fetch('/api/chats', { method: 'DELETE' });
    if (!res.ok) throw new Error('Clear failed');
    return res.json();
  },
  // Auth
  async login(email, password) {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return res.json();
  },
  async loginWithGoogle(credential) {
    const res = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
    return res.json();
  },
  async register(name, email, password) {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    return res.json();
  },
  async logout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return res.json();
  },
  async getMe() {
    const res = await fetch('/api/auth/me');
    return res.json();
  },
};

// ===== Sidebar =====
function toggleSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('hidden');
  }
  updateSidebarBtnState();
}

function updateSidebarBtnState() {
  if (window.innerWidth <= 768) {
    sidebarOpenBtn.style.display = sidebar.classList.contains('open') ? 'none' : 'block';
  } else {
    sidebarOpenBtn.style.display = sidebar.classList.contains('hidden') ? 'block' : 'none';
  }
}

// Set initial state
updateSidebarBtnState();

sidebarToggle.addEventListener('click', toggleSidebar);
sidebarOpenBtn.addEventListener('click', toggleSidebar);

// ===== Date Grouping =====
function getDateGroup(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'Previous 7 Days';
  if (date >= monthAgo) return 'Previous 30 Days';
  return 'Older';
}

function groupChatsByDate(chatsList) {
  const groups = {};
  const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];

  chatsList.forEach(chat => {
    const group = getDateGroup(chat.updated_at);
    if (!groups[group]) groups[group] = [];
    groups[group].push(chat);
  });

  // Return in order
  return order.filter(g => groups[g]).map(g => ({ label: g, chats: groups[g] }));
}

// ===== Chat List Rendering =====
function renderChatList(filter = '') {
  chatList.innerHTML = '';

  let filteredChats = chats;
  if (filter) {
    const q = filter.toLowerCase();
    filteredChats = chats.filter(c => c.title.toLowerCase().includes(q));
  }

  if (filteredChats.length === 0 && filter) {
    chatList.innerHTML = '<div style="padding: 16px 12px; color: var(--text-muted); font-size: 13px; text-align: center;">No chats found</div>';
    return;
  }

  const pinned = filteredChats.filter(c => c.pinned);
  const unpinned = filteredChats.filter(c => !c.pinned);

  // Render pinned group first
  if (pinned.length > 0) {
    const pinnedLabel = document.createElement('div');
    pinnedLabel.className = 'chat-group-label';
    pinnedLabel.innerHTML = '📌 Pinned';
    chatList.appendChild(pinnedLabel);
    pinned.forEach(chat => renderChatItem(chat));
  }

  // Render remaining by date groups
  const groups = groupChatsByDate(unpinned);
  groups.forEach(group => {
    const label = document.createElement('div');
    label.className = 'chat-group-label';
    label.textContent = group.label;
    chatList.appendChild(label);
    group.chats.forEach(chat => renderChatItem(chat));
  });
}

function renderChatItem(chat) {
  const item = document.createElement('div');
  item.className = `chat-item${chat.id === currentChatId ? ' active' : ''}${chat.pinned ? ' pinned' : ''}`;
  item.dataset.id = chat.id;
  item.innerHTML = `
    <span class="chat-item-title">${escapeHtml(chat.title)}</span>
    ${chat.pinned ? '<span class="pin-badge" title="Pinned">📌</span>' : ''}
    <button class="chat-item-menu" title="Options">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2"></circle>
        <circle cx="12" cy="12" r="2"></circle>
        <circle cx="12" cy="19" r="2"></circle>
      </svg>
    </button>
  `;

  item.addEventListener('click', (e) => {
    if (e.target.closest('.chat-item-menu')) return;
    switchChat(chat.id);
  });

  const menuBtn = item.querySelector('.chat-item-menu');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showContextMenu(e, chat.id);
  });

  chatList.appendChild(item);
}

// ===== Search =====
searchInput.addEventListener('input', () => {
  renderChatList(searchInput.value.trim());
});

// ===== Context Menu =====
function showContextMenu(e, chatId) {
  contextMenuChatId = chatId;
  contextMenu.classList.add('visible');
  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 100);
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
}

function hideContextMenu() {
  contextMenu.classList.remove('visible');
  contextMenuChatId = null;
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

const pinChatBtn = document.getElementById('pinChat');

pinChatBtn.addEventListener('click', async () => {
  const id = contextMenuChatId;
  hideContextMenu();
  const updated = await API.pinChat(id);
  const chat = chats.find(c => c.id === id);
  if (chat) chat.pinned = updated.pinned;
  renderChatList(searchInput.value.trim());
  showToast(updated.pinned ? 'Chat pinned 📌' : 'Chat unpinned');
});

renameChatBtn.addEventListener('click', () => {
  hideContextMenu();
  startRename(contextMenuChatId);
});

deleteChatBtn.addEventListener('click', () => {
  const id = contextMenuChatId;
  hideContextMenu();
  showConfirm('Are you sure you want to delete this chat? This action cannot be undone.', async () => {
    try {
      await API.deleteChat(id);
      chats = chats.filter(c => c.id !== id);
      if (currentChatId === id) {
        currentChatId = null;
        showWelcome();
      }
      renderChatList(searchInput.value.trim());
    } catch(err) {
      showToast('Failed to delete chat');
    }
  });
});

// ===== Confirm Dialog =====
function showConfirm(message, onConfirm, confirmLabel = 'Delete') {
  confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  confirmDeleteBtn.textContent = confirmLabel;
  confirmOverlay.classList.add('open');
}

confirmCancel.addEventListener('click', () => {
  confirmOverlay.classList.remove('open');
  confirmCallback = null;
  confirmDeleteBtn.textContent = 'Delete'; // always reset
});

confirmDeleteBtn.addEventListener('click', async () => {
  confirmOverlay.classList.remove('open');
  if (confirmCallback) {
    await confirmCallback();
    confirmCallback = null;
  }
});

confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) {
    confirmOverlay.classList.remove('open');
    confirmCallback = null;
    confirmDeleteBtn.textContent = 'Delete'; // always reset
  }
});

// ===== Rename =====
function startRename(chatId) {
  const item = chatList.querySelector(`[data-id="${chatId}"]`);
  if (!item) return;
  const titleEl = item.querySelector('.chat-item-title');
  const currentTitle = titleEl.textContent;

  const input = document.createElement('input');
  input.className = 'chat-item-rename';
  input.type = 'text';
  input.value = currentTitle;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  async function finishRename() {
    const newTitle = input.value.trim() || currentTitle;
    try {
      await API.renameChat(chatId, newTitle);
      const chat = chats.find(c => c.id === chatId);
      if (chat) chat.title = newTitle;
      renderChatList(searchInput.value.trim());
    } catch(err) {
      showToast('Failed to rename chat');
      renderChatList(searchInput.value.trim()); // reset to original
    }
  }

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.value = currentTitle;
      input.blur();
    }
  });
}

// ===== New Chat =====
function createNewChat() {
  currentChatId = null;
  searchInput.value = '';
  document.querySelectorAll('.chat-item.active').forEach(el => el.classList.remove('active'));
  showWelcome();
  
  // Clear inputs and attachments
  messageInput.value = '';
  messageInput.style.height = 'auto'; // reset height
  updateSendBtnState();
  if (typeof attachedFiles !== 'undefined') {
    attachedFiles = [];
    renderAttachedFiles();
  }

  messageInput.focus();
  // Reset mini chat
  if (miniChat.classList.contains('open')) {
    miniChatMessages.innerHTML = `<div class="mini-welcome"><p>Ask any doubt about the conversation. I'll help you understand!</p></div>`;
  }
}

newChatBtn.addEventListener('click', createNewChat);
if (topbarNewChat) {
  topbarNewChat.addEventListener('click', createNewChat);
}

// ===== Switch Chat =====
async function switchChat(chatId) {
  if (chatId === currentChatId) return;
  currentChatId = chatId;
  renderChatList(searchInput.value.trim());

  const messages = await API.getMessages(chatId);
  if (messages.length === 0) {
    showWelcome();
  } else {
    hideWelcome();
    renderMessages(messages);
  }

  if (miniChat.classList.contains('open')) {
    await loadMiniMessages();
  }
}

// ===== Welcome Screen =====
function showWelcome() {
  welcomeScreen.classList.remove('hidden');
  messagesContainer.classList.remove('visible');
  messagesContainer.innerHTML = '';
}

function hideWelcome() {
  welcomeScreen.classList.add('hidden');
  messagesContainer.classList.add('visible');
}

document.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const text = chip.dataset.text;
    messageInput.value = text;
    autoResizeTextarea(messageInput);
    updateSendBtnState();
    sendMainMessage();
  });
});

// ===== Render Messages =====
function renderMessages(messages) {
  messagesContainer.innerHTML = '';
  messages.forEach(msg => {
    appendMessage(msg.role, msg.content);
  });
  scrollToBottom(chatArea);
}

function enhanceCodeBlocks(containerDiv) {
  const preEls = containerDiv.querySelectorAll('pre');
  preEls.forEach(pre => {
    // If it's already wrapped (e.g. some internal glitch), skip
    if (pre.parentNode.classList.contains('code-container')) return;
    
    const container = document.createElement('div');
    container.className = 'code-container';
    
    const codeEl = pre.querySelector('code');
    let lang = 'code';
    if (codeEl && codeEl.className) {
      const match = codeEl.className.match(/language-(\w+)/);
      if (match) lang = match[1];
    }

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span class="code-lang">${lang}</span>
      <button class="code-copy-btn" title="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span style="font-size: 12px; margin-left: 4px;">Copy Code</span>
      </button>
    `;

    const copyBtn = header.querySelector('.code-copy-btn');
    copyBtn.addEventListener('click', () => {
      const textToCopy = codeEl ? codeEl.textContent : pre.textContent;
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span style="font-size: 12px; margin-left: 4px;">Copied!</span>
        `;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span style="font-size: 12px; margin-left: 4px;">Copy Code</span>
          `;
        }, 2000);
      });
    });

    pre.parentNode.insertBefore(container, pre);
    container.appendChild(header);
    container.appendChild(pre);
  });
}

function getAvatarHTML(role) {
  if (role === 'user') {
    return `<div class="message-avatar user-avatar" title="${getUserInitial()}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>`;
  } else {
    return `<div class="message-avatar assistant-avatar" style="background: var(--accent); color: white;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M12 2v2M7 11V7a5 5 0 0 1 10 0v4M8 16h.01M16 16h.01"/>
      </svg>
    </div>`;
  }
}

function getMiniAvatarHTML(role) {
  if (role === 'user') {
    return `<div class="mini-message-avatar user-avatar" title="${getUserInitial()}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>`;
  } else {
    return `<div class="mini-message-avatar assistant-avatar" style="background: var(--accent); color: white;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M12 2v2M7 11V7a5 5 0 0 1 10 0v4M8 16h.01M16 16h.01"/>
      </svg>
    </div>`;
  }
}

function appendMessage(role, content) {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${role}-wrapper`;
  const div = document.createElement('div');
  div.className = `message ${role}`;

  wrapper.dataset.originalContent = content; // store raw content for regenerate

  let mainContent = content;
  let sugLines = [];
  
  if (role === 'assistant' && typeof content === 'string') {
    // If it contains the strict prefix, use that
    if (content.includes('###_SUGGESTIONS_###')) {
      const parts = content.split('###_SUGGESTIONS_###');
      mainContent = parts[0].trim();
      sugLines = parts[1].split('\n').filter(line => line.trim().startsWith('-'));
    } else {
      // Fallback: If AI disobeyed and wrote "Here are some suggestions:" instead
      const fallbackMatch = content.match(/\n\n.*(?:suggestions|follow-up|follow up).*\n((?:- .*\n?)+)$/i);
      if (fallbackMatch) {
        mainContent = content.slice(0, fallbackMatch.index).trim();
        sugLines = fallbackMatch[1].split('\n').filter(line => line.trim().startsWith('-'));
      }
    }
  }

  div.innerHTML = `
    ${getAvatarHTML(role)}
    <div class="message-content">${formatContent(mainContent)}</div>
  `;
  wrapper.appendChild(div);

  // Parse code blocks to add header and copy buttons
  if (role === 'assistant') {
    enhanceCodeBlocks(div);
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-action-btn';
  copyBtn.title = 'Copy';
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(content).then(() => {
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      showToast('Copied to clipboard');
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    });
  });
  actions.appendChild(copyBtn);

  // Regenerate button (only for assistant messages)
  if (role === 'assistant') {
    const regenBtn = document.createElement('button');
    regenBtn.className = 'msg-action-btn';
    regenBtn.title = 'Regenerate';
    regenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    regenBtn.addEventListener('click', () => regenerateLastResponse());
    actions.appendChild(regenBtn);
  }

  wrapper.appendChild(actions);

  if (sugLines.length > 0) {
    const sugContainer = document.createElement('div');
    sugContainer.className = 'suggestions-chips-container';
    // Indent to align with the message text bubble horizontally
    sugContainer.style.marginLeft = '40px'; 
    sugLines.forEach(line => {
      const cleanSug = line.replace(/^- /, '').replace(/\*\*/g, '').trim();
      const btn = document.createElement('button');
      btn.className = 'suggestion-chip-btn';
      btn.textContent = cleanSug;
      btn.addEventListener('click', () => {
         const messageInputEl = document.getElementById('messageInput');
         messageInputEl.value = cleanSug;
         document.querySelector('.send-btn').click();
      });
      sugContainer.appendChild(btn);
    });
    wrapper.appendChild(sugContainer);
  }

  messagesContainer.appendChild(wrapper);

  // Render Mathematical Equations / LaTeX (like ChatGPT)
  if (typeof renderMathInElement === 'function') {
    try {
      renderMathInElement(wrapper, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.error('KaTeX rendering error:', e);
    }
  }
}

// ===== Toast =====
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ===== Regenerate =====
async function regenerateLastResponse() {
  if (isMainTyping || !currentChatId) return;
  // Find last user message from DOM
  const allMsgs = messagesContainer.querySelectorAll('.message-wrapper');
  let lastUserContent = '';
  for (let i = allMsgs.length - 1; i >= 0; i--) {
    const msg = allMsgs[i].querySelector('.message.user');
    if (msg) {
      // Read from data-attribute (preserves markdown & file links)
      lastUserContent = allMsgs[i].dataset.originalContent || msg.querySelector('.message-content').textContent;
      break;
    }
  }
  if (!lastUserContent) return;

  // Remove last AI message
  const lastWrapper = allMsgs[allMsgs.length - 1];
  if (lastWrapper && lastWrapper.querySelector('.message.assistant')) {
    lastWrapper.remove();
  }

  isMainTyping = true;
  showTypingIndicator();

  try {
    // FIX BUG #7: Pass current model and settings so regenerate respects user's chosen model
    const result = await API.sendMessage(
      currentChatId,
      lastUserContent,
      settings.currentModel,
      settings.customInstructions,
      settings.unrestrictedMode,
      settings.truthMode,
      isDeepResearchEnabled
    );
    removeTypingIndicator();
    isMainTyping = false;

    if (result.error) {
      appendMessage('assistant', `Warning: ${result.error}`);
      scrollToBottom(chatArea);
      return;
    }

    appendMessage('assistant', result.aiMessage.content);
    showToast('Response regenerated');
  } catch (err) {
    removeTypingIndicator();
    isMainTyping = false;
    appendMessage('assistant', 'Sorry, something went wrong. Please try again.');
    scrollToBottom(chatArea);
  }
}

function getUserInitial() {
  if (currentUser && currentUser.name) {
    return currentUser.name.charAt(0).toUpperCase();
  }
  return 'G';
}

function showTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typingIndicator';
  div.innerHTML = `
    ${getAvatarHTML('assistant')}
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  messagesContainer.appendChild(div);
  scrollToBottom(chatArea);
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

// ===== Send Main Message =====
async function sendMainMessage() {
  const content = messageInput.value.trim();
  if ((!content && attachedFiles.length === 0) || isMainTyping) return;

  // Guest limit removed as per request - Unlimited access for all users

  if (!currentChatId) {
    const chat = await API.createChat();
    chats.unshift(chat);
    currentChatId = chat.id;
    renderChatList();
  }

  hideWelcome();

  // Upload files to server if any
  let uploadedFiles = [];
  if (attachedFiles.length > 0) {
    try {
      const uploadResult = await API.uploadFiles(attachedFiles);
      uploadedFiles = uploadResult.files || [];
    } catch (err) {
      showToast('File upload failed');
    }
  }

  // Build message with uploaded file links
  let fullContent = content;
  if (uploadedFiles.length > 0) {
    const fileRefs = uploadedFiles.map(f => {
      if (f.type && f.type.startsWith('image/')) {
        return `[Image: ${f.name}](${f.url})`;
      }
      return `[Attachment: ${f.name}](${f.url}) (${formatFileSize(f.size)})`;
    }).join('\n');
    fullContent = content ? `${fileRefs}\n\n${content}` : fileRefs;
  }

  messageInput.value = '';
  autoResizeTextarea(messageInput);
  attachedFiles = [];
  renderAttachedFiles();
  updateSendBtnState();

  appendMessage('user', fullContent);
  scrollToBottom(chatArea);

  isMainTyping = true;
  showTypingIndicator();

  try {
    // Check for image generation keywords to show animation
    let imageLoader = null;
    if (/draw|create image|generate image|imagine|paint|bomma|veyyi|pic|photo|image|చిత్రం/i.test(fullContent)) {
      imageLoader = showImageLoadingAnimation();
    }

    const result = await API.sendMessage(
      currentChatId, 
      fullContent, 
      settings.currentModel, 
      settings.customInstructions, 
      settings.unrestrictedMode, 
      settings.truthMode,
      isDeepResearchEnabled
    );
    
    if (imageLoader) imageLoader.remove();
    removeTypingIndicator();
    isMainTyping = false;

    if (result.error) {
      appendMessage('assistant', `Warning: ${result.error}`);
      return;
    }

    appendMessage('assistant', result.aiMessage.content);

    if (result.chat) {
      const chat = chats.find(c => c.id === currentChatId);
      if (chat && chat.title !== result.chat.title) {
        chat.title = result.chat.title;
        renderChatList(searchInput.value.trim());
      }
    }
  } catch (err) {
    removeTypingIndicator();
    isMainTyping = false;
    appendMessage('assistant', 'Sorry, something went wrong. Please try again.');
    scrollToBottom(chatArea);
  }
}

// ===== Main Input Handlers =====
messageInput.addEventListener('input', () => {
  autoResizeTextarea(messageInput);
  updateSendBtnState();
});

messageInput.addEventListener('keydown', (e) => {
  const shouldSendEnter = settings.enterToSend !== false; // default true
  if (e.key === 'Enter' && !e.shiftKey && shouldSendEnter) {
    e.preventDefault();
    sendMainMessage();
  }
  if (e.key === 'Enter' && e.ctrlKey && !shouldSendEnter) {
    e.preventDefault();
    sendMainMessage();
  }
});

sendBtn.addEventListener('click', sendMainMessage);

function updateSendBtnState() {
  sendBtn.disabled = !messageInput.value.trim() && attachedFiles.length === 0;
}

// ===== File Upload =====
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const attachedFilesContainer = document.getElementById('attachedFiles');
let attachedFiles = [];

const attachMenu = document.getElementById('attachMenu');
const attachPhotoBtn = document.getElementById('attachPhotoBtn');
const attachDocBtn = document.getElementById('attachDocBtn');

attachBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  attachMenu.classList.toggle('open');
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (attachMenu && attachMenu.classList.contains('open') && !e.target.closest('#attachMenuContainer')) {
    attachMenu.classList.remove('open');
  }
});

attachPhotoBtn.addEventListener('click', () => {
  fileInput.accept = 'image/*,video/*';
  fileInput.click();
  attachMenu.classList.remove('open');
});

attachDocBtn.addEventListener('click', () => {
  fileInput.accept = '.txt,.json,.md,.js,.py,.html,.css,.csv,.log,.c,.cpp,.java,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';
  fileInput.click();
  attachMenu.classList.remove('open');
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    if (attachedFiles.length >= 5) {
      showToast('Maximum 5 files allowed');
      return;
    }
    attachedFiles.push(file);
  });
  renderAttachedFiles();
  updateSendBtnState();
  fileInput.value = '';
});

function renderAttachedFiles() {
  attachedFilesContainer.innerHTML = '';
  attachedFiles.forEach((file, index) => {
    const fileEl = document.createElement('div');
    fileEl.className = 'attached-file';

    const icon = getFileIcon(file.type);
    const size = formatFileSize(file.size);

    fileEl.innerHTML = `
      <span>${icon}</span>
      <span class="attached-file-name">${escapeHtml(file.name)}</span>
      <span style="color: var(--text-muted); font-size: 11px;">(${size})</span>
      <button class="attached-file-remove" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    fileEl.querySelector('.attached-file-remove').addEventListener('click', () => {
      attachedFiles.splice(index, 1);
      renderAttachedFiles();
      updateSendBtnState();
    });

    attachedFilesContainer.appendChild(fileEl);
  });
}

function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
  if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('xml')) return '📝';
  return '📎';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== Mini Chat =====
miniChatToggle.addEventListener('click', async () => {
  miniChatToggle.classList.add('hidden');
  miniChat.classList.add('open');
  if (currentChatId) {
    await loadMiniMessages();
  }
  miniMessageInput.focus();
});

miniChatClose.addEventListener('click', () => {
  miniChat.classList.remove('open');
  miniChatToggle.classList.remove('hidden');
});

async function loadMiniMessages() {
  if (!currentChatId) {
    miniChatMessages.innerHTML = `<div class="mini-welcome"><p>Start a chat first, then ask your doubts here!</p></div>`;
    return;
  }

  const messages = await API.getMiniMessages(currentChatId);
  if (messages.length === 0) {
    miniChatMessages.innerHTML = `<div class="mini-welcome"><p>Ask any doubt about the conversation. I'll help you understand!</p></div>`;
  } else {
    miniChatMessages.innerHTML = '';
    messages.forEach(msg => {
      appendMiniMessage(msg.role, msg.content);
    });
    scrollToBottom(miniChatMessages);
  }
}

function appendMiniMessage(role, content) {
  const welcome = miniChatMessages.querySelector('.mini-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `mini-message ${role}`;
  div.innerHTML = `
    ${getMiniAvatarHTML(role)}
    <div class="mini-message-content">${formatContent(content)}</div>
  `;
  
  if (role === 'assistant') {
    enhanceCodeBlocks(div);
  }
  
  miniChatMessages.appendChild(div);
}

function showMiniTyping() {
  const div = document.createElement('div');
  div.className = 'mini-typing';
  div.id = 'miniTypingIndicator';
  div.innerHTML = `
    ${getMiniAvatarHTML('assistant')}
    <div class="mini-typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  miniChatMessages.appendChild(div);
  scrollToBottom(miniChatMessages);
}

function removeMiniTyping() {
  const el = document.getElementById('miniTypingIndicator');
  if (el) el.remove();
}

async function sendMiniMessage() {
  const content = miniMessageInput.value.trim();
  if (!content || isMiniTyping || !currentChatId) return;

  miniMessageInput.value = '';
  autoResizeTextarea(miniMessageInput);
  updateMiniSendBtnState();

  appendMiniMessage('user', content);
  scrollToBottom(miniChatMessages);

  isMiniTyping = true;
  showMiniTyping();

  try {
    const result = await API.sendMiniMessage(currentChatId, content, settings.unrestrictedMode, settings.truthMode);
    removeMiniTyping();
    isMiniTyping = false;

    if (result.error) {
      appendMiniMessage('assistant', `Warning: ${result.error}`);
      scrollToBottom(miniChatMessages);
      return;
    }

    appendMiniMessage('assistant', result.aiMessage.content);
    scrollToBottom(miniChatMessages);
  } catch (err) {
    removeMiniTyping();
    isMiniTyping = false;
    appendMiniMessage('assistant', 'Sorry, something went wrong. Please try again.');
    scrollToBottom(miniChatMessages);
  }
}

miniMessageInput.addEventListener('input', () => {
  autoResizeTextarea(miniMessageInput);
  updateMiniSendBtnState();
});

miniMessageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMiniMessage();
  }
});

miniSendBtn.addEventListener('click', sendMiniMessage);

function updateMiniSendBtnState() {
  miniSendBtn.disabled = !miniMessageInput.value.trim();
}

// ===== Settings Modal =====
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('open');
});

settingsClose.addEventListener('click', () => {
  settingsModal.classList.remove('open');
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.remove('open');
  }
});

// Clear all chats
clearAllChatsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('open');
  showConfirm('Are you sure you want to delete ALL chats? This action cannot be undone.', async () => {
    try {
      await API.clearAllChats();
      chats = [];
      currentChatId = null;
      searchInput.value = '';
      renderChatList();
      showWelcome();
      if (miniChat.classList.contains('open')) {
        miniChatMessages.innerHTML = `<div class="mini-welcome"><p>Ask any doubt about the conversation. I'll help you understand!</p></div>`;
      }
    } catch(err) {
      showToast('Failed to clear chats. Try again.');
    }
  });
});

// ===== Model Selector =====
modelSelectorBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  modelDropdown.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.model-selector')) {
    modelDropdown.classList.remove('open');
  }
});

document.querySelectorAll('.model-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    const model = opt.dataset.model;
    settings.currentModel = model;
    // Get only the main text, not the badge text
    const nameEl = opt.querySelector('.model-option-name');
    const nameText = nameEl.childNodes[0].textContent.trim();
    modelName.textContent = nameText;
    modelDropdown.classList.remove('open');
    saveSettings();
    showToast('Model changed to ' + nameText);
  });
});

// ===== Font Size =====
fontSizeSelect.addEventListener('change', () => {
  settings.fontSize = fontSizeSelect.value;
  applyFontSize();
  saveSettings();
});

function applyFontSize() {
  document.body.classList.remove('font-small', 'font-large');
  if (settings.fontSize === 'small') document.body.classList.add('font-small');
  else if (settings.fontSize === 'large') document.body.classList.add('font-large');
}

// ===== Enter to Send Toggle =====
enterToSendToggle.addEventListener('change', () => {
  settings.enterToSend = enterToSendToggle.checked;
  saveSettings();
});

// ===== Unrestricted Mode Toggle =====
unrestrictedModeToggle.addEventListener('change', () => {
  settings.unrestrictedMode = unrestrictedModeToggle.checked;
  saveSettings();
});

// ===== Truth Mode Toggle =====
truthModeToggle.addEventListener('change', () => {
  settings.truthMode = truthModeToggle.checked;
  saveSettings();
});

// ===== Custom Instructions =====
customInstructionsInput.addEventListener('change', () => {
  settings.customInstructions = customInstructionsInput.value;
  saveSettings();
});

// ===== Language Select (UI only — more languages coming soon) =====
const langSelectEl = document.getElementById('langSelect');
if (langSelectEl) {
  langSelectEl.addEventListener('change', () => {
    langSelectEl.value = 'en'; // reset — only English supported now
    showToast('More languages coming soon!');
  });
}

// ===== Export Data =====
exportDataBtn.addEventListener('click', async () => {
  try {
    const allChats = await API.getChats();
    const exportData = { chats: [], exported_at: new Date().toISOString() };

    for (const chat of allChats) {
      const messages = await API.getMessages(chat.id);
      const miniMessages = await API.getMiniMessages(chat.id);
      exportData.chats.push({
        ...chat,
        messages,
        mini_messages: miniMessages,
      });
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartai-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully');
  } catch (err) {
    showToast('Export failed');
  }
});

// ===== Save/Load Settings =====
function saveSettings() {
  localStorage.setItem('smartai_settings', JSON.stringify(settings));
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('smartai_settings');
    if (saved) {
      Object.assign(settings, JSON.parse(saved));
    }
    // Apply settings to UI
    themeSelect.value = settings.theme || 'light';
    applyTheme();
    fontSizeSelect.value = settings.fontSize;
    applyFontSize();
    enterToSendToggle.checked = settings.enterToSend;
    unrestrictedModeToggle.checked = settings.unrestrictedMode;
    truthModeToggle.checked = settings.truthMode;
    customInstructionsInput.value = settings.customInstructions;
    // Model
    const modelDisplayNames = {
      'smart-ai-1': 'Samba AI 1.0',
      'smart-ai-2': 'Samba AI 2.0 Pro',
      'nvidia-nemotron': 'Samba AI Ultra'
    };
    modelName.textContent = modelDisplayNames[settings.currentModel] || 'Samba AI 1.0';
    document.querySelectorAll('.model-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.model === settings.currentModel);
    });
  } catch (e) {
    // ignore
  }
}

themeSelect.addEventListener('change', () => {
  settings.theme = themeSelect.value;
  saveSettings();
  applyTheme();
});

function applyTheme() {
  if (settings.theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

// ===== User Panel (profile popup) =====
const userPanel = document.getElementById('userPanel');
const userPanelAvatar = document.getElementById('userPanelAvatar');
const userPanelName = document.getElementById('userPanelName');
const userPanelEmail = document.getElementById('userPanelEmail');
const userPanelSignout = document.getElementById('userPanelSignout');

function openUserPanel() {
  // Sync panel with current user data
  if (currentUser) {
    const initials = (currentUser.name || currentUser.email || 'U')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    userPanelAvatar.textContent = initials;
    userPanelName.textContent = currentUser.name || 'User';
    userPanelEmail.textContent = currentUser.email || '';
  }
  userPanel.classList.add('open');
  userProfile.classList.add('panel-open');
}

function closeUserPanel() {
  userPanel.classList.remove('open');
  userProfile.classList.remove('panel-open');
}

// ===== Login Modal =====
userProfile.addEventListener('click', (e) => {
  e.stopPropagation();
  if (currentUser) {
    if (userPanel.classList.contains('open')) {
      closeUserPanel();
    } else {
      openUserPanel();
    }
  } else {
    loginModal.classList.add('open');
  }
});

// Sign out from panel
userPanelSignout.addEventListener('click', async () => {
  closeUserPanel();
  try { await API.logout(); } catch (e) { /* ignore */ }
  currentUser = null;
  localStorage.removeItem('smartai_user');
  updateUserUI();
  currentChatId = null;
  showWelcome();
  showToast('Signed out');
});

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (userPanel.classList.contains('open') && !userPanel.contains(e.target) && !userProfile.contains(e.target)) {
    closeUserPanel();
  }
});


// Auth Mode Toggle
let isSignUpMode = false;
const toggleAuthMode = document.getElementById('toggleAuthMode');
const nameGroup = document.getElementById('nameGroup');
const loginModalSubtitle = document.getElementById('loginModalSubtitle');
const registerBtn = document.getElementById('registerBtn');

loginClose.addEventListener('click', () => {
  loginModal.classList.remove('open');
});

loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) loginModal.classList.remove('open');
});

toggleAuthMode.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUpMode = !isSignUpMode;
  if (isSignUpMode) {
    nameGroup.style.display = 'block';
    loginSubmit.style.display = 'none';
    registerBtn.style.display = 'block';
    loginModalSubtitle.textContent = 'Create a new account';
    toggleAuthMode.textContent = 'Already have an account? Sign in';
    document.querySelector('#loginModal h2').textContent = 'Sign Up';
  } else {
    nameGroup.style.display = 'none';
    loginSubmit.style.display = 'block';
    registerBtn.style.display = 'none';
    loginModalSubtitle.textContent = 'Sign in to your account';
    toggleAuthMode.textContent = 'Need an account? Sign up';
    document.querySelector('#loginModal h2').textContent = 'Sign In';
  }
});

loginSubmit.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email) {
    document.getElementById('loginEmail').focus();
    return;
  }
  if (!password) {
    document.getElementById('loginPassword').focus();
    return;
  }
  try {
    const result = await API.login(email, password);
    if (result.error) {
      showToast(result.error);
      return;
    }
    currentUser = result.user;
    localStorage.setItem('smartai_user', JSON.stringify(currentUser));
    localStorage.removeItem('smartai_guest_count'); // reset guest message limit
    updateUserUI();
    loginModal.classList.remove('open');
    showToast('Signed in successfully');
  } catch (err) {
    showToast('Login failed. Check your connection.');
  }
});

// ===== Google Sign-In Handler =====
async function handleGoogleCredentialResponse(response) {
  try {
    const result = await API.loginWithGoogle(response.credential);
    if (result.error) {
      showToast(result.error);
      return;
    }
    currentUser = result.user;
    localStorage.setItem('smartai_user', JSON.stringify(currentUser));
    localStorage.removeItem('smartai_guest_count'); // reset guest message limit
    updateUserUI();
    loginModal.classList.remove('open');
    showToast('Signed in with Google successfully');
  } catch (err) {
    console.error('Google Auth Error:', err);
    showToast('Google login failed: ' + (err.message || 'Check your connection.'));
  }
}

// Initialize Google Auth when script loads
window.addEventListener('load', () => {
  setTimeout(() => {
    if (window.google) {
      google.accounts.id.initialize({
        client_id: "934282490318-runko93pndtjqs6aas9jqbb53ti6pv6a.apps.googleusercontent.com",
        callback: handleGoogleCredentialResponse
      });
      google.accounts.id.renderButton(
        document.getElementById("googleSignInDiv"),
        { theme: "outline", size: "large", type: "standard", width: 280 }
      );
    }
  }, 1000); // Small delay to ensure Google SDK is fully loaded
});

// Register button
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
    const name = document.getElementById('loginName').value.trim();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!name) { document.getElementById('loginName').focus(); return; }
    if (!email) { document.getElementById('loginEmail').focus(); return; }
    if (!password || password.length < 6) {
      showToast('Password must be at least 6 characters');
      return;
    }
    try {
      const result = await API.register(name, email, password);
      if (result.error) {
        showToast(result.error);
        return;
      }
      currentUser = result.user;
      localStorage.setItem('smartai_user', JSON.stringify(currentUser));
      updateUserUI();
      loginModal.classList.remove('open');
      showToast('Account created successfully');
    } catch (err) {
      showToast('Registration failed. Check your connection.');
    }
  });
}



loginGuest.addEventListener('click', () => {
  loginModal.classList.remove('open');
});

function updateUserUI() {
  if (currentUser) {
    const displayName = currentUser.name || currentUser.email || 'User';
    userName.textContent = displayName;
    userEmail.textContent = currentUser.email || 'Signed in';
    userAvatar.textContent = displayName.charAt(0).toUpperCase();
    
    // Tiered feature access
    const isAdmin = currentUser.email === 'prudhvisiva03@gmail.com';
    const isPro = currentUser.isPremium && (currentUser.planType === 'pro' || currentUser.planType === 'truth');
    const isTruth = currentUser.isPremium && currentUser.planType === 'truth';

    if (isPro || isAdmin) {
      securityModeContainer.style.display = 'flex';
    } else {
      securityModeContainer.style.display = 'none';
      settings.unrestrictedMode = false;
      unrestrictedModeToggle.checked = false;
    }

    if (isTruth || isAdmin) {
      truthModeContainer.style.display = 'flex';
    } else {
      truthModeContainer.style.display = 'none';
      settings.truthMode = false;
      truthModeToggle.checked = false;
    }
    saveSettings();
  } else {
    userName.textContent = 'Guest';
    userEmail.textContent = 'Click to sign in';
    userAvatar.textContent = 'G';
    securityModeContainer.style.display = 'none';
    truthModeContainer.style.display = 'none';
    settings.unrestrictedMode = false;
    settings.truthMode = false;
    unrestrictedModeToggle.checked = false;
    truthModeToggle.checked = false;
  }

  // Reload chats for this account (critical for user-scoped history)
  currentChatId = null;
  showWelcome();
  API.getChats().then(freshChats => {
    chats = freshChats;
    renderChatList();
  }).catch(() => {});
}

// Load user from localStorage
function loadUser() {
  try {
    const saved = localStorage.getItem('smartai_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      updateUserUI();
    }
  } catch (e) {
    // ignore
  }
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'h') {
    e.preventDefault();
    if (miniChat.classList.contains('open')) {
      miniChatClose.click();
    } else {
      miniChatToggle.click();
    }
  }
  // Escape closes any open modal
  if (e.key === 'Escape') {
    if (settingsModal.classList.contains('open')) settingsModal.classList.remove('open');
    if (loginModal.classList.contains('open')) loginModal.classList.remove('open');
    if (confirmOverlay.classList.contains('open')) {
      confirmOverlay.classList.remove('open');
      confirmCallback = null;
    }
  }
});

// ===== Utility Functions =====
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--input-max-height')) || 200) + 'px';
}

function scrollToBottom(element) {
  requestAnimationFrame(() => {
    element.scrollTop = element.scrollHeight;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Ensure images don't break scroll position when they load
document.addEventListener('load', function(e) {
  if (e.target.tagName.toLowerCase() === 'img' && chatArea.contains(e.target)) {
    scrollToBottom(chatArea);
  }
}, true); // use capture phase to catch load events on images

// Configure marked.js with highlight.js
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined') {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {}
        }
        return hljs.highlightAuto(code).value;
      }
      return code;
    }
  });
}

function formatContent(text) {
  if (typeof marked !== 'undefined') {
    try {
      const parsedHTML = marked.parse(text);
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(parsedHTML);
      }
      return parsedHTML;
    } catch (error) {
      console.error('Markdown parse error:', error);
    }
  }
  
  // Fallback if marked is not loaded
  let html = escapeHtml(text);
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ===== Initialize =====
async function init() {
  try {
    loadSettings();
    chatList.innerHTML = '<div style="padding: 16px 12px; color: var(--text-muted); font-size: 13px; text-align: center;">\u23f3 Loading...</div>';
    // ALWAYS verify session with server — never trust localStorage alone
    try {
      const session = await API.getMe();
      if (session.user) {
        // Server confirmed session valid ✅
        currentUser = session.user;
        localStorage.setItem('smartai_user', JSON.stringify(currentUser));
        updateUserUI();
      } else {
        // Session expired (server restart etc.) — clear stale localStorage
        const hadUser = localStorage.getItem('smartai_user');
        localStorage.removeItem('smartai_user');
        currentUser = null;
        updateUserUI();
        if (hadUser) {
          setTimeout(() => showToast('Session expired. Please sign in again.'), 500);
        }
      }
    } catch (e) {
      loadUser(); // Network error only — try localStorage
    }
    chats = await API.getChats();
    renderChatList();
    showWelcome();
  } catch (err) {
    console.error('Failed to initialize:', err);
    chatList.innerHTML = '<div style="padding: 16px 12px; color: #e88; font-size: 13px; text-align: center;">\u26a0\ufe0f Failed to load. Refresh the page.</div>';
  }
}

init();

// ===== Auto-Hint via Text Selection =====
const selectionBtn = document.createElement('button');
selectionBtn.className = 'selection-hint-btn';
selectionBtn.innerHTML = `Hint: Explain this`;
document.body.appendChild(selectionBtn);

let currentSelectedText = '';

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length > 0 && text.length < 150) {
    // Ensure the selection is within a message content
    let node = selection.anchorNode;
    let isInsideMessage = false;
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains('message-content')) {
        isInsideMessage = true;
        break;
      }
      node = node.parentNode;
    }

    if (isInsideMessage) {
      currentSelectedText = text;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Position the button centered above the selection
      selectionBtn.style.left = `${rect.left + (rect.width / 2)}px`;
      selectionBtn.style.top = `${rect.top - 44}px`;
      selectionBtn.classList.add('visible');
      return;
    }
  }
  
  selectionBtn.classList.remove('visible');
  currentSelectedText = '';
});

// Hide on mousedown anywhere else
document.addEventListener('mousedown', (e) => {
  if (e.target !== selectionBtn) {
    selectionBtn.classList.remove('visible');
  }
});

// Click the hint button
selectionBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // maintain selection context momentarily
  e.stopPropagation();
  
  if (!currentSelectedText) return;
  
  // Open mini chat if closed
  if (!miniChat.classList.contains('open')) {
    miniChatToggle.click();
  }
  
  // Pre-fill input and trigger auto-send
  miniMessageInput.value = `What does "${currentSelectedText}" mean?`;
  sendMiniMessage(); // Assume sendMiniMessage reads from miniMessageInput
  
  // Cleanup
  selectionBtn.classList.remove('visible');
  window.getSelection().removeAllRanges();
});

// ===== Premium / Upgrade System =====
const upgradeBtn = document.getElementById('upgradeBtn');
const upgradeBtnText = document.getElementById('upgradeBtnText');

function getPlanLabel(planType) {
  if (planType === 'truth') return 'Truth AI';
  if (planType === 'pro') return 'Direct AI';
  return 'Pro';
}

function updateUpgradeBtnState(isPremium, expiry, planType = 'free') {
  if (!upgradeBtn || !upgradeBtnText) return;

  if (isPremium && expiry) {
    const expiryDate = new Date(expiry);
    const formatted = expiryDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    upgradeBtnText.textContent = `${getPlanLabel(planType)} Active - Expires ${formatted}`;
    upgradeBtn.classList.add('pro-active');
  } else {
    upgradeBtnText.textContent = 'Upgrade Plans';
    upgradeBtn.classList.remove('pro-active');
  }
}

function openPremiumPlans(e) {
  if (e) e.preventDefault();
  window.location.href = '/premium';
}

if (upgradeBtn) {
  upgradeBtn.onclick = openPremiumPlans;
}

async function checkPremiumStatus() {
  try {
    const res = await fetch('/api/payment/status');
    const data = await res.json();
    updateUpgradeBtnState(data.isPremium, data.premiumExpiry, data.planType);
    if (data.isPremium) {
      settings.unrestrictedMode = true;
      settings.truthMode = data.planType === 'truth';
      const toggle = document.getElementById('unrestrictedMode');
      const toggle2 = document.getElementById('truthModeToggle');
      if (toggle) toggle.checked = true;
      if (toggle2) toggle2.checked = data.planType === 'truth';
      
      // We must also update currentUser in memory so the settings UI displays correctly
      if (currentUser) {
         currentUser.isPremium = true;
         currentUser.planType = data.planType || 'pro';
      }
      updateUserUI();
    }
  } catch (e) {}
}

// Check premium status on page load (immediately + after session loads)
checkPremiumStatus();
setTimeout(checkPremiumStatus, 1000);

function showImageLoadingAnimation() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper assistant';
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    ${getAvatarHTML('assistant')}
    <div class="message-content">
      <div class="image-generating-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>Samba AI is drawing your masterpiece...</span>
        <div class="shimmer-bar"></div>
      </div>
    </div>
  `;
  wrapper.appendChild(div);
  messagesContainer.appendChild(wrapper);
  scrollToBottom(messagesContainer);
  return wrapper;
}

// ===== AI DEBATE FEATURE =====
const aiDebateToggle = document.getElementById('aiDebateToggle');

const DEBATE_AIS = [
  { key: 'groq',   label: 'Groq (LLaMA 3.3)',             initials: 'GQ', role: 'Pragmatic Engineer' },
  { key: 'gemini', label: 'Gemini (Google)',               initials: 'GE', role: 'Creative Strategist' },
  { key: 'nvidia', label: 'NVIDIA Nemotron Ultra',         initials: 'NV', role: 'Research Scientist' },
  { key: 'gpt',    label: 'GPT-4o (OpenAI)',               initials: 'GP', role: 'Product Manager' },
  { key: 'claude', label: 'Claude 3.5 Sonnet (Anthropic)', initials: 'CL', role: "Devil's Advocate" }
];

async function startDebate(idea) {
  // First, append the user's idea as a normal chat message
  if (!currentChatId) {
    const chat = await API.createChat();
    chats.unshift(chat);
    currentChatId = chat.id;
    renderChatList();
  }
  hideWelcome();
  
  // Actually save the idea to the db as a user message
  await API.sendMessage(currentChatId, `[AI Debate Mode] Analyze this idea: ${idea}`);
  appendMessage('user', idea);
  scrollToBottom(chatArea);

  // Create the main wrapper for the debate output
  const debateWrapper = document.createElement('div');
  debateWrapper.className = `message-wrapper assistant-wrapper debate-flow-wrapper`;
  
  // Master container for the debate
  const debateContainer = document.createElement('div');
  debateContainer.className = 'message assistant debate-container';
  debateContainer.style.flexDirection = 'column';
  debateContainer.style.alignItems = 'stretch';
  debateContainer.style.padding = '16px';
  debateContainer.style.gap = '16px';
  debateContainer.style.width = '100%';
  debateContainer.style.maxWidth = '100%';
  debateContainer.style.background = 'transparent';
  debateContainer.style.border = 'none';
  
  // Header
  const header = document.createElement('div');
  header.className = 'debate-header-title';
  header.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <span>AI Debate Arena</span>
  `;
  debateContainer.appendChild(header);

  // Loading Bar
  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'debate-progress-wrap';
  loadingWrap.style.margin = '0';
  loadingWrap.innerHTML = `
    <div class="debate-progress-label" id="debateFlowLabel">Sending idea to AI panel...</div>
    <div class="debate-progress-track">
      <div class="debate-progress-fill" id="debateFlowFill" style="width: 5%"></div>
    </div>
  `;
  debateContainer.appendChild(loadingWrap);
  
  // Cards container
  const roundsContainer = document.createElement('div');
  roundsContainer.className = 'debate-rounds';
  roundsContainer.style.padding = '0';
  debateContainer.appendChild(roundsContainer);

  debateWrapper.appendChild(debateContainer);
  messagesContainer.appendChild(debateWrapper);
  scrollToBottom(chatArea);

  const setProgress = (pct, label) => {
    const fill = document.getElementById('debateFlowFill');
    const text = document.getElementById('debateFlowLabel');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = label;
  };

  try {
    const steps = [
      { pct: 15, msg: '🟣 Groq (LLaMA 3.3) is analyzing your idea...' },
      { pct: 30, msg: '🔵 Gemini is countering Groq\'s arguments...' },
      { pct: 50, msg: '🟢 NVIDIA Nemotron is adding deep research perspective...' },
      { pct: 65, msg: '🟩 GPT-4o is evaluating product-market fit...' },
      { pct: 85, msg: '🟧 Claude 3.5 is playing Devil\'s Advocate...' },
      { pct: 95, msg: '⭐ Synthesizing the final verdict...' }
    ];

    let stepIndex = 0;
    const progressTimer = setInterval(() => {
      if (stepIndex < steps.length) {
        setProgress(steps[stepIndex].pct, steps[stepIndex].msg);
        stepIndex++;
      } else {
        clearInterval(progressTimer);
      }
    }, 6000);

    const res = await fetch('/api/debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea })
    });

    clearInterval(progressTimer);
    const data = await res.json();

    if (data.error) {
      loadingWrap.innerHTML = `<span style="color:var(--text-error, #f87171);">Debate failed: ${data.error}</span>`;
      return;
    }

    setProgress(100, 'Debate complete!');
    setTimeout(() => { loadingWrap.style.display = 'none'; }, 800);

    // Save final synthesis to chat history so it persists
    await API.sendMessage(currentChatId, `[Debate Verdict Generated]\n${data.synthesis}`);

    // Render cards
    if (data.debates && data.debates.length > 0) {
      data.debates.forEach((debate, i) => {
        setTimeout(() => {
          const card = document.createElement('div');
          card.className = `debate-card ${debate.model}`;
          const parsed = typeof marked !== 'undefined' ? marked.parse(debate.response) : debate.response.replace(/\n/g, '<br>');
          card.innerHTML = `
            <div class="debate-card-header">
              <div class="debate-ai-avatar">${DEBATE_AIS.find(a => a.key === debate.model)?.initials || 'AI'}</div>
              <div>
                <div class="debate-ai-name">${debate.name}</div>
                <div class="debate-ai-role">${debate.role}</div>
              </div>
            </div>
            <div class="debate-card-body">${parsed}</div>
          `;
          roundsContainer.appendChild(card);
          scrollToBottom(chatArea);
        }, i * 400);
      });
    }

    // Render synthesis
    const synthDelay = (data.debates?.length || 0) * 400 + 600;
    setTimeout(() => {
      if (data.synthesis) {
        const synthCard = document.createElement('div');
        synthCard.className = 'debate-synthesis-card';
        synthCard.style.margin = '16px 0 0 0';
        const parsed = typeof marked !== 'undefined' ? marked.parse(data.synthesis) : data.synthesis.replace(/\n/g, '<br>');
        synthCard.innerHTML = `
          <div class="synthesis-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Final Verdict Synthesis
          </div>
          <div class="synthesis-body">${parsed}</div>
        `;
        debateContainer.appendChild(synthCard);
        scrollToBottom(chatArea);
      }
    }, synthDelay);

  } catch (err) {
    loadingWrap.innerHTML = `<span style="color:var(--text-error, #f87171);">Debate failed. Please try again.</span>`;
  }
}

// Trigger debate from the toggle button
if (aiDebateToggle) {
  aiDebateToggle.addEventListener('click', () => {
    const idea = messageInput.value.trim();
    if (!idea) {
      showToast('💡 Type your project idea first, then click AI Debate!');
      messageInput.focus();
      return;
    }
    
    // Clear input and send it
    messageInput.value = '';
    autoResizeTextarea(messageInput);
    updateSendBtnState();
    
    startDebate(idea);
  });
}
