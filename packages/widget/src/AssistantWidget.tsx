import React, { useCallback, useEffect, useState } from 'react';
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
            suggestions={suggestions}
            mobileCompactMode={isMobileViewport && mobileMode === 'compact'}
            onExpandMobileHistory={() => setMobileMode('full')}
            onSuggestionClick={(q) => {
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
