import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import type { ActionLogEntry, ChatAttachment, RightClickContext } from '@ai-assistant/core';
import { AgentCursorOverlay } from './components/AgentCursorOverlay.tsx';
import { AssistantAvatar3D } from './components/AssistantAvatar3D.tsx';
import { Composer } from './components/Composer.tsx';
import { ContextMenu } from './components/ContextMenu.tsx';
import { CursorInspector } from './components/CursorInspector.tsx';
import { FileDrop } from './components/FileDrop.tsx';
import { HistoryDrawer } from './components/HistoryDrawer.tsx';
import { MessageList } from './components/MessageList.tsx';
import { Panel } from './components/Panel.tsx';
import { PersonalizationModal } from './components/PersonalizationModal.tsx';
import { useChatStorage } from './hooks/useChatStorage.ts';
import { useChatStream } from './hooks/useChatStream.ts';
import { ensureWidgetStyles } from './styles.ts';

export interface AssistantWidgetTheme {
  primaryColor?: string;
  primaryTextColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  textColor?: string;
  position?: 'right' | 'left';
}

export interface AssistantWidgetProps {
  appId: string;
  apiUrl: string;
  userKey?: string;
  userLabel?: string;
  getPageId?: () => string;
  getAuthToken?: () => string | Promise<string>;
  getAppState?: () => Record<string, unknown>;
  onAppCommand?: (command: string, payload: Record<string, unknown>) => void;
  title?: string;
  suggestions?: string[];
  theme?: AssistantWidgetTheme;
  rtl?: boolean;
  enabled?: boolean;
  onActionCompleted?: (action: ActionLogEntry) => void;
}

