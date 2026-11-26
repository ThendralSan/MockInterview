import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
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
  ragResult?: any;
  ragAnswer?: any;
}

export interface ConversationMessage {
  id: string;
  speaker: 'INTERVIEWER' | 'CANDIDATE';
  text: string;
  timestamp: string | Date;
  isQuestion?: boolean;
  isStreaming?: boolean;
  answered?: boolean;
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

  // Video and Chat Elements
  @ViewChild('interviewerVideo') interviewerVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('chatScrollContainer') chatScrollContainerRef?: ElementRef<HTMLDivElement>;

  // WebSocket state
  ws: WebSocket | null = null;
  isConnected: boolean = false;
  reconnectTimeout: any = null;

  // Auto-Answer ON/OFF Toggle (Default to OFF per user preference)
  autoAnswerEnabled: boolean = false;
  candidateMicMuted: boolean = false;
  speechStateMessage: string = '';
  micSensitivityLevel: 'NORMAL' | 'HIGH' | 'MAX' = 'HIGH';

  // Dual Speaker Conversation Feed
  conversationMessages: ConversationMessage[] = [];
  conversationFilter: 'ALL' | 'INTERVIEWER' | 'CANDIDATE' = 'ALL';
  isMeetingLive: boolean = false;
  activeMeetingQuestion: string = '';

  // Session Stopwatch
  sessionSeconds: number = 0;
  sessionTimerStr: string = '00:00';
  sessionTimerInterval: any = null;

  // Question & streaming generation state
  question: string = '';
  interimTranscript: string = '';
  loading: boolean = false;
  streamingAnswerText: string = '';
  aiResponse: HistoryItem | null = null;
  history: HistoryItem[] = [];
  selectedHistoryId: string | null = null;
  lastGenerationLatency: number = 0;

  // Persistent Word-by-Word Streaming Buffer for Candidate Microphone
  candidateCommittedText: string = '';
  activeCandidateMsgId: string | null = null;
  candidateSilenceTimer: any = null;

  // Real-Time Word-by-Word Progressive Streaming Buffer for Interviewer Tab Audio
  interviewerCommittedText: string = '';
  interviewerDisplayedText: string = '';
  activeInterviewerMsgId: string | null = null;
  interviewerWordQueue: string[] = [];
  interviewerStreamInterval: any = null;
  interviewerSilenceTimer: any = null;

  // Speech Recognition state
  isListening: boolean = false;
  recognition: any = null;
  speechTimeout: any = null;
  speechSupported: boolean = false;
  audioSource: AudioInputSource = 'DUAL_AUDIO';

  // Text to Speech (Audio Headset) state
  isSpeaking: boolean = false;
  voices: SpeechSynthesisVoice[] = [];
  selectedVoiceURI: string = '';
  ttsSupported: boolean = false;
  hasSpokenFirstSentence: boolean = false;

  // Modals & settings
  showSettingsModal: boolean = false;
  showHistoryDrawer: boolean = false;
  copiedFeedback: string = '';

  // RAG & Dual Answer Engine State
  ragResponse: {
    question: string;
    answer: string;
    category?: string;
    confidence?: number;
    sourceName?: string;
    strategy?: string;
    code?: any;
    durationMs?: number;
  } | null = null;
  ragLoading: boolean = false;
  ragStatusMessage: string = '';
  answerViewMode: 'DUAL' | 'RAG_ONLY' | 'AI_ONLY' = 'DUAL';

  // Knowledge Base Management State
  showKnowledgeModal: boolean = false;
  knowledgeTab: 'UPLOAD' | 'LIBRARY' | 'TEST' = 'UPLOAD';
  kbDocuments: any[] = [];
  kbQuestions: any[] = [];
  kbCategories: any[] = [];
  kbCategoryFilter: string = 'ALL';
  kbSearchFilter: string = '';
  kbIsUploading: boolean = false;
  kbUploadStatus: string = '';
  kbUploadCategory: string = 'GENERAL';
  kbSelectedFile: File | null = null;
  showAddQuestionModal: boolean = false;
  editingQuestion: any = { id: null, question: '', answer: '', category: 'GENERAL', code: '' };
  testQuery: string = '';
  testResults: any = null;
  testLoading: boolean = false;

  candidateProfile: CandidateProfile = {
    experienceYears: 7,
    primarySkills: 'C#, ASP.NET, ASP.NET Core, ASP.NET MVC, Entity Framework Core, SQL Server, Microsoft Azure, React, Angular',
    secondarySkills: 'TypeScript, Microservices, Docker, Kubernetes, Redis, Kafka, RabbitMQ, CI/CD',
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
    this.autoAnswerEnabled = false;
    localStorage.setItem('parakeet_auto_answer', 'false');

    this.initAudioSynthesis();
    this.connectWebSocket();
    this.setupSpeechRecognition();
  }

