import { RequestError } from '@/lib/requests';
import { UUID_RE } from './access';

export type ConversationCursor = { createdAt: string; id: string };

export function encodeConversationCursor(cursor: ConversationCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function conversationPagination(query: URLSearchParams) {
  const rawLimit = query.get('limit');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) throw new RequestError('Invalid page size.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RequestError('Page size must be between 1 and 50.');
  const rawCursor = query.get('cursor');
  let cursor: ConversationCursor | null = null;
  if (rawCursor !== null) {
    try {
      if (rawCursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) throw new Error('Invalid cursor');
      const value = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'));
      if (typeof value.id !== 'string' || !UUID_RE.test(value.id) || typeof value.createdAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt))
        || value.createdAt.startsWith('0000') || new Date(value.createdAt).toISOString().slice(0, 19) !== value.createdAt.slice(0, 19)) {
        throw new Error('Invalid cursor');
      }
      cursor = { id: value.id, createdAt: value.createdAt };
    } catch { throw new RequestError('Invalid page cursor.'); }
  }
  return { limit, cursor };
}
