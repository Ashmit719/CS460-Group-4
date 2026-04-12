//auth.js
const API_BASE = 'http://localhost:8080/api';

function saveUser(user) {
    localStorage.setItem('botbuilderUser', JSON.stringify(user));
}

function getUser() {
    const raw = localStorage.getItem('botbuilderUser');
    return raw ? JSON.parse(raw) : null;
}

function logoutUser() {
    localStorage.removeItem('botbuilderUser');
    localStorage.removeItem('selectedBotId');
    localStorage.removeItem('selectedBotUrl');
    window.location.href = 'login.html';
}

async function signupUser(name, email, password) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Signup failed');
    }

    const user = await res.json();
    saveUser(user);
    return user;
}

async function loginUser(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Login failed');
    }

    const user = await res.json();
    saveUser(user);
    return user;
}

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();

            try {
                await loginUser(email, password);
                window.location.href = 'dashboard.html';
            } catch (err) {
                alert(err.message);
            }
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value.trim();

            try {
                await signupUser(name, email, password);
                window.location.href = 'dashboard.html';
            } catch (err) {
                alert(err.message);
            }
        });
    }
});