import { createGoogle } from '@ai-sdk/google';

export type GeminiTask = 'report' | 'preview' | 'followup' | 'summary';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export class AIServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 503,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export function getGeminiModelId(task: GeminiTask): string {
  const taskModel = {
    report: process.env.GEMINI_REPORT_MODEL,
    preview: process.env.GEMINI_PREVIEW_MODEL,
    followup: process.env.GEMINI_FOLLOWUP_MODEL,
    summary: process.env.GEMINI_SUMMARY_MODEL,
  }[task];
  const model = [taskModel, process.env.GEMINI_MODEL, process.env.GOOGLE_MODEL]
    .map((value) => value?.trim())
    .find(Boolean)?.replace(/^models\//, '') || DEFAULT_GEMINI_MODEL;

  if (!/^gemini-[a-z0-9.-]+$/.test(model)) {
    throw new AIServiceError('AI_CONFIGURATION', 'AI model configuration needs attention. Please contact support.');
  }
  return model;
}

export function getGeminiModel(task: GeminiTask) {
  const apiKey = process.env.VERTEX_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()
    || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIServiceError('AI_NOT_CONFIGURED', 'Report generation is not configured yet. Please try again later.');
  }
  // Vertex Express uses the same generateContent wire protocol. Explicit mode
  // also supports ordinary Google Cloud API keys (which do not start with AQ.).
  const api = process.env.GEMINI_API?.trim() || (process.env.VERTEX_API_KEY?.trim() || apiKey.startsWith('AQ.') ? 'vertex' : 'developer');
  if (!['vertex', 'developer'].includes(api)) {
    throw new AIServiceError('AI_CONFIGURATION', 'Choose vertex or developer for GEMINI_API.');
  }
  return createGoogle({
    apiKey,
    baseURL: api === 'vertex' ? 'https://aiplatform.googleapis.com/v1/publishers/google' : undefined,
  })(getGeminiModelId(task));
}

/** Safe for API responses and logs: never include SDK errors, prompts, or keys. */
export function toAIServiceError(error: unknown): AIServiceError {
  if (error instanceof AIServiceError) return error;

  // SDK errors may wrap an HTTP failure in a retry or generation error.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const item = current as { statusCode?: number; name?: string; code?: string; cause?: unknown; lastError?: unknown };
    if (item.statusCode === 402) {
      return new AIServiceError('AI_BILLING_REQUIRED', 'Report generation is temporarily unavailable because the AI service needs credit. Please try again after the service is restored.');
    }
    if (item.statusCode === 401 || item.statusCode === 403 || item.statusCode === 404) {
      return new AIServiceError('AI_CONFIGURATION', 'The AI service configuration needs attention. Please try again later.');
    }
    if (item.statusCode === 429) {
      return new AIServiceError('AI_RATE_LIMITED', 'Frank is handling too many requests right now. Please try again shortly.', 429);
    }
    if (item.statusCode === 408 || item.statusCode === 425 || (item.statusCode && item.statusCode >= 500 && item.statusCode <= 599)
      || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(item.code || '')) {
      return new AIServiceError('AI_UNAVAILABLE', 'Frank could not reach the AI service. Please try again shortly.');
    }
    if (item.name === 'TimeoutError' || item.name === 'AbortError') {
      return new AIServiceError('AI_TIMEOUT', 'Frank took too long to finish. Please try again.', 504);
    }
    if (item.name === 'AI_NoObjectGeneratedError' || item.name === 'ZodError') {
      return new AIServiceError('AI_INVALID_OUTPUT', 'Frank could not produce a complete report. Please try again.', 502);
    }
    current = item.lastError || item.cause;
  }
  // Unknown/programming errors are terminal: retrying them spends quota without
  // evidence of a transient upstream failure.
  return new AIServiceError('AI_FAILED', 'Frank could not finish this request. Please try again shortly.');
}
