// Voice & Speech Engine for LifeDesk:
// - Live microphone waveform via Web Audio API AnalyserNode
// - Speech recognition with real-time transcript
// - Voice command intent parser (Search, Read Attention, Create Note, Remember)
// - Full Text-to-Speech controller with Read Aloud, Pause, Resume, Stop

export interface VoiceRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export type ParsedVoiceIntent =
  | { type: 'search'; query: string }
  | { type: 'read_attention' }
  | { type: 'create_note'; content: string; title: string }
  | { type: 'navigate'; target: 'home' | 'search' | 'attention' | 'knowledge' | 'copilot' | 'tools' | 'settings' | 'about' };

export function parseVoiceCommandIntent(transcript: string): ParsedVoiceIntent {
  const clean = transcript.trim();
  const lower = clean.toLowerCase();

  // Check for "Find my X" or "Search for X"
  const searchMatch = lower.match(/^(?:find|search(?:\s+for)?|look\s+for|show\s+me)(?:\s+my)?\s+(.+?)(?:\s+documents|\s+files|\s+notes)?[.!?]*$/i);
  if (searchMatch && searchMatch[1]) {
    return { type: 'search', query: searchMatch[1].trim() };
  }

  // Check for "Read my attention items" / "What needs my attention"
  if (
    lower.includes('read my attention') ||
    lower.includes('what needs my attention') ||
    lower.includes('read attention') ||
    lower.includes('read today')
  ) {
    return { type: 'read_attention' };
  }

  // Check for navigation
  if (lower === 'open attention' || lower === 'go to attention') {
    return { type: 'navigate', target: 'attention' };
  }
  if (lower === 'open knowledge' || lower === 'go to knowledge') {
    return { type: 'navigate', target: 'knowledge' };
  }
  if (lower === 'open copilot' || lower === 'go to copilot') {
    return { type: 'navigate', target: 'copilot' };
  }
  if (lower === 'open settings' || lower === 'go to settings') {
    return { type: 'navigate', target: 'settings' };
  }

  // Default: Create note / Remember
  const noteBody = clean
    .replace(/^(?:remember\s+that|remember\s+this|add\s+this\s+as\s+a\s+note|create\s+a\s+note|note\s+to\s+self)[:\s,-]*/i, '')
    .trim();

  const finalBody = noteBody || clean;
  const words = finalBody.split(/\s+/).slice(0, 6).join(' ');
  const title = words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'Voice Capture';

  return {
    type: 'create_note',
    content: finalBody,
    title,
  };
}

export class SpeechService {
  private recognition: any = null;
  private isListening: boolean = false;
  private currentAudioElement: HTMLAudioElement | null = null;
  private isPausedState: boolean = false;
  private isSpeakingState: boolean = false;

