const API_BASE = 'http://localhost:8080/api';

function saveUser(user) {
    localStorage.setItem('botbuilderUser', JSON.stringify(user));
}

function getUser() {
    const raw = localStorage.getItem('botbuilderUser');
    return raw ? JSON.parse(raw) : null;
}

function isAdminUser(user) {
    return user && user.role === 'ADMIN';
}

function redirectUserByRole(user) {
    if (isAdminUser(user)) {
        window.location.href = 'analytics.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

function logoutUser() {
    localStorage.removeItem('botbuilderUser');
    localStorage.removeItem('selectedBot');
    localStorage.removeItem('selectedBotId');
    localStorage.removeItem('selectedBotUrl');
    localStorage.removeItem('botMode');
    window.location.href = 'login.html';
}

function clearMessage(id) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = '';
        el.className = 'form-message';
    }
}

function showMessage(id, message, type = 'error') {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }

    el.textContent = message;
    el.className = `form-message ${type}`;
}

async function extractErrorMessage(res, fallbackMessage) {
    try {
        const data = await res.json();

        if (data.message) {
            return data.message;
        }

        if (data.error) {
            return data.error;
        }

        return fallbackMessage;
    } catch (e) {
        try {
            const text = await res.text();
            return text || fallbackMessage;
        } catch (err) {
            return fallbackMessage;
        }
    }
}

async function signupUser(name, email, password, pin, adminAccessCode) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            email,
            password,
            pin,
            adminAccessCode
        })
    });

    if (!res.ok) {
        const message = await extractErrorMessage(res, 'Signup failed');
        throw new Error(message);
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
        const message = await extractErrorMessage(res, 'Login failed');
        throw new Error(message);
    }

    const user = await res.json();
    saveUser(user);
    return user;
}

async function resetPassword(email, pin, newPassword) {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            pin,
            newPassword
        })
    });

    if (!res.ok) {
        const message = await extractErrorMessage(res, 'Password reset failed');
        throw new Error(message);
    }

    return res.json();
}

function isValidSixDigitPin(pin) {
    return /^\d{6}$/.test(pin);
}

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const resetBtn = document.getElementById('reset-btn');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            clearMessage('login-message');
            clearMessage('signup-message');
            clearMessage('reset-message');

            const email = document.getElementById('login-email')?.value.trim() || '';
            const password = document.getElementById('login-password')?.value.trim() || '';

            if (!email || !password) {
                showMessage('login-message', 'Please enter email and password.', 'error');
                return;
            }

            try {
                const user = await loginUser(email, password);
                showMessage('login-message', 'Login successful. Redirecting...', 'success');
                redirectUserByRole(user);
            } catch (err) {
                showMessage('login-message', err.message, 'error');
            }
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            clearMessage('login-message');
            clearMessage('signup-message');
            clearMessage('reset-message');

            const name = document.getElementById('signup-name')?.value.trim() || '';
            const email = document.getElementById('signup-email')?.value.trim() || '';
            const password = document.getElementById('signup-password')?.value.trim() || '';
            const confirmPassword = document.getElementById('signup-confirm-password')?.value.trim() || '';
            const pin = document.getElementById('signup-pin')?.value.trim() || '';
            const adminAccessCode = document.getElementById('signup-admin-code')?.value.trim() || '';

            if (!name || !email || !password || !confirmPassword || !pin) {
                showMessage(
                    'signup-message',
                    'Please fill in all signup fields except the optional admin access code.',
                    'error'
                );
                return;
            }

            if (password !== confirmPassword) {
                showMessage('signup-message', 'Passwords do not match.', 'error');
                return;
            }

            if (!isValidSixDigitPin(pin)) {
                showMessage('signup-message', 'PIN must be exactly 6 digits.', 'error');
                return;
            }

            try {
                const user = await signupUser(name, email, password, pin, adminAccessCode);
                showMessage('signup-message', 'Account created successfully. Redirecting...', 'success');
                redirectUserByRole(user);
            } catch (err) {
                showMessage('signup-message', err.message, 'error');
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            clearMessage('login-message');
            clearMessage('signup-message');
            clearMessage('reset-message');

            const email = document.getElementById('reset-email')?.value.trim() || '';
            const pin = document.getElementById('reset-pin')?.value.trim() || '';
            const newPassword = document.getElementById('reset-new-password')?.value.trim() || '';

            if (!email || !pin || !newPassword) {
                showMessage('reset-message', 'Email, PIN, and new password are required.', 'error');
                return;
            }

            if (!isValidSixDigitPin(pin)) {
                showMessage('reset-message', 'PIN must be exactly 6 digits.', 'error');
                return;
            }

            try {
                const result = await resetPassword(email, pin, newPassword);
                showMessage(
                    'reset-message',
                    result.message || 'Password reset successfully.',
                    'success'
                );
            } catch (err) {
                showMessage('reset-message', err.message, 'error');
            }
        });
    }
});