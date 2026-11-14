import type { GuideDef, GuideStep } from '@ai-assistant/core';
import { TargetResolver } from './TargetResolver.ts';
import { VoiceController } from './VoiceController.ts';
import { GuideAvatarController } from './GuideAvatarController.ts';

export type GuideState = 'idle' | 'starting' | 'running' | 'paused' | 'completed' | 'aborted';

export interface GuideEngineOptions {
  apiUrl?: string;
  defaultLang?: string;
  onStateChange?: (state: GuideState) => void;
  onStepChange?: (step: GuideStep, stepIndex: number, totalSteps: number) => void;
  onComplete?: (guide: GuideDef) => void;
  onAbort?: (guide: GuideDef) => void;
  onAskMiniChat?: (query: string) => void;
}

const STORAGE_KEY = 'khazna_guide_active';

export class GuideEngine {
  private state: GuideState = 'idle';
  private guide: GuideDef | null = null;
  private currentStepIndex = 0;
  private lang = 'en';

  public targetResolver: TargetResolver;
  public voiceController: VoiceController;
  public avatarController: GuideAvatarController;

  private cleanupListeners: Array<() => void> = [];
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private miniChatTimer: ReturnType<typeof setTimeout> | null = null;
  private options: GuideEngineOptions;

  constructor(options: GuideEngineOptions = {}) {
    this.options = options;
    this.lang = options.defaultLang || 'en';
    this.targetResolver = new TargetResolver();
    this.voiceController = new VoiceController({
      apiUrl: options.apiUrl,
      defaultLang: this.lang,
    });
    this.avatarController = new GuideAvatarController();
  }

  public getState(): GuideState {
    return this.state;
  }

  public getActiveGuide(): GuideDef | null {
    return this.guide;
  }

