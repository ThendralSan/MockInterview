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
}

export interface ConversationMessage {
  id: string;
  speaker: 'INTERVIEWER' | 'CANDIDATE';
  text: string;
  timestamp: string | Date;
  isQuestion?: boolean;
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

  // Auto-Answer ON/OFF Toggle
  autoAnswerEnabled: boolean = true;
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
    const savedAutoAnswer = localStorage.getItem('parakeet_auto_answer');
    if (savedAutoAnswer !== null) {
      this.autoAnswerEnabled = savedAutoAnswer === 'true';
    }

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

      case 'SPEECH_TRANSCRIBED': {
        const msg: ConversationMessage = payload.data;
        if (msg && msg.text) {
          // Avoid duplicate messages with same id
          if (!this.conversationMessages.some(m => m.id === msg.id)) {
            this.conversationMessages.push(msg);
            this.scrollConversationToBottom();
          }

          if (msg.speaker === 'INTERVIEWER') {
            this.activeMeetingQuestion = msg.text;
            if (msg.isQuestion && !this.loading) {
              this.question = msg.text;
            }
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
    setTimeout(() => {
      if (this.chatScrollContainerRef && this.chatScrollContainerRef.nativeElement) {
        const el = this.chatScrollContainerRef.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
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
    let q = (customText !== undefined ? customText : this.question).trim();
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

    if (customText === undefined) {
      this.question = '';
    }
    this.interimTranscript = '';
    this.cdr.detectChanges();
  }

  triggerAnswerForMessage(msg: ConversationMessage) {
    this.question = msg.text;
    this.askQuestion(msg.text);
  }

  clearConversation() {
    if (confirm('Clear the conversation messages?')) {
      this.conversationMessages = [];
      this.activeMeetingQuestion = '';
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: 'CLEAR_CONVERSATION' }));
      }
    }
  }

  selectHistoryItem(item: HistoryItem) {
    this.selectedHistoryId = item.id;
    this.aiResponse = item;
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

    // Attach video track to preview element (Parakeet AI visual style)
    setTimeout(() => {
      if (this.interviewerVideoRef && result.displayStream) {
        this.interviewerVideoRef.nativeElement.srcObject = result.displayStream;
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

    if (this.interviewerVideoRef && this.interviewerVideoRef.nativeElement) {
      this.interviewerVideoRef.nativeElement.srcObject = null;
    }

    this.speechStateMessage = 'Capture stopped.';
    this.cdr.detectChanges();
  }

  // --- CANDIDATE MICROPHONE RECOGNITION (NEVER AUTO-TRIGGERS ANSWER) ---

  setupSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechSupported = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
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

        // When candidate speaks into microphone:
        // We log it as CANDIDATE speech (displayed on the RIGHT side).
        // CRITICAL: We NEVER trigger answer generation on candidate speech!
        if (bestFinalChunk.trim()) {
          const correctedFinal = this.audioEngine.correctTechnicalTerms(bestFinalChunk.trim());
          if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify({
              type: 'LOG_CANDIDATE_SPEECH',
              text: correctedFinal
            }));
          }
          this.interimTranscript = '';
        } else if (bestInterimChunk.trim()) {
          this.interimTranscript = bestInterimChunk.trim();
        }
        this.cdr.detectChanges();
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
}
