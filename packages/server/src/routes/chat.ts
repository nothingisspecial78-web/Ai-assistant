import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { ChatRequestSchema, type AssistantSseEvent } from '@ai-assistant/core';
import type { AuthedRequest } from '../auth.ts';
import { logger, type ServerConfig } from '../config.ts';
import { runChatAgent } from '../llm/agentLoop.ts';
import type { LlmGateway } from '../llm/client.ts';
import type { Embedder } from '../rag/embedder.ts';
import type { VectorStore } from '../rag/store.ts';
import type { ActionLogStore } from '../security/confirmation.ts';
import type { ResponseCache } from '../security/limits.ts';
import { redactPiiForLog } from '../security/sanitize.ts';
import type { ToolRegistry } from '../tools/registry.ts';

export interface ServerDeps {
  cfg: ServerConfig;
  embedder: Embedder;
  vectorStore: VectorStore;
  llm: LlmGateway;
  toolRegistry: ToolRegistry;
  actionStore: ActionLogStore;
  cache: ResponseCache;
}

function writeSseEvent(res: Response, event: AssistantSseEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export function createChatRouter(deps: ServerDeps): Router {
  const router = Router();

  router.post('/', async (req: AuthedRequest, res: Response) => {
    const requestId = crypto.randomUUID();
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid chat request payload',
        issues: parsed.error.issues.map((i) => i.message),
      });
      return;
    }

    const profile = req.appProfile;
    const authUser = req.authUser;
    if (!profile || !authUser || profile.appId !== parsed.data.appId) {
      res.status(403).json({ error: 'App isolation check failed.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const lastUserText =
      [...parsed.data.messages].reverse().find((m) => m.role === 'user')?.content || '';

    try {
      const outcome = await runChatAgent({
        profile,
        messages: parsed.data.messages,
        context: parsed.data.context || parsed.data.contexts?.[0],
        contexts: parsed.data.contexts,
        attachments: parsed.data.attachments,
        requestedLanguage: parsed.data.language,
        appState: parsed.data.appState,
        personalization: parsed.data.personalization,
        userId: authUser.userId,
        authToken: authUser.rawToken,
        cfg: deps.cfg,
        embedder: deps.embedder,
        vectorStore: deps.vectorStore,
        llm: deps.llm,
        toolRegistry: deps.toolRegistry,
        actionStore: deps.actionStore,
        cache: deps.cache,
        emit: (ev) => writeSseEvent(res, ev),
      });

      logger.info(
        {
          requestId,
          appId: profile.appId,
          userId: authUser.userId,
          model: outcome.model,
          latencyMs: outcome.latencyMs,
          topScore: outcome.topScore,
          refusal: outcome.refusal,
          questionPreview: redactPiiForLog(lastUserText.slice(0, 80)),
        },
        'Chat request completed'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected chat processing error';
      logger.error({ requestId, appId: profile.appId, err }, 'Chat route failed');
      writeSseEvent(res, { type: 'error', message });
    } finally {
      res.end();
    }
  });

  return router;
}
