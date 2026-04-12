let currentStep = 1;
const totalSteps = 5;
let currentBotId = null;
let currentBotUrl = '';
let isSavingBot = false;
let pageFlowMode = 'create';

function requireUser() {
    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

function getSelectedBot() {
    const raw = localStorage.getItem('selectedBot');
    return raw ? JSON.parse(raw) : null;
}

function getBotMode() {
    return localStorage.getItem('botMode') || 'create';
}

function isOpenMode() {
    return getBotMode() === 'open';
}

function clearSelectedBotState() {
    localStorage.removeItem('selectedBot');
    localStorage.removeItem('selectedBotId');
    localStorage.removeItem('selectedBotUrl');
    localStorage.removeItem('botMode');
    currentBotId = null;
    currentBotUrl = '';
}

function normalizeWebsiteUrl(url) {
    if (!url) {
        return '';
    }

    let cleaned = url.trim();

    try {
        const parsed = new URL(cleaned);
        return `${parsed.origin}${parsed.pathname}`;
    } catch (e) {
        const queryIndex = cleaned.indexOf('?');
        if (queryIndex >= 0) {
            cleaned = cleaned.substring(0, queryIndex);
        }
        return cleaned.trim();
    }
}

function updateStepper(stepNumber) {
    const steps = document.querySelectorAll('.step');

    if (isOpenMode()) {
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 === 4) {
                step.classList.add('active');
            }
        });
        return;
    }

    steps.forEach((step, index) => {
        step.classList.remove('active', 'completed');

        if (index + 1 < stepNumber) {
            step.classList.add('completed');
        } else if (index + 1 === stepNumber) {
            step.classList.add('active');
        }
    });
}

function showStep(stepNumber) {
    document.querySelectorAll('.wizard-step').forEach((step) => {
        step.classList.remove('active');
    });

    const stepEl = document.getElementById(`step-${stepNumber}`);
    if (stepEl) {
        stepEl.classList.add('active');
    }

    currentStep = stepNumber;
    updateStepper(stepNumber);
}

function goNext() {
    if (isOpenMode()) {
        return;
    }

    if (currentStep < totalSteps) {
        showStep(currentStep + 1);
    }
}

function goPrev() {
    if (isOpenMode()) {
        return;
    }

    if (currentStep > 1) {
        showStep(currentStep - 1);
    }
}

function getToneValue() {
    const toneSlider = document.querySelectorAll('.slider')[0];
    if (!toneSlider) {
        return 'Balanced';
    }

    const val = parseInt(toneSlider.value, 10);
    if (val < 33) {
        return 'Formal';
    }
    if (val > 66) {
        return 'Casual';
    }
    return 'Balanced';
}

function getResponseLengthValue() {
    const lengthSlider = document.querySelectorAll('.slider')[1];
    if (!lengthSlider) {
        return 'Medium';
    }

    const val = parseInt(lengthSlider.value, 10);
    if (val < 33) {
        return 'Short';
    }
    if (val > 66) {
        return 'Detailed';
    }
    return 'Medium';
}

function setSliderUIFromBot(bot) {
    const sliders = document.querySelectorAll('.slider');
    if (sliders.length < 2) {
        return;
    }

    const toneSlider = sliders[0];
    const lengthSlider = sliders[1];

    const tone = bot.tone || 'Balanced';
    const responseLength = bot.responseLength || 'Medium';

    toneSlider.value = tone === 'Formal' ? 0 : tone === 'Casual' ? 100 : 50;
    lengthSlider.value = responseLength === 'Short' ? 0 : responseLength === 'Detailed' ? 100 : 50;

    toneSlider.dispatchEvent(new Event('input'));
    lengthSlider.dispatchEvent(new Event('input'));
}

function populateReview(bot) {
    const reviewInfo = document.getElementById('review-info');
    if (!reviewInfo) {
        return;
    }

    reviewInfo.innerHTML = `
        <div><strong>Name:</strong> ${bot.name || ''}</div>
        <div><strong>URL:</strong> ${bot.url || ''}</div>
        <div><strong>Description:</strong> ${bot.description || ''}</div>
        <div><strong>Language:</strong> ${bot.language || 'English'}</div>
        <div><strong>Personality:</strong> ${bot.personality || 'Professional'}</div>
        <div><strong>Tone:</strong> ${bot.tone || 'Balanced'}</div>
        <div><strong>Response Length:</strong> ${bot.responseLength || 'Medium'}</div>
        <div><strong>Source Type:</strong> ${bot.sourceType || 'website'}</div>
        <div><strong>Status:</strong> ${bot.status || 'ACTIVE'}</div>
    `;
}

