const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.GEMINI_API_KEY;

// Ultra-fast models with high availability and speed
const FAST_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
];

// Persistent HTTPS agent to reuse TLS connection
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50
});

// Comprehensive technical vocabulary normalizer to fix phonetic slips across .NET, C#, Angular, React, SQL, Azure
const TECH_REPLACEMENTS = [
    // 1. CORS / Web Security
    [/\b(cores|c o r s|c\.o\.r\.s\.|c-o-r-s|c ores|cross origin resource sharing)\b/gi, 'CORS'],
    [/\b(what('s| is| are)? (a |the )?)(course|cause|cars)\b/gi, '$1CORS'],
    [/\b(course policy|cause policy|cars policy)\b/gi, 'CORS policy'],
    [/\b(course error|cause error|cars error)\b/gi, 'CORS error'],
    [/\b(enable course|enable cause)\b/gi, 'enable CORS'],
    [/\b(cross origin)\b/gi, 'cross-origin'],
    [/\b(c s r f|see surf|sea surf|cross site request forgery)\b/gi, 'CSRF'],
    [/\b(x s s|cross site scripting)\b/gi, 'XSS'],
    [/\b(s s r f|server side request forgery)\b/gi, 'SSRF'],
    [/\b(sequel injection|s q l injection)\b/gi, 'SQL Injection'],
    [/\b(jwt|j w t|jot token|j w token|json web token)\b/gi, 'JWT'],
    [/\b(o auth|o off|oauth|o auth two|o off two)\b/gi, 'OAuth 2.0'],

    // 2. DOM / Frontend
    [/\b(what('s| is| are)? (a |the )?)(dumb|dawn|dome|d o m|the o m|d\.o\.m\.)\b/gi, '$1DOM'],
    [/\b(virtual dumb|virtual dawn|virtual dome|virtual d o m)\b/gi, 'Virtual DOM'],
    [/\b(shadow dumb|shadow dawn|shadow dome|shadow d o m)\b/gi, 'Shadow DOM'],
    [/\b(real dumb|real dawn|browser dumb)\b/gi, 'real DOM'],
    [/\b(the dumb|a dumb|to dumb)\b/gi, 'the DOM'],
    [/\b(d o m)\b/gi, 'DOM'],

    // 3. API / Services
    [/\b(what('s| is| are)? (a |an )?)(a pie|a pea|a p i|a\.p\.i\.|a p eye)\b/gi, '$1an API'],
    [/\b(rest a pie|rest a pea|restful a pie|restful a pea)\b/gi, 'REST API'],
    [/\b(web a pie|web a pea|web api)\b/gi, 'Web API'],
    [/\b(open a pie|open a p i|openapi)\b/gi, 'OpenAPI'],
    [/\b(a p i|a\.p\.i\.)\b/gi, 'API'],

    // 4. Async and Await / Concurrency (Strict preservation of "What is")
    [/\b(a sink and a wait|a sink and await|a sync and a wait|eight sink and eight wait|eight sink and a wait|a Sinkanda white|async and a wait|async slash await|a sink await|a sync await|a sink a wait|a sync a wait|async and wait|async and weight|async and wade|a sink end await|a sync end await|a-sink and a-wait)\b/gi, 'async and await'],
    [/\b(async await)\b/gi, 'async/await'],
    [/\b(a sink method|eight sink method|a sync method)\b/gi, 'async method'],
    [/\b(what('s| is| are)? )(a sink|a sync|eight sink)\b/gi, '$1async'],
    [/\b(what('s| is| are)? )(a wait|eight wait)\b/gi, '$1await'],
    [/\b(task and a wait|task and await)\b/gi, 'Task and await'],
    [/\b(configure a wait|configureawait)\b/gi, 'ConfigureAwait'],
    [/\b(task dot when all|task\.whenall)\b/gi, 'Task.WhenAll'],
    [/\b(task dot when any|task\.whenany)\b/gi, 'Task.WhenAny'],
    [/\b(value task|valuetask)\b/gi, 'ValueTask'],
    [/\b(task parallel library|t p l)\b/gi, 'Task Parallel Library (TPL)'],

    // 5. Dependency Injection / Design Patterns
    [/\b(dependency in action|dependency in section|the pendency injection|dependent injection|dependency interjection)\b/gi, 'Dependency Injection'],
    [/\b(inversion of control|i o c container|ioc container)\b/gi, 'Inversion of Control (IoC)'],
    [/\b(d i container|di container)\b/gi, 'DI container'],
    [/\b(service provider|service collection)\b/gi, 'IServiceCollection'],

    // 6. Middleware / ASP.NET Pipeline
    [/\b(middle where|middle wear|middle ware|middle weight|metal wear|mid layer)\b/gi, 'middleware'],
    [/\b(request pipe line|request pipeline)\b/gi, 'request pipeline'],

    // 7. Entity Framework / ORM
    [/\b(entry framework|empty framework|identity framework|entity frame work|entity frame)\b/gi, 'Entity Framework'],
    [/\b(ef core|e f core|e\.f\. core)\b/gi, 'EF Core'],
    [/\b(dbcontext|db context|database context)\b/gi, 'DbContext'],
    [/\b(code first approach|code first)\b/gi, 'Code-First'],
    [/\b(db first approach|database first)\b/gi, 'Database-First'],
    [/\b(as no tracking|asnotracking)\b/gi, 'AsNoTracking'],
    [/\b(i queryable|iqueryable)\b/gi, 'IQueryable'],
    [/\b(i enumerable|ienumerable)\b/gi, 'IEnumerable'],

    // 8. .NET / C# / Architecture
    [/\b(what('s| is| are)? (a |the )?)(o o p|oh oh pee|o\.o\.p\.|whoop|oops|oh oh p)\b/gi, '$1OOP'],
    [/\b(o o p|oh oh pee|o\.o\.p\.|oh oh p)\b/gi, 'OOP'],
    [/\b(four pillars of oop|4 pillars of oop|pillars of oop)\b/gi, 'pillars of OOP'],
    [/\b(object oriented programming|object-oriented programming)\b/gi, 'Object-Oriented Programming'],
    [/\b(polymorphism|polymorphic)\b/gi, 'polymorphism'],
    [/\b(encapsulation)\b/gi, 'encapsulation'],
    [/\b(inheritance)\b/gi, 'inheritance'],
    [/\b(abstraction)\b/gi, 'abstraction'],
    [/\b(see sharp|sea sharp|c sharp|c-sharp|c #)\b/gi, 'C#'],
    [/\b(dot net|dotnet|\.net core|dot net core|dot net six|dot net eight|dot net standard)\b/gi, '.NET'],
    [/\b(linq|link query|link queries|l i n q)\b/gi, 'LINQ'],
    [/\b(garbage collection|garbage collector|g c)\b/gi, 'Garbage Collection'],
    [/\b(clr|c l r|common language runtime)\b/gi, 'CLR'],
    [/\b(asp\.?net core|asp net core)\b/gi, 'ASP.NET Core'],
    [/\b(asp\.?net mvc|asp net mvc|mvc framework|m v c)\b/gi, 'ASP.NET MVC'],
    [/\b(asp\.?net\b(?!\s*core|\s*mvc))/gi, 'ASP.NET'],
    [/\b(model binding|model binder|model binders)\b/gi, 'Model Binding'],
    [/\b(action filters?|action result|iactionresult|actionresults)\b/gi, 'Action Filter'],
    [/\b(razor view|razor views|razor pages)\b/gi, 'Razor View'],
    [/\b(view bag|viewbag|view data|viewdata|temp data|tempdata)\b/gi, 'ViewBag / ViewData'],
    [/\b(partial views?|view components?)\b/gi, 'Partial View'],
    [/\b(http module|http modules|http handler|http handlers)\b/gi, 'HttpHandler / HttpModule'],
    [/\b(blazor|blazer)\b/gi, 'Blazor'],
    [/\b(signal are|signal r|signal-r)\b/gi, 'SignalR'],
    [/\b(g r p c|grpc)\b/gi, 'gRPC'],
    [/\b(c q r s|cqrs)\b/gi, 'CQRS'],
    [/\b(polly library|poly library|poly)\b/gi, 'Polly'],
    [/\b(dapper orm|dapper)\b/gi, 'Dapper'],
    [/\b(mediatr|media t r|mediator pattern)\b/gi, 'MediatR'],
    [/\b(salad|solid principles?)\b/gi, 'SOLID principles'],
    [/\b(x unit|xunit)\b/gi, 'xUnit'],
    [/\b(n unit|nunit)\b/gi, 'NUnit'],
    [/\b(kestrel web server|castrel|kestrel server)\b/gi, 'Kestrel'],
    [/\b(yield return)\b/gi, 'yield return'],

    // 9. Angular / React / TypeScript / RxJS
    [/\b(angular|angler|and cooler)\b/gi, 'Angular'],
    [/\b(re act|re-act)\b/gi, 'React'],
    [/\b(rxjs|rx js|our x j s|r x j s)\b/gi, 'RxJS'],
    [/\b(ng rx|ngrx|n g r x)\b/gi, 'NgRx'],
    [/\b(type script|typescript)\b/gi, 'TypeScript'],
    [/\b(web pack|webpack)\b/gi, 'Webpack'],
    [/\b(micro frontend|micro frontends|micro front ends)\b/gi, 'micro frontends'],
    [/\b(change detection strategy|on push change detection)\b/gi, 'OnPush change detection'],

    // 10. SQL Server / Databases
    [/\b(sequel|s q l|sequel server|s q l server)\b/gi, 'SQL Server'],
    [/\b(t sequel|t-sql|transact sql)\b/gi, 'T-SQL'],
    [/\b(clustered index|non clustered index|nonclustered index)\b/gi, 'clustered / non-clustered index'],
    [/\b(dead lock|dead locks|deadlock|deadlocks)\b/gi, 'deadlocks'],
    [/\b(optimistic concurrency|pessimistic concurrency)\b/gi, 'optimistic concurrency'],

    // 11. Microsoft Azure / Cloud / Distributed Systems
    [/\b(azure blob storage|blob storage|azure blobs?)\b/gi, 'Azure Blob Storage'],
    [/\b(azure functions?|azure function app)\b/gi, 'Azure Functions'],
    [/\b(azure app services?|azure web app|app services?)\b/gi, 'Azure App Service'],
    [/\b(azure key vault|key vault)\b/gi, 'Azure Key Vault'],
    [/\b(azure service bus|service bus)\b/gi, 'Azure Service Bus'],
    [/\b(azure sql|azure sql database)\b/gi, 'Azure SQL'],
    [/\b(app insights|application insights)\b/gi, 'Application Insights'],
    [/\b(as sure|a sure|assure|azur)\b/gi, 'Azure'],
    [/\b(azure dev ops|azure devops)\b/gi, 'Azure DevOps'],
    [/\b(coober netties|coobernetes|k8s|cube|kube)\b/gi, 'Kubernetes'],
    [/\b(darker|docker)\b/gi, 'Docker'],
    [/\b(cough car|kaphka|cough ka|calf car)\b/gi, 'Kafka'],
    [/\b(read is|red is|radish)\b/gi, 'Redis'],
    [/\b(rabbit m q|rabbit mq)\b/gi, 'RabbitMQ'],
    [/\b(micro services|micro service)\b/gi, 'microservices'],
    [/\b(ci cd|c i c d|c i slash c d|continuous integration)\b/gi, 'CI/CD']
];

function normalizeQuestionText(raw) {
    if (!raw) return '';
    let text = raw.trim();
    for (const [regex, replacement] of TECH_REPLACEMENTS) {
        text = text.replace(regex, replacement);
    }
    return text;
}

/**
 * Builds the streamlined, experience-based interview prompt covering all 9 core technologies.
 * Generates ONE natural, hands-on, senior-level response. No multi-mode fluff.
 */
function buildSystemPrompt(candidateProfile, contextSummary) {
    return `
You are an expert real-time technical interview assistant for a Senior Full Stack Software Engineer with 7+ years of hands-on enterprise development experience.

YOUR 9 CORE TECHNICAL DOMAINS:
1. C# (Language features, OOP: Encapsulation, Abstraction, Inheritance, Polymorphism, Generics, LINQ, Memory/GC, Async/Await, Delegates, Events, Interfaces)
2. ASP.NET (Classic architecture, Web Forms, HTTP Modules/Handlers, Page Lifecycle)
3. ASP.NET Core (Kestrel, Middleware pipeline, Native Dependency Injection, Configuration, Minimal APIs, Filters)
4. ASP.NET MVC (Controller-Action pattern, Model Binding, Razor Views, Action/Authorization Filters, Routing)
5. Entity Framework Core (DbContext, Migrations, Performance, AsNoTracking, Query Optimization, Navigation properties, Concurrency)
6. SQL Server (T-SQL, Clustered/Non-Clustered Indexes, Execution Plans, Stored Procedures, Transactions, Deadlocks, ACID, Isolation Levels)
7. Microsoft Azure (App Services, Azure Functions, Blob Storage, Key Vault, Service Bus, Azure SQL, Application Insights)
8. React (Functional components, Hooks: useState, useEffect, useMemo, useCallback, Virtual DOM, Fiber, State Management: Redux/Zustand)
9. Angular (Standalone components, Hierarchical DI, RxJS Observables, Signals, OnPush change detection, Route Guards, Interceptors)

CRITICAL DIRECTIVES:
1. TARGETED TECHNOLOGY ANSWER:
   - Identify which of the 9 technologies the interviewer is asking about.
   - If asked a C# question (e.g. "What is OOP?", "What is polymorphism?", "What is an interface?", "What is encapsulation?"), answer strictly in the context of C#.
   - If asked about React, answer strictly in the context of React.
   - If asked about Angular, answer strictly in the context of Angular.
   - If asked about ASP.NET MVC, answer strictly in the context of ASP.NET MVC.
   - If asked about ASP.NET Core, answer strictly in the context of ASP.NET Core.
   - If asked about classic ASP.NET, answer strictly in the context of ASP.NET.
   - If asked about SQL Server, answer strictly in the context of SQL Server.
   - If asked about Azure, answer strictly in the context of Microsoft Azure.
   - If asked about EF Core, answer strictly in the context of Entity Framework Core.

2. NEVER RESTRICT TO A SINGLE FRAMEWORK & NEVER MIX UNRELATED TECHNOLOGIES:
   - You have deep, authoritative, 7+ years production experience across ALL 9 technologies.
   - NEVER introduce, compare, or mention competitor or alternative technologies (for example: if asked about React, NEVER mention Angular; if asked about Angular, NEVER mention React; if asked about C#, NEVER bring up Java; if asked about SQL Server, NEVER mention MongoDB or Oracle) UNLESS the interviewer explicitly asked for a comparison.
   - NEVER use defensive, apologetic, or qualifying phrases such as:
     * "While our primary stack is X, I used Y for..."
     * "Although I mostly work in X..."
     * "In our Angular projects, we..." (when asked about React)
     * "Unlike X's approach, Y does..."
   - Speak with direct, confident, 7+ years hands-on production authority in the requested technology itself.

3. INDEPENDENT QUESTION EVALUATION (NO CONTEXT BLEED):
   - Treat each question as an independent inquiry.
   - DO NOT bleed previous questions about other technologies (e.g. an earlier Angular question) into the current question (e.g. a new React question).
   - Only reference earlier discussion if the interviewer explicitly connects it (e.g. "In that case...", "Why that over the previous approach?").

4. PRACTICAL PRODUCTION DEPTH:
   - Speak from real hands-on enterprise experience ("In our production applications, we...", "The way we implement this...", "A key performance bottleneck we solve is...").
   - Explain HOW it is actually implemented in real architectures, WHY that specific approach was chosen, and what challenges or edge cases are handled.
   - Length: Concise and focused (3 to 5 clear sentences, approximately 30-45 seconds of natural speech).

5. CODE ONLY IF EXPLICITLY ASKED:
   - ONLY include a code snippet in the "code" field if the interviewer specifically asks to "write code", "implement a function", or "show the syntax". Otherwise, "code" MUST BE NULL.

6. CATEGORY CLASSIFICATION:
   Choose the exact technology category matching the question:
   "CSHARP" | "ASPNET_CORE" | "ASPNET_MVC" | "ASPNET" | "EF_CORE" | "SQL_SERVER" | "AZURE" | "REACT" | "ANGULAR" | "ARCHITECTURE" | "GENERAL"

RECENT CONVERSATION TOPICS (Reference only; DO NOT mix previous technologies into new questions):
${contextSummary}

RESPONSE FORMAT (Strictly valid JSON):
{
  "category": "CSHARP" | "ASPNET_CORE" | "ASPNET_MVC" | "ASPNET" | "EF_CORE" | "SQL_SERVER" | "AZURE" | "REACT" | "ANGULAR" | "ARCHITECTURE" | "GENERAL",
  "answer": "The exact natural, experience-backed answer for the candidate to speak out loud.",
  "bulletPoints": [
    "Brief mental anchor 1",
    "Brief mental anchor 2",
    "Brief mental anchor 3"
  ],
  "code": {
    "language": "csharp" | "typescript" | "javascript" | "sql",
    "snippet": "// Clean, production code here"
  } | null
}
`;
}

/**
 * Streams the response with ultra-fast latency.
 */
async function streamInterviewAnswer(rawQuestion, sessionManager, onChunk, onComplete) {
    const question = normalizeQuestionText(rawQuestion);
    const candidateProfile = sessionManager.getCandidateProfile();
    const contextSummary = sessionManager.getContextSummary();

    const systemPrompt = buildSystemPrompt(candidateProfile, contextSummary);
    const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: `Interviewer asks: "${question}"` }] }],
        generationConfig: {
            temperature: 0.25,
            topP: 0.85,
            maxOutputTokens: 700, // Ample token space preventing truncated JSON objects
            responseMimeType: "application/json"
        }
    };

    const startTime = Date.now();
    let accumulatedText = "";
    let modelUsed = "";
    let firstTokenTime = null;

    for (const model of FAST_MODELS) {
        try {
            console.log(`[AIService] Fast stream with: ${model}`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${API_KEY}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500); // 3.5s timeout per model

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) {
                console.warn(`[AIService] Model ${model} returned HTTP ${res.status}`);
                continue;
            }

            modelUsed = model;
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (!firstTokenTime) {
                    firstTokenTime = Date.now() - startTime;
                    console.log(`⚡ [AIService] FIRST TOKEN in ${firstTokenTime}ms from ${model}`);
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6).trim();
                        if (jsonStr === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const candidate = parsed.candidates && parsed.candidates[0];
                            if (candidate && candidate.content && candidate.content.parts) {
                                const delta = candidate.content.parts[0].text;
                                if (delta) {
                                    accumulatedText += delta;
                                    if (onChunk) onChunk(delta, accumulatedText);
                                }
                            }
                        } catch (e) {}
                    }
                }
            }

            if (accumulatedText.length > 20) {
                break;
            }
        } catch (err) {
            console.warn(`[AIService] Model ${model} failed: ${err.message}`);
        }
    }

    const totalDuration = Date.now() - startTime;

    // Parse accumulated JSON
    let parsedResult = null;
    try {
        let jsonStr = accumulatedText.trim();
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        parsedResult = JSON.parse(jsonStr);
    } catch (parseErr) {
        console.warn('[AIService] Failed to parse stream JSON, attempting resilient regex extraction:', parseErr.message);
        const ansMatch = accumulatedText.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        const catMatch = accumulatedText.match(/"category"\s*:\s*"([^"]+)"/);
        if (ansMatch && ansMatch[1]) {
            parsedResult = {
                category: catMatch ? catMatch[1] : "TECHNICAL",
                answer: ansMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                bulletPoints: [],
                code: null
            };
        } else {
            parsedResult = generateHandsOnFallback(question);
        }
    }

    // Standardize fields
    const finalResult = {
        category: parsedResult.category || "TECHNICAL",
        answer: parsedResult.answer || parsedResult.spokenAnswer || "",
        spokenAnswer: parsedResult.answer || parsedResult.spokenAnswer || "",
        bulletPoints: Array.isArray(parsedResult.bulletPoints) ? parsedResult.bulletPoints : [],
        code: parsedResult.code || null,
        latencyMs: totalDuration,
        firstTokenMs: firstTokenTime || totalDuration,
        modelUsed: modelUsed || 'fallback'
    };

    console.log(`✅ [AIService] Answer ready in ${totalDuration}ms`);
    if (onComplete) onComplete(finalResult);
    return finalResult;
}

/**
 * Domain-specific, highly authentic senior developer answers if API experiences network latency.
 * Completely eliminates generic templates! Directly addresses all 9 core technologies.
 */
function generateHandsOnFallback(question) {
    const q = question.toLowerCase();

    // 1. C# / OOP Concepts (Strictly C# Context)
    if (q.includes('oop') || q.includes('object oriented') || q.includes('polymorphism') || 
        q.includes('encapsulation') || q.includes('inheritance') || q.includes('abstraction') || 
        q.includes('c#') || q.includes('linq') || q.includes('garbage collection')) {
        
        if (q.includes('polymorphism')) {
            return {
                category: "CSHARP",
                answer: "In C#, polymorphism allows derived classes to override methods of a base class, enabling a single interface to represent different underlying types at runtime. In our production codebases, we use compile-time polymorphism through method overloading for clean API surfaces, and runtime polymorphism via virtual and override keywords or interface implementations for pluggable business logic. This decouples our services from concrete classes and adheres to the Open/Closed Principle.",
                bulletPoints: [
                    "Compile-time polymorphism via method overloading and optional parameters",
                    "Runtime polymorphism using virtual/override methods and interface contracts",
                    "Decouples service consumers from concrete implementation details"
                ],
                code: null
            };
        }

        return {
            category: "CSHARP",
            answer: "In C#, Object-Oriented Programming is foundational for structuring enterprise applications around classes and objects that encapsulate state and behavior. We leverage its four core pillars—encapsulation using properties and access modifiers, abstraction via interfaces and abstract classes to define clear contracts, inheritance for domain model hierarchies, and polymorphism through virtual/override methods. This enables us to maintain loosely coupled, unit-testable codebases that scale cleanly across large development teams.",
            bulletPoints: [
                "Encapsulation hides state using access modifiers and auto-properties",
                "Abstraction and interfaces define decoupled, testable contracts",
                "Polymorphism enables pluggable runtime behaviors and OCP compliance"
            ],
            code: null
        };
    }

    // 2. React / React Hooks / Virtual DOM / Fiber / Props (STRICTLY PURE REACT - NO ANGULAR)
    if (q.includes('react') || q.includes('fiber') || q.includes('children prop') || q.includes('useeffect') || q.includes('usestate')) {
        if (q.includes('children prop')) {
            return {
                category: "REACT",
                answer: "In React, the children prop is an implicit prop that passes whatever content is nested between a component's opening and closing JSX tags directly into that component. In production, we use it extensively for compound components and layout wrappers like modals, cards, and grid containers. It decouples the container's layout logic from the dynamic child UI, promoting clean composition over inheritance and making UI components truly reusable across features.",
                bulletPoints: [
                    "Implicit prop representing nested JSX markup",
                    "Enables component composition for reusable layout wrappers",
                    "Decouples container layout from dynamic child UI"
                ],
                code: null
            };
        }
        if (q.includes('fiber')) {
            return {
                category: "REACT",
                answer: "React Fiber is the complete rewrite of React's reconciliation engine, designed to enable incremental rendering by breaking rendering work into small, priority-based units called fiber nodes. In production, Fiber prevents the main thread from blocking during heavy UI tree updates by giving higher priority to urgent updates like user keystrokes and animations over background state changes. It operates as a linked-list data structure that can pause, resume, or abort rendering work without freezing the browser.",
                bulletPoints: [
                    "Reconciliation engine redesign enabling incremental rendering",
                    "Prioritizes high-urgency user inputs over background updates",
                    "Linked-list fiber nodes allow pausing and resuming render work"
                ],
                code: null
            };
        }
        return {
            category: "REACT",
            answer: "React is a component-driven JavaScript library designed for building dynamic, high-performance user interfaces using a Virtual DOM and a unidirectional data flow. In our production applications, we build functional components utilizing modern React Hooks—such as useState and useReducer for local state, and useMemo and useCallback to eliminate expensive re-renders. We manage server state with TanStack React Query and global state with Redux Toolkit or Zustand, organizing components cleanly to maintain separation between business logic and presentational views.",
            bulletPoints: [
                "Declarative component-driven UI with Virtual DOM reconciliation",
                "Functional components with React Hooks (useState, useEffect, useMemo)",
                "Unidirectional data flow paired with React Query or Redux"
            ],
            code: null
        };
    }

    // 3. Angular / RxJS / Signals / Change Detection (STRICTLY PURE ANGULAR - NO REACT)
    if (q.includes('angular') || q.includes('rxjs') || q.includes('signals') || q.includes('change detection')) {
        return {
            category: "ANGULAR",
            answer: "In our enterprise applications, Angular is our framework for building structured, scalable frontend systems. We organize code into modular feature domains with standalone components, leveraging Angular's hierarchical dependency injection with providedIn root for singletons. We enforce OnPush change detection and modern Angular Signals to optimize reactivity and eliminate unnecessary change detection cycles across deep component trees, and we handle asynchronous reactive streams cleanly using RxJS and the async pipe.",
            bulletPoints: [
                "Modular standalone components with hierarchical dependency injection",
                "OnPush change detection and Signals to eliminate zone.js cycle overhead",
                "Reactive streams managed via RxJS observables and async pipes"
            ],
            code: null
        };
    }

    // 4. ASP.NET MVC / Model Binding
    if (q.includes('asp.net mvc') || q.includes('model binding') || q.includes('razor') || q.includes('action filter') || q.includes('viewbag')) {
        return {
            category: "ASPNET_MVC",
            answer: "In ASP.NET MVC, Model Binding maps incoming HTTP request data—such as query string parameters, route segments, and form post fields—directly to strongly typed action method parameters and model classes. Value providers extract values from various request parts, while model binders handle type conversion and validation using DataAnnotations. In production, we implement custom model binders for complex payloads like localized dates or encrypted identifiers to eliminate boilerplate parsing in controllers.",
            bulletPoints: [
                "Maps HTTP request data (forms, query strings, routes) to strongly typed models",
                "Automates type conversion and DataAnnotations model validation",
                "Supports custom IModelBinder for complex or proprietary payload formats"
            ],
            code: null
        };
    }

    // 5. ASP.NET Core / Middleware / Kestrel
    if (q.includes('asp.net core') || q.includes('kestrel') || q.includes('middleware') || q.includes('minimal api')) {
        return {
            category: "ASPNET_CORE",
            answer: "ASP.NET Core is a modern, cross-platform, high-performance framework built from the ground up on the Kestrel web server. Unlike classic ASP.NET, it features a lightweight, modular request pipeline configured via middleware components and native dependency injection supporting Transient, Scoped, and Singleton lifetimes. In production, we build high-throughput microservices using Minimal APIs and Web APIs, deploying them as lightweight Linux containers in Docker and Kubernetes.",
            bulletPoints: [
                "Cross-platform execution on Kestrel with native Dependency Injection",
                "Modular middleware pipeline with strict order (Routing -> Auth -> Endpoints)",
                "Minimal APIs and cloud-native containerization on Linux"
            ],
            code: null
        };
    }

    // 6. Classic ASP.NET / Web Forms
    if (q.includes('web forms') || q.includes('page lifecycle') || q.includes('viewstate') || q.includes('httphandler') || q.includes('httpmodule')) {
        return {
            category: "ASPNET",
            answer: "In classic ASP.NET, applications run on the full .NET Framework hosted in IIS worker processes (w3wp.exe). Requests flow through the HTTP pipeline via IHttpModules for cross-cutting security and logging, and IHttpHandlers for specific resource execution. In Web Forms, state is maintained across stateless HTTP roundtrips using ViewState and session state, following a deterministic page lifecycle from Init, Load, and Control Events to PreRender and Render.",
            bulletPoints: [
                "Full .NET Framework hosted in IIS worker processes (w3wp.exe)",
                "IHttpModules for pipeline interception and IHttpHandlers for resource processing",
                "Deterministic Web Forms page lifecycle with ViewState roundtrip management"
            ],
            code: null
        };
    }

    // 7. Entity Framework Core
    if (q.includes('entity framework') || q.includes('ef core') || q.includes('asnotracking') || q.includes('dbcontext')) {
        return {
            category: "EF_CORE",
            answer: "In EF Core, our primary Object-Relational Mapper for SQL Server, high production performance relies on using .AsNoTracking() for all read-only queries. AsNoTracking disables the internal Change Tracker, drastically reducing memory allocations and CPU overhead during high-volume reads. For complex queries with navigation properties, we use .AsSplitQuery() to eliminate Cartesian product explosions, and we manage database schema changes reliably using code-first migrations.",
            bulletPoints: [
                ".AsNoTracking() bypasses Change Tracker to maximize read performance",
                ".AsSplitQuery() prevents Cartesian explosion on multiple collection includes",
                "Safe database evolution using automated Code-First migrations"
            ],
            code: null
        };
    }

    // 8. SQL Server / Indexes / Concurrency
    if (q.includes('sql server') || q.includes('index') || q.includes('deadlock') || q.includes('stored procedure') || q.includes('concurrency')) {
        return {
            category: "SQL_SERVER",
            answer: "In SQL Server, a clustered index determines the physical order of data rows on disk, meaning the leaf level of the index is the actual table data itself. A table can only have one clustered index, ideally placed on a unique, narrow, and sequentially increasing key like an IDENTITY column to prevent costly B-tree page splits. Non-clustered indexes are auxiliary B-tree structures storing index keys with row pointers or clustered index keys, which we optimize using covering indexes with INCLUDE columns to avoid key lookups.",
            bulletPoints: [
                "Clustered index physically sorts data pages on disk (one per table)",
                "Sequential keys minimize expensive B-tree page splits and fragmentation",
                "Covering non-clustered indexes with INCLUDE columns prevent key lookups"
            ],
            code: null
        };
    }

    // 9. Microsoft Azure Cloud
    if (q.includes('azure') || q.includes('blob storage') || q.includes('key vault') || q.includes('service bus') || q.includes('app service')) {
        return {
            category: "AZURE",
            answer: "In Microsoft Azure, we architect resilient cloud solutions using Azure App Services and Azure Functions for compute, backed by Azure Blob Storage for scalable unstructured data. We manage secrets, certificates, and connection strings securely using Azure Key Vault with Managed Identities, eliminating hardcoded credentials. For asynchronous decoupling between microservices, we utilize Azure Service Bus with message queues and topic subscriptions, and monitor distributed telemetry through Application Insights.",
            bulletPoints: [
                "App Services and Azure Functions for serverless and containerized compute",
                "Azure Key Vault with Managed Identities for zero-secret credential management",
                "Azure Service Bus queues and topics for reliable decoupled messaging",
                "Azure Blob Storage with Hot/Cool lifecycle management for data cost control"
            ],
            code: null
        };
    }

    // 10. CORS / Cross-Origin Resource Sharing
    if (q.includes('cors') || q.includes('cross origin')) {
        return {
            category: "ASPNET_CORE",
            answer: "CORS is a browser security mechanism that restricts cross-origin HTTP requests. In our production systems, we configure explicit CORS policies in the backend pipeline using builder.Services.AddCors(). The most important production best practice we enforce is never combining AllowAnyOrigin() with AllowCredentials(), which is a severe security vulnerability rejected by modern browsers. Instead, we configure explicit allowed origins bound to our environment configurations, explicitly specify allowed HTTP methods and headers, and place the CORS middleware in the exact correct pipeline order—after routing and before authentication and authorization.",
            bulletPoints: [
                "Browser security mechanism restricting cross-origin HTTP calls",
                "Configured via explicit origin, method, and header whitelisting",
                "Strict pipeline order: after UseRouting and before UseAuthentication"
            ],
            code: null
        };
    }

    // 11. Async and Await
    if (q.includes('async') || q.includes('await')) {
        return {
            category: "CSHARP",
            answer: "In C# and ASP.NET Core, async and await is fundamentally about thread pool scalability rather than making a single query run faster. When an I/O-bound operation like a database call or microservice HTTP request is awaited, the thread is released back to the thread pool to handle other incoming requests, preventing thread pool starvation under high concurrent traffic. In our services, we enforce 'async all the way down' and strictly forbid blocking calls like .Result or .Wait() because they can cause severe deadlocks. In class libraries and non-UI code, we also use ConfigureAwait(false) to avoid unnecessary synchronization context captures.",
            bulletPoints: [
                "Frees up thread pool threads during I/O-bound operations",
                "Avoids thread pool starvation under high concurrent request load",
                "Strict rule: Never block on async code with .Result or .Wait()"
            ],
            code: null
        };
    }

    // 12. Dependency Injection
    if (q.includes('dependency injection') || q.includes('di') || q.includes('ioc')) {
        return {
            category: "ASPNET_CORE",
            answer: "In ASP.NET Core, Dependency Injection is built natively into the framework via IServiceCollection. We configure service lifetimes strictly based on their state and concurrency requirements: Transient for lightweight, stateless utility operations; Scoped for components that share state within a single HTTP request, such as our EF Core DbContext; and Singleton for expensive, thread-safe instances like our Redis multiplexer or HttpClientFactory. A critical anti-pattern we guard against is captive dependencies, such as injecting a Scoped service into a Singleton, which can cause DbContext concurrency exceptions and memory leaks.",
            bulletPoints: [
                "Native ASP.NET Core DI with Transient, Scoped, and Singleton lifetimes",
                "DbContext is always Scoped to the individual HTTP request",
                "Prevent captive dependencies (never inject Scoped into Singleton)"
            ],
            code: null
        };
    }

    // 13. General Production Experience Fallback
    return {
        category: "GENERAL",
        answer: `In our production enterprise systems, when we work with ${question.replace(/[?]/g, '')}, our primary focus is on architectural decoupling, resilience, and maintainability. We structure the implementation so it can handle high concurrency without creating resource bottlenecks, ensure comprehensive automated test coverage with xUnit and Moq, and monitor its real-time performance in production using telemetry and health checks.`,
        bulletPoints: [
            "Architectural decoupling and maintainability",
            "High concurrency resilience and resource efficiency",
            "Production observability and automated testing"
        ],
        code: null
    };
}

/**
 * Fast speech-to-text transcriber for interviewer meeting audio chunks.
 * Handles audio/webm, audio/wav, audio/ogg from browser MediaRecorder.
 */
async function transcribeAudio(base64Audio, mimeType = 'audio/webm') {
    if (!base64Audio) return '';

    const payload = {
        system_instruction: {
            parts: [{
                text: "You are a fast, high-accuracy speech-to-text transcriber for software engineering technical interviews. Transcribe the spoken speech verbatim in English. Ensure correct technical capitalization and terminology for developer frameworks and languages (e.g., C#, .NET, ASP.NET Core, ASP.NET MVC, React, Angular, TypeScript, SQL Server, Azure, OOP, Entity Framework Core, AsNoTracking, RxJS, Signals, etc.). If the audio contains no clear human speech, background noise only, or music, reply with exactly 'NO_SPEECH'."
            }]
        },
        contents: [{
            role: "user",
            parts: [
                {
                    inlineData: {
                        mimeType: mimeType || 'audio/webm',
                        data: base64Audio
                    }
                },
                {
                    text: "Transcribe the spoken audio verbatim."
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 250
        }
    };

    for (const model of FAST_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4500);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) continue;

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleaned = text.trim();
            if (!cleaned || cleaned.toUpperCase().includes('NO_SPEECH')) {
                return '';
            }
            return normalizeQuestionText(cleaned);
        } catch (err) {
            console.warn(`[AIService] Audio transcribe with ${model} error:`, err.message);
        }
    }
    return '';
}

/**
 * Checks if the interviewer's transcript represents a technical question or prompt requiring an answer.
 */
function isInterviewerQuestion(text) {
    if (!text || !text.trim()) return false;
    const clean = text.trim();
    if (clean.includes('?')) return true;

    const lower = clean.toLowerCase();
    const questionStarters = /^(what|how|why|when|where|which|who|can you|could you|would you|have you|tell me|explain|describe|walk me through|differentiate|define|talk about|what about)/i;
    if (questionStarters.test(lower)) return true;

    // Direct topic prompts: e.g. "Controlled and uncontrolled components", "SOLID principles", "AsNoTracking"
    const techMarkers = [
        'react', 'angular', 'c#', 'csharp', 'asp.net', 'mvc', 'sql', 'azure', 'oop', 'linq',
        'component', 'hooks', 'virtual dom', 'fiber', 'dependency injection', 'ioc',
        'middleware', 'entity framework', 'ef core', 'index', 'stored procedure', 'deadlock',
        'blob storage', 'service bus', 'key vault', 'solid', 'docker', 'kubernetes', 'microservices'
    ];
    for (const marker of techMarkers) {
        if (lower.includes(marker) && clean.split(/\s+/).length >= 2) {
            return true;
        }
    }
    return false;
}

module.exports = {
    streamInterviewAnswer,
    normalizeQuestionText,
    transcribeAudio,
    isInterviewerQuestion
};
