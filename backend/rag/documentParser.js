const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

/**
 * Intelligent Document Parser for Interview Preparation Notes (PDF & Markdown)
 * Extracts discrete (Question, Answer, Category, Code) records.
 */

// Known interview domain categorizer
function inferCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('asp.net core') || lower.includes('.net core') || lower.includes('dependency injection') || lower.includes('minimal api') || lower.includes('kestrel') || lower.includes('middleware')) return 'ASP.NET Core';
    if (lower.includes('asp.net mvc') || lower.includes('action filter') || lower.includes('razor')) return 'ASP.NET MVC';
    if (lower.includes('entity framework') || lower.includes('ef core') || lower.includes('dbcontext') || lower.includes('asnotracking')) return 'Entity Framework Core';
    if (lower.includes('sql') || lower.includes('query') || lower.includes('index') || lower.includes('t-sql') || lower.includes('stored procedure') || lower.includes('table scan') || lower.includes('dense_rank') || lower.includes('rank(')) return 'SQL Server';
    if (lower.includes('react') || lower.includes('virtual dom') || lower.includes('jsx') || lower.includes('useeffect') || lower.includes('usestate') || lower.includes('usememo')) return 'React';
    if (lower.includes('angular') || lower.includes('rxjs') || lower.includes('signals') || lower.includes('onpush') || lower.includes('ngoninit') || lower.includes('ngmodule') || lower.includes('lifecycle hook')) return 'Angular';
    if (lower.includes('c#') || lower.includes('linq') || lower.includes('value type') || lower.includes('reference type') || lower.includes('generics') || lower.includes('ienumerable') || lower.includes('iqueryable') || lower.includes('deadlock') || lower.includes('race condition') || lower.includes('readonly') || lower.includes('const')) return 'C#';
    if (lower.includes('microservice') || lower.includes('distributed') || lower.includes('saga') || lower.includes('circuit breaker') || lower.includes('idempotency')) return 'Microservices';
    if (lower.includes('azure') || lower.includes('blob storage') || lower.includes('service bus') || lower.includes('key vault') || lower.includes('sas token') || lower.includes('sas url')) return 'Azure';
    if (lower.includes('docker') || lower.includes('container') || lower.includes('dockerfile')) return 'Docker';
    if (lower.includes('kubernetes') || lower.includes('k8s') || lower.includes('pod') || lower.includes('ingress')) return 'Kubernetes';
    if (lower.includes('solid')) return 'SOLID Principles';
    if (lower.includes('design pattern') || lower.includes('singleton') || lower.includes('factory') || lower.includes('repository')) return 'Design Patterns';
    if (lower.includes('system design') || lower.includes('scalability') || lower.includes('load balancer') || lower.includes('cache') || lower.includes('streaming') || lower.includes('upi architecture')) return 'System Design';
    if (lower.includes('rag') || lower.includes('retrieval augmented') || lower.includes('vector db') || lower.includes('embeddings')) return 'RAG';
    if (lower.includes('generative ai') || lower.includes('llm') || lower.includes('prompt engineering')) return 'Generative AI';
    if (lower.includes('web api') || lower.includes('rest api') || lower.includes('http') || lower.includes('cors') || lower.includes('swagger')) return 'Web API';
    if (lower.includes('ci/cd') || lower.includes('pipeline') || lower.includes('devops') || lower.includes('github actions')) return 'Azure DevOps';
    return 'GENERAL';
}

function cleanText(str) {
    if (!str) return '';
    let text = str
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t/g, '  ');

    // Strip common repeating running headers and footers across PDF pages
    text = text.replace(/Technical Interview Guide[^\n]*Page \d+ of \d+/gi, '');
    text = text.replace(/-- \d+ of \d+ --/g, '');
    text = text.replace(/Full-Stack Technical Interview Master Guide[^\n]*/gi, '');
    text = text.replace(/Direct, Panel-Ready Explanations with Practical Scenarios & Examples[^\n]*/gi, '');
    text = text.replace(/Panel Delivery Strategy & Tip[^\n]*/gi, '');

    return text.trim();
}

