// Vision Chat - GitHub Pages Frontend
// Uses a proxy URL that injects the token server-side
// The API_URL setting defaults to the Cloudflare Worker proxy we'll set up

const DEFAULT_API_URL = 'https://midking12-vision-gateway.hf.space/api/v1/run-task';
const HF_TOKEN = '__HF_TOKEN__';

// State
let state = {
    conversations: [],
    currentConvId: null,
    attachedImage: null,
    settings: {
        apiUrl: DEFAULT_API_URL,
        apiToken: HF_TOKEN,
        email: '',
        password: ''
    }
};

// Elements
const els = {};
function cacheEls() {
    [
        'sidebar', 'sidebarClose', 'menuBtn', 'overlay', 'newChat', 'chatHistory',
        'chatTitle', 'clearChat', 'messages', 'welcome', 'imagePreview', 'previewImg',
        'removeImage', 'attachBtn', 'fileInput', 'messageInput', 'sendBtn',
        'connectionStatus', 'settingsBtn', 'settingsModal', 'closeSettings',
        'apiUrl', 'apiToken', 'email', 'password'
    ].forEach(id => els[document.getElementById(id).id] = document.getElementById(id));
}

// Load state from localStorage
function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem('visionChat'));
        if (saved) {
            state.conversations = saved.conversations || [];
            state.settings = { ...state.settings, ...saved.settings };
        }
    } catch {}
    els.apiUrl.value = state.settings.apiUrl;
    els.apiToken.value = state.settings.apiToken;
    els.email.value = state.settings.email;
    els.password.value = state.settings.password;
}

function saveState() {
    localStorage.setItem('visionChat', JSON.stringify({
        conversations: state.conversations,
        settings: state.settings
    }));
}

// Chat history rendering
function renderHistory() {
    els.chatHistory.innerHTML = '';
    state.conversations.forEach((conv, i) => {
        const item = document.createElement('div');
        item.className = 'chat-history-item' + (conv.id === state.currentConvId ? ' active' : '');
        item.textContent = conv.title || 'New Chat';
        item.title = conv.title || 'New Chat';
        item.onclick = () => loadConversation(conv.id);
        els.chatHistory.appendChild(item);
    });
}

function loadConversation(id) {
    const conv = state.conversations.find(c => c.id === id);
    if (!conv) return;
    state.currentConvId = id;
    els.chatTitle.textContent = conv.title || 'New Chat';
    els.messages.innerHTML = '';
    els.welcome.style.display = conv.messages.length === 0 ? 'flex' : 'none';
    els.messages.style.display = conv.messages.length === 0 ? 'none' : 'flex';
    conv.messages.forEach(m => renderMessage(m));
    scrollToBottom();
    renderHistory();
    els.sidebar.classList.remove('open');
    els.overlay.classList.remove('active');
}

function newChat() {
    const conv = { id: Date.now().toString(), title: 'New Chat', messages: [] };
    state.conversations.unshift(conv);
    state.currentConvId = conv.id;
    els.chatTitle.textContent = 'New Chat';
    els.messages.innerHTML = '';
    els.welcome.style.display = 'flex';
    els.messages.style.display = 'none';
    saveState();
    renderHistory();
    els.sidebar.classList.remove('open');
    els.overlay.classList.remove('active');
}

function updateTitle(conv, msg) {
    if (conv.title === 'New Chat' && conv.messages.length <= 2) {
        conv.title = msg.substring(0, 40) + (msg.length > 40 ? '...' : '');
        els.chatTitle.textContent = conv.title;
        renderHistory();
    }
}

function getCurrentConv() {
    return state.conversations.find(c => c.id === state.currentConvId);
}

