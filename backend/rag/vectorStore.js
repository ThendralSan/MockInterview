const { getEmbedding } = require('./embeddingService');
const db = require('./db');

/**
 * High-Performance In-Memory Hybrid Vector Store & Retriever
 * Combines O(1) Exact Matching, Normalized Text Indexing, BM25 Keyword Search,
 * and Cosine Vector Similarity.
 */

const STOP_WORDS = new Set([
    'what', 'is', 'are', 'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 
    'from', 'by', 'as', 'do', 'does', 'did', 'how', 'why', 'where', 'when', 'which', 'who', 'whom', 
    'can', 'could', 'would', 'should', 'will', 'you', 'your', 'i', 'my', 'we', 'our', 'it', 'its', 
    'this', 'that', 'these', 'those', 'there', 'have', 'has', 'had', 'having', 'be', 'been', 'being', 
    'between', 'into', 'through', 'about', 'above', 'below', 'up', 'down', 'out', 'tell', 'me', 'explain'
]);

class VectorStore {
    constructor() {
        this.items = []; // Array of { id, question, answer, code, category, sourceName, normalized, vector }
        this.normalizedIndex = new Map(); // normalizedQuestion -> item
        this.isLoaded = false;
        this.confidenceThreshold = 0.45; // Configurable threshold (45% combined relevance)
    }