/**
 * Parses raw text extracted from PDF or Markdown into structured Q&A pairs.
 * Uses a multi-strategy parser:
 * 1. Line-by-line boundary scanner for standard interview guides (Q 01, Q 1:, Question 1:, ## Question, Numbered lists)
 * 2. Explicit Q: and A: block splitter
 * 3. Double-newline paragraph fallback
 */
function extractQAPairs(rawContent, defaultCategory = null) {
    const text = cleanText(rawContent);
    const lines = text.split('\n');
    const qPositions = [];

    // Helper: checks if a line looks like an interview question header
    const isQuestionLine = (line) => {
        const trimmed = line.trim();
        if (trimmed.length < 5) return null;

        // 1. "Q 01 ...", "Q 1: ...", "Q 22b ...", "Question 1: ...", "Q: ...", "Q - ..."
        const qMatch = trimmed.match(/^(?:#{1,4}\s+|\*{0,2})(?:Q\s*\d+[a-z]?|Question\s*\d*|Q)[:.\-–]?\s+(.*)/i);
        if (qMatch && qMatch[1].trim().length >= 4) {
            return qMatch[1].trim();
        }

        // 2. Numbered questions: "1. What is ...?", "1) How does ..."
        const numMatch = trimmed.match(/^\d{1,3}[.)]\s+(.*)/);
        if (numMatch && numMatch[1].trim().length >= 10) {
            const content = numMatch[1].trim();
            if (content.includes('?') || /^(What|How|Why|Explain|Difference|Where|When|Which|Compare|Can you|Describe|Walk through|Is there|Define)\b/i.test(content)) {
                return content;
            }
        }

        // 3. Markdown Heading with Question: "## What is X?" or "### How does Y work?"
        const mdMatch = trimmed.match(/^#{1,3}\s+(.*)/);
        if (mdMatch && mdMatch[1].trim().length >= 10) {
            const content = mdMatch[1].trim();
            if (content.includes('?') || /^(What|How|Why|Explain|Difference|Where|When|Which|Compare|Can you|Describe|Walk through)\b/i.test(content)) {
                return content;
            }
        }

        return null;
    };

    // Scan lines for question boundaries
    for (let i = 0; i < lines.length; i++) {
        const qText = isQuestionLine(lines[i]);
        if (qText) {
            qPositions.push({
                lineIndex: i,
                question: qText.replace(/^[*_~#]+|[*_~#]+$/g, '').trim()
            });
        }
    }

    const pairs = [];

    // Strategy 1: Line-by-line boundary scanner
    if (qPositions.length >= 2) {
        for (let i = 0; i < qPositions.length; i++) {
            const startLine = qPositions[i].lineIndex + 1;
            const endLine = (i + 1 < qPositions.length) ? qPositions[i + 1].lineIndex : lines.length;
            const answerLines = lines.slice(startLine, endLine);
            const rawAnswer = answerLines.join('\n').trim();
            const cleanAnswer = rawAnswer
                .replace(/^(?:A(?:nswer)?\s*[:.\-–)]|\*{0,2}Answer:\*{0,2})\s*/i, '')
                .trim();

            const q = qPositions[i].question;
            if (q.length >= 5 && cleanAnswer.length >= 10) {
                const codeMatch = cleanAnswer.match(/```([a-z0-9#+]*)\n([\s\S]*?)```/i);
                pairs.push({
                    question: q,
                    answer: cleanAnswer,
                    code: codeMatch ? codeMatch[0] : null,
                    category: defaultCategory || inferCategory(q + ' ' + cleanAnswer)
                });
            }
        }
    }

    // Strategy 2: Explicit Q & A or Question / Answer blocks (fallback)
    if (pairs.length === 0) {
        const blockRegex = /(?:^|\n)(?:#{1,4}\s+|\*{0,2})(?:Q(?:uestion)?\s*(?:\d+)?[:.\-–)]|\d{1,3}[.)]\s+)([\s\S]*?)(?=(?:^|\n)(?:#{1,4}\s+|\*{0,2})(?:Q(?:uestion)?\s*(?:\d+)?[:.\-–)]|\d{1,3}[.)]\s+)|$)/gi;
        let match;
        while ((match = blockRegex.exec(text)) !== null) {
            const fullBlock = match[1].trim();
            if (!fullBlock || fullBlock.length < 15) continue;

            const answerSplitRegex = /(?:\n\s*|\s+)(?:\*{0,2}A(?:nswer)?\s*[:.\-–)]\*{0,2}|\n\s*[-–]\s+Answer[:\s]+)([\s\S]*)/i;
            const answerMatch = fullBlock.match(answerSplitRegex);

            if (answerMatch && answerMatch.index !== undefined) {
                const rawQ = fullBlock.substring(0, answerMatch.index).trim();
                const rawA = answerMatch[1].trim();

                const cleanedQ = rawQ
                    .replace(/^[*_~#]+|[*_~#]+$/g, '')
                    .replace(/^Q(?:uestion)?\s*(?:\d+)?[:.\-–)]\s*/i, '')
                    .replace(/^\d{1,3}[.)]\s*/, '')
                    .trim();

                const cleanedA = rawA
                    .replace(/^[*_~#]+|[*_~#]+$/g, '')
                    .replace(/^A(?:nswer)?\s*[:.\-–)]\s*/i, '')
                    .trim();

                if (cleanedQ.length >= 5 && cleanedA.length >= 10) {
                    const codeMatch = cleanedA.match(/```([a-z0-9#+]*)\n([\s\S]*?)```/i);
                    pairs.push({
                        question: cleanedQ,
                        answer: cleanedA,
                        code: codeMatch ? codeMatch[0] : null,
                        category: defaultCategory || inferCategory(cleanedQ + ' ' + cleanedA)
                    });
                }
            }
        }
    }

    // Strategy 3: Paragraph double-newline fallback
    if (pairs.length === 0) {
        const sections = text.split(/\n{2,}/);
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i].trim();
            if (sec.includes('?') && sec.length < 250 && i + 1 < sections.length) {
                const qText = sec.replace(/^[#*\s\d.)-]+/, '').trim();
                const aText = sections[i + 1].trim();
                if (qText.length >= 8 && aText.length >= 20) {
                    pairs.push({
                        question: qText,
                        answer: aText,
                        code: null,
                        category: defaultCategory || inferCategory(qText + ' ' + aText)
                    });
                    i++;
                }
            }
        }
    }

    return pairs;
}

/**
 * Extracts raw text from PDF file buffer.
 */
async function parsePdfBuffer(buffer) {
    try {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        return (result && result.text) ? result.text : '';
    } catch (err) {
        console.error('[DocumentParser] PDF extraction error:', err.message);
        throw new Error(`Failed to parse PDF document: ${err.message}`);
    }
}

/**
 * Extracts raw text from Markdown or plain text file buffer.
 */
function parseMarkdownBuffer(buffer) {
    try {
        return buffer.toString('utf-8');
    } catch (err) {
        throw new Error(`Failed to read Markdown document: ${err.message}`);
    }
}

/**
 * Main parse entry point: Takes file path or buffer and returns structured Q&A records.
 */
async function parseDocument(filePath, originalFilename) {
    const ext = path.extname(originalFilename || filePath).toLowerCase();
    const buffer = fs.readFileSync(filePath);
    let rawText = '';

    if (ext === '.pdf') {
        rawText = await parsePdfBuffer(buffer);
    } else if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
        rawText = parseMarkdownBuffer(buffer);
    } else {
        throw new Error(`Unsupported file type: ${ext}. Please upload a PDF (.pdf) or Markdown (.md) document.`);
    }

    if (!rawText || rawText.trim().length < 20) {
        throw new Error(`Document appears to be empty or contains no extractable text.`);
    }

    const qaPairs = extractQAPairs(rawText);
    return {
        rawTextLength: rawText.length,
        qaPairs
    };
}

module.exports = {
    parseDocument,
    extractQAPairs,
    inferCategory
};
