// AI calls go through the BrandShield backend proxy; the provider keys never reach the browser.
import { request, ApiError } from './api';

export interface AiStatus {
  chat: { configured: boolean; providers?: string[]; used_today?: number; daily_limit?: number };
  image: { configured: boolean; used_today?: number; daily_limit?: number; sizes?: string[] };
  limits?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'model';
  content: string;
}

export class AiError extends Error {
  status: number;
  /** True when the failure is "no pictures can be produced right now" (credits, not configured): offer manual upload. */
  imageUnavailable: boolean;
  constructor(message: string, status: number, imageUnavailable = false) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.imageUnavailable = imageUnavailable;
  }
}

/** Plain, friendly wording for a failed AI call. 401 never gets here (the API client already sent the user to sign in). */
export function friendlyAiError(e: unknown, kind: 'chat' | 'image' = 'chat'): AiError {
  if (e instanceof AiError) return e;
  const what = kind === 'image' ? 'Image generation' : 'The AI assistant';
  if (e instanceof ApiError) {
    const detail = e.message;
    if (e.network) return new AiError('Cannot reach the server. Check your connection and try again.', 0);
    if (e.status === 401) return new AiError('Your session has ended. Redirecting you to sign in.', 401);
    if (e.status === 402 || /out of credits/i.test(detail)) {
      return new AiError(
        kind === 'image'
          ? 'Image generation is unavailable because the image service (Pollinations) has run out of credits. You can upload your own logo instead; everything else keeps working.'
          : 'The AI service has run out of credits. Please tell the administrator.',
        e.status,
        kind === 'image',
      );
    }
    if (e.status === 429) {
      const wait = e.retryAfter ? ` Try again in about ${e.retryAfter} seconds.` : '';
      return new AiError(`${detail || 'You have reached the AI usage limit for now.'}${wait}`.trim(), 429);
    }
    if (e.status === 503) {
      return new AiError(
        kind === 'image'
          ? 'Image generation is not available right now. You can upload your own logo instead.'
          : `${what} is not available right now. ${detail}`.trim(),
        503,
        kind === 'image',
      );
    }
    if (e.status === 502) return new AiError(`${what} is not answering right now. Try again in a moment.`, 502, kind === 'image');
    if (e.status === 403) return new AiError('Your account is not allowed to use this.', 403);
    return new AiError(detail || `${what} failed. Try again.`, e.status);
  }
  return new AiError(`${what} failed. Try again.`, 0);
}

export async function aiChat(messages: ChatMessage[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  try {
    const res = await request<{ text: string }>('/api/studio/ai/chat', {
      method: 'POST',
      json: { messages, response_format: opts.json ? 'json' : 'text', temperature: opts.temperature ?? 0.7 },
    });
    return res.text;
  } catch (e) {
    throw friendlyAiError(e, 'chat');
  }
}

export async function aiImage(prompt: string, size = '1024x1024'): Promise<string> {
  try {
    const res = await request<{ data_url: string }>('/api/studio/ai/image', { method: 'POST', json: { prompt, size } });
    return res.data_url;
  } catch (e) {
    throw friendlyAiError(e, 'image');
  }
}

export function getAiStatus(): Promise<AiStatus> {
  return request<AiStatus>('/api/studio/ai/status');
}