export function AssistantWidget({
  appId,
  apiUrl,
  userKey,
  userLabel,
  getPageId,
  getAuthToken,
  getAppState,
  onAppCommand,
  title = 'Khazna AI Agent',
  suggestions,
  theme,
  rtl = false,
  enabled = true,
  onActionCompleted,
}: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [panelWidth, setPanelWidth] = useState(0);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const [pendingContexts, setPendingContexts] = useState<RightClickContext[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'history' | 'personalize'>('none');
  const [mobileMode, setMobileMode] = useState<'compact' | 'full'>('compact');
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640
  );
  const [dynamicChips, setDynamicChips] = useState<Array<{ id: string; label: string; prompt: string }>>([]);
  const chipsCacheRef = useRef<Map<string, Array<{ id: string; label: string; prompt: string }>>>(new Map());

  const position = theme?.position || (rtl ? 'left' : 'right');

  useEffect(() => {
    ensureWidgetStyles();
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const {
    threads,
    activeThread,
    activeThreadId,
    personalization,
    createNewThread,
    selectThread,
    renameThreadById,
    deleteThreadById,
    clearAllUserThreads,
    syncActiveMessages,
    updatePersonalization,
  } = useChatStorage(appId, userKey);

  const handleActionCompleted = useCallback(
    (action: ActionLogEntry) => {
      setCelebrateTick((c) => c + 1);
      onActionCompleted?.(action);
    },
    [onActionCompleted]
  );

  const handleUiAction = useCallback(() => {
    setCelebrateTick((c) => c + 1);
  }, []);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    editAndResendMessage,
    submitInteractiveForm,
    cancelInteractiveForm,
    uploadSpreadsheet,
    confirmAction,
    confirmImportPreview,
    undoAction,
    downloadErrorCsv,
    clearMessages,
  } = useChatStream({
    appId,
    apiUrl,
    userKey,
    threadKey: `${userKey || 'default'}:${activeThreadId}`,
    initialMessages: activeThread.messages,
    personalization,
    getAuthToken,
    getAppState,
    onAppCommand,
    onActionCompleted: handleActionCompleted,
    onUiAction: handleUiAction,
    onMessagesChange: syncActiveMessages,
  });

  // Fetch dynamic chips when opening panel or navigating pages
  useEffect(() => {
    if (!open) return;
    const pageId = getPageId ? getPageId() : 'global';
    const lang = personalization.preferredLanguage || 'en';
    const cacheKey = `${pageId}:${lang}:${userKey || 'default'}`;

    if (chipsCacheRef.current.has(cacheKey)) {
      setDynamicChips(chipsCacheRef.current.get(cacheKey) || []);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = getAuthToken ? await getAuthToken() : '';
        const headers: Record<string, string> = { 'x-app-id': appId };
        if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

        const res = await fetch(
          `${apiUrl.replace(/\/$/, '')}/api/assistant/chips?pageId=${encodeURIComponent(pageId)}&lang=${encodeURIComponent(lang)}`,
          { headers, signal: controller.signal }
        );
        if (res.ok) {
          const data = (await res.json()) as { chips?: Array<{ id: string; label: string; prompt: string }> };
          if (Array.isArray(data.chips) && data.chips.length > 0) {
            chipsCacheRef.current.set(cacheKey, data.chips);
            setDynamicChips(data.chips);
          }
        }
      } catch {
        // fallback to default suggestions
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, getPageId, getAuthToken, apiUrl, appId, personalization.preferredLanguage, userKey]);

  // Reset transient overlays when switching appId or userKey
  useEffect(() => {
    setPendingContexts([]);
    setUploadError(null);
    setInspecting(false);
    setActiveOverlay('none');
  }, [appId, userKey]);

  if (!enabled) return null;

  const openPanel = (mode: 'compact' | 'full' = 'compact') => {
    setMobileMode(mode);
    setOpen(true);
  };

  const toggleInspectMode = () => {
    setInspecting((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && window.innerWidth <= 640) {
        setOpen(false);
      }
      return next;
    });
  };

  const appendContext = (ctx: RightClickContext) => {
    setPendingContexts((prev) => {
      const exists = prev.some(
        (c) =>
          (c.cssSelector && ctx.cssSelector && c.cssSelector === ctx.cssSelector) ||
          (c.text && ctx.text && c.text === ctx.text)
      );
      if (exists) return prev;
      return [...prev, ctx].slice(-5);
    });
  };

  // Attach selected cuboid as Accessory View above composer WITHOUT auto-sending
  const handleInspectSelect = (ctx: RightClickContext) => {
    setInspecting(false);
    appendContext(ctx);
    openPanel('compact');
  };

  const handleUploadSpreadsheet = async (
    file: File,
    targetArea?: 'auto' | 'students' | 'managers' | 'bulk-entries'
  ) => {
    setUploadError(null);
    openPanel('compact');
    try {
      await uploadSpreadsheet(file, { targetArea });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'File upload failed.');
    }
  };

  const handleDropFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        void handleUploadSpreadsheet(file);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const att: ChatAttachment = {
              type: 'image',
              name: file.name || 'screenshot.png',
              mimeType: file.type,
              dataUrl: reader.result,
            };
            void sendMessage({
              text: 'Please analyze this screenshot and tell me how to resolve any issue.',
              attachments: [att],
              contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const rootStyle: React.CSSProperties & Record<string, string> = {
    ...(theme?.primaryColor ? { '--aia-primary': theme.primaryColor } : {}),
    ...(theme?.primaryTextColor ? { '--aia-primary-fg': theme.primaryTextColor } : {}),
    ...(theme?.accentColor ? { '--aia-accent': theme.accentColor } : {}),
    ...(theme?.surfaceColor ? { '--aia-surface': theme.surfaceColor } : {}),
    ...(theme?.textColor ? { '--aia-text': theme.textColor } : {}),
  };

  return (
    <div className="aia-root" style={rootStyle}>
      <AgentCursorOverlay />

      <ContextMenu
        enabled={enabled && !inspecting}
        onAskAboutElement={(ctx) => {
          appendContext(ctx);
          openPanel('compact');
        }}
      />

      <CursorInspector
        active={inspecting}
        onCancel={() => setInspecting(false)}
        onSelectElement={handleInspectSelect}
      />

      <div
        className={`aia-avatar-dock ${open ? 'aia-dock-open' : ''}`}
        style={{
          [position]: open ? `${panelWidth + 24}px` : '18px',
        }}
      >
        {!open && (
          <button
            type="button"
            data-testid="cursor-denoter-fab"
            aria-pressed={inspecting}
            aria-label={inspecting ? 'Cancel cursor denoter' : 'Select card with cursor'}
            title="Select a card or cuboid to ask Khazna AI"
            className={`aia-inspect-fab ${inspecting ? 'aia-active' : ''}`}
            style={{ marginBottom: '10px' }}
            onClick={toggleInspectMode}
          >
            <Crosshair size={15} />
            <span>{inspecting ? 'Pick a card…' : 'Inspect'}</span>
          </button>
        )}

        <AssistantAvatar3D
          title={title}
          open={open}
          thinking={isStreaming}
          celebrateTick={celebrateTick}
          accentColor={theme?.accentColor || '#f97316'}
          primaryColor={theme?.primaryColor || '#0f172a'}
          onClick={() => {
            setInspecting(false);
            if (!open) {
              openPanel('compact');
            }
          }}
        />
      </div>

      <Panel
        open={open}
        title={title}
        position={position}
        rtl={rtl}
        inspecting={inspecting}
        mobileMode={mobileMode}
        onMobileModeChange={setMobileMode}
        onToggleInspect={toggleInspectMode}
        onOpenHistory={() => {
          setMobileMode('full');
          setActiveOverlay((cur) => (cur === 'history' ? 'none' : 'history'));
        }}
        onOpenPersonalize={() => {
          setMobileMode('full');
          setActiveOverlay((cur) => (cur === 'personalize' ? 'none' : 'personalize'));
        }}
        onNewChat={() => {
          setActiveOverlay('none');
          createNewThread();
        }}
        onEffectiveWidthChange={setPanelWidth}
        onClose={() => {
          setInspecting(false);
          setActiveOverlay('none');
          setOpen(false);
        }}
      >
        <FileDrop onDropFiles={handleDropFiles}>
          {activeOverlay === 'history' && (
            <HistoryDrawer
              threads={threads}
              activeThreadId={activeThreadId}
              userLabel={userLabel}
              onSelect={(id) => {
                selectThread(id);
                setActiveOverlay('none');
              }}
              onCreate={() => {
                createNewThread();
                setActiveOverlay('none');
              }}
              onRename={renameThreadById}
              onDelete={deleteThreadById}
              onClearAll={() => {
                clearAllUserThreads();
                clearMessages();
              }}
              onClose={() => setActiveOverlay('none')}
            />
          )}

          {activeOverlay === 'personalize' && (
            <PersonalizationModal
              value={personalization}
              userLabel={userLabel}
              onSave={updatePersonalization}
              onClose={() => setActiveOverlay('none')}
            />
          )}

          {(error || uploadError) && (
            <div
              role="alert"
              style={{
                margin: '10px 14px 0',
                padding: '9px 12px',
                borderRadius: '12px',
                background: 'color-mix(in oklab, var(--aia-debit) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--aia-debit) 30%, transparent)',
                color: 'var(--aia-debit)',
                fontSize: '12.5px',
                fontWeight: 500,
              }}
            >
              {uploadError || error}
            </div>
          )}

          <MessageList
            messages={messages}
            suggestions={
              dynamicChips.length > 0
                ? dynamicChips.map((c) => c.prompt)
                : suggestions
            }
            mobileCompactMode={isMobileViewport && mobileMode === 'compact'}
            onExpandMobileHistory={() => setMobileMode('full')}
            onSuggestionClick={(q) => {
              const matched = dynamicChips.find((c) => c.prompt === q);
              if (matched) {
                const pageId = getPageId ? getPageId() : 'global';
                void fetch(`${apiUrl.replace(/\/$/, '')}/api/assistant/chips/click`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chipId: matched.id, pageId }),
                }).catch(() => {});
              }
              void sendMessage({
                text: q,
                contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
              });
              setPendingContexts([]);
            }}
            onSubmitForm={submitInteractiveForm}
            onCancelForm={cancelInteractiveForm}
            onConfirmAction={confirmAction}
            onUndoAction={undoAction}
            onConfirmImport={confirmImportPreview}
            onDownloadErrorCsv={downloadErrorCsv}
            onEditMessage={(id, nextText) => {
              void editAndResendMessage(id, nextText);
            }}
            onActionCompleted={onActionCompleted}
          />

          {/* Persistent Role-Aware Prompt Chips Dock (always accessible even when conversation has messages) */}
          {(dynamicChips.length > 0 || (suggestions && suggestions.length > 0)) && (
            <div
              className="aia-chips-dock"
              style={{
                display: 'flex',
                gap: '6px',
                padding: '6px 12px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                borderTop: '1px solid var(--aia-hairline, rgba(255,255,255,0.08))',
                background: 'var(--aia-surface, rgba(15,23,42,0.95))',
                flexShrink: 0,
              }}
            >
              {(dynamicChips.length > 0
                ? dynamicChips
                : (suggestions || []).map((s, idx) => ({ id: `sug-${idx}`, label: s, prompt: s }))
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="aia-suggestion-chip-pill"
                  title={chip.prompt}
                  onClick={() => {
                    if (chip.id && !chip.id.startsWith('sug-')) {
                      const pageId = getPageId ? getPageId() : 'global';
                      void fetch(`${apiUrl.replace(/\/$/, '')}/api/assistant/chips/click`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chipId: chip.id, pageId }),
                      }).catch(() => {});
                    }
                    void sendMessage({
                      text: chip.prompt,
                      contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
                    });
                    setPendingContexts([]);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    background: 'var(--aia-inset, rgba(255,255,255,0.06))',
                    border: '1px solid var(--aia-hairline, rgba(255,255,255,0.12))',
                    color: 'var(--aia-text, #f8fafc)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ color: 'var(--aia-primary, #f97316)', fontSize: '10px' }}>✦</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          )}

          <Composer
            disabled={isStreaming}
            apiUrl={apiUrl}
            appId={appId}
            defaultLanguage={personalization.preferredLanguage || 'auto'}
            voiceAutoSend={Boolean(personalization.voiceAutoSend)}
            pendingContexts={pendingContexts}
            onClearContext={() => setPendingContexts([])}
            onRemoveContext={(idx) =>
              setPendingContexts((prev) => prev.filter((_, i) => i !== idx))
            }
            onAskAboutContexts={(ctxs) => {
              const labels = ctxs
                .map((c) => c.nearbyLabel?.trim())
                .filter((s): s is string => Boolean(s));
              const q =
                labels.length === 1
                  ? `What does "${labels[0]}" show here?`
                  : labels.length > 1
                    ? `Explain these ${labels.length} selected cards (${labels.join(', ')})`
                    : 'What is shown in these selected cards?';
              void sendMessage({ text: q, contexts: ctxs });
              setPendingContexts([]);
            }}
            onToggleInspect={toggleInspectMode}
            onSend={({ text, attachments, language }) => {
              void sendMessage({
                text,
                attachments,
                language,
                contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
              });
              setPendingContexts([]);
            }}
            onUploadSpreadsheet={(file, targetArea) => {
              void handleUploadSpreadsheet(file, targetArea);
            }}
          />
        </FileDrop>
      </Panel>
    </div>
  );
}
