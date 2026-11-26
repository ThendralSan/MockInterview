process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Process] Unhandled Rejection:', reason);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const sessionManager = require('./sessionManager');
const { streamInterviewAnswer, transcribeAudio, isInterviewerQuestion } = require('./aiService');
const ragService = require('./rag/ragService');
const ragDb = require('./rag/db');

// Setup multer storage for uploaded PDF & Markdown documents
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    }
});

const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.pdf', '.md', '.markdown', '.txt'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF (.pdf) and Markdown (.md, .txt) files are supported.'));
        }
    }
});

// Initialize RAG Vector Store & SQLite on boot
ragService.initialize().then(() => {
    console.log('📚 [RAG Engine] Knowledge Base & Vector Store Initialized');
}).catch(err => {
    console.warn('⚠️ [RAG Engine] Initialization notice:', err.message);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support base64 audio payloads

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- REST API ENDPOINTS ---

// Get current session state (profile, preferences, history, conversationLog)
app.get('/api/session', (req, res) => {
    res.json({
        ...sessionManager.getSession(),
        conversationLog: sessionManager.getConversationLog()
    });
});

// Update candidate profile and formatting preferences
app.post('/api/session/preferences', (req, res) => {
    const { preferences, candidateProfile } = req.body;
    const updated = sessionManager.updatePreferences(preferences, candidateProfile);
    broadcast({ type: 'PREFERENCES_UPDATED', data: updated });
    res.json(updated);
});

// Clear question history
app.post('/api/session/clear-history', (req, res) => {
    const updated = sessionManager.clearHistory();
    broadcast({ type: 'HISTORY_CLEARED', data: updated });
    res.json(updated);
});

// Clear conversation log
app.post('/api/session/clear-conversation', (req, res) => {
    const updated = sessionManager.clearConversationLog();
    broadcast({ type: 'CONVERSATION_CLEARED', data: updated });
    res.json(updated);
});

// Reset session to default
app.post('/api/session/reset', (req, res) => {
    const updated = sessionManager.resetSession();
    broadcast({ type: 'SESSION_RESET', data: updated });
    res.json(updated);
});

// REST endpoint for asking a question (returns both RAG & AI answers)
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required' });
    }
    const cleanQ = question.trim();
    try {
        const [ragResult, aiResult] = await Promise.all([
            ragService.search(cleanQ).catch(() => null),
            streamInterviewAnswer(cleanQ, sessionManager)
        ]);
        const historyItem = sessionManager.addHistoryItem({
            question: cleanQ,
            ragResult: ragResult?.isMatch ? ragResult : null,
            ...aiResult
        });
        broadcast({ type: 'NEW_HISTORY_ITEM', data: historyItem });
        res.json({
            ...historyItem,
            ragAnswer: ragResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WEBSOCKET REALTIME SYSTEM ---

function broadcast(messageObj) {
    const payload = JSON.stringify(messageObj);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(payload, (err) => {
                    if (err) console.warn('[WS] Send error:', err.message);
                });
            } catch (e) {
                console.warn('[WS] Broadcast exception:', e.message);
            }
        }
    });
}

// --- KNOWLEDGE BASE MANAGEMENT REST APIS ---