  public getCurrentStep(): GuideStep | null {
    if (!this.guide || this.currentStepIndex >= this.guide.steps.length) return null;
    return this.guide.steps[this.currentStepIndex];
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public getTotalSteps(): number {
    return this.guide ? this.guide.steps.length : 0;
  }

  public setLanguage(lang: string): void {
    this.lang = lang;
    this.voiceController.setLanguage(lang);
  }

  public async start(guide: GuideDef, startStepId?: string): Promise<void> {
    this.cleanupStep();
    this.guide = guide;
    this.currentStepIndex = 0;

    if (startStepId) {
      const idx = guide.steps.findIndex((s) => s.id === startStepId);
      if (idx >= 0) this.currentStepIndex = idx;
    }

    this.setState('running');
    this.saveProgress();
    await this.executeCurrentStep();
  }

  public async next(): Promise<void> {
    if (!this.guide) return;
    if (this.currentStepIndex < this.guide.steps.length - 1) {
      this.currentStepIndex++;
      this.saveProgress();
      await this.executeCurrentStep();
    } else {
      await this.complete();
    }
  }

  public async back(): Promise<void> {
    if (!this.guide || this.currentStepIndex <= 0) return;
    this.currentStepIndex--;
    this.saveProgress();
    await this.executeCurrentStep();
  }

  public async repeat(): Promise<void> {
    if (!this.guide) return;
    await this.executeCurrentStep();
  }

  public pause(): void {
    if (this.state !== 'running') return;
    this.setState('paused');
    this.voiceController.stop();
  }

  public resume(): void {
    if (this.state !== 'paused') return;
    this.setState('running');
    void this.executeCurrentStep();
  }

  public async complete(): Promise<void> {
    this.clearTimers();
    this.cleanupStep();
    this.setState('completed');
    this.clearSavedProgress();

    this.avatarController.celebrate();
    const finalMsg = this.lang === 'ml'
      ? 'അഭിനന്ദനങ്ങൾ! ഈ ഘട്ടങ്ങൾ വിജയകരമായി പൂർത്തിയായി.'
      : 'Great job! Walkthrough complete.';
    await this.voiceController.speak(finalMsg);

    this.avatarController.hide();
    if (this.guide) {
      this.options.onComplete?.(this.guide);
    }
  }

  public abort(): void {
    this.clearTimers();
    this.cleanupStep();
    this.setState('aborted');
    this.clearSavedProgress();
    this.voiceController.stop();
    this.avatarController.hide();
    if (this.guide) {
      this.options.onAbort?.(this.guide);
    }
  }

  private setState(state: GuideState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private saveProgress(): void {
    if (typeof window === 'undefined' || !this.guide) return;
    try {
      const current = this.getCurrentStep();
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          guideId: this.guide.id,
          stepId: current?.id,
          stepIndex: this.currentStepIndex,
          timestamp: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  }

  private clearSavedProgress(): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  public static getSavedProgress(): { guideId: string; stepId?: string; stepIndex?: number } | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Valid if saved within past 2 hours
      if (Date.now() - parsed.timestamp < 2 * 60 * 60 * 1000) {
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async executeCurrentStep(): Promise<void> {
    const step = this.getCurrentStep();
    if (!step || !this.guide) return;

    this.clearTimers();
    this.cleanupStep();

    this.options.onStepChange?.(step, this.currentStepIndex, this.guide.steps.length);

    // Resolve target element on screen
    const resolved = await this.targetResolver.resolve(step.target);
    const targetEl = resolved?.element || null;

    // Position Avatar & Spotlighting
    if (targetEl) {
      const isSensitive = step.target.sensitive || targetEl.getAttribute('data-guide-sensitive') === 'true' || targetEl.getAttribute('type') === 'password';
      this.avatarController.positionBeside(targetEl, {
        preferredSide: step.target.position || 'right',
        sensitive: isSensitive,
      });
    } else {
      this.avatarController.showDefaultPosition();
    }

    // Speak Voice Narration
    const narration = this.voiceController.resolveText(step.instruction, this.lang);
    void this.voiceController.speak(narration);

    // Wire Step Advance Detection
    this.attachAdvanceListeners(step, targetEl);

    // Setup Stuck Timers (15s hint, 45s mini-chat option)
    this.setupStuckTimers(step);
  }

  private attachAdvanceListeners(step: GuideStep, targetEl: HTMLElement | null): void {
    const condition = step.completionCondition;

    // Condition 1: Click
    if (condition.type === 'click' && targetEl) {
      const handler = () => {
        setTimeout(() => void this.next(), 250);
      };
      targetEl.addEventListener('click', handler, { once: true });
      this.cleanupListeners.push(() => targetEl.removeEventListener('click', handler));
    }

    // Condition 2: Value Filled (input/textarea)
    else if (condition.type === 'valueFilled' && targetEl) {
      const inputEl = (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA')
        ? (targetEl as HTMLInputElement)
        : (targetEl.querySelector('input, textarea') as HTMLInputElement | null);

      if (inputEl) {
        const handler = () => {
          if (inputEl.value.trim().length >= (condition.minChars || 1)) {
            // Once user enters sufficient text and pauses or focuses out, advance
            setTimeout(() => void this.next(), 400);
          }
        };
        inputEl.addEventListener('change', handler);
        inputEl.addEventListener('blur', handler);
        this.cleanupListeners.push(() => {
          inputEl.removeEventListener('change', handler);
          inputEl.removeEventListener('blur', handler);
        });
      }
    }

    // Condition 3: File Selected
    else if (condition.type === 'fileSelected' && targetEl) {
      const fileInput = (targetEl.tagName === 'INPUT' && targetEl.getAttribute('type') === 'file')
        ? (targetEl as HTMLInputElement)
        : (targetEl.querySelector('input[type="file"]') as HTMLInputElement | null);

      if (fileInput) {
        const handler = () => {
          if (fileInput.files && fileInput.files.length > 0) {
            setTimeout(() => void this.next(), 300);
          }
        };
        fileInput.addEventListener('change', handler, { once: true });
        this.cleanupListeners.push(() => fileInput.removeEventListener('change', handler));
      }
    }

    // Condition 4: Route Changed
    else if (condition.type === 'routeChanged') {
      const checkRoute = () => {
        if (typeof window !== 'undefined' && condition.expectedRoute) {
          if (window.location.pathname.includes(condition.expectedRoute)) {
            void this.next();
          }
        }
      };
      window.addEventListener('popstate', checkRoute);
      this.cleanupListeners.push(() => window.removeEventListener('popstate', checkRoute));
    }
  }

  private setupStuckTimers(step: GuideStep): void {
    // 15-second stuck hint
    this.stuckTimer = setTimeout(() => {
      if (this.state === 'running' && step.hint) {
        const hintText = this.voiceController.resolveText(step.hint, this.lang);
        void this.voiceController.speak(hintText);
      }
    }, 15000);

    // 45-second fallback
    this.miniChatTimer = setTimeout(() => {
      if (this.state === 'running') {
        const offer = this.lang === 'ml'
          ? 'സഹായം വേണമെന്നുണ്ടോ? ഈ ഘട്ടം ഞാൻ ചെയ്യണോ അതോ കൂടുതൽ വിശദീകരിക്കണോ?'
          : 'Need some help? Want me to explain this step further or guide you through it?';
        void this.voiceController.speak(offer);
      }
    }, 45000);
  }

  private clearTimers(): void {
    if (this.stuckTimer) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }
    if (this.miniChatTimer) {
      clearTimeout(this.miniChatTimer);
      this.miniChatTimer = null;
    }
  }

  private cleanupStep(): void {
    this.cleanupListeners.forEach((cleanup) => cleanup());
    this.cleanupListeners = [];
  }

  public destroy(): void {
    this.clearTimers();
    this.cleanupStep();
    this.targetResolver.destroy();
    this.voiceController.destroy();
    this.avatarController.destroy();
  }
}
