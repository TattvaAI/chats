import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from './db';
import { requestLimits } from './db/schema';

export class RequestError extends Error {
  constructor(message: string, public status = 400, public retryAfterSeconds?: number) {
    super(message);
    this.name = 'RequestError';
  }
}

/** An invalid deployment setting must never disable a cost or concurrency limit. */
export function positiveIntegerSetting(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

export async function readJson(req: Request, limit = 1_500_000): Promise<unknown> {
  const contentType = req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!contentType || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(contentType)) {
    throw new RequestError('Send the request as application/json.', 415);
  }
  const contentLength = req.headers.get('content-length');
  if (contentLength && !/^\d+$/.test(contentLength)) throw new RequestError('Invalid request length.');
  if (contentLength && Number(contentLength) > limit) throw new RequestError('Upload is too large.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestError('The upload timed out. Please try again.', 408)), 15_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new RequestError('Upload is too large.', 413);
      chunks.push(value);
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new RequestError('Invalid JSON request body.');
    }
  } catch (error) {
    // Do not await an untrusted stream's cancellation callback.
    void reader.cancel().catch(() => undefined);
    if (error instanceof RequestError) throw error;
    throw new RequestError('The request body could not be read.');
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

/** Trust only a header the configured ingress overwrites; never arbitrary X-Forwarded-For. */
export function trustedClientIp(req: Request): string {
  const header = process.env.TRUSTED_PROXY === 'vercel' ? 'x-vercel-forwarded-for'
    : process.env.TRUSTED_PROXY === 'cloudflare' ? 'cf-connecting-ip'
    : process.env.TRUSTED_PROXY === 'railway' ? 'x-real-ip' : null;
  const address = header ? req.headers.get(header)?.trim() : undefined;
  if (!address || !isIP(address)) return 'unknown';
  if (isIP(address) === 6) {
    // Canonicalization prevents alternate IPv6 spellings from creating new buckets.
    return new URL(`http://[${address}]/`).hostname.slice(1, -1);
  }
  return address;
}

type LimitDatabase = Pick<NonNullable<typeof db>, 'insert'>;
type RateLimitOptions = { identity?: string; transaction?: LimitDatabase };

/** The upsert is atomic across app instances. Pass a transaction for paid admission. */
export async function rateLimit(req: Request, scope: string, limit: number, windowMs = 600_000, options: RateLimitOptions = {}) {
  const database = options.transaction ?? db;
  if (!database) throw new RequestError('The service is not configured yet.', 503);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RequestError('Request limits need configuration.', 503);
  }
  const identity = options.identity ?? `ip:${trustedClientIp(req)}`;
  const key = createHash('sha256').update(`${scope}:${identity}`).digest('hex');
  const expiresAt = new Date(Date.now() + windowMs);
  const [row] = await database.insert(requestLimits).values({ key, count: 1, expiresAt }).onConflictDoUpdate({
    target: requestLimits.key,
    set: {
      count: sql`CASE WHEN ${requestLimits.expiresAt} <= now() THEN 1 ELSE LEAST(${requestLimits.count} + 1, 1000000000) END`,
      expiresAt: sql`CASE WHEN ${requestLimits.expiresAt} <= now() THEN ${expiresAt.toISOString()}::timestamptz ELSE ${requestLimits.expiresAt} END`,
    },
  }).returning();
  if (!row) throw new RequestError('Request limits are temporarily unavailable.', 503);
  if (row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 1000));
    throw new RequestError('Too many requests. Please try again later.', 429, retryAfter);
  }
}

export function requestFailure(error: unknown) {
  const headers: Record<string, string> = { 'Cache-Control': 'private, no-store' };
  if (error instanceof RequestError) {
    if (error.status === 429 || error.retryAfterSeconds) {
      headers['Retry-After'] = String(Math.max(1, Math.ceil(error.retryAfterSeconds ?? 60)));
    }
    return Response.json({ error: error.message }, { status: error.status, headers });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: 'Invalid request. Please check the submitted fields.' }, { status: 400, headers });
  }
  // Provider, SQL and validation errors can contain private input. Never serialize them.
  return Response.json({ error: 'The request could not be completed. Please try again.' }, { status: 503, headers });
}
