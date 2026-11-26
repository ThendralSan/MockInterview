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
        const cleanQ = (item.question || '').trim();

        // Deduplicate: If latest history item has identical question or very close match within 30 seconds, update it!
        if (this.sessionData.history.length > 0) {
            const lastItem = this.sessionData.history[this.sessionData.history.length - 1];
            const timeDiff = Date.now() - new Date(lastItem.timestamp).getTime();
            const lastClean = (lastItem.question || '').trim().toLowerCase();
            const currentClean = cleanQ.toLowerCase();

            if (timeDiff < 30000 && (lastClean === currentClean || lastClean.includes(currentClean) || currentClean.includes(lastClean))) {
                console.log(`[SessionManager] Updating recent history item for "${cleanQ}" (avoiding duplicate card)`);
                lastItem.question = cleanQ;
                lastItem.category = item.category || lastItem.category;
                lastItem.answer = answerText;
                lastItem.spokenAnswer = answerText;
                lastItem.bulletPoints = bullets;
                lastItem.code = item.code || lastItem.code;
                lastItem.latencyMs = item.latencyMs || lastItem.latencyMs;
                lastItem.ragAnswer = item.ragAnswer || item.ragResult || lastItem.ragAnswer || null;
                lastItem.timestamp = new Date().toISOString();
                this.saveSession();
                return lastItem;
            }
        }

        const historyItem = {
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            question: cleanQ,
            category: item.category || 'TECHNICAL',
            answer: answerText,
            spokenAnswer: answerText,
            bulletPoints: bullets,
            code: item.code || null,
            latencyMs: item.latencyMs || 0,
            firstTokenMs: item.firstTokenMs || 0,
            ragAnswer: item.ragAnswer || item.ragResult || null
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

    addConversationMessage({ id, speaker = 'INTERVIEWER', text = '', isQuestion }) {
        if (!text || !text.trim()) return null;
        if (!Array.isArray(this.sessionData.conversationLog)) {
            this.sessionData.conversationLog = [];
        }

        const cleanText = text.trim();
        const cleanSpeaker = speaker.toUpperCase() === 'CANDIDATE' ? 'CANDIDATE' : 'INTERVIEWER';
        const now = Date.now();
        const { isInterviewerQuestion, normalizeQuestionText } = require('./aiService');

        // 1. If explicit ID provided, check if that message already exists in conversationLog
        if (id) {
            const existingById = this.sessionData.conversationLog.find(m => m.id === id);
            if (existingById) {
                existingById.text = cleanText;
                if (isQuestion !== undefined) existingById.isQuestion = !!isQuestion;
                existingById.timestamp = new Date().toISOString();
                this.saveSession();
                console.log(`[SessionManager] Updated existing message by ID (${id}): "${cleanText}"`);
                return existingById;
            }
        }

        // 2. For CANDIDATE speech: Prevent duplicate cards if recent candidate message exists with matching text
        if (cleanSpeaker === 'CANDIDATE' && this.sessionData.conversationLog.length > 0) {
            const lastMsg = this.sessionData.conversationLog[this.sessionData.conversationLog.length - 1];
            const timeDiff = now - new Date(lastMsg.timestamp).getTime();
            if (lastMsg.speaker === 'CANDIDATE' && timeDiff < 15000) {
                const lastClean = (lastMsg.text || '').trim().toLowerCase();
                const currClean = cleanText.toLowerCase();
                if (lastClean === currClean || lastClean.includes(currClean) || currClean.includes(lastClean)) {
                    console.log(`[SessionManager] Updating recent candidate message in-place to avoid duplicate card: "${cleanText}"`);
                    lastMsg.text = cleanText;
                    if (id) lastMsg.id = id;
                    if (isQuestion !== undefined) lastMsg.isQuestion = !!isQuestion;
                    lastMsg.timestamp = new Date().toISOString();
                    this.saveSession();
                    return lastMsg;
                }
            }
        }

        // Progressive question continuation for INTERVIEWER:
        // Stitch multi-part clauses (e.g. "What is the difference between..." + "MVC versus ASP.NET Core")
        // into ONE continuous, complete question bubble without splitting or duplicating!
        if (cleanSpeaker === 'INTERVIEWER' && this.sessionData.conversationLog.length > 0) {
            const lastMsg = this.sessionData.conversationLog[this.sessionData.conversationLog.length - 1];
            const timeDiff = now - new Date(lastMsg.timestamp).getTime();

            if (lastMsg.speaker === 'INTERVIEWER' && (!lastMsg.answered || !lastMsg.isQuestion) && timeDiff < 7000) {
                const lastTrimmed = (lastMsg.text || '').trim();
                const lastWords = lastTrimmed.split(/\s+/);
                const lastWord = lastWords[lastWords.length - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
                const newWords = cleanText.split(/\s+/);
                const firstNewWord = newWords[0].toLowerCase().replace(/[^a-z0-9]/g, '');

                const QUESTION_STARTER_REGEX = /^(what|how|why|when|where|which|who|can you|could you|would you|have you|did you|tell me|explain|describe|walk me|is there|are there|do you|differentiate|define|difference between|compare)\b/i;
                const CONTINUATION_WORDS = new Set(['and', 'or', 'versus', 'vs', 'between', 'with', 'without', 'in', 'on', 'at', 'to', 'for', 'of', 'from', 'into', 'also', 'furthermore', 'additionally']);
                const DANGLING_WORDS = new Set(['and', 'or', 'but', 'because', 'so', 'yet', 'while', 'since', 'if', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'between', 'under', 'versus', 'vs', 'of', 'the', 'a', 'an', 'this', 'that', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'can', 'could', 'which', 'who', 'how', 'what', 'why']);
                const INCOMPLETE_MODIFIERS = new Set(['dependency', 'virtual', 'shadow', 'solid', 'entity', 'stored', 'action', 'model', 'view', 'change', 'single', 'cross', 'rest', 'web', 'object']);

                const isLastIncomplete = !lastMsg.isQuestion || DANGLING_WORDS.has(lastWord) || INCOMPLETE_MODIFIERS.has(lastWord) || (QUESTION_STARTER_REGEX.test(lastTrimmed) && !lastTrimmed.includes('?'));
                const isNewContinuation = CONTINUATION_WORDS.has(firstNewWord) || !QUESTION_STARTER_REGEX.test(cleanText) || /^[a-z]/.test(cleanText);

                // If last message was incomplete, or new chunk is a continuation, or word count is under 28 words: STITCH!
                if ((isLastIncomplete || isNewContinuation) && lastWords.length < 28) {
                    // Strip trailing periods or commas from previous clause (Gemini STT punctuation artifact)
                    const strippedLast = lastTrimmed.replace(/[.,;:\s]+$/, '').trim();
                    const strippedNew = cleanText.replace(/^[.,;:\s]+/, '').trim();

                    // If incoming chunk repeats the tail of previous chunk (acoustic overlap), avoid duplicating
                    const lastLower = strippedLast.toLowerCase();
                    const newLower = strippedNew.toLowerCase();
                    if (lastLower.endsWith(newLower)) {
                        return lastMsg;
                    }

                    // Cleanly stitch
                    const combined = `${strippedLast} ${strippedNew}`.trim();
                    lastMsg.text = normalizeQuestionText(combined);
                    lastMsg.isQuestion = isInterviewerQuestion(lastMsg.text);
                    lastMsg.timestamp = new Date().toISOString();
                    this.saveSession();
                    console.log(`[SessionManager] Stitched interviewer clauses: "${strippedLast}" + "${strippedNew}" -> "${lastMsg.text}" (isQuestion: ${lastMsg.isQuestion})`);
                    return lastMsg;
                }
            }
        }

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

        const initialIsQuestion = isQuestion !== undefined ? !!isQuestion : (cleanSpeaker === 'INTERVIEWER' ? isInterviewerQuestion(cleanText) : false);

        const msg = {
            id: id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
            timestamp: new Date().toISOString(),
            speaker: cleanSpeaker,
            text: cleanText,
            isQuestion: initialIsQuestion,
            answered: false
        };
        this.sessionData.conversationLog.push(msg);
        if (this.sessionData.conversationLog.length > 150) {
            this.sessionData.conversationLog.shift();
        }
        this.saveSession();
        return msg;
    }

    markMessageAnswered(questionText) {
        if (!this.sessionData.conversationLog || !questionText) return;
        const clean = questionText.toLowerCase().trim();
        for (let i = this.sessionData.conversationLog.length - 1; i >= 0; i--) {
            const msg = this.sessionData.conversationLog[i];
            if (msg.speaker === 'INTERVIEWER' && !msg.answered) {
                const msgClean = msg.text.toLowerCase().trim();
                if (msgClean === clean || clean.includes(msgClean) || msgClean.includes(clean)) {
                    msg.answered = true;
                    this.saveSession();
                    break;
                }
            }
        }
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

