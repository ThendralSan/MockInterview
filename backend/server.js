const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const WebSocket = require('ws');
const sessionManager = require('./sessionManager');
const { streamInterviewAnswer } = require('./aiService');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- REST API ENDPOINTS ---

// Get current session state (profile, preferences, history)
app.get('/api/session', (req, res) => {
    res.json(sessionManager.getSession());
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

wss.on('connection', (ws) => {
    console.log('✅ Client connected via WebSocket');

    // Immediately push full session state (history + preferences + profile) upon connection
    ws.send(JSON.stringify({
        type: 'SESSION_SYNC',
        data: sessionManager.getSession()
    }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const msgType = data.type || (data.question ? 'ASK_QUESTION' : 'UNKNOWN');

            switch (msgType) {
                case 'ASK_QUESTION': {
                    const question = (data.question || '').trim();
                    if (!question) return;

                    console.log(`\n⚡ [WebSocket] Received question: "${question}"`);

                    // Notify frontend generation has started
                    ws.send(JSON.stringify({
                        type: 'GENERATING_START',
                        question
                    }));

                    // Run the low-latency streaming pipeline
                    const result = await streamInterviewAnswer(
                        question,
                        sessionManager,
                        // onChunk: stream delta tokens to client in real-time!
                        (delta, accumulated) => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'STREAM_CHUNK',
                                    delta,
                                    partialText: accumulated
                                }));
                            }
                        },
                        // onComplete: final parsed structured object
                        (finalParsed) => {
                            const historyItem = sessionManager.addHistoryItem({
                                question,
                                ...finalParsed
                            });

                            // Send final structured payload
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'AI_RESPONSE',
                                    data: historyItem,
                                    ...historyItem
                                }));
                            }

                            // Broadcast history update to all clients
                            broadcast({
                                type: 'SESSION_UPDATE',
                                history: sessionManager.getHistory()
                            });

                            console.log(`🚀 [WebSocket] Completed (${historyItem.category} - ${historyItem.questionType}) in ${finalParsed.latencyMs}ms`);
                        }
                    );
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
