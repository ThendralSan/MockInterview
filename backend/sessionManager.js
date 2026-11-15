const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'data', 'session_store.json');

const DEFAULT_PROFILE = {
    experienceYears: 7,
    primarySkills: "C#, ASP.NET, ASP.NET Core, ASP.NET MVC, Entity Framework Core, SQL Server, Microsoft Azure, React, Angular",
    secondarySkills: "TypeScript, Microservices, Docker, Kubernetes, Redis, Kafka, RabbitMQ, CI/CD",
    targetRole: "Senior Full Stack Developer",
    answerStyle: "Direct, practical, natural spoken English, 30-45 seconds, strictly isolated to the requested technology",
    spokenDuration: "30-45 seconds"
};

const DEFAULT_PREFERENCES = {
    preferredFormat: "STANDARD", // STANDARD | EXECUTIVE_SUMMARY | HIGH_LEVEL_ELIF5 | DEEP_DIVE | CUSTOM
    customFormattingRules: "", // Any persistent formatting rule requested by the user
    audioSettings: {
        autoTts: true,
        speechRate: 1.05,
        voiceURI: ""
    }
};

class SessionManager {
    constructor() {
        this.sessionData = {
            sessionId: 'default-session',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            candidateProfile: { ...DEFAULT_PROFILE },
            preferences: { ...DEFAULT_PREFERENCES },
            history: [],
            conversationLog: []
        };
        this.loadSession();
    }

    loadSession() {
        try {
            if (fs.existsSync(STORE_PATH)) {
                const raw = fs.readFileSync(STORE_PATH, 'utf-8');
                const parsed = JSON.parse(raw);
                this.sessionData = {
                    ...this.sessionData,
                    ...parsed,
                    candidateProfile: { ...DEFAULT_PROFILE, ...(parsed.candidateProfile || {}) },
                    preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) },
                    history: Array.isArray(parsed.history) ? parsed.history : [],
                    conversationLog: Array.isArray(parsed.conversationLog) ? parsed.conversationLog : []
                };
                console.log(`[SessionManager] Loaded session: ${this.sessionData.history.length} answers, ${this.sessionData.conversationLog.length} conversation messages.`);
            } else {
                this.saveSession();
            }
        } catch (err) {
            console.error('[SessionManager] Error reading session store:', err.message);
        }
    }

    saveSession() {
        try {
            const dir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.sessionData.updatedAt = new Date().toISOString();
            fs.writeFileSync(STORE_PATH, JSON.stringify(this.sessionData, null, 2), 'utf-8');
        } catch (err) {
            console.error('[SessionManager] Error saving session store:', err.message);
        }
    }

    getSession() {
        return this.sessionData;
    }

    getCandidateProfile() {
        return this.sessionData.candidateProfile;
    }

    getPreferences() {
        return this.sessionData.preferences;
    }

    updatePreferences(newPreferences = {}, newProfile = {}) {
        if (newPreferences && Object.keys(newPreferences).length > 0) {
            this.sessionData.preferences = {
                ...this.sessionData.preferences,
                ...newPreferences
            };
        }
        if (newProfile && Object.keys(newProfile).length > 0) {
            this.sessionData.candidateProfile = {
                ...this.sessionData.candidateProfile,
                ...newProfile
            };
        }
        this.saveSession();
        return this.sessionData;
    }

    addHistoryItem(item) {
        const answerText = item.answer || item.spokenAnswer || '';
        const bullets = item.bulletPoints || item.technicalDeepDivePoints || item.keyPoints || [];
        const historyItem = {
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            question: item.question,
            category: item.category || 'TECHNICAL',
            answer: answerText,
            spokenAnswer: answerText,
            bulletPoints: bullets,
            code: item.code || null,
            latencyMs: item.latencyMs || 0,
            firstTokenMs: item.firstTokenMs || 0
        };

        this.sessionData.history.push(historyItem);
        // Keep max 50 items in history
        if (this.sessionData.history.length > 50) {
            this.sessionData.history.shift();
        }
        this.saveSession();
        return historyItem;
    }

    getHistory() {
        return this.sessionData.history;
    }

    clearHistory() {
        this.sessionData.history = [];
        this.saveSession();
        return this.sessionData;
    }

    addConversationMessage({ speaker = 'INTERVIEWER', text = '', isQuestion = false }) {
        if (!text || !text.trim()) return null;
        if (!Array.isArray(this.sessionData.conversationLog)) {
            this.sessionData.conversationLog = [];
        }

        const cleanText = text.trim();
        const cleanSpeaker = speaker.toUpperCase() === 'CANDIDATE' ? 'CANDIDATE' : 'INTERVIEWER';
        const now = Date.now();

        // Deduplicate rapid consecutive identical messages from same speaker within 2.5 seconds
        const recent = this.sessionData.conversationLog.slice(-4);
        for (const prev of recent) {
            const timeDiff = now - new Date(prev.timestamp).getTime();
            if (prev.speaker === cleanSpeaker && timeDiff < 2500) {
                if (prev.text.toLowerCase().trim() === cleanText.toLowerCase().trim()) {
                    console.log(`[SessionManager] Deduplicated consecutive message from ${cleanSpeaker}: "${cleanText}"`);
                    return null;
                }
            }
        }

        // Progressive continuation: If previous message from INTERVIEWER was an incomplete fragment and within 5 seconds, stitch together
        if (cleanSpeaker === 'INTERVIEWER' && this.sessionData.conversationLog.length > 0) {
            const lastMsg = this.sessionData.conversationLog[this.sessionData.conversationLog.length - 1];
            const timeDiff = now - new Date(lastMsg.timestamp).getTime();
            if (lastMsg.speaker === 'INTERVIEWER' && timeDiff < 5000 && !lastMsg.text.endsWith('?')) {
                lastMsg.text = `${lastMsg.text} ${cleanText}`.trim();
                lastMsg.isQuestion = !!isQuestion;
                lastMsg.timestamp = new Date().toISOString();
                this.saveSession();
                return lastMsg;
            }
        }

        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            speaker: cleanSpeaker,
            text: cleanText,
            isQuestion: !!isQuestion
        };
        this.sessionData.conversationLog.push(msg);
        if (this.sessionData.conversationLog.length > 150) {
            this.sessionData.conversationLog.shift();
        }
        this.saveSession();
        return msg;
    }

    getConversationLog() {
        return this.sessionData.conversationLog || [];
    }

    clearConversationLog() {
        this.sessionData.conversationLog = [];
        this.saveSession();
        return this.sessionData;
    }

    resetSession() {
        this.sessionData = {
            sessionId: 'session_' + Date.now(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            candidateProfile: { ...DEFAULT_PROFILE },
            preferences: { ...DEFAULT_PREFERENCES },
            history: [],
            conversationLog: []
        };
        this.saveSession();
        return this.sessionData;
    }

    /**
     * Builds a lightweight semantic context summary for the LLM.
     * Crucially, this ONLY summarizes topics discussed, avoiding raw JSON or formatting templates.
     * This prevents ChatGPT-style "formatting mimicry" while maintaining multi-turn context!
     */
    getContextSummary() {
        if (!this.sessionData.history || this.sessionData.history.length === 0) {
            return "No previous questions in this interview session.";
        }

        const recent = this.sessionData.history.slice(-5);
        return recent.map((item, idx) => {
            return `Turn ${idx + 1}: Interviewer asked "${item.question}".`;
        }).join('\n');
    }
}

module.exports = new SessionManager();