function populateForm(bot) {
    const botName = document.getElementById('bot-name');
    const knowledgeUrl = document.getElementById('knowledge-website-url');
    const botDescription = document.getElementById('bot-description');
    const botLanguage = document.getElementById('bot-language');
    const botPersonality = document.getElementById('bot-personality');
    const sourceInput = document.getElementById('knowledge-source-type');

    if (botName) {
        botName.value = bot.name || '';
    }

    if (knowledgeUrl) {
        knowledgeUrl.value = bot.url || '';
    }

    if (botDescription) {
        botDescription.value = bot.description || '';
    }

    if (botLanguage) {
        botLanguage.value = bot.language || 'English';
    }

    if (botPersonality) {
        botPersonality.value = bot.personality || 'Professional';
    }

    if (sourceInput) {
        sourceInput.value = bot.sourceType || 'website';
    }

    document.querySelectorAll('.personality-option').forEach((option) => {
        option.classList.toggle(
            'active',
            option.dataset.value === (bot.personality || 'Professional')
        );
    });

    const activeSource = bot.sourceType || 'website';

    document.querySelectorAll('.knowledge-source-option').forEach((opt) => {
        opt.classList.toggle('active', opt.dataset.source === activeSource);
    });

    const websitePanel = document.getElementById('knowledge-panel-website');
    const pdfPanel = document.getElementById('knowledge-panel-pdf');
    const textPanel = document.getElementById('knowledge-panel-text');

    if (websitePanel) {
        websitePanel.classList.toggle('active', activeSource === 'website');
    }

    if (pdfPanel) {
        pdfPanel.classList.toggle('active', activeSource === 'pdf');
    }

    if (textPanel) {
        textPanel.classList.toggle('active', activeSource === 'text');
    }

    currentBotId = bot.id || null;
    currentBotUrl = bot.url || '';

    if (bot.id) {
        localStorage.setItem('selectedBotId', String(bot.id));
    }

    localStorage.setItem('selectedBot', JSON.stringify(bot));
    localStorage.setItem('selectedBotUrl', bot.url || '');
    localStorage.setItem('botMode', 'edit');

    setSliderUIFromBot(bot);
    populateReview(bot);
}

function handleStepOneNext() {
    const nameInput = document.getElementById('bot-name');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        alert('Enter bot name');
        return;
    }

    showStep(2);
}

function saveBotFromStepTwo() {
    if (isSavingBot) {
        return;
    }

    const user = requireUser();
    if (!user) {
        return;
    }

    const nameInput = document.getElementById('bot-name');
    const descriptionInput = document.getElementById('bot-description');
    const languageInput = document.getElementById('bot-language');
    const personalityInput = document.getElementById('bot-personality');
    const sourceTypeInput = document.getElementById('knowledge-source-type');
    const websiteUrlInput = document.getElementById('knowledge-website-url');
    const nextBtn = document.getElementById('next-btn');

    const name = nameInput ? nameInput.value.trim() : '';
    const description = descriptionInput ? descriptionInput.value.trim() : '';
    const language = languageInput ? languageInput.value : 'English';
    const personality = personalityInput ? personalityInput.value : 'Professional';
    const sourceType = sourceTypeInput ? sourceTypeInput.value : 'website';
    const rawUrl = websiteUrlInput ? websiteUrlInput.value.trim() : '';
    const url = sourceType === 'website' ? normalizeWebsiteUrl(rawUrl) : '';
    const tone = getToneValue();
    const responseLength = getResponseLengthValue();

    if (!name) {
        alert('Enter bot name');
        return;
    }

    if (sourceType === 'website' && !url) {
        alert('Enter website URL');
        return;
    }

    if (websiteUrlInput && sourceType === 'website') {
        websiteUrlInput.value = url;
    }

    const isEditMode = pageFlowMode === 'edit' && !!currentBotId;

    const payload = {
        userId: String(user.id),
        name,
        description,
        language,
        personality,
        tone,
        responseLength,
        sourceType,
        status: 'ACTIVE',
        url
    };

    const endpoint = isEditMode
        ? `http://localhost:8080/api/bot/update/${currentBotId}`
        : 'http://localhost:8080/api/bot/create';

    const method = isEditMode ? 'PUT' : 'POST';

    isSavingBot = true;

    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = 'Saving...';
    }

    fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(async (res) => {
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'Error saving bot');
            }
            return res.json();
        })
        .then((bot) => {
            currentBotId = bot.id;
            currentBotUrl = bot.url || '';
            pageFlowMode = 'edit';

            localStorage.setItem('selectedBot', JSON.stringify(bot));
            localStorage.setItem('selectedBotId', String(bot.id));
            localStorage.setItem('selectedBotUrl', bot.url || '');
            localStorage.setItem('botMode', 'edit');

            populateForm(bot);
            populateReview(bot);
            showStep(3);
        })
        .catch((err) => {
            console.error(err);
            alert(err.message);
        })
        .finally(() => {
            isSavingBot = false;

            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.textContent = 'Next →';
            }
        });
}

