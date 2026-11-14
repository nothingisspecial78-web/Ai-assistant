export interface VoiceControllerOptions {
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  onLipSyncBoundary?: (charIndex: number) => void;
  apiUrl?: string;
}

export class VoiceController {
  private muted = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeaking = false;
  private options: VoiceControllerOptions;

  constructor(options: VoiceControllerOptions = {}) {
    this.options = options;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('khazna_guide_muted');
        this.muted = saved === 'true';
      } catch {
        // ignore
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('khazna_guide_muted', String(muted));
      } catch {
        // ignore
      }
    }
    if (muted) {
      this.stop();
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.isSpeaking = false;
    this.options.onSpeakEnd?.();
  }

  destroy(): void {
    this.stop();
  }

  /**
   * Speaks the given text using browser SpeechSynthesis with English/Malayalam voice selection,
   * falling back to server TTS if no Malayalam voice exists.
   */
  async speak(text: string, lang: 'en' | 'ml' = 'en'): Promise<void> {
    if (this.muted || !text || text.trim().length === 0) return;
    if (typeof window === 'undefined') return;

    this.stop();

    if ('speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices();
      let chosenVoice: SpeechSynthesisVoice | null = null;

      if (lang === 'ml') {
        chosenVoice = voices.find((v) => v.lang.startsWith('ml')) || null;
      }

      if (!chosenVoice) {
        // Select clear English voice (prefer en-IN or en-US)
        chosenVoice =
          voices.find((v) => v.lang === 'en-IN') ||
          voices.find((v) => v.lang === 'en-US' && v.name.includes('Natural')) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          null;
      }

      if (chosenVoice || lang === 'en') {
        const utterance = new SpeechSynthesisUtterance(text);
        if (chosenVoice) utterance.voice = chosenVoice;
        utterance.lang = chosenVoice?.lang || (lang === 'ml' ? 'ml-IN' : 'en-US');
        utterance.rate = 1.0;
        utterance.pitch = 1.05;

        utterance.onstart = () => {
          this.isSpeaking = true;
          this.options.onSpeakStart?.();
        };

        utterance.onend = () => {
          this.isSpeaking = false;
          this.options.onSpeakEnd?.();
        };

        utterance.onerror = () => {
          this.isSpeaking = false;
          this.options.onSpeakEnd?.();
        };

        utterance.onboundary = (e) => {
          this.options.onLipSyncBoundary?.(e.charIndex);
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
        return;
      }
    }

    // Server TTS Fallback if browser synthesis is missing or unsupported
    try {
      const endpoint = `${this.options.apiUrl || ''}/api/assistant/guides/tts`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.currentAudio = audio;

        audio.onplay = () => {
          this.isSpeaking = true;
          this.options.onSpeakStart?.();
        };

        audio.onended = () => {
          this.isSpeaking = false;
          this.options.onSpeakEnd?.();
          URL.revokeObjectURL(url);
        };

        await audio.play();
      }
    } catch {
      // Gracefully fall back to captions only
      this.isSpeaking = false;
      this.options.onSpeakEnd?.();
    }
  }
}