function renderMessage(msg, isStreaming = false) {
    const welcome = els.welcome;
    if (welcome.style.display !== 'none') {
        welcome.style.display = 'none';
        els.messages.style.display = 'flex';
    }

    if (msg.role === 'assistant' && isStreaming) {
        const existing = els.messages.querySelector('.message.assistant:last-child');
        if (existing) {
            existing.querySelector('.message-text').textContent = msg.content;
            scrollToBottom();
            return;
        }
    }

    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    if (msg.error) div.classList.add('error');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = msg.role === 'user'
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

    const content = document.createElement('div');
    content.className = 'message-content';

    if (msg.role === 'assistant') {
        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = 'Vision Assistant';
        content.appendChild(sender);
    }

    if (msg.image) {
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = msg.image;
        content.appendChild(img);
    }

    const text = document.createElement('div');
    text.className = 'message-text';

    if (msg.typing) {
        text.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    } else {
        text.textContent = msg.content;
    }

    content.appendChild(text);
    div.appendChild(avatar);
    div.appendChild(content);
    els.messages.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
}

// API call with image
async function sendMessage(text) {
    const conv = getCurrentConv();
    if (!conv) return;

    if (!state.settings.email || !state.settings.password) {
        renderMessage({
            role: 'assistant',
            content: '⚠️ Please set your Email and Password in Settings (gear icon bottom-left of sidebar) before sending requests.',
            error: true
        });
        return;
    }

    // Add user message
    const userMsg = { role: 'user', content: text, image: state.attachedImage };
    conv.messages.push(userMsg);
    renderMessage(userMsg);
    state.attachedImage = null;
    els.imagePreview.style.display = 'none';
    updateTitle(conv, text);

    // Add typing assistant msg
    const asstMsg = { role: 'assistant', content: '', typing: true };
    conv.messages.push(asstMsg);
    renderMessage(asstMsg);

    updateConnectionStatus('checking');

    try {
        const formData = new FormData();
        formData.append('email', state.settings.email);
        formData.append('password', state.settings.password);
        formData.append('message', text);

        if (state.settings.apiToken) {
            formData.append('token', state.settings.apiToken);
        }

        const resp = await fetch(state.settings.apiUrl, {
            method: 'POST',
            body: formData
        });

        const data = await resp.json();

        asstMsg.typing = false;

        if (data.status === 'success') {
            asstMsg.content = data.result || data.message || JSON.stringify(data, null, 2);
            updateConnectionStatus('online');
        } else if (data.status === 'queued') {
            asstMsg.content = 'Request queued. Checking status...';
            renderMessage(asstMsg);
            // Poll for result if task_id provided
            pollTaskResult(asstMsg, data.task_id);
            return;
        } else {
            asstMsg.content = `Error: ${data.message || data.error || 'Unknown error'}`;
            asstMsg.error = true;
            updateConnectionStatus('offline');
        }
    } catch (err) {
        asstMsg.typing = false;
        asstMsg.content = `Connection error: ${err.message}. Make sure the API endpoint is correct and accessible.`;
        asstMsg.error = true;
        updateConnectionStatus('offline');
    }

    renderMessage(asstMsg);
    saveState();
}

async function pollTaskResult(msgEl, taskId) {
    if (!taskId) return;
    const maxPolls = 60;
    let polls = 0;

    const poll = async () => {
        polls++;
        if (polls > maxPolls) {
            msgEl.content = 'Task timed out. Please try again.';
            msgEl.error = true;
            renderMessage(msgEl);
            saveState();
            return;
        }

        try {
            const resp = await fetch(`${state.settings.apiUrl}/status/${taskId}`);
            const data = await resp.json();

            if (data.status === 'completed') {
                msgEl.content = data.result || 'Task completed.';
                renderMessage(msgEl);
                saveState();
                updateConnectionStatus('online');
            } else if (data.status === 'failed') {
                msgEl.content = `Task failed: ${data.error || 'Unknown'}`;
                msgEl.error = true;
                renderMessage(msgEl);
                saveState();
            } else {
                setTimeout(poll, 3000);
            }
        } catch {
            setTimeout(poll, 3000);
        }
    };
    setTimeout(poll, 3000);
}