function setupStepOneButton() {
    const createBtn = document.getElementById('create-bot-btn');
    if (createBtn) {
        createBtn.addEventListener('click', handleStepOneNext);
    }
}

function setupGenericNav() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', goPrev);
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', saveBotFromStepTwo);
    }

    document.querySelectorAll('.prev-generic').forEach((btn) => {
        btn.addEventListener('click', goPrev);
    });

    document.querySelectorAll('.next-generic').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (currentStep === 3) {
                const selectedBot = getSelectedBot();
                if (selectedBot) {
                    selectedBot.tone = getToneValue();
                    selectedBot.responseLength = getResponseLengthValue();
                    localStorage.setItem('selectedBot', JSON.stringify(selectedBot));
                    populateReview(selectedBot);
                }
            }

            goNext();
        });
    });
}

function setupSliders() {
    const sliders = document.querySelectorAll('.slider');
    if (sliders.length < 2) {
        return;
    }

    const toneSlider = sliders[0];
    const lengthSlider = sliders[1];

    const toneValue = toneSlider.previousElementSibling.querySelector('.slider-value');
    const toneInfo = toneSlider.nextElementSibling;

    const lengthValue = lengthSlider.previousElementSibling.querySelector('.slider-value');
    const lengthInfo = lengthSlider.nextElementSibling;

    toneSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);

        if (val < 33) {
            toneValue.textContent = 'Formal';
            toneInfo.textContent = 'Professional tone';
        } else if (val > 66) {
            toneValue.textContent = 'Casual';
            toneInfo.textContent = 'Friendly tone';
        } else {
            toneValue.textContent = 'Balanced';
            toneInfo.textContent = 'Balanced tone';
        }
    });

    lengthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);

        if (val < 33) {
            lengthValue.textContent = 'Short';
            lengthInfo.textContent = 'Brief responses';
        } else if (val > 66) {
            lengthValue.textContent = 'Detailed';
            lengthInfo.textContent = 'Detailed responses';
        } else {
            lengthValue.textContent = 'Medium';
            lengthInfo.textContent = 'Balanced responses';
        }
    });

    toneSlider.dispatchEvent(new Event('input'));
    lengthSlider.dispatchEvent(new Event('input'));
}

function setupChat() {
    const chatField = document.querySelector('.chat-field');
    const chatSend = document.querySelector('.chat-send');
    const chatMessages = document.querySelector('.chat-messages');

    if (!chatField || !chatSend || !chatMessages) {
        return;
    }

    const sendMessage = () => {
        const message = chatField.value.trim();
        if (!message) {
            return;
        }

        const user = requireUser();
        if (!user) {
            return;
        }

        const userMsg = document.createElement('div');
        userMsg.innerHTML = `<div class="chat-line chat-line-user"><b>You:</b> ${message}</div>`;
        chatMessages.appendChild(userMsg);

        chatField.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        const previewUrlInput = document.getElementById('knowledge-website-url');
        const previewUrl = previewUrlInput ? previewUrlInput.value.trim() : '';
        const botUrlToUse = currentBotId ? currentBotUrl : normalizeWebsiteUrl(previewUrl);
        const personalityInput = document.getElementById('bot-personality');
        const languageInput = document.getElementById('bot-language');
        const tone = getToneValue();
        const responseLength = getResponseLengthValue();

        let endpoint = '';
        let payload = {};

        if (currentBotId) {
            endpoint = 'http://localhost:8080/api/bot/chat';
            payload = {
                userId: String(user.id),
                botId: String(currentBotId),
                message
            };
        } else {
            endpoint = 'http://localhost:8080/api/bot/previewChat';
            payload = {
                message,
                knowledgeText: '',
                url: botUrlToUse,
                personality: personalityInput ? personalityInput.value : 'Professional',
                language: languageInput ? languageInput.value : 'English',
                tone,
                responseLength
            };
        }

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || 'Chat request failed');
                }
                return res.text();
            })
            .then((botReply) => {
                const botMsg = document.createElement('div');
                botMsg.innerHTML = `<div class="chat-line chat-line-bot"><b>Bot:</b> ${botReply}</div>`;
                chatMessages.appendChild(botMsg);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            })
            .catch((err) => {
                console.error(err);
                const errorMsg = document.createElement('div');
                errorMsg.innerHTML = `<div class="chat-line chat-line-bot error"><b>Bot:</b> Error contacting chatbot service.</div>`;
                chatMessages.appendChild(errorMsg);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            });
    };

    chatSend.addEventListener('click', sendMessage);
    chatField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

