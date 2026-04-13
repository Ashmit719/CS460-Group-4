let allBots = [];

function requireUser() {
    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

function getPublicUrl(bot) {
    if (!bot.publicToken) {
        return '';
    }
    return `${window.location.origin}/public-bot.html?token=${bot.publicToken}`;
}

function createBotCard(bot) {
    const publishBadgeClass = bot.published ? 'published' : 'draft';
    const publishBadgeText = bot.published ? 'Published' : 'Draft';
    const publicUrl = getPublicUrl(bot);

    return `
        <div class="bot-card">
            <div class="bot-card-top">
                <div>
                    <h3>${bot.name}</h3>
                    <p>${bot.url || ''}</p>
                </div>
                <span class="status-badge ${publishBadgeClass}">${publishBadgeText}</span>
            </div>

            <div class="bot-card-meta">
                <span>Updated recently</span>
                <span>ID: ${bot.id}</span>
            </div>

            ${
                bot.published && publicUrl
                    ? `
                    <div class="bot-public-link-row">
                        <input
                            class="bot-public-link"
                            type="text"
                            value="${publicUrl}"
                            readonly
                        >
                    </div>
                    `
                    : `
                    <div class="bot-public-link-row">
                        <span class="bot-draft-text">
                            Publish this bot to get a shareable link.
                        </span>
                    </div>
                    `
            }

            <div class="bot-card-actions">
                <button class="btn btn-secondary btn-small edit-btn" data-id="${bot.id}">
                    Edit
                </button>

                ${
                    bot.published && publicUrl
                        ? `
                        <button class="btn btn-primary btn-small open-public-btn" data-url="${publicUrl}">
                            Open Bot
                        </button>
                        `
                        : `
                        <button class="btn btn-primary btn-small open-builder-btn" data-id="${bot.id}">
                            Open
                        </button>
                        <button class="btn btn-secondary btn-small publish-btn" data-id="${bot.id}">
                            Publish
                        </button>
                        `
                }
            </div>
        </div>
    `;
}

function saveSelectedBot(bot, mode) {
    localStorage.setItem('selectedBot', JSON.stringify(bot));
    localStorage.setItem('selectedBotId', String(bot.id));
    localStorage.setItem('selectedBotUrl', bot.url || '');
    localStorage.setItem('botMode', mode);
}

function filterBots(query) {
    const q = (query || '').toLowerCase();

    return allBots.filter((bot) => {
        const botName = (bot.name || '').toLowerCase();
        const botUrl = (bot.url || '').toLowerCase();
        return botName.includes(q) || botUrl.includes(q);
    });
}

function renderBots(bots) {
    const botGrid = document.getElementById('bot-grid');

    if (!botGrid) {
        return;
    }

    if (!bots.length) {
        botGrid.innerHTML = `
            <div class="empty-bot-card">
                <div class="empty-icon">＋</div>
                <h3>Create New Bot</h3>
                <p>Start building your chatbot in minutes</p>
                <a href="create-bot.html?mode=create" class="btn btn-primary">Create Bot</a>
            </div>
        `;
        return;
    }

    const createCard = `
        <div class="empty-bot-card">
            <div class="empty-icon">＋</div>
            <h3>Create New Bot</h3>
            <p>Start building your chatbot in minutes</p>
            <a href="create-bot.html?mode=create" class="btn btn-primary">Create Bot</a>
        </div>
    `;

    botGrid.innerHTML = bots.map(createBotCard).join('') + createCard;
    attachBotCardEvents(bots);
}

async function fetchBotsForCurrentUser() {
    const user = requireUser();
    if (!user) {
        return [];
    }

    const res = await fetch(`http://localhost:8080/api/bot/user/${user.id}`);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to load bots');
    }

    return res.json();
}

async function refreshBots() {
    allBots = await fetchBotsForCurrentUser();

    const searchInput = document.getElementById('bot-search');
    const currentQuery = searchInput ? searchInput.value : '';
    renderBots(filterBots(currentQuery));
}

async function publishBot(botId) {
    const user = requireUser();
    if (!user) {
        return;
    }

    const publishBtn = document.querySelector(`.publish-btn[data-id="${botId}"]`);
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing...';
    }

    try {
        const res = await fetch(
            `http://localhost:8080/api/bot/publish/${botId}?userId=${user.id}`,
            { method: 'POST' }
        );

        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Failed to publish bot');
        }

        await refreshBots();
    } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to publish bot');
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Publish';
        }
    }
}

function attachBotCardEvents(bots) {
    document.querySelectorAll('.edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const botId = Number(btn.dataset.id);
            const bot = bots.find((b) => b.id === botId);

            if (!bot) {
                alert('Bot not found');
                return;
            }

            saveSelectedBot(bot, 'edit');
            window.location.href = 'create-bot.html?mode=edit';
        });
    });

    document.querySelectorAll('.open-public-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const url = btn.dataset.url;
            if (!url) {
                alert('Public URL not available');
                return;
            }

            window.open(url, '_blank');
        });
    });

    document.querySelectorAll('.open-builder-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const botId = Number(btn.dataset.id);
            const bot = bots.find((b) => b.id === botId);

            if (!bot) {
                alert('Bot not found');
                return;
            }

            saveSelectedBot(bot, 'open');
            window.location.href = 'create-bot.html?mode=open';
        });
    });

    document.querySelectorAll('.publish-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const botId = Number(btn.dataset.id);
            await publishBot(botId);
        });
    });
}

async function loadBots() {
    const user = requireUser();
    if (!user) {
        return;
    }

    if (user.role === 'ADMIN') {
        window.location.href = 'analytics.html';
        return;
    }

    allBots = await fetchBotsForCurrentUser();
    renderBots(allBots);

    const searchInput = document.getElementById('bot-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderBots(filterBots(searchInput.value));
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const user = requireUser();
    if (!user) {
        return;
    }

    if (user.role === 'ADMIN') {
        window.location.href = 'analytics.html';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    loadBots().catch((err) => {
        console.error(err);
        alert(err.message || 'Failed to load dashboard');
    });
});