const params = new URLSearchParams(window.location.search);
const token = params.get('token');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const typingIndicator = document.getElementById('typing-indicator');

const botNameEl = document.getElementById('bot-name');
const botDescEl = document.getElementById('bot-description');
const botPersonalityEl = document.getElementById('bot-personality');
const botLanguageEl = document.getElementById('bot-language');

let botData = null;

function getSessionStorageKey() {
    return token ? `publicSessionId_${token}` : 'publicSessionId_fallback';
}

function getOrCreateSessionId() {
    const storageKey = getSessionStorageKey();
    let existingSessionId = localStorage.getItem(storageKey);

    if (existingSessionId) {
        return existingSessionId;
    }

    let newSessionId = '';

    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        newSessionId = window.crypto.randomUUID();
    } else {
        newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    localStorage.setItem(storageKey, newSessionId);
    return newSessionId;
}

const sessionId = getOrCreateSessionId();

function scrollChatToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function addUserMessage(text) {
    if (!chatMessages) {
        return;
    }

    const msg = document.createElement('div');
    msg.className = 'chat-bubble user';
    msg.textContent = text;
    chatMessages.appendChild(msg);
    scrollChatToBottom();
}

function addBotMessage(text) {
    if (!chatMessages) {
        return;
    }

    const msg = document.createElement('div');
    msg.className = 'chat-bubble bot';
    msg.textContent = text;
    chatMessages.appendChild(msg);
    scrollChatToBottom();
}

async function loadBot() {
    if (!token) {
        addBotMessage('Invalid bot link.');
        return;
    }

    try {
        const res = await fetch(`/api/bot/public/${token}`);

        if (!res.ok) {
            addBotMessage('This bot is not available.');
            return;
        }

        const bot = await res.json();
        botData = bot;

        if (botNameEl) {
            botNameEl.textContent = bot.name || 'Bot';
        }

        if (botDescEl) {
            botDescEl.textContent = bot.description || 'Ask me anything';
        }

        if (botPersonalityEl) {
            botPersonalityEl.textContent = bot.personality || 'Professional';
        }

        if (botLanguageEl) {
            botLanguageEl.textContent = bot.language || 'English';
        }

        addBotMessage(`Hi! I’m ${bot.name || 'your bot'}. How can I help you?`);
    } catch (err) {
        console.error(err);
        addBotMessage('Unable to load this bot right now.');
    }
}

async function sendMessage() {
    const message = chatInput ? chatInput.value.trim() : '';

    if (!message) {
        return;
    }

    addUserMessage(message);

    if (chatInput) {
        chatInput.value = '';
        chatInput.focus();
    }

    if (typingIndicator) {
        typingIndicator.classList.remove('hidden');
    }

    try {
        const res = await fetch(`/api/bot/publicChat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token,
                message,
                sessionId
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Public chat failed');
        }

        const reply = await res.text();

        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
        }

        addBotMessage(reply || 'I could not generate a response.');
    } catch (err) {
        console.error(err);

        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
        }

        addBotMessage('Error connecting to bot.');
    }
}

if (chatSend) {
    chatSend.addEventListener('click', sendMessage);
}

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

loadBot();