  ngOnDestroy() {
    this.stopMeetingSession();
    this.stopSpeaking();
    if (this.ws) this.ws.close();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    if (this.candidateSilenceTimer) clearTimeout(this.candidateSilenceTimer);
    if (this.sessionTimerInterval) clearInterval(this.sessionTimerInterval);
  }

  // Hotkey listener: pressing Alt+Enter commits question immediately
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.altKey && event.key === 'Enter') || (event.ctrlKey && event.key === 'Enter')) {
      event.preventDefault();
      this.askQuestion();
    }
  }

  // Filtered conversation messages
  get filteredConversation(): ConversationMessage[] {
    if (this.conversationFilter === 'INTERVIEWER') {
      return this.conversationMessages.filter(m => m.speaker === 'INTERVIEWER');
    }
    if (this.conversationFilter === 'CANDIDATE') {
      return this.conversationMessages.filter(m => m.speaker === 'CANDIDATE');
    }
    return this.conversationMessages;
  }

  // --- AUTO-ANSWER TOGGLE ---

  toggleAutoAnswer() {
    this.autoAnswerEnabled = !this.autoAnswerEnabled;
    localStorage.setItem('parakeet_auto_answer', String(this.autoAnswerEnabled));
    
    if (!this.autoAnswerEnabled) {
      if (this.speechTimeout) clearTimeout(this.speechTimeout);
      this.speechStateMessage = 'Auto-Answer is OFF (Manual mode: click "⚡ Answer Now" when ready)';
      this.showCopiedFeedback('Auto-Answer turned OFF.');
    } else {
      this.speechStateMessage = 'Auto-Answer is ON (Automatic response upon interviewer question)';
      this.showCopiedFeedback('Auto-Answer turned ON.');
    }
    this.cdr.detectChanges();
  }

  toggleCandidateMic() {
    this.candidateMicMuted = !this.candidateMicMuted;
    if (this.candidateMicMuted) {
      this.stopCandidateMic();
      this.showCopiedFeedback('My Voice (Microphone) MUTED.');
    } else {
      this.startCandidateMic();
      this.showCopiedFeedback('My Voice (Microphone) ACTIVE.');
    }
    this.cdr.detectChanges();
  }

  // --- SESSION TIMER ---
  startSessionTimer() {
    this.stopSessionTimer();
    this.sessionSeconds = 0;
    this.sessionTimerInterval = setInterval(() => {
      this.sessionSeconds++;
      const mins = Math.floor(this.sessionSeconds / 60).toString().padStart(2, '0');
      const secs = (this.sessionSeconds % 60).toString().padStart(2, '0');
      this.sessionTimerStr = `${mins}:${secs}`;
      this.cdr.detectChanges();
    }, 1000);
  }

  stopSessionTimer() {
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
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
        if (Array.isArray(payload.conversationLog)) {
          this.conversationMessages = payload.conversationLog;
          this.scrollConversationToBottom();
        }
        this.cdr.detectChanges();
        break;
      }

      case 'TRANSCRIBE_ACK': {
        this.audioEngine.onTranscribeComplete();
        break;
      }

      case 'SPEECH_TRANSCRIBED': {
        this.audioEngine.onTranscribeComplete();
        const msg: ConversationMessage = payload.data;
        if (msg && msg.text) {
          if (msg.speaker === 'CANDIDATE') {
            // Find existing candidate message by ID or recent matching text to completely prevent duplicate cards!
            let existing = this.conversationMessages.find(m => m.id === msg.id);
            if (!existing) {
              existing = this.conversationMessages.slice().reverse().find(m =>
                m.speaker === 'CANDIDATE' && (
                  m.id === this.activeCandidateMsgId ||
                  m.text.trim().toLowerCase() === msg.text.trim().toLowerCase() ||
                  (Date.now() - new Date(m.timestamp).getTime() < 15000 && (
                    m.text.toLowerCase().includes(msg.text.toLowerCase()) ||
                    msg.text.toLowerCase().includes(m.text.toLowerCase())
                  ))
                )
              );
            }

            if (existing) {
              existing.id = msg.id;
              existing.text = msg.text;
              existing.isQuestion = msg.isQuestion;
              existing.isStreaming = false;
            } else {
              // Deduplicate if last message was already identical candidate text
              const last = this.conversationMessages[this.conversationMessages.length - 1];
              if (last && last.speaker === 'CANDIDATE' && last.text.trim().toLowerCase() === msg.text.trim().toLowerCase()) {
                last.id = msg.id;
                last.isQuestion = msg.isQuestion;
                last.isStreaming = false;
              } else {
                this.conversationMessages.push(msg);
                this.scrollConversationToBottom();
              }
            }

            // Auto-populate manual question textarea when candidate repeats a question (if not already filled)
            if (!this.loading && !this.question.trim()) {
              this.question = msg.text;
            }
          } else if (msg.speaker === 'INTERVIEWER') {
            const liveDisplayed = (this.interviewerDisplayedText || '').toLowerCase().trim();
            const incomingText = (msg.text || '').toLowerCase().trim();

            // If real-time native speech engine has already rendered this question, avoid duplicating:
            if (liveDisplayed && (liveDisplayed.includes(incomingText) || incomingText.includes(liveDisplayed))) {
              if (this.activeInterviewerMsgId) {
                const active = this.conversationMessages.find(m => m.id === this.activeInterviewerMsgId);
                if (active) {
                  active.id = msg.id;
                  active.isQuestion = msg.isQuestion;
                }
              }
              return;
            }

            // Headphone mode / digital tab stream fallback:
            this.handleInterviewerStreamingSpeech(msg);
          }
        }
        this.cdr.detectChanges();
        break;
      }

      case 'CONVERSATION_CLEARED': {
        this.conversationMessages = [];
        this.activeMeetingQuestion = '';
        this.cdr.detectChanges();
        break;
      }

      case 'GENERATING_START': {
        this.loading = true;
        this.ragLoading = true;
        this.ragResponse = null;
        this.ragStatusMessage = 'Searching Knowledge Base for prepared answer...';
        this.streamingAnswerText = '';
        this.hasSpokenFirstSentence = false;
        this.speechStateMessage = 'Generating senior-level response...';
        this.cdr.detectChanges();
        break;
      }

      case 'RAG_RESPONSE': {
        this.ragLoading = false;
        if (payload.isMatch) {
          this.ragResponse = {
            question: payload.question,
            answer: payload.answer,
            category: payload.category || 'TECHNICAL',
            confidence: payload.confidence || 0,
            sourceName: payload.sourceName || 'Knowledge Base',
            strategy: payload.strategy || 'SEMANTIC',
            code: payload.code || null,
            durationMs: payload.durationMs || 0
          };
          this.ragStatusMessage = `Prepared answer found (${payload.confidence}% confidence · ${payload.strategy})`;
        } else {
          this.ragResponse = null;
          this.ragStatusMessage = payload.message || 'No prepared answer found in Knowledge Base for this question';
        }
        this.cdr.detectChanges();
        break;
      }

      case 'KNOWLEDGE_BASE_UPDATED': {
        this.loadKbDocuments();
        this.loadKbQuestions();
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

  scrollConversationToBottom() {
    requestAnimationFrame(() => {
      if (this.chatScrollContainerRef && this.chatScrollContainerRef.nativeElement) {
        const el = this.chatScrollContainerRef.nativeElement;
        // Smooth scroll to bottom without jitter
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (isNearBottom || el.scrollTop === 0) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    });
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

  askQuestion(customText?: string) {
    let q = (customText !== undefined ? customText : (this.question.trim() || this.activeMeetingQuestion.trim())).trim();
    if (!q) return;

    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    if (this.candidateSilenceTimer) clearTimeout(this.candidateSilenceTimer);

    if (this.activeCandidateMsgId) {
      const activeMsg = this.conversationMessages.find(m => m.id === this.activeCandidateMsgId);
      if (activeMsg) {
        activeMsg.isStreaming = false;
        activeMsg.isQuestion = true;
      }
      this.resetCandidateBuffer();
    }

    if (this.activeInterviewerMsgId) {
      const activeMsg = this.conversationMessages.find(m => m.id === this.activeInterviewerMsgId);
      if (activeMsg) {
        activeMsg.isStreaming = false;
        activeMsg.answered = true;
      }
      this.resetInterviewerBuffer();
    }

    q = this.audioEngine.correctTechnicalTerms(q);
    if (!this.ws || !this.isConnected) return;

    this.loading = true;
    this.ragLoading = true;
    this.ragResponse = null;
    this.ragStatusMessage = 'Searching Knowledge Base for prepared answer...';
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

  triggerAnswerForMessage(msg: ConversationMessage) {
    if (msg) {
      msg.answered = true;
      msg.isStreaming = false;
    }
    this.resetInterviewerBuffer();
    this.question = msg.text;
    this.askQuestion(msg.text);
  }

  clearConversation() {
    if (confirm('Clear the conversation messages?')) {
      this.conversationMessages = [];
      this.activeMeetingQuestion = '';
      this.resetCandidateBuffer();
      this.resetInterviewerBuffer();
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: 'CLEAR_CONVERSATION' }));
      }
    }
  }

  selectHistoryItem(item: HistoryItem) {
    this.selectedHistoryId = item.id;
    this.aiResponse = item;
    if (item.ragResult || item.ragAnswer) {
      this.ragResponse = item.ragResult || item.ragAnswer;
    }
  }

  clearHistory() {
    if (confirm('Clear all generated interview question answers?')) {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: 'CLEAR_HISTORY' }));
      }
    }
  }

  emergencyStop() {
    this.stopMeetingSession();
    this.stopSpeaking();
    this.loading = false;
    this.streamingAnswerText = '';
    this.interimTranscript = '';
    this.speechStateMessage = '';
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    this.showCopiedFeedback('Halted all audio capture and speech synthesis.');
  }

  // --- DUAL AUDIO SEPARATION PIPELINE ---

  async startDualMeetingSession() {
    this.speechStateMessage = 'Requesting tab/screen share with meeting audio...';

    const result = await this.audioEngine.startDualAudioCapture(
      // onInterviewerSpeechReady: Interviewer audio segment recorded from tab
      async (blob: Blob) => {
        if (!this.ws || !this.isConnected) return;
        try {
          const base64Audio = await this.audioEngine.blobToBase64(blob);
          this.ws.send(JSON.stringify({
            type: 'TRANSCRIBE_AUDIO',
            audio: base64Audio,
            mimeType: blob.type || 'audio/webm',
            speaker: 'INTERVIEWER',
            autoAnswer: this.autoAnswerEnabled
          }));
        } catch (err) {
          console.error('[App] Failed to encode interviewer audio:', err);
        }
      },
      // onTabEnded: User clicked Chrome's Stop sharing
      () => {
        this.stopMeetingSession();
        this.showCopiedFeedback('Meeting tab share stopped.');
      }
    );

    if (!result.success) {
      this.speechStateMessage = result.error || 'Capture failed.';
      alert(result.error || 'Failed to capture audio.');
      this.cdr.detectChanges();
      return;
    }

    this.isMeetingLive = true;
    this.isListening = true;
    this.conversationFilter = 'ALL';

    // Attach video track ONLY to preview element (Parakeet AI visual style).
    // CRITICAL: Strip all audio tracks from preview to prevent delayed speaker playback echo!
    setTimeout(() => {
      if (this.interviewerVideoRef && result.displayStream) {
        const videoTracks = result.displayStream.getVideoTracks();
        if (videoTracks.length > 0) {
          const videoOnlyStream = new MediaStream(videoTracks);
          const videoEl = this.interviewerVideoRef.nativeElement;
          videoEl.muted = true;
          videoEl.volume = 0;
          videoEl.srcObject = videoOnlyStream;
        }
      }
    }, 150);

    // Start local candidate microphone recognition
    this.startCandidateMic();

    // Start session timer
    this.startSessionTimer();

    this.speechStateMessage = 'Dual Audio Separation Active (Interviewer on Left, Candidate on Right)';
    this.showCopiedFeedback('Dual Audio Active! Interviewer & candidate separated.');
    this.cdr.detectChanges();
  }

  stopMeetingSession() {
    this.isMeetingLive = false;
    this.isListening = false;
    this.audioEngine.stopAudio();
    this.stopCandidateMic();
    this.stopSessionTimer();
    this.resetCandidateBuffer();
    this.resetInterviewerBuffer();

    if (this.interviewerVideoRef && this.interviewerVideoRef.nativeElement) {
      this.interviewerVideoRef.nativeElement.srcObject = null;
    }

    this.speechStateMessage = 'Capture stopped.';
    this.cdr.detectChanges();
  }

  // --- CANDIDATE MICROPHONE STREAMING & BUFFER ENGINE ---

  setupSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechSupported = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.cdr.detectChanges();
      };

      this.recognition.onresult = (event: any) => {
        let bestFinalChunk = '';
        let bestInterimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            bestFinalChunk += ' ' + res[0].transcript;
          } else {
            bestInterimChunk += ' ' + res[0].transcript;
          }
        }

        // INTELLIGENT REAL-TIME AUDIO SOURCE DISAMBIGUATION:
        // When tab audio (Interviewer) is actively playing, speech heard by mic is acoustic bleed.
        // Route immediately to INTERVIEWER pipeline for sub-50ms native streaming on the LEFT!
        // When tab audio is silent, route to CANDIDATE pipeline for streaming on the RIGHT!
        if (this.audioEngine.isTabAudioActive()) {
          this.handleInterviewerLiveSpeech(bestFinalChunk, bestInterimChunk);
        } else {
          this.handleCandidateLiveSpeech(bestFinalChunk, bestInterimChunk);
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Candidate Speech Recognition notice:', event.error);
        this.cdr.detectChanges();
      };

      this.recognition.onend = () => {
        // Auto-restart recognition while meeting is live
        if (this.isMeetingLive) {
          try { this.recognition.start(); } catch (e) {}
        }
      };
    }
  }

  handleCandidateLiveSpeech(finalChunk: string, interimChunk: string) {
    if (this.candidateMicMuted) return;

    const now = Date.now();

    // 1. PHYSICAL AUDIO SEPARATION & SPEAKER BLEED SUPPRESSION:
    // If digital tab audio is active, this acoustic bleed belongs to Interviewer, not candidate
    if (this.audioEngine.isTabAudioActive()) {
      return;
    }

    // 2. Accumulate committed text from final chunks
    if (finalChunk.trim()) {
      const correctedFinal = this.audioEngine.correctTechnicalTerms(finalChunk.trim());
      const lastLower = this.candidateCommittedText.toLowerCase();
      const newLower = correctedFinal.toLowerCase();
      if (!lastLower.endsWith(newLower)) {
        if (this.candidateCommittedText) {
          this.candidateCommittedText = `${this.candidateCommittedText} ${correctedFinal}`.trim();
        } else {
          this.candidateCommittedText = correctedFinal;
        }
      }
    }

    const correctedInterim = this.audioEngine.correctTechnicalTerms(interimChunk.trim());
    const fullSpokenText = `${this.candidateCommittedText} ${correctedInterim}`.trim();

    if (!fullSpokenText) return;

    // 3. Render progressive streaming text IMMEDIATELY (True word-by-word streaming in UI)
    this.renderCandidateStreamingText(fullSpokenText, true);

    // 4. Evaluate Question Completeness
    const evalResult = this.audioEngine.isCompleteQuestion(fullSpokenText);
    const isComplete = evalResult.isComplete;

    // 5. Pause & Continuation Window (2.5s pause tolerance so sentences like "What is RAG" are never truncated)
    if (this.candidateSilenceTimer) {
      clearTimeout(this.candidateSilenceTimer);
      this.candidateSilenceTimer = null;
    }

    if (isComplete) {
      // COMPLETE QUESTION IDENTIFIED!
      // Allow 2500ms natural speech pause tolerance so the full sentence is captured
      this.candidateSilenceTimer = setTimeout(() => {
        this.finalizeCandidateQuestion(fullSpokenText);
      }, 2500);
    } else {
      // INCOMPLETE PHRASE (e.g. "What is...", "What is Dependency...", "What is the difference...")
      // Hold the question buffer open for 5.0 seconds so subsequent words continue the exact same question!
      this.candidateSilenceTimer = setTimeout(() => {
        this.renderCandidateStreamingText(this.candidateCommittedText || fullSpokenText, false);
        this.resetCandidateBuffer();
      }, 5000);
    }
  }

  finalizeCandidateQuestion(questionText: string) {
    const finalQ = this.audioEngine.correctTechnicalTerms(questionText.trim());
    if (!finalQ) return;

    console.log('[Candidate Speech Engine] Complete question finalized:', finalQ);

    const candidateMsgId = this.activeCandidateMsgId;

    // Finalize the message bubble (remove streaming pulse cursor, ensure marked as question)
    this.renderCandidateStreamingText(finalQ, false);

    // Notify backend with the exact same message ID so the existing card is updated rather than duplicated
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({
        type: 'LOG_CANDIDATE_SPEECH',
        id: candidateMsgId,
        text: finalQ,
        isQuestion: true
      }));
    }

    // Reset buffer so the NEXT question starts a fresh card!
    this.resetCandidateBuffer();

    // Log candidate speech in manual input bar for immediate access (never auto-trigger AI answer from candidate mic)
    this.question = finalQ;
    this.cdr.detectChanges();
  }

  renderCandidateStreamingText(text: string, isStreaming: boolean) {
    if (!text.trim()) return;

    const evalResult = this.audioEngine.isCompleteQuestion(text);

    if (this.activeCandidateMsgId) {
      const existing = this.conversationMessages.find(m => m.id === this.activeCandidateMsgId);
      if (existing) {
        existing.text = text;
        existing.isStreaming = isStreaming;
        existing.isQuestion = evalResult.isComplete;
        existing.timestamp = new Date();
      } else {
        this.createCandidateMessage(text, isStreaming, evalResult.isComplete);
      }
    } else {
      this.createCandidateMessage(text, isStreaming, evalResult.isComplete);
    }

    // Keep activeMeetingQuestion and bottom input updated in real time as words arrive!
    this.activeMeetingQuestion = text;
    this.scrollConversationToBottom();
    this.cdr.detectChanges();
  }

  createCandidateMessage(text: string, isStreaming: boolean, isQuestion: boolean) {
    const newId = 'cand_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.activeCandidateMsgId = newId;
    const msg: ConversationMessage = {
      id: newId,
      speaker: 'CANDIDATE',
      text: text,
      timestamp: new Date(),
      isQuestion: isQuestion,
      isStreaming: isStreaming
    };
    this.conversationMessages.push(msg);
  }

  // --- INTERVIEWER LIVE STREAMING ENGINE (NATIVE REAL-TIME STREAMING) ---

  handleInterviewerLiveSpeech(finalChunk: string, interimChunk: string) {
    // 1. Accumulate committed text from final chunks
    if (finalChunk.trim()) {
      const correctedFinal = this.audioEngine.correctTechnicalTerms(finalChunk.trim());
      const lastLower = this.interviewerCommittedText.toLowerCase();
      const newLower = correctedFinal.toLowerCase();
      if (!lastLower.endsWith(newLower)) {
        if (this.interviewerCommittedText) {
          this.interviewerCommittedText = `${this.interviewerCommittedText} ${correctedFinal}`.trim();
        } else {
          this.interviewerCommittedText = correctedFinal;
        }
      }
    }

    const correctedInterim = this.audioEngine.correctTechnicalTerms(interimChunk.trim());
    const fullSpokenText = `${this.interviewerCommittedText} ${correctedInterim}`.trim();

    if (!fullSpokenText) return;

    // 2. Render progressive streaming text IMMEDIATELY on the LEFT side (Interviewer bubble)
    this.renderInterviewerLiveText(fullSpokenText, true);

    // 3. Keep active question header & bottom input textarea updated in real time as words arrive
    this.activeMeetingQuestion = fullSpokenText;
    if (!this.loading) {
      this.question = fullSpokenText;
    }

    // 4. Evaluate Question Completeness
    const evalResult = this.audioEngine.isCompleteQuestion(fullSpokenText);
    const isComplete = evalResult.isComplete;

    // 5. Speech pause hold window (3500ms):
    // After 3.5s of silence, remove streaming pulse cursor, but KEEP the same card active!
    // Never reset the buffer or create multiple cards while the interviewer is speaking.
    if (this.interviewerSilenceTimer) {
      clearTimeout(this.interviewerSilenceTimer);
      this.interviewerSilenceTimer = null;
    }

    this.interviewerSilenceTimer = setTimeout(() => {
      this.finalizeInterviewerLiveQuestion(fullSpokenText, isComplete);
    }, 3500);
  }

  renderInterviewerLiveText(text: string, isStreaming: boolean) {
    if (!text.trim()) return;

    const evalResult = this.audioEngine.isCompleteQuestion(text);

    // Look up active interviewer card or re-use latest unanswered interviewer card:
    let existing: ConversationMessage | undefined;
    if (this.activeInterviewerMsgId) {
      existing = this.conversationMessages.find(m => m.id === this.activeInterviewerMsgId);
    }
    if (!existing && this.conversationMessages.length > 0) {
      const last = this.conversationMessages[this.conversationMessages.length - 1];
      if (last && last.speaker === 'INTERVIEWER' && !last.answered) {
        existing = last;
        this.activeInterviewerMsgId = last.id;
      }
    }

    if (existing) {
      // KEEP UPDATING THE EXACT SAME CARD IN PLACE:
      existing.text = text;
      existing.isStreaming = isStreaming;
      existing.isQuestion = evalResult.isComplete;
      existing.timestamp = new Date();
    } else {
      // Create ONE card for this question:
      this.createInterviewerMessage(text, isStreaming, evalResult.isComplete);
    }

    this.interviewerDisplayedText = text;
    this.scrollConversationToBottom();
    this.cdr.detectChanges();
  }

  createInterviewerMessage(text: string, isStreaming: boolean, isQuestion: boolean) {
    const newId = 'int_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.activeInterviewerMsgId = newId;
    const msg: ConversationMessage = {
      id: newId,
      speaker: 'INTERVIEWER',
      text: text,
      timestamp: new Date(),
      isQuestion: isQuestion,
      isStreaming: isStreaming
    };
    this.conversationMessages.push(msg);
  }

  finalizeInterviewerLiveQuestion(questionText: string, isQuestion: boolean) {
    const finalQ = this.audioEngine.correctTechnicalTerms(questionText.trim());
    if (!finalQ) return;

    console.log('[Interviewer Speech Engine] Question finalized on card:', finalQ);

    const intMsgId = this.activeInterviewerMsgId;

    // Finalize the message bubble (remove streaming pulse cursor, ensure marked as question if complete)
    this.renderInterviewerLiveText(finalQ, false);

    // Notify backend with the exact same message ID
    if (this.ws && this.isConnected && intMsgId) {
      this.ws.send(JSON.stringify({
        type: 'LOG_INTERVIEWER_SPEECH',
        id: intMsgId,
        text: finalQ,
        isQuestion: isQuestion,
        autoAnswer: false
      }));
    }

    // Keep active question & question input updated
    this.activeMeetingQuestion = finalQ;
    if (!this.loading) {
      this.question = finalQ;
    }
    this.cdr.detectChanges();
  }

  resetCandidateBuffer() {
    this.activeCandidateMsgId = null;
    this.candidateCommittedText = '';
    if (this.candidateSilenceTimer) {
      clearTimeout(this.candidateSilenceTimer);
      this.candidateSilenceTimer = null;
    }
  }

  resetInterviewerBuffer() {
    this.activeInterviewerMsgId = null;
    this.interviewerCommittedText = '';
    this.interviewerDisplayedText = '';
    this.interviewerWordQueue = [];
    if (this.interviewerStreamInterval) {
      clearInterval(this.interviewerStreamInterval);
      this.interviewerStreamInterval = null;
    }
    if (this.interviewerSilenceTimer) {
      clearTimeout(this.interviewerSilenceTimer);
      this.interviewerSilenceTimer = null;
    }
  }

  // --- IMMEDIATE SYNC FOR INTERVIEWER TAB AUDIO (NO QUEUE DELAYS) ---

  handleInterviewerStreamingSpeech(msg: ConversationMessage) {
    if (!msg || !msg.text || !msg.text.trim()) return;

    const targetText = this.audioEngine.correctTechnicalTerms(msg.text.trim());
    if (!targetText) return;

    // Look up active interviewer card or re-use latest unanswered interviewer card:
    let activeMsg: ConversationMessage | undefined;
    if (this.activeInterviewerMsgId) {
      activeMsg = this.conversationMessages.find(m => m.id === this.activeInterviewerMsgId);
    }
    if (!activeMsg && this.conversationMessages.length > 0) {
      const last = this.conversationMessages[this.conversationMessages.length - 1];
      if (last && last.speaker === 'INTERVIEWER' && !last.answered) {
        activeMsg = last;
        this.activeInterviewerMsgId = last.id;
      }
    }

    if (!activeMsg) {
      const newId = msg.id || ('int_' + Date.now());
      this.activeInterviewerMsgId = newId;
      activeMsg = {
        id: newId,
        speaker: 'INTERVIEWER',
        text: targetText,
        timestamp: new Date(),
        isQuestion: msg.isQuestion,
        isStreaming: false
      };
      this.conversationMessages.push(activeMsg);
    } else {
      activeMsg.text = targetText;
      activeMsg.isQuestion = msg.isQuestion;
      activeMsg.isStreaming = false;
    }

    this.interviewerDisplayedText = targetText;
    this.activeMeetingQuestion = targetText;
    if (!this.loading) {
      this.question = targetText;
    }

    this.scrollConversationToBottom();
    this.cdr.detectChanges();
  }

  startCandidateMic() {
    if (!this.recognition) return;
    try {
      this.recognition.start();
    } catch (e) {}
  }

  stopCandidateMic() {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (e) {}
  }

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

  // --- KNOWLEDGE BASE (RAG) METHODS ---

  getApiUrl(path: string): string {
    const port = window.location.port;
    const host = window.location.hostname || 'localhost';
    const baseUrl = (port === '4200') ? `http://${host}:8080` : '';
    return `${baseUrl}${path}`;
  }

  openKnowledgeModal() {
    this.showKnowledgeModal = true;
    this.kbUploadStatus = '';
    this.loadKbDocuments();
    this.loadKbQuestions();
    this.loadKbCategories();
  }

  loadKbDocuments() {
    this.http.get<any[]>(this.getApiUrl('/api/knowledge/documents')).subscribe({
      next: (docs) => {
        this.kbDocuments = docs || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load KB documents:', err)
    });
  }

  loadKbCategories() {
    this.http.get<any[]>(this.getApiUrl('/api/knowledge/categories')).subscribe({
      next: (cats) => {
        this.kbCategories = cats || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load KB categories:', err)
    });
  }

  loadKbQuestions() {
    let params: any = {};
    if (this.kbCategoryFilter && this.kbCategoryFilter !== 'ALL') {
      params.category = this.kbCategoryFilter;
    }
    if (this.kbSearchFilter && this.kbSearchFilter.trim()) {
      params.search = this.kbSearchFilter.trim();
    }
    this.http.get<any[]>(this.getApiUrl('/api/knowledge/questions'), { params }).subscribe({
      next: (questions) => {
        this.kbQuestions = questions || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load KB questions:', err)
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.kbSelectedFile = file;
      this.kbUploadStatus = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    }
  }

  uploadKbFile() {
    if (!this.kbSelectedFile) return;
    const formData = new FormData();
    formData.append('file', this.kbSelectedFile);
    if (this.kbUploadCategory) {
      formData.append('category', this.kbUploadCategory);
    }

    this.kbIsUploading = true;
    this.kbUploadStatus = 'Uploading document and generating vector embeddings...';

    this.http.post<any>(this.getApiUrl('/api/knowledge/upload'), formData).subscribe({
      next: (res) => {
        this.kbIsUploading = false;
        this.kbUploadStatus = `✅ Successfully indexed ${res.questionsCount || 0} Q&A pairs from "${res.filename}"!`;
        this.kbSelectedFile = null;
        this.loadKbDocuments();
        this.loadKbQuestions();
        this.showCopiedFeedback('Document indexed into Knowledge Base!');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.kbIsUploading = false;
        this.kbUploadStatus = '❌ Ingestion error: ' + (err.error?.error || err.message);
        this.cdr.detectChanges();
      }
    });
  }

  deleteKbDocument(docId: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this document and all its indexed questions?')) return;
    this.http.delete(this.getApiUrl(`/api/knowledge/documents/${docId}`)).subscribe({
      next: () => {
        this.loadKbDocuments();
        this.loadKbQuestions();
        this.showCopiedFeedback('Document deleted from Knowledge Base.');
      },
      error: (err) => console.error('Failed to delete document:', err)
    });
  }

  reindexKbDocument(docId: string, event: Event) {
    event.stopPropagation();
    this.kbUploadStatus = 'Re-indexing document...';
    this.http.post<any>(this.getApiUrl(`/api/knowledge/reindex/${docId}`), {}).subscribe({
      next: (res) => {
        this.kbUploadStatus = `✅ Re-indexed: ${res.questionsCount} questions processed.`;
        this.loadKbDocuments();
        this.loadKbQuestions();
        this.showCopiedFeedback('Document re-indexed successfully.');
      },
      error: (err) => {
        this.kbUploadStatus = '❌ Re-index failed: ' + (err.error?.error || err.message);
      }
    });
  }

  openAddQuestionModal(item?: any) {
    if (item) {
      this.editingQuestion = {
        id: item.id,
        question: item.question,
        answer: item.answer,
        category: item.category || 'GENERAL',
        code: item.code ? (typeof item.code === 'string' ? item.code : item.code.snippet || JSON.stringify(item.code)) : ''
      };
    } else {
      this.editingQuestion = {
        id: null,
        question: '',
        answer: '',
        category: this.kbCategoryFilter !== 'ALL' ? this.kbCategoryFilter : 'GENERAL',
        code: ''
      };
    }
    this.showAddQuestionModal = true;
  }

  saveQuestion() {
    if (!this.editingQuestion.question.trim() || !this.editingQuestion.answer.trim()) {
      alert('Please provide both question and answer');
      return;
    }
    const payload = {
      question: this.editingQuestion.question.trim(),
      answer: this.editingQuestion.answer.trim(),
      category: this.editingQuestion.category || 'GENERAL',
      code: this.editingQuestion.code ? { snippet: this.editingQuestion.code, language: 'csharp' } : null
    };

    if (this.editingQuestion.id) {
      this.http.put(this.getApiUrl(`/api/knowledge/questions/${this.editingQuestion.id}`), payload).subscribe({
        next: () => {
          this.showAddQuestionModal = false;
          this.loadKbQuestions();
          this.showCopiedFeedback('Question updated successfully!');
        },
        error: (err) => alert('Error updating question: ' + (err.error?.error || err.message))
      });
    } else {
      this.http.post(this.getApiUrl('/api/knowledge/questions'), payload).subscribe({
        next: () => {
          this.showAddQuestionModal = false;
          this.loadKbQuestions();
          this.showCopiedFeedback('New question added to Knowledge Base!');
        },
        error: (err) => alert('Error adding question: ' + (err.error?.error || err.message))
      });
    }
  }

  deleteKbQuestion(id: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this question from Knowledge Base?')) return;
    this.http.delete(this.getApiUrl(`/api/knowledge/questions/${id}`)).subscribe({
      next: () => {
        this.loadKbQuestions();
        this.showCopiedFeedback('Question deleted.');
      },
      error: (err) => console.error('Failed to delete question:', err)
    });
  }

  runTestSearch() {
    if (!this.testQuery.trim()) return;
    this.testLoading = true;
    this.testResults = null;
    this.http.post<any>(this.getApiUrl('/api/rag/search'), {
      query: this.testQuery.trim(),
      topK: 3
    }).subscribe({
      next: (res) => {
        this.testLoading = false;
        this.testResults = res;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.testLoading = false;
        this.testResults = { isMatch: false, error: err.error?.error || err.message };
        this.cdr.detectChanges();
      }
    });
  }
}
