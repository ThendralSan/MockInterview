const path = require('path');
const fs = require('fs');
const db = require('./db');
const { parseDocument } = require('./documentParser');
const { getEmbedding, batchGetEmbeddings } = require('./embeddingService');
const vectorStore = require('./vectorStore');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class RagService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        await vectorStore.preload();
        this.initialized = true;
    }

    /**
     * Ingests an uploaded PDF or Markdown document
     */
    async ingestDocument(filePath, originalFilename, fileSize, defaultCategory = null) {
        await this.initialize();

        // If a document with the exact same filename exists, cleanly replace it to prevent duplicates
        const existingDocs = db.getDocuments();
        for (const d of existingDocs) {
            if (d.filename === originalFilename) {
                console.log(`[RagService] Replacing previous document "${originalFilename}" (id: ${d.id})...`);
                vectorStore.items = vectorStore.items.filter(item => item.documentId !== d.id);
                db.deleteDocument(d.id);
            }
        }

        const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const savedFilePath = path.join(UPLOADS_DIR, `${docId}_${originalFilename}`);
        if (filePath !== savedFilePath) {
            fs.copyFileSync(filePath, savedFilePath);
        }

        console.log(`[RagService] Ingesting document: "${originalFilename}" (${fileSize} bytes)`);

        // Step 1 & 2: Parse document
        const parsed = await parseDocument(savedFilePath, originalFilename);
        const qaPairs = parsed.qaPairs;

        console.log(`[RagService] Extracted ${qaPairs.length} Q&A pairs from "${originalFilename}".`);

        // Record document in SQLite
        db.insertDocument({
            id: docId,
            filename: originalFilename,
            filePath: savedFilePath,
            fileType: path.extname(originalFilename).toLowerCase(),
            fileSize,
            parsedCount: qaPairs.length,
            status: 'INDEXED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        if (qaPairs.length === 0) {
            return {
                documentId: docId,
                filename: originalFilename,
                questionsCount: 0,
                message: 'Document saved, but no distinct Q&A pairs were detected. You can add questions manually or reformat headers.'
            };
        }

        // Step 3 & 4: Generate Embeddings and Save
        const textsToEmbed = qaPairs.map(p => `${p.question}\n${p.answer.substring(0, 300)}`);
        const vectors = await batchGetEmbeddings(textsToEmbed, (done, total) => {
            console.log(`[RagService] Embedding progress: ${done}/${total}...`);
        });

        // Step 5 & 6: Save questions and embeddings to SQLite + Memory Index
        let indexedCount = 0;
        for (let i = 0; i < qaPairs.length; i++) {
            const pair = qaPairs[i];
            const qId = 'q_kb_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4);
            const normalizedQ = vectorStore.normalize(pair.question);

            const questionRecord = {
                id: qId,
                documentId: docId,
                category: defaultCategory || pair.category || 'GENERAL',
                question: pair.question,
                answer: pair.answer,
                code: pair.code || null,
                normalizedQuestion: normalizedQ,
                sourceName: originalFilename,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            db.insertQuestion(questionRecord);
            db.saveEmbedding(qId, vectors[i]);
            vectorStore.addItem(questionRecord, vectors[i]);
            indexedCount++;
        }

        db.updateDocumentCount(docId, indexedCount);
        console.log(`✅ [RagService] Successfully indexed ${indexedCount} questions for "${originalFilename}".`);

        return {
            documentId: docId,
            filename: originalFilename,
            questionsCount: indexedCount,
            qaPairs
        };
    }

    /**
     * Add manual interview question and answer
     */
    async addQuestion(data) {
        await this.initialize();

        const qId = 'q_manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const normalized = vectorStore.normalize(data.question);
        const record = {
            id: qId,
            documentId: null,
            category: data.category || 'GENERAL',
            question: data.question.trim(),
            answer: data.answer.trim(),
            code: data.code || null,
            normalizedQuestion: normalized,
            sourceName: 'Manual Entry',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const vector = await getEmbedding(`${record.question}\n${record.answer.substring(0, 300)}`);
        db.insertQuestion(record);
        db.saveEmbedding(qId, vector);
        vectorStore.addItem(record, vector);

        return record;
    }

    /**
     * Update existing question
     */
    async updateQuestion(id, updates) {
        await this.initialize();
        const existing = db.getQuestionById(id);
        if (!existing) throw new Error('Question not found');

        const questionChanged = updates.question && updates.question !== existing.question;
        const normalized = questionChanged ? vectorStore.normalize(updates.question) : existing.normalized_question;

        const updated = db.updateQuestion(id, {
            ...updates,
            normalizedQuestion: normalized
        });

        if (questionChanged || updates.answer) {
            const vector = await getEmbedding(`${updated.question}\n${updated.answer.substring(0, 300)}`);
            db.saveEmbedding(id, vector);
            vectorStore.addItem({
                id: updated.id,
                documentId: updated.document_id,
                question: updated.question,
                answer: updated.answer,
                code: updated.code,
                category: updated.category,
                sourceName: updated.source_name
            }, vector);
        }

        return updated;
    }

    /**
     * Delete question
     */
    async deleteQuestion(id) {
        await this.initialize();
        vectorStore.removeItem(id);
        return db.deleteQuestion(id);
    }

    /**
     * Re-index existing document
     */
    async reindexDocument(docId) {
        await this.initialize();
        const doc = db.getDocumentById(docId);
        if (!doc) throw new Error('Document not found');
        if (!fs.existsSync(doc.file_path)) throw new Error('Document file no longer exists on disk');

        const filePath = doc.file_path;
        const filename = doc.filename;
        const fileSize = doc.file_size;

        // Delete old questions for this document from DB and memory without deleting the file
        db.deleteDocument(docId, false);
        vectorStore.items = vectorStore.items.filter(item => item.documentId !== docId);

        // Re-ingest
        return await this.ingestDocument(filePath, filename, fileSize);
    }

    /**
     * Search knowledge base
     */
    async search(query, options = {}) {
        await this.initialize();
        return await vectorStore.search(query, options);
    }

    getStats() {
        return {
            totalIndexedQuestions: vectorStore.items.length,
            isLoaded: vectorStore.isLoaded,
            categories: db.getCategories()
        };
    }
}

const ragServiceInstance = new RagService();
module.exports = ragServiceInstance;
