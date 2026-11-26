const https = require('https');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.GEMINI_API_KEY;
const CACHE_PATH = path.join(__dirname, '..', 'data', 'embeddings_cache.json');

// Reusable HTTPS agent for keep-alive connection pooling
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 20
});

// Load persistent disk cache
let cache = new Map();
try {
    if (fs.existsSync(CACHE_PATH)) {
        const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
            cache.set(k, v);
        }
    }
} catch (e) {
    console.warn('[EmbeddingService] Could not load embedding cache:', e.message);
}

function saveCache() {
    try {
        const obj = {};
        for (const [k, v] of cache.entries()) {
            obj[k] = v;
        }
        fs.writeFileSync(CACHE_PATH, JSON.stringify(obj), 'utf-8');
    } catch (e) {
        console.warn('[EmbeddingService] Could not save embedding cache:', e.message);
    }
}

// Simple deterministic hash for cache keys
function hashText(text) {
    let hash = 0;
    const clean = text.trim().toLowerCase();
    for (let i = 0; i < clean.length; i++) {
        hash = ((hash << 5) - hash) + clean.charCodeAt(i);
        hash |= 0;
    }
    return 'emb_' + hash + '_' + clean.length;
}

/**
 * Generate embedding for a single text chunk using Gemini API.
 */
async function generateGeminiEmbedding(text) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            content: { parts: [{ text: text.trim() }] }
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-embedding-001:embedContent?key=${API_KEY}`,
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 6000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Gemini embedding API returned HTTP ${res.statusCode}: ${data}`));
                }
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.embedding && Array.isArray(parsed.embedding.values)) {
                        resolve(parsed.embedding.values);
                    } else {
                        reject(new Error('Invalid embedding response structure'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('timeout', () => req.destroy(new Error('Embedding API request timed out')));
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Fallback lightweight local TF-IDF vectorizer (384 dimensions) if API is unavailable or offline.
 */
function generateLocalVector(text, dimensions = 384) {
    const vector = new Array(dimensions).fill(0);
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) return vector;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        let h = 0;
        for (let j = 0; j < word.length; j++) {
            h = ((h << 5) - h) + word.charCodeAt(j);
            h |= 0;
        }
        const index = Math.abs(h) % dimensions;
        vector[index] += 1 / Math.sqrt(words.length);
    }

    // Normalize vector to unit length
    let norm = 0;
    for (let v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < dimensions; i++) vector[i] /= norm;
    }
    return vector;
}

/**
 * Main function to get embedding for a text string, utilizing cache and fallbacks.
 */
async function getEmbedding(text) {
    if (!text || !text.trim()) {
        return new Array(3072).fill(0);
    }

    const key = hashText(text);
    if (cache.has(key)) {
        const cached = cache.get(key);
        // Ensure cached vector is a real dense Gemini embedding, not a sparse fallback
        if (cached && Array.isArray(cached) && cached.length === 3072) {
            let nonZeros = 0;
            for (let i = 0; i < 50; i++) {
                if (cached[i] !== 0) nonZeros++;
            }
            if (nonZeros > 15) {
                return cached;
            }
        }
    }

    try {
        const vector = await generateGeminiEmbedding(text);
        if (vector && Array.isArray(vector) && vector.length === 3072) {
            cache.set(key, vector);
            if (cache.size % 10 === 0) {
                saveCache();
            }
        }
        return vector;
    } catch (err) {
        console.warn(`[EmbeddingService] Remote embedding failed (${err.message}), using high-dimensional local vector.`);
        return generateLocalVector(text, 3072);
    }
}

/**
 * Batch generate embeddings with concurrency control.
 */
async function batchGetEmbeddings(texts, onProgress) {
    const results = [];
    const batchSize = 5;

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const promises = batch.map(t => getEmbedding(t));
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);

        if (onProgress) {
            onProgress(Math.min(i + batchSize, texts.length), texts.length);
        }
    }

    saveCache();
    return results;
}

module.exports = {
    getEmbedding,
    batchGetEmbeddings,
    generateLocalVector
};
