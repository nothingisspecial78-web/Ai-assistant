import OpenAI from 'openai';
import sharp from 'sharp';
import {
  DEFAULT_IMAGE_MAX_WIDTH,
  DEFAULT_IMAGE_QUALITY,
  type RetrievedChunk,
} from '@ai-assistant/core';
import { logger, type ServerConfig } from '../config.ts';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAiToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmCompletionResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
  modelUsed: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function compressScreenshotDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return dataUrl;
  const rawBuffer = Buffer.from(match[2], 'base64');

  try {
    const compressed = await sharp(rawBuffer)
      .resize({ width: DEFAULT_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: DEFAULT_IMAGE_QUALITY, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${compressed.toString('base64')}`;
  } catch (err) {
    logger.warn({ err }, 'Sharp compression skipped; forwarding original image');
    return dataUrl;
  }
}

export interface LlmGateway {
  readonly hasLiveProvider: boolean;
  streamChat(params: {
    model: string;
    messages: LlmChatMessage[];
    onDelta: (text: string) => void;
    retrievedChunks?: RetrievedChunk[];
    language?: 'en' | 'ml';
  }): Promise<{ fullText: string; modelUsed: string; usage?: LlmCompletionResult['usage'] }>;

  completeWithTools(params: {
    model: string;
    messages: LlmChatMessage[];
    tools: OpenAiToolSpec[];
    retrievedChunks?: RetrievedChunk[];
    language?: 'en' | 'ml';
  }): Promise<LlmCompletionResult>;
}

function buildGroundedLocalAnswer(
  messages: LlmChatMessage[],
  chunks: RetrievedChunk[],
  language: 'en' | 'ml'
): string {
  const lastTool = [...messages].reverse().find((m) => m.role === 'tool' && typeof m.content === 'string');
  if (lastTool && typeof lastTool.content === 'string') {
    const raw = lastTool.content
      .replace(/^<untrusted_data[^>]*>\s*/i, '')
      .replace(/\s*<\/untrusted_data>$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.formattedReport === 'string' && parsed.formattedReport.trim()) {
        return parsed.formattedReport;
      }
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        return parsed.summary;
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error;
      }
    } catch {
      if (raw) return raw.slice(0, 1800);
    }
  }

  const sysMsg = messages.find((m) => m.role === 'system');
  const sysText = typeof sysMsg?.content === 'string' ? sysMsg.content : '';
  const uiMatch = /<untrusted_data source="ui_context">\s*(\{[\s\S]*?\})\s*<\/untrusted_data>/i.exec(sysText);
  if (uiMatch) {
    try {
      const ui = JSON.parse(uiMatch[1]) as {
        nearbyLabel?: string;
        text?: string;
        routePath?: string;
      };
      const label = (ui.nearbyLabel || '').trim();
      const snippet = (ui.text || '').replace(/\s+/g, ' ').trim();
      if (label || snippet) {
        const subject = label || snippet.slice(0, 60);
        const detail = snippet && snippet !== label ? ` (${snippet.slice(0, 120)})` : '';
        return language === 'ml'
          ? `ഈ ഭാഗം നിലവിലെ അക്കൗണ്ടിലോ വെബ് ആപ്പിലോ ഉള്ള **${subject}** വിവരങ്ങളാണ് കാണിക്കുന്നത്${detail}.`
          : `This shows the **${subject}** currently displayed in this account and web app${detail}.`;
      }
    } catch {
      // fall through to docs synthesis
    }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const hasImage =
    Array.isArray(lastUser?.content) && lastUser.content.some((p) => p.type === 'image_url');

  if (chunks.length === 0) {
    return "I don't have enough documentation context to answer that question.";
  }

  const top = chunks[0];
  const citations = chunks
    .slice(0, 3)
    .map((c) => `${c.source} (${c.heading})`)
    .join(', ');

  if (hasImage) {
    return [
      `Based on the uploaded screenshot and the **${top.heading}** documentation:`,
      '',
      '1. Review the active form or table highlighted on the current screen.',
      '2. Verify required inputs match the documented rules in **' + top.source + '**.',
      '3. Fix any highlighted validation warnings and submit or retry the action.',
      '',
      `Source: ${citations}`,
      '',
      'Want me to do this for you?',
    ].join('\n');
  }

  const combinedLines: string[] = [];
  for (const chunk of chunks.slice(0, 3)) {
    const lines = chunk.content
      .replace(/^#+\s*/gm, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (!combinedLines.includes(line)) {
        combinedLines.push(line);
      }
      if (combinedLines.length >= 28) break;
    }
    if (combinedLines.length >= 28) break;
  }

  const prefix =
    language === 'ml'
      ? 'ലഭ്യമായ ഡോക്യുമെന്റേഷൻ പ്രകാരം:\n\n'
      : '';

  return `${prefix}${combinedLines.join('\n')}\n\nSource: ${citations}`;
}

interface ProviderTarget {
  name: 'openrouter' | 'groq' | 'gemini';
  client: OpenAI;
  supportsVision: boolean;
  mapModel: (requestedModel: string) => string[];
}

function messagesContainImage(messages: LlmChatMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part) => part.type === 'image_url')
  );
}

export function createLlmGateway(cfg: ServerConfig): LlmGateway {
  const targets: ProviderTarget[] = [];

  const openRouterTarget = (): ProviderTarget | null =>
    cfg.openRouterApiKey
      ? {
          name: 'openrouter',
          client: new OpenAI({
            apiKey: cfg.openRouterApiKey,
            baseURL: cfg.llmBaseUrl,
            timeout: cfg.llmTimeoutMs,
            defaultHeaders: {
              'X-Title': 'Embeddable AI Assistant',
            },
          }),
          supportsVision: true,
          mapModel: (requested) =>
            Array.from(new Set([requested, cfg.modelFallback, cfg.modelFast].filter(Boolean))),
        }
      : null;

  const groqTarget = (): ProviderTarget | null =>
    cfg.groqApiKey
      ? {
          name: 'groq',
          client: new OpenAI({
            apiKey: cfg.groqApiKey,
            baseURL: 'https://api.groq.com/openai/v1',
            timeout: cfg.llmTimeoutMs,
          }),
          supportsVision: false,
          mapModel: (requested) =>
            requested === cfg.modelStrong
              ? ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']
              : ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
        }
      : null;

  const geminiTarget = (): ProviderTarget | null =>
    cfg.geminiApiKey
      ? {
          name: 'gemini',
          client: new OpenAI({
            apiKey: cfg.geminiApiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            timeout: cfg.llmTimeoutMs,
          }),
          supportsVision: true,
          mapModel: () => ['gemini-2.5-flash'],
        }
      : null;

  const builders: Record<'openrouter' | 'groq' | 'gemini', () => ProviderTarget | null> = {
    openrouter: openRouterTarget,
    groq: groqTarget,
    gemini: geminiTarget,
  };

  const order: Array<'openrouter' | 'groq' | 'gemini'> =
    cfg.llmProvider === 'groq'
      ? ['groq', 'openrouter', 'gemini']
      : cfg.llmProvider === 'gemini'
        ? ['gemini', 'openrouter', 'groq']
        : ['openrouter', 'groq', 'gemini'];

  for (const name of order) {
    const built = builders[name]();
    if (built) targets.push(built);
  }

  return {
    hasLiveProvider: targets.length > 0,

    async streamChat({ model, messages, onDelta, retrievedChunks = [], language = 'en' }) {
      const hasImage = messagesContainImage(messages);
      const eligibleTargets = targets.filter((t) => !hasImage || t.supportsVision);

      if (eligibleTargets.length === 0) {
        const synthesized = buildGroundedLocalAnswer(messages, retrievedChunks, language);
        for (const token of synthesized.split(/(\s+)/)) {
          if (token) onDelta(token);
        }
        return { fullText: synthesized, modelUsed: 'local-grounded-fallback' };
      }

      for (const target of eligibleTargets) {
        const candidates = target.mapModel(model);
        for (const resolvedModel of candidates) {
          let emittedAny = false;
          try {
            const stream = await target.client.chat.completions.create({
              model: resolvedModel,
              messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              stream: true,
              temperature: 0.2,
              max_tokens: 1500,
            });

            let fullText = '';
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                emittedAny = true;
                fullText += delta;
                onDelta(delta);
              }
            }
            if (fullText.trim().length > 0) {
              return { fullText, modelUsed: `${target.name}:${resolvedModel}` };
            }
            if (!emittedAny) {
              logger.warn({ provider: target.name, resolvedModel }, 'LLM stream returned empty output; trying next candidate');
            }
          } catch (err) {
            logger.warn({ err, provider: target.name, resolvedModel }, 'LLM stream attempt failed; trying next candidate');
            if (emittedAny) break;
          }
        }
      }

      const synthesized = buildGroundedLocalAnswer(messages, retrievedChunks, language);
      onDelta(synthesized);
      return { fullText: synthesized, modelUsed: 'local-grounded-fallback' };
    },

    async completeWithTools({ model, messages, tools, retrievedChunks = [], language = 'en' }) {
      const hasImage = messagesContainImage(messages);
      const eligibleTargets = targets.filter((t) => !hasImage || t.supportsVision);

      if (eligibleTargets.length === 0) {
        const synthesized = buildGroundedLocalAnswer(messages, retrievedChunks, language);
        return {
          content: synthesized,
          toolCalls: [],
          modelUsed: 'local-grounded-fallback',
        };
      }

      for (const target of eligibleTargets) {
        const candidates = target.mapModel(model);
        for (const resolvedModel of candidates) {
          try {
            const res = await target.client.chat.completions.create({
              model: resolvedModel,
              messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              tools: tools.length > 0 ? tools : undefined,
              tool_choice: tools.length > 0 ? 'auto' : undefined,
              temperature: 0.1,
              max_tokens: 1500,
            });

            const choice = res.choices?.[0]?.message;
            const toolCalls = (choice?.tool_calls || [])
              .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => tc.type === 'function')
              .map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                argumentsJson: tc.function.arguments || '{}',
              }));

            return {
              content: choice?.content || '',
              toolCalls,
              modelUsed: `${target.name}:${resolvedModel}`,
              usage: res.usage
                ? {
                    promptTokens: res.usage.prompt_tokens,
                    completionTokens: res.usage.completion_tokens,
                    totalTokens: res.usage.total_tokens,
                  }
                : undefined,
            };
          } catch (err) {
            logger.warn({ err, provider: target.name, resolvedModel }, 'Tool completion attempt failed; trying next candidate');
          }
        }
      }

      return {
        content: buildGroundedLocalAnswer(messages, retrievedChunks, language),
        toolCalls: [],
        modelUsed: 'local-grounded-fallback',
      };
    },
  };
}
