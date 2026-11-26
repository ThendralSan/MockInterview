const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'knowledge_base.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize schema
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        parsed_questions_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'INDEXED',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        document_id TEXT,
        category TEXT NOT NULL DEFAULT 'GENERAL',
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        code TEXT,
        normalized_question TEXT NOT NULL,
        source_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embeddings (
        question_id TEXT PRIMARY KEY,
        vector_json TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
        name TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_questions_normalized ON questions(normalized_question);
    CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
    CREATE INDEX IF NOT EXISTS idx_questions_doc_id ON questions(document_id);
`);

// Pre-populate standard interview categories
const defaultCategories = [
    'C#', 'ASP.NET Core', 'Web API', 'Angular', 'React',
    'SQL Server', 'Entity Framework Core', 'Microservices', 'Azure',
    'Azure DevOps', 'Docker', 'Kubernetes', 'Generative AI', 'RAG',
    'System Design', 'Design Patterns', 'SOLID Principles', 'GENERAL'
];

const insertCategoryStmt = db.prepare(`INSERT OR IGNORE INTO categories (name, created_at) VALUES (?, ?)`);
const now = new Date().toISOString();
for (const cat of defaultCategories) {
    insertCategoryStmt.run(cat, now);
}

module.exports = {
    db,
    
    // Document queries
    getDocuments() {
        return db.prepare(`SELECT * FROM documents ORDER BY created_at DESC`).all();
    },

    getDocumentById(id) {
        return db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id);
    },

    insertDocument(doc) {
        const stmt = db.prepare(`
            INSERT INTO documents (id, filename, file_path, file_type, file_size, parsed_questions_count, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(doc.id, doc.filename, doc.filePath, doc.fileType, doc.fileSize, doc.parsedCount || 0, doc.status || 'INDEXED', doc.createdAt, doc.updatedAt);
        return doc;
    },

    updateDocumentCount(id, count) {
        db.prepare(`UPDATE documents SET parsed_questions_count = ?, updated_at = ? WHERE id = ?`).run(count, new Date().toISOString(), id);
    },

    deleteDocument(id, deleteFile = true) {
        const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id);
        if (doc) {
            // Delete questions & embeddings cascading
            const questions = db.prepare(`SELECT id FROM questions WHERE document_id = ?`).all(id);
            const deleteEmb = db.prepare(`DELETE FROM embeddings WHERE question_id = ?`);
            for (const q of questions) {
                deleteEmb.run(q.id);
            }
            db.prepare(`DELETE FROM questions WHERE document_id = ?`).run(id);
            db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);

            // Delete file if exists and deleteFile is true
            if (deleteFile) {
                try {
                    if (doc.file_path && fs.existsSync(doc.file_path)) {
                        fs.unlinkSync(doc.file_path);
                    }
                } catch (e) {
                    console.warn('[DB] Failed to delete file on disk:', e.message);
                }
            }
        }
        return doc;
    },

    // Question queries
    getAllQuestions(filter = {}) {
        let sql = `SELECT q.*, d.filename as document_filename FROM questions q LEFT JOIN documents d ON q.document_id = d.id`;
        const params = [];
        const conditions = [];

        if (filter.category && filter.category !== 'ALL') {
            conditions.push(`q.category = ?`);
            params.push(filter.category);
        }

        if (filter.search && filter.search.trim()) {
            conditions.push(`(q.question LIKE ? OR q.answer LIKE ?)`);
            const term = `%${filter.search.trim()}%`;
            params.push(term, term);
        }

        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }

        sql += ` ORDER BY q.created_at DESC`;
        return db.prepare(sql).all(...params);
    },

    getQuestionById(id) {
        return db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id);
    },

    insertQuestion(q) {
        const stmt = db.prepare(`
            INSERT INTO questions (id, document_id, category, question, answer, code, normalized_question, source_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(q.id, q.documentId || null, q.category || 'GENERAL', q.question, q.answer, q.code || null, q.normalizedQuestion, q.sourceName || 'Manual Entry', q.createdAt, q.updatedAt);
        return q;
    },

    updateQuestion(id, updates) {
        const stmt = db.prepare(`
            UPDATE questions 
            SET category = COALESCE(?, category),
                question = COALESCE(?, question),
                answer = COALESCE(?, answer),
                code = COALESCE(?, code),
                normalized_question = COALESCE(?, normalized_question),
                updated_at = ?
            WHERE id = ?
        `);
        stmt.run(updates.category, updates.question, updates.answer, updates.code, updates.normalizedQuestion, new Date().toISOString(), id);
        return this.getQuestionById(id);
    },

    deleteQuestion(id) {
        db.prepare(`DELETE FROM embeddings WHERE question_id = ?`).run(id);
        const res = db.prepare(`DELETE FROM questions WHERE id = ?`).run(id);
        return res.changes > 0;
    },

    // Embedding queries
    saveEmbedding(questionId, vector) {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO embeddings (question_id, vector_json, dimensions, created_at)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(questionId, JSON.stringify(vector), vector.length, new Date().toISOString());
    },

    getAllEmbeddingsWithQuestions() {
        const rows = db.prepare(`
            SELECT q.id, q.document_id, q.category, q.question, q.answer, q.code, q.normalized_question, q.source_name, e.vector_json
            FROM questions q
            JOIN embeddings e ON q.id = e.question_id
        `).all();
        
        return rows.map(r => ({
            ...r,
            vector: JSON.parse(r.vector_json)
        }));
    },

    // Categories
    getCategories() {
        return db.prepare(`SELECT name FROM categories ORDER BY name ASC`).all().map(r => r.name);
    },

    addCategory(name) {
        if (!name || !name.trim()) return;
        db.prepare(`INSERT OR IGNORE INTO categories (name, created_at) VALUES (?, ?)`).run(name.trim(), new Date().toISOString());
    }
};