// Upload and ingest document (PDF or Markdown)
app.post('/api/knowledge/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please upload a PDF or Markdown file.' });
    }
    try {
        const category = req.body.category || null;
        const result = await ragService.ingestDocument(req.file.path, req.file.originalname, req.file.size, category);
        broadcast({ type: 'KNOWLEDGE_BASE_UPDATED' });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[API /api/knowledge/upload] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// List all indexed documents
app.get('/api/knowledge/documents', (req, res) => {
    try {
        const docs = ragDb.getDocuments();
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete document and all associated questions & vectors
app.delete('/api/knowledge/documents/:id', (req, res) => {
    try {
        const deleted = ragDb.deleteDocument(req.params.id);
        ragService.initialize(); // Refresh in-memory vector store
        broadcast({ type: 'KNOWLEDGE_BASE_UPDATED' });
        res.json({ success: true, deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Re-index an existing document
app.post('/api/knowledge/reindex/:id', async (req, res) => {
    try {
        const result = await ragService.reindexDocument(req.params.id);
        broadcast({ type: 'KNOWLEDGE_BASE_UPDATED' });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get stored questions with optional category or text search
app.get('/api/knowledge/questions', (req, res) => {
    try {
        const { category, search } = req.query;
        const questions = ragDb.getAllQuestions({ category, search });
        res.json(questions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add manual question
app.post('/api/knowledge/questions', async (req, res) => {
    const { question, answer, category, code } = req.body;
    if (!question || !question.trim() || !answer || !answer.trim()) {
        return res.status(400).json({ error: 'Both question and answer are required' });
    }
    try {
        const record = await ragService.addQuestion({ question, answer, category, code });
        broadcast({ type: 'KNOWLEDGE_BASE_UPDATED' });
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update manual question
app.put('/api/knowledge/questions/:id', async (req, res) => {
    try {
        const updated = await ragService.updateQuestion(req.params.id, req.body);
        broadcast({ type: 'KNOWLEDGE_BASE_UPDATED' });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete question
app.delete('/api/knowledge/questions/:id', async (req, res) => {
    try {
        const success = await ragService.deleteQuestion(req.params.id);
        broadcast({ type: 'KNOWLEDGE_BASE_UPDATED' });
        res.json({ success });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all categories
app.get('/api/knowledge/categories', (req, res) => {
    try {
        const cats = ragDb.getCategories();
        res.json(cats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add custom category
app.post('/api/knowledge/categories', (req, res) => {
    try {
        const { name } = req.body;
        ragDb.addCategory(name);
        res.json({ success: true, categories: ragDb.getCategories() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RAG Search API
app.post('/api/rag/search', async (req, res) => {
    const qText = req.body.question || req.body.query;
    const { threshold, topK } = req.body;
    if (!qText || !qText.trim()) {
        return res.status(400).json({ error: 'Question or query is required' });
    }
    try {
        const result = await ragService.search(qText.trim(), { threshold, topK });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RAG System Health & Status
app.get('/api/rag/health', (req, res) => {
    res.json({
        status: 'UP',
        ...ragService.getStats()
    });
});

// Reusable parallel answer dispatcher (Engine 1: RAG + Engine 2: Gemini AI)
async function handleStreamingAnswer(question, ws) {
    const cleanQ = (question || '').trim();
    if (!cleanQ) return;

    // Mark corresponding question message as answered so further speech starts a new bubble
    sessionManager.markMessageAnswered(cleanQ);

    const questionId = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    console.log(`\n⚡ [Parallel Dispatcher] Generating dual answers for: "${cleanQ}" (ID: ${questionId})`);

    // Notify clients that answer generation has started
    broadcast({
        type: 'GENERATING_START',
        questionId,
        question: cleanQ
    });

    // --- ENGINE 1: RAG PREPARED ANSWER (Simultaneous Execution) ---
    const ragPromise = (async () => {
        const t0 = Date.now();
        try {
            const ragResult = await ragService.search(cleanQ);
            const durationMs = Date.now() - t0;
            console.log(`📘 [RAG Engine] Finished in ${durationMs}ms (match: ${ragResult.isMatch}, confidence: ${ragResult.confidence}%)`);

            broadcast({
                type: 'RAG_RESPONSE',
                questionId,
                question: cleanQ,
                durationMs,
                ...ragResult
            });
            return ragResult;
        } catch (ragErr) {
            console.warn('[RAG Engine] Error:', ragErr.message);
            broadcast({
                type: 'RAG_RESPONSE',
                questionId,
                question: cleanQ,
                isMatch: false,
                confidence: 0,
                error: ragErr.message,
                message: 'RAG search encountered an error.'
            });
            return null;
        }
    })();

    // --- ENGINE 2: GEMINI AI REAL-TIME ANSWER (Simultaneous Execution) ---
    const geminiPromise = (async () => {
        try {
            const result = await streamInterviewAnswer(
                cleanQ,
                sessionManager,
                // onChunk: stream delta tokens in real-time
                (delta, accumulated) => {
                    broadcast({
                        type: 'STREAM_CHUNK',
                        questionId,
                        delta,
                        partialText: accumulated
                    });
                },
                // onComplete: final parsed structured object
                (finalParsed) => {
                    const historyItem = sessionManager.addHistoryItem({
                        question: cleanQ,
                        ...finalParsed
                    });

                    // Send final structured payload to all clients
                    broadcast({
                        type: 'AI_RESPONSE',
                        questionId,
                        data: historyItem,
                        ...historyItem
                    });

                    // Broadcast history update to all clients
                    broadcast({
                        type: 'SESSION_UPDATE',
                        history: sessionManager.getHistory()
                    });

                    console.log(`🚀 [Gemini Engine] Completed (${historyItem.category}) in ${finalParsed.latencyMs}ms`);
                }
            );
            return result;
        } catch (geminiErr) {
            console.error('[Gemini Engine] Error:', geminiErr.message);
            broadcast({
                type: 'AI_ERROR',
                questionId,
                message: geminiErr.message
            });
            return null;
        }
    })();

    // Run both simultaneously without either blocking the other
    return Promise.allSettled([ragPromise, geminiPromise]);
}

wss.on('connection', (ws) => {
    console.log('✅ Client connected via WebSocket');

    ws.on('error', (err) => {
        console.warn('[WS] Client socket notice:', err.message);
    });

    // Immediately push full session state (history + preferences + profile + conversationLog)
    try {
        ws.send(JSON.stringify({
            type: 'SESSION_SYNC',
            data: sessionManager.getSession(),
            conversationLog: sessionManager.getConversationLog()
        }));
    } catch (e) {
        console.warn('[WS] Sync send error:', e.message);
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const msgType = data.type || (data.question ? 'ASK_QUESTION' : 'UNKNOWN');

            switch (msgType) {
                case 'ASK_QUESTION': {
                    const question = (data.question || '').trim();
                    if (!question) return;
                    await handleStreamingAnswer(question, ws);
                    break;
                }

                case 'TRANSCRIBE_AUDIO': {
                    const { audio, mimeType = 'audio/webm', speaker = 'INTERVIEWER', autoAnswer = false } = data;
                    if (!audio) {
                        try { ws.send(JSON.stringify({ type: 'TRANSCRIBE_ACK', success: false })); } catch (e) { }
                        return;
                    }

                    const startTime = Date.now();
                    let transcript = '';
                    try {
                        transcript = await transcribeAudio(audio, mimeType);
                    } catch (sttErr) {
                        console.warn('[Server] transcribeAudio error:', sttErr.message);
                    }
                    const duration = Date.now() - startTime;

                    // Release frontend STT concurrency lock immediately
                    try {
                        ws.send(JSON.stringify({
                            type: 'TRANSCRIBE_ACK',
                            success: true,
                            hasTranscript: !!(transcript && transcript.trim()),
                            durationMs: duration
                        }));
                    } catch (e) { }

                    if (transcript && transcript.trim()) {
                        const msg = sessionManager.addConversationMessage({
                            speaker,
                            text: transcript
                        });

                        if (msg) {
                            console.log(`🎙️ [Transcribed ${speaker}] in ${duration}ms: "${transcript}" -> Combined: "${msg.text}" (isQuestion: ${msg.isQuestion})`);
                            broadcast({
                                type: 'SPEECH_TRANSCRIBED',
                                data: msg
                            });
                        }
                    }
                    break;
                }

                case 'LOG_CANDIDATE_SPEECH': {
                    const text = (data.text || '').trim();
                    if (!text) return;

                    const msg = sessionManager.addConversationMessage({
                        id: data.id,
                        speaker: 'CANDIDATE',
                        text,
                        isQuestion: data.isQuestion !== undefined ? !!data.isQuestion : false
                    });

                    if (msg) {
                        broadcast({
                            type: 'SPEECH_TRANSCRIBED',
                            data: msg
                        });
                        console.log(`🗣️ [Candidate Voice]: "${text}" (Zero AI generation triggered)`);
                    }
                    break;
                }

                case 'LOG_INTERVIEWER_SPEECH': {
                    const text = (data.text || '').trim();
                    if (!text) return;

                    const msg = sessionManager.addConversationMessage({
                        id: data.id,
                        speaker: 'INTERVIEWER',
                        text,
                        isQuestion: data.isQuestion !== undefined ? !!data.isQuestion : false
                    });

                    if (msg) {
                        broadcast({
                            type: 'SPEECH_TRANSCRIBED',
                            data: msg
                        });
                        console.log(`🎙️ [Interviewer Voice Logged]: "${text}" (isQuestion: ${msg.isQuestion})`);
                    }
                    break;
                }

                case 'CLEAR_CONVERSATION': {
                    if (ws.interviewerAutoAnswerTimer) {
                        clearTimeout(ws.interviewerAutoAnswerTimer);
                        ws.interviewerAutoAnswerTimer = null;
                    }
                    sessionManager.clearConversationLog();
                    broadcast({ type: 'CONVERSATION_CLEARED' });
                    console.log('[WebSocket] Conversation log cleared.');
                    break;
                }

                case 'UPDATE_PREFERENCES': {
                    const updated = sessionManager.updatePreferences(data.preferences, data.candidateProfile);
                    broadcast({ type: 'PREFERENCES_UPDATED', data: updated });
                    console.log('[WebSocket] Session preferences updated.');
                    break;
                }

                case 'CLEAR_HISTORY': {
                    const updated = sessionManager.clearHistory();
                    broadcast({ type: 'HISTORY_CLEARED', data: updated });
                    console.log('[WebSocket] History cleared.');
                    break;
                }

                case 'RESET_SESSION': {
                    const updated = sessionManager.resetSession();
                    broadcast({ type: 'SESSION_RESET', data: updated });
                    console.log('[WebSocket] Session reset.');
                    break;
                }

                default:
                    console.log(`[WebSocket] Unknown message type: ${msgType}`);
            }
        } catch (err) {
            console.error('[WebSocket] Message handling error:', err);
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: err.message
            }));
        }
    });

    ws.on('close', () => {
        if (ws.interviewerAutoAnswerTimer) {
            clearTimeout(ws.interviewerAutoAnswerTimer);
            ws.interviewerAutoAnswerTimer = null;
        }
        console.log('Client disconnected from WebSocket');
    });
});

// --- STATIC ASSETS & SINGLE-PORT PRODUCTION SERVING ---
const distPath = path.join(__dirname, '../frontend/dist/frontend/browser');
const fs = require('fs');

if (fs.existsSync(distPath)) {
    console.log(`📦 Serving compiled Angular frontend from: ${distPath}`);
    app.use(express.static(distPath));
    // SPA fallback for all frontend routes
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            return res.sendFile(path.join(distPath, 'index.html'));
        }
        next();
    });
}

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🤖 Mock Interview Copilot Ultra-Fast Engine`);
    console.log(`🌐 Web App Interface: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${PORT}`);
    console.log(`⚡ Streaming Model: gemini-flash-lite-latest (Sub-2s pipeline)`);
    console.log(`=======================================================`);
});
