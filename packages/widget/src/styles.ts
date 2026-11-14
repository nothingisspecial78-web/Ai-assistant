export const WIDGET_STYLE_ID = 'ai-assistant-widget-styles';

export function ensureWidgetStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(WIDGET_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = WIDGET_STYLE_ID;
  style.textContent = `
    @keyframes aia-ripple {
      0% { transform: scale(0.7); opacity: 0.95; }
      100% { transform: scale(2.1); opacity: 0; }
    }
    .aia-root {
      --aia-primary: var(--primary, #f97316);
      --aia-primary-fg: var(--primary-foreground, #ffffff);
      --aia-accent: var(--primary, #f97316);
      --aia-gradient-primary: var(--gradient-primary, linear-gradient(135deg, #f97316, #fb923c));
      --aia-surface: var(--glass, rgba(255, 255, 255, 0.72));
      --aia-surface-strong: var(--glass-strong, rgba(255, 255, 255, 0.88));
      --aia-surface-muted: var(--background, #f7f5f2);
      --aia-inset: var(--accent, rgba(15, 23, 42, 0.045));
      --aia-border: var(--glass-border, rgba(255, 255, 255, 0.9));
      --aia-hairline: var(--hairline, rgba(15, 23, 42, 0.08));
      --aia-text: var(--foreground, #0f172a);
      --aia-text-muted: var(--muted-foreground, #475569);
      --aia-subtle: var(--subtle, #64748b);
      --aia-credit: var(--credit, #059669);
      --aia-debit: var(--debit, #e11d48);
      --aia-info: var(--info, #2563eb);
      --aia-shadow-glass: var(
        --shadow-glass,
        inset 0 1px 0 0 rgba(255, 255, 255, 0.9),
        0 0 0 1px rgba(15, 23, 42, 0.06),
        0 18px 40px -18px rgba(15, 23, 42, 0.22)
      );
      --aia-shadow-glow: var(--shadow-glow, 0 12px 36px -12px rgba(249, 115, 22, 0.55));
      --aia-font-sans: "Geist", "Noto Sans Malayalam", ui-sans-serif, system-ui, sans-serif;
      --aia-font-display: "Bricolage Grotesque", "Geist", "Noto Sans Malayalam", ui-sans-serif, system-ui, sans-serif;
      --aia-font-mono: "Geist Mono", ui-monospace, monospace;
      font-family: var(--aia-font-sans);
      color: var(--aia-text);
      box-sizing: border-box;
    }
    .aia-root *, .aia-root *::before, .aia-root *::after {
      box-sizing: border-box;
    }
    .aia-panel {
      position: fixed;
      top: 12px;
      bottom: 12px;
      z-index: 2147483001;
      display: flex;
      flex-direction: column;
      background: var(--aia-surface-strong);
      backdrop-filter: blur(28px) saturate(150%);
      -webkit-backdrop-filter: blur(28px) saturate(150%);
      border: 1px solid var(--aia-border);
      border-radius: 1.5rem;
      box-shadow: var(--aia-shadow-glass);
      overflow: hidden;
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), height 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .aia-panel::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(90% 42% at 100% 0%, color-mix(in oklab, var(--aia-primary) 12%, transparent), transparent 65%);
    }
    .aia-mobile-handle {
      display: none;
      width: 100%;
      padding: 8px 0 4px;
      justify-content: center;
      align-items: center;
      cursor: grab;
      touch-action: none;
      flex-shrink: 0;
    }
    .aia-mobile-handle-bar {
      width: 42px;
      height: 4px;
      border-radius: 999px;
      background: color-mix(in oklab, var(--aia-text-muted) 35%, transparent);
    }
    .aia-resize-handle {
      position: absolute;
      top: 16px;
      bottom: 16px;
      width: 6px;
      cursor: col-resize;
      background: transparent;
      z-index: 10;
      border-radius: 999px;
      transition: background-color 150ms ease;
    }
    .aia-resize-handle:hover {
      background: color-mix(in oklab, var(--aia-primary) 25%, transparent);
    }
    .aia-suggestion-btn {
      width: 100%;
      text-align: left;
      padding: 10px 13px;
      border-radius: 0.875rem;
      border: 1px solid var(--aia-hairline);
      background: var(--aia-surface);
      color: var(--aia-text);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--aia-font-sans);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.25);
      transition: translate 220ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease, box-shadow 220ms ease, background-color 180ms ease;
    }
    .aia-suggestion-btn:hover {
      translate: 0 -2px;
      border-color: color-mix(in oklab, var(--aia-primary) 45%, transparent);
      box-shadow: 0 10px 26px -14px color-mix(in oklab, var(--aia-primary) 45%, transparent);
    }
    .aia-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 31px;
      height: 31px;
      border-radius: 0.72rem;
      border: 1px solid var(--aia-hairline);
      background: var(--aia-inset);
      color: var(--aia-text-muted);
      cursor: pointer;
      transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    }
    .aia-icon-btn:hover {
      background: color-mix(in oklab, var(--aia-primary) 12%, transparent);
      color: var(--aia-text);
      border-color: color-mix(in oklab, var(--aia-primary) 30%, transparent);
    }
    .aia-icon-btn.aia-active {
      background: color-mix(in oklab, var(--aia-primary) 16%, transparent);
      color: var(--aia-primary);
      border-color: color-mix(in oklab, var(--aia-primary) 45%, transparent);
    }
    .aia-ctx-menu {
      position: fixed;
      z-index: 2147483005;
      min-width: 200px;
      background: var(--aia-surface-strong);
      backdrop-filter: blur(22px) saturate(145%);
      -webkit-backdrop-filter: blur(22px) saturate(145%);
      border: 1px solid var(--aia-border);
      border-radius: 1rem;
      padding: 5px;
      box-shadow: var(--aia-shadow-glass);
    }
    .aia-ctx-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 11px;
      border: none;
      background: transparent;
      color: var(--aia-text);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--aia-font-sans);
      text-align: left;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .aia-ctx-btn:hover {
      background: color-mix(in oklab, var(--aia-primary) 12%, transparent);
      color: var(--aia-primary);
    }
    .aia-inspect-fab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 38px;
      padding: 0 13px;
      border-radius: 0.75rem;
      border: 1px solid var(--aia-border);
      background: var(--aia-surface-strong);
      backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      color: var(--aia-text);
      font-size: 12.5px;
      font-weight: 600;
      font-family: var(--aia-font-sans);
      cursor: pointer;
      box-shadow: var(--aia-shadow-glass);
      transition: translate 200ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms ease, background-color 160ms ease;
    }
    .aia-inspect-fab:hover {
      translate: 0 -2px;
      border-color: color-mix(in oklab, var(--aia-primary) 50%, transparent);
    }
    .aia-inspect-fab.aia-active {
      background: var(--aia-gradient-primary);
      color: var(--aia-primary-fg);
      border-color: transparent;
      box-shadow: var(--aia-shadow-glow);
    }
    .aia-inspector-hud {
      position: fixed;
      bottom: 84px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483006;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border-radius: 1rem;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(249, 115, 22, 0.35);
      color: #ffffff;
      font-size: 12.5px;
      font-weight: 500;
      font-family: var(--aia-font-sans);
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.34);
      max-width: calc(100vw - 24px);
    }
    body.aia-inspect-cursor *:not(.aia-root):not(.aia-root *) {
      cursor: crosshair !important;
    }
    .aia-avatar-dock {
      position: fixed;
      bottom: 20px;
      z-index: 2147483002;
      display: inline-flex;
      align-items: flex-end;
      gap: 8px;
      transition: right 220ms cubic-bezier(0.22, 1, 0.36, 1), left 220ms cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events: none;
    }
    .aia-avatar-dock > * {
      pointer-events: auto;
    }
    .aia-avatar-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 6px 8px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 18px;
      transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .aia-avatar-btn:hover {
      transform: translateY(-3px);
    }
    .aia-avatar-btn:focus-visible {
      outline: 2px solid var(--aia-primary);
      outline-offset: 2px;
    }
    .aia-avatar-stage {
      width: 112px;
      height: 118px;
      display: block;
      position: relative;
    }
    .aia-avatar-btn.aia-avatar-open .aia-avatar-stage {
      width: 92px;
      height: 98px;
    }
    .aia-avatar-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 12px;
      border-radius: 0.65rem;
      background: var(--aia-gradient-primary);
      color: var(--aia-primary-fg);
      border: 1px solid rgba(255, 255, 255, 0.25);
      font-family: var(--aia-font-display);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
      box-shadow: var(--aia-shadow-glow);
      white-space: nowrap;
    }
    @media (max-width: 767px) {
      .aia-avatar-dock {
        bottom: 84px;
        gap: 6px;
      }
    }
    @media (max-width: 640px) {
      .aia-panel {
        top: auto !important;
        left: 8px !important;
        right: 8px !important;
        bottom: 8px !important;
        width: calc(100% - 16px) !important;
        border-radius: 1.5rem;
      }
      .aia-panel.aia-panel-compact {
        height: min(46dvh, 420px) !important;
      }
      .aia-panel.aia-panel-full {
        height: 88dvh !important;
      }
      .aia-mobile-handle {
        display: flex;
      }
      .aia-desktop-only {
        display: none !important;
      }
      .aia-resize-handle { display: none; }
      .aia-avatar-dock.aia-dock-open {
        display: none;
      }
      .aia-avatar-stage {
        width: 78px;
        height: 82px;
      }
      .aia-inspect-fab {
        height: 36px;
        padding: 0 11px;
        font-size: 12px;
      }
    }
  `;
  document.head.appendChild(style);
}