function setupPersonalityOptions() {
    const options = document.querySelectorAll('.personality-option');
    const hiddenInput = document.getElementById('bot-personality');

    options.forEach((option) => {
        option.addEventListener('click', () => {
            options.forEach((item) => item.classList.remove('active'));
            option.classList.add('active');

            if (hiddenInput) {
                hiddenInput.value = option.dataset.value;
            }
        });
    });
}

function setupKnowledgeSourceOptions() {
    const options = document.querySelectorAll('.knowledge-source-option');
    const hiddenInput = document.getElementById('knowledge-source-type');
    const websitePanel = document.getElementById('knowledge-panel-website');
    const pdfPanel = document.getElementById('knowledge-panel-pdf');
    const textPanel = document.getElementById('knowledge-panel-text');
    const textArea = document.getElementById('knowledge-text-content');
    const counter = document.getElementById('knowledge-text-counter');
    const dropzone = document.querySelector('.upload-dropzone');
    const fileInput = document.getElementById('knowledge-pdf-file');

    const showPanel = (sourceType) => {
        options.forEach((option) => {
            option.classList.toggle('active', option.dataset.source === sourceType);
        });

        if (hiddenInput) {
            hiddenInput.value = sourceType;
        }

        if (websitePanel) {
            websitePanel.classList.toggle('active', sourceType === 'website');
        }
        if (pdfPanel) {
            pdfPanel.classList.toggle('active', sourceType === 'pdf');
        }
        if (textPanel) {
            textPanel.classList.toggle('active', sourceType === 'text');
        }
    };

    options.forEach((option) => {
        option.addEventListener('click', () => {
            showPanel(option.dataset.source);
        });
    });

    if (textArea && counter) {
        textArea.addEventListener('input', () => {
            counter.textContent = `${textArea.value.length} characters`;
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                const titleEl = dropzone.querySelector('.upload-dropzone-title');
                const subtitleEl = dropzone.querySelector('.upload-dropzone-subtitle');

                if (titleEl) {
                    titleEl.textContent = fileInput.files[0].name;
                }
                if (subtitleEl) {
                    subtitleEl.textContent = 'PDF selected';
                }
            }
        });
    }
}

function setOpenModeUI() {
    document.body.classList.add('open-mode');

    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (prevBtn) {
        prevBtn.style.display = 'none';
        prevBtn.disabled = true;
    }

    if (nextBtn) {
        nextBtn.style.display = 'none';
        nextBtn.disabled = true;
    }

    document.querySelectorAll('.prev-generic').forEach((btn) => {
        btn.style.display = 'none';
        btn.disabled = true;
    });

    document.querySelectorAll('.next-generic').forEach((btn) => {
        btn.style.display = 'none';
        btn.disabled = true;
    });
}

function handlePageMode() {
    const params = new URLSearchParams(window.location.search);
    const pageMode = params.get('mode');
    const selectedBot = getSelectedBot();
    const storedMode = getBotMode();

    if (pageMode === 'create') {
        pageFlowMode = 'create';
        clearSelectedBotState();
        showStep(1);
        return;
    }

    if (selectedBot && storedMode === 'open') {
        pageFlowMode = 'open';
        populateForm(selectedBot);
        setOpenModeUI();
        showStep(4);
        return;
    }

    if (selectedBot && storedMode === 'edit') {
        pageFlowMode = 'edit';
        populateForm(selectedBot);
        showStep(1);
        return;
    }

    pageFlowMode = 'create';
    clearSelectedBotState();
    showStep(1);
}

document.addEventListener('DOMContentLoaded', () => {
    setupStepOneButton();
    setupGenericNav();
    setupSliders();
    setupChat();
    setupPersonalityOptions();
    setupKnowledgeSourceOptions();

    const user = getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    handlePageMode();
});