const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const WebSocket = require('ws');
const sessionManager = require('./sessionManager');
const { streamInterviewAnswer, transcribeAudio, isInterviewerQuestion } = require('./aiService');

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

// REST endpoint for asking a question
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required' });
    }
    try {
        const result = await streamInterviewAnswer(question.trim(), sessionManager);
        const historyItem = sessionManager.addHistoryItem({
            question: question.trim(),
            ...result
        });
        broadcast({ type: 'NEW_HISTORY_ITEM', data: historyItem });
        res.json(historyItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WEBSOCKET REALTIME SYSTEM ---

function broadcast(messageObj) {
    const payload = JSON.stringify(messageObj);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Reusable streaming answer pipeline
async function handleStreamingAnswer(question, ws) {
    const cleanQ = (question || '').trim();
    if (!cleanQ) return;

    console.log(`\n⚡ [AI Pipeline] Generating answer for question: "${cleanQ}"`);

    // Notify clients that answer generation has started
    broadcast({
        type: 'GENERATING_START',
        question: cleanQ
    });

    const result = await streamInterviewAnswer(
        cleanQ,
        sessionManager,
        // onChunk: stream delta tokens in real-time
        (delta, accumulated) => {
            broadcast({
                type: 'STREAM_CHUNK',
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
                data: historyItem,
                ...historyItem
            });

            // Broadcast history update to all clients
            broadcast({
                type: 'SESSION_UPDATE',
                history: sessionManager.getHistory()
            });

            console.log(`🚀 [AI Pipeline] Completed (${historyItem.category}) in ${finalParsed.latencyMs}ms`);
        }
    );

    return result;
}

wss.on('connection', (ws) => {
    console.log('✅ Client connected via WebSocket');

    // Immediately push full session state (history + preferences + profile + conversationLog)
    ws.send(JSON.stringify({
        type: 'SESSION_SYNC',
        data: sessionManager.getSession(),
        conversationLog: sessionManager.getConversationLog()
    }));

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
                    if (!audio) return;

                    const startTime = Date.now();
                    const transcript = await transcribeAudio(audio, mimeType);
                    const duration = Date.now() - startTime;

                    if (transcript && transcript.trim()) {
                        const isQuestion = isInterviewerQuestion(transcript);
                        console.log(`🎙️ [Transcribed ${speaker}] in ${duration}ms: "${transcript}" (isQuestion: ${isQuestion})`);

                        const msg = sessionManager.addConversationMessage({
                            speaker,
                            text: transcript,
                            isQuestion
                        });

                        broadcast({
                            type: 'SPEECH_TRANSCRIBED',
                            data: msg
                        });

                        // ONLY generate an answer if the INTERVIEWER asked a question and autoAnswer is ON!
                        // NEVER auto-trigger on candidate speech!
                        if (speaker === 'INTERVIEWER' && autoAnswer && isQuestion) {
                            console.log(`⚡ [Auto-Answer Triggered by Interviewer Question]: "${transcript}"`);
                            await handleStreamingAnswer(transcript, ws);
                        }
                    }
                    break;
                }

                case 'LOG_CANDIDATE_SPEECH': {
                    const text = (data.text || '').trim();
                    if (!text) return;

                    const msg = sessionManager.addConversationMessage({
                        speaker: 'CANDIDATE',
                        text,
                        isQuestion: false
                    });

                    broadcast({
                        type: 'SPEECH_TRANSCRIBED',
                        data: msg
                    });
                    console.log(`🗣️ [Candidate Voice]: "${text}" (Zero AI generation triggered)`);
                    break;
                }

                case 'CLEAR_CONVERSATION': {
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