    /**
     * Normalizes text for clean semantic and hash indexing
     */
    normalize(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Preloads all indexed vectors and question metadata into memory on backend boot.
     */
    async preload() {
        try {
            console.log('[VectorStore] Preloading vector index from SQLite database...');
            const rows = db.getAllEmbeddingsWithQuestions();
            this.items = rows.map(r => ({
                id: r.id,
                documentId: r.document_id,
                question: r.question,
                answer: r.answer,
                code: r.code,
                category: r.category,
                sourceName: r.source_name,
                normalized: this.normalize(r.question),
                vector: r.vector
            }));

            this.normalizedIndex.clear();
            for (const item of this.items) {
                this.normalizedIndex.set(item.normalized, item);
            }

            this.isLoaded = true;
            console.log(`✅ [VectorStore] Preloaded ${this.items.length} questions into memory index.`);
        } catch (err) {
            console.error('[VectorStore] Error preloading vectors:', err.message);
        }
    }

    /**
     * Adds or updates a single item in memory
     */
    addItem(item, vector) {
        const normalized = this.normalize(item.question);
        const entry = {
            id: item.id,
            documentId: item.documentId,
            question: item.question,
            answer: item.answer,
            code: item.code || null,
            category: item.category || 'GENERAL',
            sourceName: item.sourceName || 'Manual Entry',
            normalized,
            vector
        };

        const existingIdx = this.items.findIndex(i => i.id === item.id);
        if (existingIdx !== -1) {
            this.items[existingIdx] = entry;
        } else {
            this.items.push(entry);
        }

        this.normalizedIndex.set(normalized, entry);
    }

    /**
     * Removes an item by ID
     */
    removeItem(id) {
        const idx = this.items.findIndex(i => i.id === id);
        if (idx !== -1) {
            const item = this.items[idx];
            this.normalizedIndex.delete(item.normalized);
            this.items.splice(idx, 1);
        }
    }

    /**
     * Computes Cosine Similarity between two float vectors.
     */
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Keyword / Token Overlap Score with stop-word filtering
     */
    keywordScore(queryTokens, item) {
        const meaningfulTokens = queryTokens.filter(t => t.length > 2 && !STOP_WORDS.has(t));
        if (meaningfulTokens.length === 0) return 0;
        const qText = item.normalized;
        let matched = 0;
        for (const token of meaningfulTokens) {
            // Match exact token or root prefix (e.g. "join" matches "joins", "queri" matches "queries")
            const stem = token.length > 4 ? token.slice(0, -1) : token;
            if (qText.includes(token) || qText.includes(stem)) {
                matched++;
            }
        }
        return matched / meaningfulTokens.length;
    }

    /**
     * Hybrid Search:
     * 1. Exact / Normalized Match (Instant, 0ms)
     * 2. Semantic Vector Similarity (Cosine)
     * 3. Keyword / BM25 token relevance
     * 4. Weighted Fusion & Confidence Thresholding
     */
    async search(rawQuery, options = {}) {
        const startTime = Date.now();
        const threshold = options.threshold !== undefined ? options.threshold : this.confidenceThreshold;
        const topK = options.topK || 3;
        const query = rawQuery.trim();
        const normalizedQuery = this.normalize(query);

        if (!normalizedQuery || this.items.length === 0) {
            return {
                isMatch: false,
                confidence: 0,
                durationMs: Date.now() - startTime,
                message: this.items.length === 0 ? "Knowledge base is empty. Upload documents or add questions first." : "Empty query",
                candidates: []
            };
        }

        // Step 1: O(1) Exact Normalized Match Check
        if (this.normalizedIndex.has(normalizedQuery)) {
            const match = this.normalizedIndex.get(normalizedQuery);
            return {
                isMatch: true,
                confidence: 100,
                strategy: 'EXACT_MATCH',
                durationMs: Date.now() - startTime,
                question: match.question,
                answer: match.answer,
                code: match.code,
                category: match.category,
                sourceName: match.sourceName,
                candidates: [{ ...match, score: 1.0 }]
            };
        }

        // Substring / Sub-phrase Match check (e.g. interviewer question contains exact prepared question)
        for (const item of this.items) {
            if (item.normalized.length >= 12 && (normalizedQuery.includes(item.normalized) || item.normalized.includes(normalizedQuery))) {
                return {
                    isMatch: true,
                    confidence: 96,
                    strategy: 'SUBSTRING_MATCH',
                    durationMs: Date.now() - startTime,
                    question: item.question,
                    answer: item.answer,
                    code: item.code,
                    category: item.category,
                    sourceName: item.sourceName,
                    candidates: [{ ...item, score: 0.96 }]
                };
            }
        }

        // Step 2 & 3: Semantic Vector Search + BM25 Keyword Search
        const queryVector = await getEmbedding(query);
        const queryTokens = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

        const scored = [];
        for (const item of this.items) {
            const semanticSim = this.cosineSimilarity(queryVector, item.vector);
            const kwScore = this.keywordScore(queryTokens, item);

            // Dynamic Hybrid Scoring:
            // High technical keyword overlap provides a floor score so slight rephrasings match reliably
            let hybridScore;
            if (kwScore >= 0.70) {
                hybridScore = Math.max((0.60 * semanticSim) + (0.40 * kwScore), kwScore * 0.90);
            } else if (kwScore >= 0.45) {
                hybridScore = Math.max((0.65 * semanticSim) + (0.35 * kwScore), kwScore * 0.80);
            } else {
                hybridScore = (0.75 * semanticSim) + (0.25 * kwScore);
            }

            scored.push({
                ...item,
                semanticSim,
                kwScore,
                score: hybridScore
            });
        }

        // Sort descending by score
        scored.sort((a, b) => b.score - a.score);
        const topCandidates = scored.slice(0, topK);
        const best = topCandidates[0];

        const durationMs = Date.now() - startTime;
        const confidencePct = Math.round((best?.score || 0) * 100);

        if (best && best.score >= threshold) {
            return {
                isMatch: true,
                confidence: confidencePct,
                strategy: 'HYBRID_SEMANTIC_KEYWORD',
                durationMs,
                question: best.question,
                answer: best.answer,
                code: best.code,
                category: best.category,
                sourceName: best.sourceName,
                candidates: topCandidates.map(c => ({
                    id: c.id,
                    question: c.question,
                    answer: c.answer,
                    category: c.category,
                    sourceName: c.sourceName,
                    score: Math.round(c.score * 100)
                }))
            };
        }

        return {
            isMatch: false,
            confidence: confidencePct,
            strategy: 'LOW_CONFIDENCE',
            durationMs,
            message: "No matching prepared answer found in knowledge base.",
            bestCandidate: best ? { question: best.question, confidence: confidencePct } : null,
            candidates: topCandidates.map(c => ({
                id: c.id,
                question: c.question,
                category: c.category,
                sourceName: c.sourceName,
                score: Math.round(c.score * 100)
            }))
        };
    }
}

const vectorStoreInstance = new VectorStore();
module.exports = vectorStoreInstance;
