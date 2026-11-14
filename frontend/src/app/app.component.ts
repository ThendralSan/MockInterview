import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AudioEngineService, AudioInputSource } from './audio-engine.service';

export interface HistoryItem {
  id: string;
  timestamp: string;
  question: string;
  category: string;
  answer: string;
  spokenAnswer: string;
  bulletPoints: string[];
  code?: {
    language: string;
    snippet: string;
  } | null;
  latencyMs?: number;
}

export interface CandidateProfile {
  experienceYears: number;
  primarySkills: string;
  secondarySkills: string;
  targetRole: string;
}

export interface Preferences {
  audioSettings: {
    autoTts: boolean;
    speechRate: number;
    voiceURI: string;
  };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Parakeet Copilot - Real-Time Technical Interview Assistant';

  // WebSocket state
  ws: WebSocket | null = null;
  isConnected: boolean = false;
  reconnectTimeout: any = null;

  // Auto-Answer ON/OFF Toggle
  autoAnswerEnabled: boolean = true;
  speechStateMessage: string = '';
  micSensitivityLevel: 'NORMAL' | 'HIGH' | 'MAX' = 'HIGH';

  // Question & streaming generation state
  question: string = '';
  interimTranscript: string = '';
  loading: boolean = false;
  streamingAnswerText: string = '';
  aiResponse: HistoryItem | null = null;
  history: HistoryItem[] = [];
  selectedHistoryId: string | null = null;
  lastGenerationLatency: number = 0;

  // Speech Recognition state
  isListening: boolean = false;
  recognition: any = null;
  speechTimeout: any = null;
  speechSupported: boolean = false;
  audioSource: AudioInputSource = 'MICROPHONE';

  // Text to Speech (Audio Headset) state
  isSpeaking: boolean = false;
  voices: SpeechSynthesisVoice[] = [];
  selectedVoiceURI: string = '';
  ttsSupported: boolean = false;
  hasSpokenFirstSentence: boolean = false;

  // Modals & settings
  showSettingsModal: boolean = false;
  copiedFeedback: string = '';

  candidateProfile: CandidateProfile = {
    experienceYears: 7,
    primarySkills: 'C#, ASP.NET Core, EF Core, React, Angular, TypeScript, SQL Server, Azure, Microservices, Redis, Kafka, RabbitMQ, Docker, Kubernetes',
    secondarySkills: 'CI/CD, Event-Driven Architecture, Distributed Systems',
    targetRole: 'Senior Full Stack Developer'
  };

  preferences: Preferences = {
    audioSettings: {
      autoTts: true,
      speechRate: 1.05,
      voiceURI: ''
    }
  };

  constructor(
    private http: HttpClient,
    public audioEngine: AudioEngineService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Restore persistent Auto-Answer preference from localStorage
    const savedAutoAnswer = localStorage.getItem('parakeet_auto_answer');
    if (savedAutoAnswer !== null) {
      this.autoAnswerEnabled = savedAutoAnswer === 'true';
    }

    this.initAudioSynthesis();
    this.connectWebSocket();
    this.setupSpeechRecognition();
  }

  ngOnDestroy() {
    this.stopListening();
    this.stopSpeaking();
    this.audioEngine.stopAudio();
    if (this.ws) this.ws.close();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
  }