  // Waveform analyser
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private animFrameId: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
      }
    }
  }

  get isSupported(): boolean {
    return !!this.recognition;
  }

  get isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  get isPaused(): boolean {
    return this.isPausedState;
  }

  async startWaveformMonitor(onLevels: (levels: number[]) => void): Promise<void> {
    this.stopWaveformMonitor();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(bufferLength / 16));
        for (let i = 0; i < 16; i++) {
          const val = dataArray[Math.min(bufferLength - 1, i * step)] || 0;
          bars.push(Math.max(12, Math.min(100, Math.round((val / 255) * 100))));
        }
        onLevels(bars);
        this.animFrameId = requestAnimationFrame(tick);
      };

      this.animFrameId = requestAnimationFrame(tick);
    } catch {
      // If mic stream for waveform fails, recognition may still proceed
    }
  }

  stopWaveformMonitor(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.analyser = null;
  }

  startListening(
    onResult: (result: VoiceRecognitionResult) => void,
    onError: (error: string) => void,
    onEnd: () => void,
    onWaveform?: (levels: number[]) => void
  ): boolean {
    if (!this.recognition) {
      onError('Speech recognition is not supported in this browser. You can still type or edit directly.');
      return false;
    }

    if (this.isListening) {
      return true;
    }

    if (onWaveform) {
      this.startWaveformMonitor(onWaveform);
    }

    let accumulatedFinal = '';

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          accumulatedFinal += (accumulatedFinal ? ' ' : '') + event.results[i][0].transcript.trim();
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const fullText = [accumulatedFinal, interimTranscript.trim()].filter(Boolean).join(' ');
      onResult({
        transcript: fullText,
        isFinal: !interimTranscript,
      });
    };

    this.recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        onError('Microphone access was denied. Enable microphone permission in your browser settings to use voice capture.');
      } else if (event.error !== 'aborted') {
        onError(`Voice capture: ${event.error || 'Unable to hear clearly'}`);
      }
      this.stopWaveformMonitor();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.stopWaveformMonitor();
      onEnd();
    };

    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e: any) {
      this.stopWaveformMonitor();
      onError(e.message || 'Could not start microphone.');
      return false;
    }
  }

  stopListening(): void {
    this.stopWaveformMonitor();
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.isListening = false;
    }
  }

  async speakText(
    text: string,
    options: {
      voice?: string;
      rate?: number;
      volume?: number;
      useCloudVoice?: boolean;
      onStart?: () => void;
      onPause?: () => void;
      onResume?: () => void;
      onEnd?: () => void;
      onError?: (err: string) => void;
    } = {}
  ): Promise<void> {
    this.stopSpeaking();

    const cleanText = text.replace(/[#*_`~>-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      options.onError?.('Nothing to read aloud.');
      return;
    }

    const {
      voice = 'default',
      rate = 1.0,
      volume = 1.0,
      useCloudVoice = false,
      onStart,
      onEnd,
      onError,
    } = options;

    this.isSpeakingState = true;
    this.isPausedState = false;

    if (useCloudVoice && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        onStart?.();
        const res = await fetch('/api/gemini/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanText.slice(0, 3000),
            voice: voice === 'default' ? 'Kore' : voice,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audioBase64) {
            const audioBlob = this.base64ToBlob(data.audioBase64, data.mimeType || 'audio/wav');
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.playbackRate = rate;
            audio.volume = Math.max(0, Math.min(1, volume));
            this.currentAudioElement = audio;

            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              this.currentAudioElement = null;
              this.isSpeakingState = false;
              this.isPausedState = false;
              onEnd?.();
            };

            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl);
              this.currentAudioElement = null;
              this.speakWithBrowser(cleanText, { voice, rate, volume, onStart, onEnd, onError });
            };

            await audio.play();
            return;
          }
        }
      } catch {
        // Fallback to native browser speech
      }
    }

    this.speakWithBrowser(cleanText, { voice, rate, volume, onStart, onEnd, onError });
  }

  private speakWithBrowser(
    text: string,
    opts: {
      voice?: string;
      rate?: number;
      volume?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: string) => void;
    }
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.isSpeakingState = false;
      opts.onError?.('Speech playback is not supported in this browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate || 1.0;
    utterance.volume = Math.max(0, Math.min(1, opts.volume ?? 1.0));

    if (opts.voice && opts.voice !== 'default') {
      const voices = window.speechSynthesis.getVoices();
      const matched = voices.find((v) => v.name === opts.voice || v.lang === opts.voice);
      if (matched) utterance.voice = matched;
    }

    utterance.onstart = () => {
      this.isSpeakingState = true;
      this.isPausedState = false;
      opts.onStart?.();
    };
    utterance.onend = () => {
      this.isSpeakingState = false;
      this.isPausedState = false;
      opts.onEnd?.();
    };
    utterance.onerror = () => {
      this.isSpeakingState = false;
      this.isPausedState = false;
      opts.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  pauseSpeaking(): void {
    if (this.currentAudioElement && !this.currentAudioElement.paused) {
      this.currentAudioElement.pause();
      this.isPausedState = true;
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      this.isPausedState = true;
    }
  }

  resumeSpeaking(): void {
    if (this.currentAudioElement && this.currentAudioElement.paused) {
      this.currentAudioElement.play();
      this.isPausedState = false;
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.isPausedState = false;
    }
  }

  stopSpeaking(): void {
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeakingState = false;
    this.isPausedState = false;
  }

  getAvailableBrowserVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

export const speechService = new SpeechService();

// Live Two-Way Voice Conversation Session
export class LiveVoiceSession {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private isConnected: boolean = false;

  constructor(
    private callbacks: {
      onStatusChange: (
        status: 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'listening'
      ) => void;
      onError: (error: string) => void;
      onInterrupted: () => void;
    }
  ) {}

  async start(): Promise<boolean> {
    try {
      this.callbacks.onStatusChange('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onStatusChange('connected');
        this.initMicrophone();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'connected') {
            this.callbacks.onStatusChange('listening');
          }
          if (data.interrupted) {
            this.callbacks.onInterrupted();
          }
          if (data.audio) {
            this.callbacks.onStatusChange('speaking');
            await this.playAudioChunk(data.audio);
            this.callbacks.onStatusChange('listening');
          }
          if (data.error) {
            this.callbacks.onError(data.error);
          }
        } catch (e: any) {
          console.error('Error handling voice stream:', e);
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError('Could not connect to live voice session.');
        this.stop();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onStatusChange('disconnected');
        this.cleanupAudio();
      };

      return true;
    } catch (e: any) {
      this.callbacks.onError(e.message || 'Failed to start voice session');
      this.stop();
      return false;
    }
  }

  private async initMicrophone() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      this.outputAudioCtx = new AudioContext({ sampleRate: 24000 });

      const source = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);
      this.scriptProcessor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const base64 = this.arrayBufferToBase64(pcm16.buffer);
        this.ws.send(JSON.stringify({ audio: base64 }));
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputAudioCtx.destination);
    } catch (err: any) {
      this.callbacks.onError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Enable microphone access in your browser bar.'
          : `Microphone error: ${err.message}`
      );
    }
  }

  private async playAudioChunk(base64Audio: string) {
    if (!this.outputAudioCtx) {
      this.outputAudioCtx = new AudioContext({ sampleRate: 24000 });
    }
    if (this.outputAudioCtx.state === 'suspended') {
      await this.outputAudioCtx.resume();
    }

    try {
      const binary = atob(base64Audio);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);
      source.start();
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  stop() {
    this.cleanupAudio();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnected = false;
    this.callbacks.onStatusChange('disconnected');
  }

  private cleanupAudio() {
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch {}
      this.scriptProcessor = null;
    }
    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close();
      } catch {}
      this.inputAudioCtx = null;
    }
    if (this.outputAudioCtx) {
      try {
        this.outputAudioCtx.close();
      } catch {}
      this.outputAudioCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }
}
