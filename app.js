class SimpleVoiceToText {
    constructor() {
        // Application state
        this.recognition = null;
        this.isRecording = false;
        this.transcript = '';
        this.interimTranscript = '';
        this.sessionStartTime = null;
        this.timerInterval = null;
        this.selectedLanguage = 'auto';
        this.wordCount = 0;
        this.toastTimer = null;

        // Initialise once DOM is fully parsed
        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    /* ---------------- INITIALISATION ---------------- */
    init() {
        // Cache DOM nodes
        this.cacheElements();

        // Defensive: stop if vital nodes missing
        if (!this.micButton || !this.settingsBtn) {
            console.error('Critical elements missing – aborting initialisation');
            return;
        }

        // Set up speech recognition (if available)
        this.setupSpeechRecognition();

        // Bind all UI events safely
        this.bindEventListeners();

        // Paint initial UI
        this.updateUI();

        // Welcome toast
        this.showToast('Voice-to-Text ready! Click the microphone to start.', 'info');
    }

    cacheElements() {
        /* Header / Main / Footer */
        this.micButton     = document.getElementById('micButton');
        this.micIcon       = document.getElementById('micIcon');
        this.statusMessage = document.getElementById('statusMessage');
        this.timerDisplay  = document.getElementById('timer');
        this.transcriptEl  = document.getElementById('transcript');
        this.clearBtn      = document.getElementById('clearBtn');
        this.exportBtn     = document.getElementById('exportBtn');
        this.settingsBtn   = document.getElementById('settingsBtn');

        /* Settings Modal */
        this.settingsModal   = document.getElementById('settingsModal');
        if (this.settingsModal) {
            this.modalBackdrop   = this.settingsModal.querySelector('.modal-backdrop');
            this.modalContent    = this.settingsModal.querySelector('.modal-content');
        }
        this.languageSelect  = document.getElementById('languageSelect');
        this.closeSettingsBtn= document.getElementById('closeSettings');

        /* Toast */
        this.toastEl = document.getElementById('toast');
    }

    /* ---------------- SPEECH RECOGNITION ---------------- */
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            // Feature not available – keep UI operational but disable recording functionality
            this.micButton.disabled = true;
            this.showToast('Speech Recognition not supported in this browser.', 'error');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US'; // default – will switch on user request

        /* Bind recognition events */
        this.recognition.onstart  = () => this.onRecognitionStart();
        this.recognition.onresult = (e) => this.onRecognitionResult(e);
        this.recognition.onerror  = (e) => this.onRecognitionError(e);
        this.recognition.onend    = () => this.onRecognitionEnd();
    }

    /* ---------------- EVENT LISTENERS ---------------- */
    bindEventListeners() {
        // Mic
        this.micButton.addEventListener('click', () => this.toggleRecording());

        // Footer controls
        this.clearBtn.addEventListener('click', () => this.clearTranscript());
        this.exportBtn.addEventListener('click', () => this.exportTranscript());
        this.settingsBtn.addEventListener('click', () => this.openSettings());

        // Settings modal (only if elements exist)
        if (this.closeSettingsBtn) this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        if (this.languageSelect)  this.languageSelect.addEventListener('change', (e) => this.changeLanguage(e.target.value));
        if (this.modalBackdrop)   this.modalBackdrop.addEventListener('click', () => this.closeSettings());
        if (this.modalContent)    this.modalContent.addEventListener('click', (e) => e.stopPropagation());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleShortcuts(e));

        // One-time permission request
        this.micButton.addEventListener('click', () => this.requestMicPermission(), { once: true });
    }

    /* ---------------- PERMISSIONS ---------------- */
    async requestMicPermission() {
        if (!navigator.mediaDevices?.getUserMedia) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
        } catch (err) {
            console.warn('Microphone permission denied');
            this.showToast('Please allow microphone access in your browser.', 'error');
        }
    }

    /* ---------------- RECORD CONTROL ---------------- */
    toggleRecording() {
        this.isRecording ? this.stopRecording() : this.startRecording();
    }

    startRecording() {
        if (!this.recognition) return; // Not available

        this.isRecording = true;
        this.sessionStartTime = Date.now();
        this.startTimer();
        this.updateUI();

        try {
            this.recognition.start();
        } catch (e) {
            console.error(e);
            this.isRecording = false;
            this.stopTimer();
            this.updateUI();
            this.showToast('Could not start recording. Check permissions.', 'error');
        }
    }

    stopRecording() {
        if (!this.recognition) return;
        this.isRecording = false;
        this.stopTimer();
        this.updateUI();
        try { this.recognition.stop(); } catch(e) { console.error(e); }
    }

    /* ---------------- RECOGNITION EVENTS ---------------- */
    onRecognitionStart() {
        this.statusMessage.textContent = 'Listening… Speak now';
        this.statusMessage.classList.add('recording');
    }

    onRecognitionResult(event) {
        let interim = '';
        let finalTxt = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) finalTxt += res[0].transcript + ' ';
            else interim += res[0].transcript;
        }
        if (finalTxt) {
            this.transcript += finalTxt;
            this.updateWordCount();
        }
        this.interimTranscript = interim;
        this.updateTranscriptDisplay();
    }

    onRecognitionError(event) {
        const messages = {
            'not-allowed': 'Microphone blocked by browser.',
            'no-speech'  : 'No speech detected.',
            'audio-capture': 'Microphone not found.',
            'network': 'Network error.'
        };
        this.showToast(messages[event.error] || `Error: ${event.error}`, 'error');
    }

    onRecognitionEnd() {
        if (this.isRecording) {
            // Attempt to restart (handles unexpected end)
            setTimeout(() => {
                if (this.isRecording) {
                    try { this.recognition.start(); } catch(err) { console.error(err); }
                }
            }, 300);
        } else {
            this.statusMessage.textContent = 'Recording complete';
            this.statusMessage.classList.remove('recording');
        }
    }

    /* ---------------- TRANSCRIPT DISPLAY ---------------- */
    updateTranscriptDisplay() {
        const html = this.transcript + (this.interimTranscript ? `<span class="interim">${this.interimTranscript}</span>` : '');
        if (html) this.transcriptEl.classList.add('has-content');
        else this.transcriptEl.classList.remove('has-content');

        this.transcriptEl.innerHTML = html;
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;

        // Word count badge
        let badge = this.transcriptEl.querySelector('.word-count');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'word-count';
            this.transcriptEl.appendChild(badge);
        }
        badge.textContent = `${this.wordCount} words`;
    }

    updateWordCount() {
        this.wordCount = this.transcript.trim().split(/\s+/).filter(Boolean).length;
    }

    /* ---------------- UTILITIES ---------------- */
    clearTranscript() {
        if (!this.transcript.trim()) return;
        if (!confirm('Clear all recorded text?')) return;
        this.transcript = '';
        this.interimTranscript = '';
        this.wordCount = 0;
        this.updateTranscriptDisplay();
        this.updateUI();
        this.showToast('Transcript cleared', 'info');
    }

    exportTranscript() {
        if (!this.transcript.trim()) { this.showToast('Nothing to export', 'error'); return; }
        const blob = new Blob([this.transcript.trim()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Transcript exported', 'success');
    }

    openSettings() {
        if (!this.settingsModal) return;
        this.settingsModal.classList.remove('hidden');
        this.settingsModal.setAttribute('aria-hidden', 'false');
        this.languageSelect?.focus();
    }
    closeSettings() {
        if (!this.settingsModal) return;
        this.settingsModal.classList.add('hidden');
        this.settingsModal.setAttribute('aria-hidden', 'true');
    }

    changeLanguage(code) {
        this.selectedLanguage = code;
        if (this.recognition) this.recognition.lang = code === 'auto' ? 'en-US' : code;
        const label = this.languageSelect.options[this.languageSelect.selectedIndex].textContent;
        this.showToast(`Language set to ${label}`, 'info');
    }

    startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.sessionStartTime;
            const mm = String(Math.floor(elapsed / 60000)).padStart(2,'0');
            const ss = String(Math.floor((elapsed % 60000)/1000)).padStart(2,'0');
            this.timerDisplay.textContent = `${mm}:${ss}`;
        }, 1000);
    }
    stopTimer() {
        clearInterval(this.timerInterval);
        this.timerDisplay.textContent = '00:00';
    }

    updateUI() {
        if (this.isRecording) {
            this.micButton.classList.add('recording');
            this.micIcon.textContent = '⏹️';
            this.statusMessage.textContent = 'Recording… Click to stop';
            this.statusMessage.classList.add('recording');
        } else {
            this.micButton.classList.remove('recording');
            this.micIcon.textContent = '🎤';
            this.statusMessage.classList.remove('recording');
            if (!this.statusMessage.classList.contains('error')) {
                this.statusMessage.textContent = 'Ready to record – click the microphone';
            }
        }
        const hasContent = !!this.transcript.trim();
        this.clearBtn.disabled = !hasContent;
        this.exportBtn.disabled = !hasContent;
    }

    showToast(message, type='info') {
        if (!this.toastEl) return;
        this.toastEl.textContent = message;
        this.toastEl.className = `toast ${type}`;
        this.toastEl.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), 4500);
    }

    handleShortcuts(e) {
        if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.toggleRecording(); }
        if (e.key === 'Escape') { this.closeSettings(); }
        if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); this.exportTranscript(); }
        if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.clearTranscript(); }
    }
}

// Create global instance (will run after DOMContentLoaded hook)
new SimpleVoiceToText();