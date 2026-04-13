let analyticsChart = null;

function requireUser() {
    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    try {
        return new Date(value).toLocaleString();
    } catch (err) {
        return value;
    }
}

function formatDayLabel(date) {
    return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
    });
}

function setPageHeader(user) {
    const pageTitle = document.getElementById('analytics-page-title');
    const pageSubtitle = document.getElementById('analytics-page-subtitle');
    const statTwoLabel = document.getElementById('stat-two-label');
    const statTwoSubtext = document.getElementById('stat-two-subtext');
    const statFourLabel = document.getElementById('stat-four-label');
    const statFourSubtext = document.getElementById('stat-four-subtext');
    const chartTitle = document.getElementById('chart-title');
    const chartSubtitle = document.getElementById('chart-subtitle');
    const activityTitle = document.getElementById('activity-title');
    const activitySubtitle = document.getElementById('activity-subtitle');
    const navAnalytics = document.getElementById('analytics-link');
    const navMyBots = document.getElementById('my-bots-link');
    const createBotLink = document.getElementById('create-bot-link');

    if (navAnalytics) {
        navAnalytics.classList.add('active');
    }

    if (user.role === 'ADMIN') {
        if (pageTitle) {
            pageTitle.textContent = 'Platform Analytics';
        }
        if (pageSubtitle) {
            pageSubtitle.textContent = 'Monitor chatbot usage and platform activity';
        }
        if (statTwoLabel) {
            statTwoLabel.textContent = 'Total Users';
        }
        if (statTwoSubtext) {
            statTwoSubtext.textContent = 'Registered users on platform';
        }
        if (statFourLabel) {
            statFourLabel.textContent = 'Total Messages';
        }
        if (statFourSubtext) {
            statFourSubtext.textContent = 'Messages across tracked conversations';
        }
        if (chartTitle) {
            chartTitle.textContent = 'Platform Conversation Activity';
        }
        if (chartSubtitle) {
            chartSubtitle.textContent = 'Daily conversation trend for the last 7 days';
        }
        if (activityTitle) {
            activityTitle.textContent = 'Recent Platform Activity';
        }
        if (activitySubtitle) {
            activitySubtitle.textContent = 'Latest tracked chatbot conversations across the platform';
        }
        if (navMyBots) {
            navMyBots.style.display = 'none';
        }
        if (createBotLink) {
            createBotLink.style.display = 'none';
        }
        return;
    }

    if (pageTitle) {
        pageTitle.textContent = 'My Analytics';
    }
    if (pageSubtitle) {
        pageSubtitle.textContent = 'Monitor activity across your bots';
    }
    if (statTwoLabel) {
        statTwoLabel.textContent = 'Active Bots';
    }
    if (statTwoSubtext) {
        statTwoSubtext.textContent = 'Published bots you own';
    }
    if (statFourLabel) {
        statFourLabel.textContent = 'Avg Messages / Chat';
    }
    if (statFourSubtext) {
        statFourSubtext.textContent = 'Average messages per conversation';
    }
    if (chartTitle) {
        chartTitle.textContent = 'My Conversation Activity';
    }
    if (chartSubtitle) {
        chartSubtitle.textContent = 'Daily conversation trend across your bots';
    }
    if (activityTitle) {
        activityTitle.textContent = 'Recent Activity';
    }
    if (activitySubtitle) {
        activitySubtitle.textContent = 'Latest tracked conversations for your bots';
    }
}

