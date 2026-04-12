function requireUser() {
    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

function createBotCard(bot) {
    return `
        <div class="bot-card">
            <div class="bot-card-top">
                <div>
                    <h3>${bot.name}</h3>
                    <p>${bot.url}</p>
                </div>
                <span class="status-badge active">Active</span>
            </div>

            <div class="bot-card-meta">
                <span>Updated recently</span>
                <span>ID: ${bot.id}</span>
            </div>

            <div class="bot-card-actions">
                <button class="btn btn-secondary btn-small edit-btn" data-id="${bot.id}">Edit</button>
                <button class="btn btn-primary btn-small open-btn" data-id="${bot.id}">Open</button>
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

function renderBots(bots) {
    const botGrid = document.getElementById('bot-grid');

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

    document.querySelectorAll('.open-btn').forEach((btn) => {
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
}

async function loadBots() {
    const user = requireUser();
    if (!user) {
        return;
    }

    const analyticsLink = document.getElementById('analytics-link');
    if (user.email !== 'admin@test.com' && analyticsLink) {
        analyticsLink.style.display = 'none';
    }

    const res = await fetch(`http://localhost:8080/api/bot/user/${user.id}`);
    const bots = await res.json();
    renderBots(bots);

    const searchInput = document.getElementById('bot-search');
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        const filtered = bots.filter((bot) => {
            return bot.name.toLowerCase().includes(q) || bot.url.toLowerCase().includes(q);
        });
        renderBots(filtered);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const user = requireUser();
    if (!user) {
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    loadBots().catch((err) => {
        console.error(err);
    });
});