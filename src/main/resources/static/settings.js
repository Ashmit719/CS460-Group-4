function requireUser() {
    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

function showMessage(id, message, type = 'error') {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }

    el.textContent = message;
    el.className = `form-message ${type}`;
}

function clearMessage(id) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }

    el.textContent = '';
    el.className = 'form-message';
}

function populateUser(user) {
    const nameInput = document.getElementById('settings-name');
    const emailInput = document.getElementById('settings-email');
    const roleInput = document.getElementById('settings-role');
	const pinInput = document.getElementById('settings-pin');
	
    if (nameInput) {
        nameInput.value = user.name || '';
    }

    if (emailInput) {
        emailInput.value = user.email || '';
    }

    if (roleInput) {
        roleInput.value = user.role || 'USER';
    }
	
	if (pinInput) {
	        pinInput.value = user.pin || '';
	}

    const adminResetCard = document.getElementById('admin-reset-card');
    const myBotsLink = document.getElementById('my-bots-link');
    const createBotLink = document.getElementById('create-bot-link');

    if (user.role === 'ADMIN') {
        if (adminResetCard) {
            adminResetCard.style.display = 'block';
        }
        if (myBotsLink) {
            myBotsLink.style.display = 'none';
        }
        if (createBotLink) {
            createBotLink.style.display = 'none';
        }
    } else {
        if (adminResetCard) {
            adminResetCard.style.display = 'none';
        }
    }
}

async function loadCurrentProfile() {
    const user = requireUser();
    if (!user) {
        return;
    }

    populateUser(user);
}

async function saveProfile() {
    const user = requireUser();
    if (!user) {
        return;
    }

    const name = document.getElementById('settings-name')?.value.trim() || '';
    const email = document.getElementById('settings-email')?.value.trim() || '';
    const pin = document.getElementById('settings-pin')?.value.trim() || '';

    if (!name || !email || !pin) {
        showMessage('profile-message', 'Name, email, and PIN are required.');
        return;
    }

    if (!/^\d{6}$/.test(pin)) {
        showMessage('profile-message', 'PIN must be exactly 6 digits.');
        return;
    }

    clearMessage('profile-message');

    try {
        const res = await fetch('http://localhost:8080/api/auth/update-profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                name,
                email,
                pin
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Failed to update profile.');
        }
		
		const mergedUser = {
		            ...user,
		            ...data,
		            pin
		 };

        saveUser(mergedUser);
        populateUser(mergedUser);

        
        showMessage('profile-message', 'Profile updated successfully.', 'success');
    } catch (err) {
        showMessage('profile-message', err.message || 'Failed to update profile.');
    }
}

async function changePassword() {
    const user = requireUser();
    if (!user) {
        return;
    }

    const currentPassword = document.getElementById('current-password')?.value.trim() || '';
    const newPassword = document.getElementById('new-password')?.value.trim() || '';

    if (!currentPassword || !newPassword) {
        showMessage('password-message', 'Current and new password are required.');
        return;
    }

    clearMessage('password-message');

    try {
        const res = await fetch('http://localhost:8080/api/auth/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                currentPassword,
                newPassword
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Failed to change password.');
        }

        const currentPasswordInput = document.getElementById('current-password');
        const newPasswordInput = document.getElementById('new-password');

        if (currentPasswordInput) {
            currentPasswordInput.value = '';
        }

        if (newPasswordInput) {
            newPasswordInput.value = '';
        }

        showMessage('password-message', data.message || 'Password changed successfully.', 'success');
    } catch (err) {
        showMessage('password-message', err.message || 'Failed to change password.');
    }
}

async function adminResetUserPassword() {
    const user = requireUser();
    if (!user || user.role !== 'ADMIN') {
        return;
    }

    const targetEmail = document.getElementById('target-email')?.value.trim() || '';
    const targetPin = document.getElementById('target-pin')?.value.trim() || '';
    const newPassword = document.getElementById('target-new-password')?.value.trim() || '';

    if (!targetEmail || !targetPin || !newPassword) {
        showMessage('admin-reset-message', 'User email, PIN, and new password are required.');
        return;
    }

    if (!/^\d{6}$/.test(targetPin)) {
        showMessage('admin-reset-message', 'Target PIN must be exactly 6 digits.');
        return;
    }

    clearMessage('admin-reset-message');

    try {
        const res = await fetch('http://localhost:8080/api/auth/admin/reset-user-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adminId: user.id,
                targetEmail,
                targetPin,
                newPassword
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Failed to reset user password.');
        }

        const targetEmailInput = document.getElementById('target-email');
        const targetPinInput = document.getElementById('target-pin');
        const targetNewPasswordInput = document.getElementById('target-new-password');

        if (targetEmailInput) {
            targetEmailInput.value = '';
        }

        if (targetPinInput) {
            targetPinInput.value = '';
        }

        if (targetNewPasswordInput) {
            targetNewPasswordInput.value = '';
        }

        showMessage('admin-reset-message', data.message || 'User password reset successfully.', 'success');
    } catch (err) {
        showMessage('admin-reset-message', err.message || 'Failed to reset user password.');
    }
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

    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }

    const changePasswordBtn = document.getElementById('change-password-btn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', changePassword);
    }

    const adminResetBtn = document.getElementById('admin-reset-btn');
    if (adminResetBtn) {
        adminResetBtn.addEventListener('click', adminResetUserPassword);
    }

    loadCurrentProfile();
});