function renderStats(data, user) {
    const totalConversations = document.getElementById('total-conversations');
    const statTwoValue = document.getElementById('stat-two-value');
    const totalBots = document.getElementById('total-bots');
    const statFourValue = document.getElementById('stat-four-value');

    if (totalConversations) {
        totalConversations.textContent =
            Number(data.totalConversations ?? 0).toLocaleString();
    }

    if (totalBots) {
        totalBots.textContent =
            Number(data.totalBots ?? 0).toLocaleString();
    }

    if (user.role === 'ADMIN') {
        if (statTwoValue) {
            statTwoValue.textContent =
                Number(data.totalUsers ?? 0).toLocaleString();
        }
        if (statFourValue) {
            statFourValue.textContent =
                Number(data.totalMessages ?? 0).toLocaleString();
        }
        return;
    }

    if (statTwoValue) {
        statTwoValue.textContent =
            Number(data.activeBots ?? 0).toLocaleString();
    }

    if (statFourValue) {
        const avg = typeof data.avgMessagesPerConversation === 'number'
            ? data.avgMessagesPerConversation.toFixed(1)
            : '0.0';
        statFourValue.textContent = avg;
    }
}

function renderActivityTable(rows) {
    const tbody = document.getElementById('analytics-activity-body');
    if (!tbody) {
        return;
    }

    if (!rows || !rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:20px; color:#888;">
                    No conversations yet — start chatting to see analytics 📊
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map((row) => `
        <tr>
            <td>${row.botName ?? '-'}</td>
            <td>${row.publicChat ? 'Public Visitor' : 'Builder/User'}</td>
            <td>${row.publicChat ? 'Public Chat' : 'Private Chat'}</td>
            <td>${formatDateTime(row.lastMessageAt)}</td>
        </tr>
    `).join('');
}

function buildDailySeries(recentActivity) {
    const days = [];
    const counts = [];
    const dayMap = new Map();

    for (let i = 6; i >= 0; i -= 1) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);

        const key = date.toISOString().slice(0, 10);
        days.push({
            key,
            label: formatDayLabel(date)
        });
        dayMap.set(key, 0);
    }

    (recentActivity || []).forEach((item) => {
        if (!item.lastMessageAt) {
            return;
        }

        const date = new Date(item.lastMessageAt);
        const key = date.toISOString().slice(0, 10);

        if (dayMap.has(key)) {
            dayMap.set(key, dayMap.get(key) + 1);
        }
    });

    days.forEach((day) => {
        counts.push(dayMap.get(day.key) || 0);
    });

    return {
        labels: days.map((day) => day.label),
        values: counts
    };
}

function renderLineChart(data, user) {
    const canvas = document.getElementById('analytics-line-chart');
    if (!canvas || typeof Chart === 'undefined') {
        return;
    }

    const series = buildDailySeries(data.recentActivity || []);
    const label = user.role === 'ADMIN'
        ? 'Platform Conversations'
        : 'My Bot Conversations';

    if (analyticsChart) {
        analyticsChart.destroy();
    }

    analyticsChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: series.labels,
            datasets: [
                {
                    label,
                    data: series.values,
                    borderColor: '#6d4cff',
                    backgroundColor: 'rgba(109, 76, 255, 0.14)',
                    borderWidth: 4,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#6d4cff',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: '#ffffff',
                    pointHoverBorderColor: '#6d4cff'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 900,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#4b5563',
                        font: {
                            size: 13,
                            weight: '600'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = context.parsed.y ?? 0;
                            return `${value} conversation${value === 1 ? '' : 's'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: '#6b7280'
                    },
                    grid: {
                        color: '#eeeaf8'
                    }
                }
            }
        }
    });
}

async function loadAnalytics() {
    const user = requireUser();
    if (!user) {
        return;
    }

    setPageHeader(user);

    const endpoint = user.role === 'ADMIN'
        ? 'http://localhost:8080/api/analytics/admin'
        : `http://localhost:8080/api/analytics/user/${user.id}`;

    const res = await fetch(endpoint);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to load analytics');
    }

    const data = await res.json();

    renderStats(data, user);
    renderLineChart(data, user);
    renderActivityTable(data.recentActivity || []);
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

    loadAnalytics().catch((err) => {
        console.error(err);

        const tbody = document.getElementById('analytics-activity-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; color:#c00;">
                        ⚠ ${err.message || 'Failed to load analytics'}
                    </td>
                </tr>
            `;
        }
    });
});