  // Hotkey listener: pressing Alt+Enter or Ctrl+Enter commits question immediately
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.altKey && event.key === 'Enter') || (event.ctrlKey && event.key === 'Enter')) {
      event.preventDefault();
      this.askQuestion();
    }
  }

  // --- AUTO-ANSWER TOGGLE ---

  toggleAutoAnswer() {
    this.autoAnswerEnabled = !this.autoAnswerEnabled;
    localStorage.setItem('parakeet_auto_answer', String(this.autoAnswerEnabled));
    
    if (!this.autoAnswerEnabled) {
      if (this.speechTimeout) clearTimeout(this.speechTimeout);
      this.speechStateMessage = 'Auto-Answer is OFF (Manual mode: click "Answer Now" when ready)';
      this.showCopiedFeedback('Auto-Answer turned OFF: Questions will transcribe without auto-generating.');
    } else {
      this.speechStateMessage = 'Auto-Answer is ON (3s pause + complete sentence detection active)';
      this.showCopiedFeedback('Auto-Answer turned ON: Will trigger only when interviewer finishes complete question.');
    }
    this.cdr.detectChanges();
  }

  // --- WEBSOCKET CONNECTION & MESSAGING ---

  connectWebSocket() {
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname || 'localhost';
      const wsPort = window.location.port === '4200' ? '8080' : (window.location.port || '8080');
      this.ws = new WebSocket(`${wsProtocol}//${wsHost}:${wsPort}`);

      this.ws.onopen = () => {
        console.log('[WS] Connected to backend');
        this.isConnected = true;
        this.cdr.detectChanges();
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleIncomingMessage(payload);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      this.ws.onclose = () => {
        console.warn('[WS] Closed. Reconnecting in 2.5s...');
        this.isConnected = false;
        this.cdr.detectChanges();
        this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 2500);
      };

      this.ws.onerror = (err) => console.error('[WS] Error:', err);
    } catch (e) {
      console.error('[WS] Init exception:', e);
    }
  }

  handleIncomingMessage(payload: any) {
    switch (payload.type) {
      case 'SESSION_SYNC': {
        const session = payload.data;
        if (session.candidateProfile) this.candidateProfile = session.candidateProfile;
        if (session.preferences) this.preferences = session.preferences;
        if (Array.isArray(session.history)) {
          this.history = session.history;
          if (this.history.length > 0 && !this.aiResponse) {
            this.aiResponse = this.history[this.history.length - 1];
          }
        }
        this.cdr.detectChanges();
        break;
      }

      case 'GENERATING_START': {
        this.loading = true;
        this.streamingAnswerText = '';
        this.hasSpokenFirstSentence = false;
        this.speechStateMessage = 'Generating senior-level response...';
        this.cdr.detectChanges();
        break;
      }

      case 'STREAM_CHUNK': {
        const partial = payload.partialText || '';
        const answerMatch = partial.match(/"answer"\s*:\s*"([^"]*)/i);
        if (answerMatch && answerMatch[1]) {
          this.streamingAnswerText = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }

        // Whisper sentence 1 to headset early
        if (this.preferences.audioSettings.autoTts && !this.hasSpokenFirstSentence) {
          this.checkAndSpeakFirstSentence(partial);
        }
        this.cdr.detectChanges();
        break;
      }

      case 'AI_RESPONSE': {
        this.loading = false;
        this.streamingAnswerText = '';
        this.speechStateMessage = '';
        const item: HistoryItem = {
          id: payload.data?.id || 'q_' + Date.now(),
          timestamp: payload.data?.timestamp || new Date().toISOString(),
          question: payload.data?.question || '',
          category: payload.data?.category || 'TECHNICAL',
          answer: payload.data?.answer || payload.data?.spokenAnswer || '',
          spokenAnswer: payload.data?.answer || payload.data?.spokenAnswer || '',
          bulletPoints: payload.data?.bulletPoints || payload.data?.keyPoints || [],
          code: payload.data?.code || null,
          latencyMs: payload.data?.latencyMs || payload.latencyMs || 0
        };

        this.aiResponse = item;
        this.selectedHistoryId = item.id;
        this.lastGenerationLatency = item.latencyMs ? Math.round(item.latencyMs) : 1100;

        // Auto-play audio if not already started
        if (this.preferences.audioSettings.autoTts && !this.hasSpokenFirstSentence && item.answer) {
          this.speakAnswer(item.answer);
        }

        if (!this.history.some(h => h.id === item.id)) {
          this.history.push(item);
        }

        this.cdr.detectChanges();
        break;
      }

      case 'SESSION_UPDATE': {
        if (Array.isArray(payload.history)) {
          this.history = payload.history;
        }
        this.cdr.detectChanges();
        break;
      }

      case 'PREFERENCES_UPDATED': {
        if (payload.data.preferences) this.preferences = payload.data.preferences;
        if (payload.data.candidateProfile) this.candidateProfile = payload.data.candidateProfile;
        this.cdr.detectChanges();
        break;
      }

      case 'HISTORY_CLEARED': {
        this.history = [];
        this.aiResponse = null;
        this.selectedHistoryId = null;
        this.cdr.detectChanges();
        break;
      }

      case 'ERROR': {
        this.loading = false;
        this.speechStateMessage = 'Error: ' + payload.message;
        console.error('[Backend Error]:', payload.message);
        this.cdr.detectChanges();
        break;
      }
    }
  }

  // Whispers sentence 1 into headset
  private checkAndSpeakFirstSentence(partial: string) {
    const match = partial.match(/"answer"\s*:\s*"([^"]{20,}[.?!])/i);
    if (match && match[1]) {
      const firstSentence = match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
      this.hasSpokenFirstSentence = true;
      this.speakAnswer(firstSentence);
    }
  }

  // --- ACTIONS ---

  askQuestion() {
    let q = (this.question || '').trim();
    if (!q) return;

    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    q = this.audioEngine.correctTechnicalTerms(q);
    if (!this.ws || !this.isConnected) return;

    this.loading = true;
    this.stopSpeaking();
    this.hasSpokenFirstSentence = false;
    this.speechStateMessage = 'Generating answer...';

    this.ws.send(JSON.stringify({
      type: 'ASK_QUESTION',
      question: q
    }));

    this.question = '';
    this.interimTranscript = '';
    this.cdr.detectChanges();
  }

  selectHistoryItem(item: HistoryItem) {
    this.selectedHistoryId = item.id;
    this.aiResponse = item;
  }

  clearHistory() {
    if (confirm('Clear all interview question history for this session?')) {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: 'CLEAR_HISTORY' }));
      }
    }
  }

  emergencyStop() {
    this.stopListening();
    this.stopSpeaking();
    this.loading = false;
    this.streamingAnswerText = '';
    this.interimTranscript = '';
    this.speechStateMessage = '';
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    this.showCopiedFeedback('Halted microphone and audio playback.');
  }

  // --- AUDIO INPUT & INTELLIGENT QUESTION DETECTION ---

  async switchAudioSource(source: AudioInputSource) {
    this.audioSource = source;
    if (this.isListening) {
      this.stopListening();
      await this.startListening();
    }
  }

  // --- AUDIO SENSITIVITY CONTROL ---
  cycleMicSensitivity() {
    if (this.micSensitivityLevel === 'NORMAL') {
      this.micSensitivityLevel = 'HIGH';
      this.audioEngine.setSensitivityMultiplier(1.8);
      this.showCopiedFeedback('Mic Sensitivity: High (1.8x Gain Booster Active)');
    } else if (this.micSensitivityLevel === 'HIGH') {
      this.micSensitivityLevel = 'MAX';
      this.audioEngine.setSensitivityMultiplier(2.5);
      this.showCopiedFeedback('Mic Sensitivity: Maximum (2.5x Gain Booster Active)');
    } else {
      this.micSensitivityLevel = 'NORMAL';
      this.audioEngine.setSensitivityMultiplier(1.0);
      this.showCopiedFeedback('Mic Sensitivity: Standard (1.0x Normal)');
    }
    this.cdr.detectChanges();
  }

  setupSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechSupported = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 5;
      this.recognition.lang = 'en-US';

      // Acoustic biasing using SpeechGrammarList if supported by browser engine
      const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList;
      if (SpeechGrammarList) {
        try {
          const grammarList = new SpeechGrammarList();
          const techGrammar = `#JSGF V1.0; grammar tech; public <tech> = CORS | CORS policy | CSRF | XSS | DOM | Virtual DOM | Shadow DOM | API | REST API | Web API | OpenAPI | async and await | async | await | Task | ConfigureAwait | Task.WhenAll | ValueTask | Dependency Injection | IoC | DbContext | EF Core | Entity Framework | C# | .NET | ASP.NET Core | SQL Server | LINQ | CLR | Garbage Collection | IDisposable | Angular | React | RxJS | NgRx | TypeScript | Webpack | microservices | Kubernetes | Docker | Kafka | Redis | RabbitMQ | CQRS | gRPC | SignalR | Azure | CI/CD | SOLID principles | JWT | OAuth | Polly | Dapper | MediatR ;`;
          grammarList.addFromString(techGrammar, 1.0);
          this.recognition.grammars = grammarList;
        } catch (grammarErr) {
          console.warn('[SpeechRecognition] Grammar list not supported:', grammarErr);
        }
      }

      this.recognition.onstart = () => {
        this.isListening = true;
        this.speechStateMessage = this.autoAnswerEnabled 
          ? 'Listening... (Intelligent question detection active)' 
          : 'Listening... (Auto-Answer OFF - Manual mode)';
        this.cdr.detectChanges();
      };

      this.recognition.onresult = (event: any) => {
        let bestFinalChunk = '';
        let bestInterimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            // Check all alternatives and choose the one with the highest technical relevance
            let candidateText = res[0].transcript;
            let highestScore = this.audioEngine.scoreTechnicalRelevance(this.audioEngine.correctTechnicalTerms(candidateText));

            for (let j = 1; j < res.length; j++) {
              const altTranscript = res[j].transcript;
              const altScore = this.audioEngine.scoreTechnicalRelevance(this.audioEngine.correctTechnicalTerms(altTranscript));
              if (altScore > highestScore) {
                highestScore = altScore;
                candidateText = altTranscript;
              }
            }
            bestFinalChunk += ' ' + candidateText;
          } else {
            // For interim results, also check alternatives if available
            let candidateText = res[0].transcript;
            let highestScore = this.audioEngine.scoreTechnicalRelevance(this.audioEngine.correctTechnicalTerms(candidateText));

            for (let j = 1; j < res.length; j++) {
              const altTranscript = res[j].transcript;
              const altScore = this.audioEngine.scoreTechnicalRelevance(this.audioEngine.correctTechnicalTerms(altTranscript));
              if (altScore > highestScore) {
                highestScore = altScore;
                candidateText = altTranscript;
              }
            }
            bestInterimChunk += ' ' + candidateText;
          }
        }

        if (bestFinalChunk.trim()) {
          const correctedFinal = this.audioEngine.correctTechnicalTerms(bestFinalChunk.trim());
          this.question += (this.question ? ' ' : '') + correctedFinal;
          this.interimTranscript = '';
          this.evaluateQuestionCompletionAndSchedule();
        } else if (bestInterimChunk.trim()) {
          this.interimTranscript = this.audioEngine.correctTechnicalTerms(bestInterimChunk.trim());
          // Speaker is actively talking: cancel any pending silence timers immediately!
          if (this.speechTimeout) {
            clearTimeout(this.speechTimeout);
            this.speechTimeout = null;
          }
          this.speechStateMessage = 'Interviewer speaking...';
        }
        this.cdr.detectChanges();
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Speech Recognition event:', event.error);
        if (event.error === 'not-allowed') this.isListening = false;
        this.cdr.detectChanges();
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try { this.recognition.start(); } catch (e) { this.isListening = false; }
        }
        this.cdr.detectChanges();
      };
    }
  }

  /**
   * Evaluates if question is complete and handles timing:
   * - If Auto-Answer is OFF: Never auto-triggers.
   * - If Incomplete (e.g. interviewer pausing on "What is..."): Does not trigger on 2-3s pause; waits for speaker to finish.
   * - If Complete (including short technical questions like "What is DOM?"): Schedules answer generation after 2.2s silence.
   */
  private evaluateQuestionCompletionAndSchedule() {
    if (!this.autoAnswerEnabled) {
      this.speechStateMessage = 'Transcribing... (Auto-Answer is OFF - Click Answer Now when ready)';
      if (this.speechTimeout) clearTimeout(this.speechTimeout);
      return;
    }

    const currentText = this.question.trim();
    if (!currentText || this.loading) return;

    const analysis = this.audioEngine.isCompleteQuestion(currentText);

    if (this.speechTimeout) clearTimeout(this.speechTimeout);

    if (analysis.isComplete) {
      this.speechStateMessage = `Question detected: "${analysis.reason}". Auto-generating in 2.2s (or click Answer Now)...`;
      // Wait 2.2 seconds of sustained silence after a complete question to allow natural wrap-up
      this.speechTimeout = setTimeout(() => {
        if (this.autoAnswerEnabled && this.question.trim().length >= 3 && !this.loading) {
          console.log(`⚡ [Auto-Answer] Complete question verified (${analysis.reason}). Generating!`);
          this.askQuestion();
        }
      }, 2200);
    } else {
      // Sentence is incomplete (e.g. trailing "and...", "what is...", "what is the difference between...")
      // DO NOT trigger on 2-3s pause!
      this.speechStateMessage = `Interviewer paused... (${analysis.reason} - waiting for completion)`;
      console.log(`[Auto-Answer] Incomplete thought detected (${analysis.reason}). Holding trigger.`);
      
      // Safety fallback: wait up to 5.5s in case speaker walked away
      this.speechTimeout = setTimeout(() => {
        if (this.autoAnswerEnabled && this.question.trim().length >= 5 && !this.loading) {
          console.log('⚡ [Auto-Answer] Extended timeout reached on substantive text. Triggering fallback answer.');
          this.askQuestion();
        }
      }, 5500);
    }
  }

  async toggleListening() {
    if (!this.speechSupported) return;
    if (this.isListening) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  async startListening() {
    if (!this.recognition) return;

    // VAD silence callback (2800ms threshold)
    const onVADSilence = () => {
      if (this.autoAnswerEnabled && this.question.trim().length >= 3 && !this.loading) {
        const analysis = this.audioEngine.isCompleteQuestion(this.question);
        if (analysis.isComplete) {
          console.log(`⚡ [VAD Trigger] Sustained silence + complete question verified: "${this.question}"`);
          this.askQuestion();
        } else {
          console.log(`[VAD] Silence detected, but sentence incomplete (${analysis.reason}). Waiting.`);
        }
      }
    };

    if (this.audioSource === 'SYSTEM_AUDIO') {
      const ok = await this.audioEngine.startSystemAudio(onVADSilence);
      if (!ok) return;
    } else {
      await this.audioEngine.startMicrophone(onVADSilence);
    }

    try {
      this.isListening = true;
      this.recognition.start();
    } catch (e) {
      console.warn('Recognition start exception:', e);
    }
    this.cdr.detectChanges();
  }

  stopListening() {
    this.isListening = false;
    this.audioEngine.stopAudio();
    this.speechStateMessage = '';
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    this.cdr.detectChanges();
  }

  // --- TEXT TO SPEECH (PRIVATE HEADSET AUDIO) ---

  initAudioSynthesis() {
    if ('speechSynthesis' in window) {
      this.ttsSupported = true;
      const updateVoices = () => {
        this.voices = window.speechSynthesis.getVoices();
        if (this.voices.length > 0 && !this.selectedVoiceURI) {
          const preferred = this.voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
          this.selectedVoiceURI = preferred ? preferred.voiceURI : this.voices[0].voiceURI;
        }
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }

  speakAnswer(text: string) {
    if (!this.ttsSupported || !text) return;

    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.preferences.audioSettings.speechRate || 1.05;
    utterance.pitch = 1.0;

    if (this.selectedVoiceURI) {
      const v = this.voices.find(x => x.voiceURI === this.selectedVoiceURI);
      if (v) utterance.voice = v;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.cdr.detectChanges();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.cdr.detectChanges();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.cdr.detectChanges();
    };

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.ttsSupported && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }

  toggleAutoTts() {
    this.preferences.audioSettings.autoTts = !this.preferences.audioSettings.autoTts;
    this.savePreferences();
  }

  // --- SETTINGS & COPY ---

  savePreferences() {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({
        type: 'UPDATE_PREFERENCES',
        preferences: this.preferences,
        candidateProfile: this.candidateProfile
      }));
    }
    this.showCopiedFeedback('Settings saved!');
    this.showSettingsModal = false;
  }

  copyToClipboard(text: string, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.showCopiedFeedback(`${label} copied!`);
    });
  }

  showCopiedFeedback(msg: string) {
    this.copiedFeedback = msg;
    setTimeout(() => {
      if (this.copiedFeedback === msg) this.copiedFeedback = '';
    }, 2500);
  }
}
