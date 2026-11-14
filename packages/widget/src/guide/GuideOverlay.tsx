import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  X,
  HelpCircle,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import type { GuideDef, GuideStep } from '@ai-assistant/core';
import { GuideAvatarController } from './GuideAvatarController.ts';
import { VoiceController } from './VoiceController.ts';

export interface GuideOverlayProps {
  guide: GuideDef;
  currentStepIndex: number;
  currentStep: GuideStep;
  targetRect: DOMRect | null;
  targetNotFound: boolean;
  paused: boolean;
  muted: boolean;
  isSpeaking: boolean;
  stuckHint: string | null;
  onNext: () => void;
  onBack: () => void;
  onRepeat: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onExit: () => void;
  onAskQuestion: () => void;
}

export function GuideOverlay({
  guide,
  currentStepIndex,
  currentStep,
  targetRect,
  targetNotFound,
  paused,
  muted,
  isSpeaking,
  stuckHint,
  onNext,
  onBack,
  onRepeat,
  onTogglePause,
  onToggleMute,
  onExit,
  onAskQuestion,
}: GuideOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarControllerRef = useRef<GuideAvatarController | null>(null);
  const [hideAvatar, setHideAvatar] = useState(false);

  // Load hideAvatar preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('khazna_guide_hide_avatar');
      if (saved === 'true') setHideAvatar(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleHideAvatar = () => {
    const next = !hideAvatar;
    setHideAvatar(next);
    try {
      localStorage.setItem('khazna_guide_hide_avatar', String(next));
    } catch {
      // ignore
    }
  };

  // Mount 3D Avatar Controller onto Canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctrl = new GuideAvatarController(canvasRef.current);
    avatarControllerRef.current = ctrl;

    const handleResize = () => ctrl.handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ctrl.dispose();
      avatarControllerRef.current = null;
    };
  }, []);

  // Sync avatar movement with targetRect
  useEffect(() => {
    const ctrl = avatarControllerRef.current;
    if (!ctrl) return;

    if (targetRect) {
      ctrl.moveToTarget({
        x: targetRect.left,
        y: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      });
    } else {
      ctrl.moveToTarget(null);
    }
  }, [targetRect]);

  // Sync sensitive mode (password fields)
  useEffect(() => {
    const ctrl = avatarControllerRef.current;
    if (!ctrl) return;
    ctrl.setSensitive(!!currentStep?.sensitive);
  }, [currentStep?.sensitive]);

  // Sync speaking
  useEffect(() => {
    const ctrl = avatarControllerRef.current;
    if (!ctrl) return;
    ctrl.setSpeaking(isSpeaking);
  }, [isSpeaking]);

  const totalSteps = guide.steps.length;
  const stepNumber = currentStepIndex + 1;

  // Spotlight Cutout coordinates
  const pad = 8;
  const spotX = targetRect ? Math.max(0, targetRect.left - pad) : 0;
  const spotY = targetRect ? Math.max(0, targetRect.top - pad) : 0;
  const spotW = targetRect ? targetRect.width + pad * 2 : 0;
  const spotH = targetRect ? targetRect.height + pad * 2 : 0;

  return (
    <div
      className="fixed inset-0 z-[99999] pointer-events-none select-none font-sans"
      aria-label="Interactive Guide Walkthrough"
    >
      {/* 1. Full-screen Spotlight Mask Overlay */}
      <svg
        className="absolute inset-0 size-full pointer-events-none transition-opacity duration-300"
        style={{ width: '100vw', height: '100vh' }}
      >
        <defs>
          <mask id="guide-spotlight-mask">
            {/* White reveals the dimmed backdrop */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black cuts out the spotlight hole, making it transparent */}
            {targetRect && (
              <rect
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx="14"
                ry="14"
                fill="black"
              />
            )}
          </mask>
        </defs>

        {/* Dimmed backdrop covering screen, cut out at spotlight */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.65)"
          mask="url(#guide-spotlight-mask)"
          className="pointer-events-auto"
        />

        {/* Glowing Orange Outline Ring around Target */}
        {targetRect && (
          <rect
            x={spotX}
            y={spotY}
            width={spotW}
            height={spotH}
            rx="14"
            ry="14"
            fill="none"
            stroke="#f97316"
            strokeWidth="3"
            strokeDasharray="6 4"
            className="animate-pulse pointer-events-none"
          />
        )}
      </svg>

      {/* 2. Full-viewport 3D Avatar Canvas */}
      {!hideAvatar && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full pointer-events-none"
          style={{ width: '100vw', height: '100vh' }}
        />
      )}

      {/* 3. Floating Instruction Caption Bar (Bottom Center) */}
      <div className="absolute bottom-20 inset-x-4 md:bottom-24 mx-auto max-w-xl pointer-events-auto">
        <div className="rounded-2xl border border-white/20 bg-slate-900/90 p-4 md:p-5 shadow-2xl backdrop-blur-xl text-white transition-all">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 font-semibold text-xs border border-orange-500/40">
                <Sparkles className="size-3.5" />
              </span>
              <span className="text-xs uppercase tracking-wider font-semibold text-orange-400">
                {guide.title.en} · Step {stepNumber} of {totalSteps}
              </span>
            </div>
            {currentStep.sensitive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/30">
                <EyeOff className="size-3" /> Password typing (eyes closed)
              </span>
            )}
          </div>

          {/* Accessible Live Caption */}
          <div
            aria-live="polite"
            className="text-sm md:text-base font-medium leading-relaxed text-slate-100"
          >
            {targetNotFound
              ? `Look for the highlighted element on screen. You can proceed once completed.`
              : currentStep.instruction.en}
          </div>

          {/* Proactive Stuck Hint (shown after 15s) */}
          {stuckHint && (
            <div className="mt-2 rounded-xl bg-orange-950/40 border border-orange-500/30 px-3 py-2 text-xs text-orange-200">
              💡 <strong>Hint:</strong> {stuckHint}
            </div>
          )}
        </div>
      </div>

      {/* 4. Persistent Control Bar (Bottom Floating Dock) */}
      <div className="absolute bottom-4 inset-x-4 mx-auto max-w-xl pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-white/20 bg-slate-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-2xl text-white">
        {/* Left: Step navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentStepIndex === 0}
            onClick={onBack}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Go to previous step"
          >
            <SkipBack className="size-3.5" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:brightness-110 transition-all"
            title="Advance to next step"
          >
            <span>{stepNumber === totalSteps ? 'Finish' : 'Next'}</span>
            <SkipForward className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onRepeat}
            className="grid size-8 place-items-center rounded-xl text-slate-300 hover:bg-white/10 transition-colors"
            title="Repeat voice instruction"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>

        {/* Center: Controls (Pause, Mute, Hide Avatar) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePause}
            className="grid size-8 place-items-center rounded-xl text-slate-300 hover:bg-white/10 transition-colors"
            title={paused ? 'Resume guide' : 'Pause guide'}
          >
            {paused ? <Play className="size-4 text-emerald-400" /> : <Pause className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="grid size-8 place-items-center rounded-xl text-slate-300 hover:bg-white/10 transition-colors"
            title={muted ? 'Unmute voice' : 'Mute voice'}
          >
            {muted ? <VolumeX className="size-4 text-rose-400" /> : <Volume2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={toggleHideAvatar}
            className="grid size-8 place-items-center rounded-xl text-slate-300 hover:bg-white/10 transition-colors"
            title={hideAvatar ? 'Show 3D Avatar' : 'Hide 3D Avatar'}
          >
            {hideAvatar ? <Eye className="size-4 text-amber-400" /> : <EyeOff className="size-4" />}
          </button>
        </div>

        {/* Right: Question & Exit */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAskQuestion}
            className="flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/15 transition-colors"
            title="Ask a question about this screen"
          >
            <HelpCircle className="size-3.5 text-amber-400" />
            <span className="hidden sm:inline">Ask</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="grid size-8 place-items-center rounded-xl text-slate-400 hover:text-white hover:bg-red-500/20 transition-colors"
            title="Exit guide"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
