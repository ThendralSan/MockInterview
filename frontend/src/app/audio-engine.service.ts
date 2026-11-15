import { Injectable } from '@angular/core';

// Comprehensive software development phonetic misrecognitions dictionary
// Auto-corrects common speech-to-text acoustic slips for .NET, C#, Angular, React, SQL, Azure, and Web
export const TECH_REPLACEMENTS: [RegExp, string][] = [
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

  // 8. .NET / C# / OOP Architecture
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

  // 11. Microsoft Azure / Cloud / DevOps / Distributed Systems
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

// Words and prepositions that indicate an incomplete or trailing sentence/thought
export const DANGLING_WORDS = new Set([
  'and', 'or', 'but', 'because', 'so', 'yet', 'while', 'whereas', 'although', 'since', 'if',
  'in', 'on', 'at', 'to', 'for', 'from', 'with', 'without', 'by', 'about', 'into', 'through',
  'during', 'before', 'after', 'between', 'under', 'against', 'via', 'of',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their', 'its',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'will', 'would', 'should',
  'such as', 'like', 'in terms of', 'related to', 'as well as', 'instead of', 'versus', 'vs'
]);

// Question starters and interrogative phrases common in technical interviews
const QUESTION_STARTERS = /^(what|how|why|when|where|which|who|can you|could you|would you|have you|did you|tell me|explain|describe|walk me|is there|are there|do you|differentiate|define|what about|how about|talk about)/i;

// Direct technical topics that form complete questions even as 1-3 words
const TECH_TOPICS = new Set([
  'cors', 'cors policy', 'csrf', 'xss', 'dom', 'virtual dom', 'shadow dom', 'api', 'rest api', 'web api', 'openapi',
  'async and await', 'async/await', 'async', 'await', 'dependency injection', 'ioc',
  'middleware', 'entity framework', 'ef core', 'dbcontext', 'asnotracking',
  'c#', '.net', 'asp.net', 'asp.net core', 'asp.net mvc', 'sql server', 'sql', 'linq',
  'oop', 'object oriented programming', 'polymorphism', 'encapsulation', 'inheritance', 'abstraction',
  'model binding', 'action filter', 'razor view', 'azure', 'azure blob storage', 'azure functions', 'azure app service', 'azure key vault', 'azure service bus',
  'angular', 'react', 'rxjs', 'ngrx', 'signals', 'typescript', 'microservices',
  'kubernetes', 'docker', 'kafka', 'redis', 'rabbitmq', 'solid principles',
  'jwt', 'oauth', 'ci/cd', 'dapper', 'mediatr', 'signalr', 'blazor'
]);

export type AudioInputSource = 'DUAL_AUDIO' | 'MICROPHONE' | 'SYSTEM_AUDIO';

@Injectable({
  providedIn: 'root'
})
export class AudioEngineService {
  // Streams
  public displayStream: MediaStream | null = null;
  public micStream: MediaStream | null = null;

  // Audio Contexts & Analysers for Dual Separation
  private interviewerAudioContext: AudioContext | null = null;
  private interviewerAnalyser: AnalyserNode | null = null;
  private interviewerGain: GainNode | null = null;

  private candidateAudioContext: AudioContext | null = null;
  private candidateAnalyser: AnalyserNode | null = null;

  private interviewerRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  private animFrameId: number | null = null;

  public currentSource: AudioInputSource = 'DUAL_AUDIO';
  
  // Real-time audio levels (0 to 100 for meters)
  public interviewerAudioLevel: number = 0;
  public candidateAudioLevel: number = 0;

  // Speech presence flags
  public isInterviewerSpeaking: boolean = false;
  public isCandidateSpeaking: boolean = false;

  // Overall speech active (for backwards compat)
  public get isSpeechActive(): boolean {
    return this.isInterviewerSpeaking || this.isCandidateSpeaking;
  }
  public get audioLevel(): number {
    return Math.max(this.interviewerAudioLevel, this.candidateAudioLevel);
  }

  // Sensitivity multiplier (default 1.8x)
  public micGainMultiplier: number = 1.8;

  private interviewerSpeechStartTime: number = 0;
  private interviewerLastSpeechTime: number = 0;
  private isRecordingInterviewer: boolean = false;
  private segmentMaxTimer: any = null;

  private onInterviewerSpeechCallback: ((blob: Blob) => void) | null = null;

  // Silence threshold for interviewer speech (1600ms pause indicates end of thought/question)
  public interviewerSilenceThresholdMs: number = 1600;

  /**
   * Starts Dual Audio Capture:
   * - getDisplayMedia captures Meeting Tab Video + Audio (INTERVIEWER)
   * - getUserMedia captures Microphone (CANDIDATE)
   */
  async startDualAudioCapture(
    onInterviewerSpeechReady: (blob: Blob) => void,
    onTabEnded?: () => void
  ): Promise<{ success: boolean; displayStream?: MediaStream; micStream?: MediaStream; error?: string }> {
    this.stopAudio();
    this.currentSource = 'DUAL_AUDIO';
    this.onInterviewerSpeechCallback = onInterviewerSpeechReady;

    // 1. Capture Meeting Tab / Display Media with Audio
    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err: any) {
      console.warn('[AudioEngine] Screen/Tab share cancelled:', err);
      return { success: false, error: 'Screen/Tab sharing was cancelled or denied.' };
    }

    const audioTracks = this.displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.stopAudio();
      return {
        success: false,
        error: 'No audio track detected! Please check "Also share tab audio" or "Share system audio" when selecting the meeting window.'
      };
    }

    if (onTabEnded && this.displayStream.getVideoTracks().length > 0) {
      this.displayStream.getVideoTracks()[0].onended = () => {
        console.log('[AudioEngine] Tab sharing ended by user.');
        onTabEnded();
      };
    }

    // 2. Capture Candidate Microphone
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: { ideal: 48000 }
        },
        video: false
      });
    } catch (err: any) {
      console.warn('[AudioEngine] Candidate mic access error (will continue with tab audio):', err);
    }

    // 3. Initialize Audio Nodes & VAD loop
    this.initDualAudioNodes();

    return {
      success: true,
      displayStream: this.displayStream,
      micStream: this.micStream || undefined
    };
  }

  // Setup dual AudioContexts & analysers
  private initDualAudioNodes() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

    // A. Setup Interviewer Audio Nodes from display audio tracks
    if (this.displayStream && this.displayStream.getAudioTracks().length > 0) {
      try {
        this.interviewerAudioContext = new AudioContextClass();
        const tabAudioStream = new MediaStream(this.displayStream.getAudioTracks());
        const source = this.interviewerAudioContext.createMediaStreamSource(tabAudioStream);

        this.interviewerGain = this.interviewerAudioContext.createGain();
        this.interviewerGain.gain.setValueAtTime(this.micGainMultiplier, this.interviewerAudioContext.currentTime);

        this.interviewerAnalyser = this.interviewerAudioContext.createAnalyser();
        this.interviewerAnalyser.fftSize = 512;
        this.interviewerAnalyser.smoothingTimeConstant = 0.2;

        source.connect(this.interviewerGain);
        this.interviewerGain.connect(this.interviewerAnalyser);

        this.setupInterviewerRecorder(tabAudioStream);
      } catch (e) {
        console.error('[AudioEngine] Error initializing Interviewer AudioContext:', e);
      }
    }

    // B. Setup Candidate Audio Nodes from microphone
    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      try {
        this.candidateAudioContext = new AudioContextClass();
        const source = this.candidateAudioContext.createMediaStreamSource(this.micStream);

        this.candidateAnalyser = this.candidateAudioContext.createAnalyser();
        this.candidateAnalyser.fftSize = 512;
        this.candidateAnalyser.smoothingTimeConstant = 0.2;

        source.connect(this.candidateAnalyser);
      } catch (e) {
        console.error('[AudioEngine] Error initializing Candidate AudioContext:', e);
      }
    }

    this.startDualVADLoop();
  }

  // Sets up MediaRecorder to capture clean audio chunks when interviewer speaks
  private setupInterviewerRecorder(audioStream: MediaStream) {
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.interviewerRecorder = new MediaRecorder(audioStream, { mimeType: mime });
      this.recordedChunks = [];

      this.interviewerRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.interviewerRecorder.onstop = () => {
        if (this.recordedChunks.length > 0) {
          const blob = new Blob(this.recordedChunks, { type: mime });
          this.recordedChunks = [];
          if (this.onInterviewerSpeechCallback && blob.size > 2000) {
            this.onInterviewerSpeechCallback(blob);
          }
        }
      };
    } catch (e) {
      console.warn('[AudioEngine] MediaRecorder not supported on this stream:', e);
    }
  }

  // Dual Voice Activity Detection (VAD) Loop
  private startDualVADLoop() {
    const intBuffer = this.interviewerAnalyser ? new Uint8Array(this.interviewerAnalyser.frequencyBinCount) : null;
    const canBuffer = this.candidateAnalyser ? new Uint8Array(this.candidateAnalyser.frequencyBinCount) : null;

    const updateLoop = () => {
      const now = Date.now();

      // 1. Evaluate Interviewer Audio Level
      if (this.interviewerAnalyser && intBuffer) {
        this.interviewerAnalyser.getByteTimeDomainData(intBuffer);
        let sum = 0;
        for (let i = 0; i < intBuffer.length; i++) {
          const val = (intBuffer[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / intBuffer.length);
        this.interviewerAudioLevel = Math.min(100, Math.round(rms * 450));

        const speechThreshold = 2.2;
        if (this.interviewerAudioLevel > speechThreshold) {
          if (!this.isInterviewerSpeaking) {
            this.isInterviewerSpeaking = true;
            this.interviewerSpeechStartTime = now;
            this.startInterviewerRecording();
          }
          this.interviewerLastSpeechTime = now;
        } else {
          if (this.isInterviewerSpeaking) {
            // Sustained silence threshold reached after interviewer speech
            if (now - this.interviewerLastSpeechTime > this.interviewerSilenceThresholdMs) {
              this.isInterviewerSpeaking = false;
              this.stopInterviewerRecording();
            }
          }
        }
      }

      // 2. Evaluate Candidate Audio Level
      if (this.candidateAnalyser && canBuffer) {
        this.candidateAnalyser.getByteTimeDomainData(canBuffer);
        let sum = 0;
        for (let i = 0; i < canBuffer.length; i++) {
          const val = (canBuffer[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / canBuffer.length);
        this.candidateAudioLevel = Math.min(100, Math.round(rms * 450));
        this.isCandidateSpeaking = this.candidateAudioLevel > 2.5;
      }

      this.animFrameId = requestAnimationFrame(updateLoop);
    };

    updateLoop();
  }

  private startInterviewerRecording() {
    if (this.interviewerRecorder && this.interviewerRecorder.state === 'inactive') {
      try {
        this.recordedChunks = [];
        this.interviewerRecorder.start(250);
        this.isRecordingInterviewer = true;

        // Auto-slice after 7 seconds max continuous speech to avoid huge latency
        if (this.segmentMaxTimer) clearTimeout(this.segmentMaxTimer);
        this.segmentMaxTimer = setTimeout(() => {
          if (this.isInterviewerSpeaking && this.interviewerRecorder && this.interviewerRecorder.state === 'recording') {
            this.stopInterviewerRecording();
          }
        }, 7000);
      } catch (e) {}
    }
  }

  private stopInterviewerRecording() {
    if (this.segmentMaxTimer) {
      clearTimeout(this.segmentMaxTimer);
      this.segmentMaxTimer = null;
    }
    if (this.interviewerRecorder && this.interviewerRecorder.state === 'recording') {
      try {
        this.interviewerRecorder.stop();
        this.isRecordingInterviewer = false;
      } catch (e) {}
    }
  }

  // Sets mic gain sensitivity multiplier
  public setSensitivityMultiplier(multiplier: number) {
    this.micGainMultiplier = multiplier;
    if (this.interviewerGain && this.interviewerAudioContext) {
      this.interviewerGain.gain.setValueAtTime(this.micGainMultiplier, this.interviewerAudioContext.currentTime);
    }
  }

  // Converts Audio Blob to Base64
  public blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const base64 = res.split(',')[1] || res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  stopAudio() {
    this.isInterviewerSpeaking = false;
    this.isCandidateSpeaking = false;
    this.interviewerAudioLevel = 0;
    this.candidateAudioLevel = 0;

    if (this.segmentMaxTimer) {
      clearTimeout(this.segmentMaxTimer);
      this.segmentMaxTimer = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.stopInterviewerRecording();

    if (this.displayStream) {
      this.displayStream.getTracks().forEach(t => t.stop());
      this.displayStream = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }

    if (this.interviewerAudioContext && this.interviewerAudioContext.state !== 'closed') {
      try { this.interviewerAudioContext.close(); } catch (e) {}
      this.interviewerAudioContext = null;
    }

    if (this.candidateAudioContext && this.candidateAudioContext.state !== 'closed') {
      try { this.candidateAudioContext.close(); } catch (e) {}
      this.candidateAudioContext = null;
    }

    this.interviewerAnalyser = null;
    this.candidateAnalyser = null;
    this.interviewerGain = null;
  }

  // Technical term auto-correction utility applying phonetic dictionary
  correctTechnicalTerms(text: string): string {
    if (!text) return '';
    let corrected = text;
    for (const [regex, replacement] of TECH_REPLACEMENTS) {
      corrected = corrected.replace(regex, replacement);
    }
    return corrected;
  }

  // Scores text based on presence of software development technical terms
  scoreTechnicalRelevance(text: string): number {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const topic of TECH_TOPICS) {
      if (lower.includes(topic)) {
        score += 10;
      }
    }
    return score;
  }

  /**
   * Intelligently evaluates whether a transcript forms a complete interview question.
   * Handles both short questions ("What is CORS?", "What is DOM?", "What is an API?")
   * and single-word/topic prompts ("CORS", "Async and await") while holding triggers
   * during mid-sentence pauses on dangling connectors.
   */
  isCompleteQuestion(text: string): { isComplete: boolean; reason: string } {
    if (!text || !text.trim()) {
      return { isComplete: false, reason: 'Empty text' };
    }

    const clean = text.trim();
    const lower = clean.toLowerCase().replace(/[^a-z0-9#+.\s]/g, '');
    const words = clean.toLowerCase().split(/\s+/);

    // Filter out trailing punctuation for grammar checks
    const lastWord = words[words.length - 1].replace(/[^a-z0-9#+.]/g, '');

    // 1. Check if ending on a dangling preposition, conjunction, or auxiliary verb
    if (DANGLING_WORDS.has(lastWord)) {
      return { isComplete: false, reason: `Dangling connector: "${lastWord}"` };
    }

    // Check last two words for compound dangling phrases (e.g. "such as", "in terms of")
    if (words.length >= 2) {
      const lastTwo = words.slice(-2).join(' ').replace(/[^a-z0-9#+.\s]/g, '');
      if (DANGLING_WORDS.has(lastTwo)) {
        return { isComplete: false, reason: `Dangling phrase: "${lastTwo}"` };
      }
    }

    // 2. Direct recognized technical topics (even as single or double words, e.g. "CORS", "CORS policy", "Async and await")
    if (TECH_TOPICS.has(lower) || (words.length <= 3 && TECH_TOPICS.has(lastWord))) {
      return { isComplete: true, reason: `Direct technical topic prompt: "${clean}"` };
    }

    // 3. Ultra-concise imperative requests: e.g. "Explain middleware", "Define DOM", "What about CORS"
    if (words.length >= 2) {
      const firstWord = words[0];
      const subject = words.slice(1).join(' ').toLowerCase();
      if ((firstWord === 'explain' || firstWord === 'define' || firstWord === 'describe') && 
          (TECH_TOPICS.has(subject) || TECH_TOPICS.has(lastWord))) {
        return { isComplete: true, reason: `Direct technical request: "${clean}"` };
      }
    }

    const hasQuestionStarter = QUESTION_STARTERS.test(clean);
    const hasQuestionMark = clean.includes('?');

    // 4. Open interrogative clauses that require a predicate (e.g. "Can you explain how...", "How does...", "What is the difference...")
    if (/^(can you explain how|explain how|what is the difference|how does|how do we|how can)/i.test(clean) && !hasQuestionMark && words.length < 5) {
      return { isComplete: false, reason: 'Open interrogative missing predicate' };
    }

    // 5. Short Technical Questions (3+ words) like:
    // "What is CORS?", "What is DOM?", "What is an API?", "What is Middleware?", "What is Entity Framework?", "What is Dependency Injection?"
    if (words.length >= 3 && hasQuestionStarter) {
      return { isComplete: true, reason: `Complete short question: "${clean}"` };
    }

    // 6. Standard questions with question mark or 4+ words with question starter or 7+ substantive words
    if (hasQuestionMark || (hasQuestionStarter && words.length >= 4) || words.length >= 7) {
      return { isComplete: true, reason: 'Complete sentence structure' };
    }

    return { isComplete: false, reason: 'Awaiting complete thought' };
  }
}