function updateConnectionStatus(status) {
    const dot = els.connectionStatus.querySelector('.status-dot');
    const text = els.connectionStatus.querySelector('.status-text');
    dot.classList.remove('offline', 'checking');
    if (status === 'online') {
        text.textContent = 'Connected';
    } else if (status === 'offline') {
        dot.classList.add('offline');
        text.textContent = 'Error';
    } else {
        dot.classList.add('checking');
        text.textContent = 'Sending...';
    }
}

// Health check
async function connectionHealth() {
    try {
        const resp = await fetch(state.settings.apiUrl.replace('/api/v1/run-task', '/health'));
        if (resp.ok) updateConnectionStatus('online');
        else updateConnectionStatus('offline');
    } catch {
        updateConnectionStatus('offline');
    }
}

// Auto-resize textarea
function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

// Event listeners
function initEvents() {
    // Sidebar
    els.menuBtn.onclick = () => {
        els.sidebar.classList.add('open');
        els.overlay.classList.add('active');
    };
    els.sidebarClose.onclick = () => {
        els.sidebar.classList.remove('open');
        els.overlay.classList.remove('active');
    };
    els.overlay.onclick = () => {
        els.sidebar.classList.remove('open');
        els.overlay.classList.remove('active');
    };

    // New chat
    els.newChat.onclick = newChat;
    els.clearChat.onclick = () => {
        const conv = getCurrentConv();
        if (conv) {
            conv.messages = [];
            conv.title = 'New Chat';
            els.chatTitle.textContent = 'New Chat';
            els.messages.innerHTML = '';
            els.welcome.style.display = 'flex';
            els.messages.style.display = 'none';
            saveState();
            renderHistory();
        }
    };

    // Input
    els.sendBtn.onclick = () => {
        const text = els.messageInput.value.trim();
        if (!text && !state.attachedImage) return;
        sendMessage(text);
        els.messageInput.value = '';
        autoResize(els.messageInput);
        els.sendBtn.disabled = true;
    };

    els.messageInput.addEventListener('input', () => {
        autoResize(els.messageInput);
        els.sendBtn.disabled = !els.messageInput.value.trim() && !state.attachedImage;
    });

    els.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            els.sendBtn.click();
        }
    });

    // File attachment
    els.attachBtn.onclick = () => els.fileInput.click();
    els.fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            state.attachedImage = ev.target.result;
            els.previewImg.src = ev.target.result;
            els.imagePreview.style.display = 'inline-block';
            els.sendBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    };
    els.removeImage.onclick = () => {
        state.attachedImage = null;
        els.imagePreview.style.display = 'none';
        els.fileInput.value = '';
        els.sendBtn.disabled = !els.messageInput.value.trim();
    };

    // Quick actions
    document.querySelectorAll('.quick-action').forEach(btn => {
        btn.onclick = () => {
            els.messageInput.value = btn.dataset.suggest;
            autoResize(els.messageInput);
            els.sendBtn.disabled = false;
            els.messageInput.focus();
        };
    });

    // Settings
    els.settingsBtn.onclick = () => els.settingsModal.classList.add('active');
    els.closeSettings.onclick = () => els.settingsModal.classList.remove('active');
    els.settingsModal.addEventListener('click', (e) => {
        if (e.target === els.settingsModal) els.settingsModal.classList.remove('active');
    });

    const saveSettings = () => {
        state.settings.apiUrl = els.apiUrl.value.trim() || DEFAULT_API_URL;
        state.settings.apiToken = els.apiToken.value.trim();
        state.settings.email = els.email.value.trim();
        state.settings.password = els.password.value.trim();
        saveState();
    };

    [els.apiUrl, els.apiToken, els.email, els.password].forEach(input => {
        input.addEventListener('input', saveSettings);
        input.addEventListener('change', saveSettings);
    });
}

// Init
async function init() {
    cacheEls();
    loadState();
    renderHistory();
    initEvents();

    if (state.conversations.length === 0) {
        newChat();
    } else {
        loadConversation(state.conversations[0].id);
    }

    await connectionHealth();
    setInterval(connectionHealth, 30000);
}

document.addEventListener('DOMContentLoaded', init);
