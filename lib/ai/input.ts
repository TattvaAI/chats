import { z } from 'zod';
import { isDeletedPlaceholder } from '@/lib/parser/whatsapp';

export const MAX_CHAT_PARTICIPANTS = 8;
const MAX_CHAT_SPAN_MS = 50 * 366 * 86_400_000;
const name = z.string().trim().min(1).max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Names cannot contain control characters.');

export function normalizedParticipantName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function isMeaningfulMessage(message: { content: string; isSystem?: boolean; isReaction?: boolean }): boolean {
  return !message.isSystem && !message.isReaction && !isDeletedPlaceholder(message.content)
    && !/^<?(?:media|image|video|audio|sticker|document|contact|gif) omitted>?$/i.test(message.content.trim())
    && /[\p{L}\p{N}]/u.test(message.content);
}

export const AnalysisInput = z.object({
  category: z.enum(['romantic', 'friends_group', 'friend', 'family', 'work', 'other']),
  source: z.enum(['whatsapp', 'imessage']).default('whatsapp'),
  conversationId: z.string().uuid(),
  messages: z.array(z.object({
    sender: name,
    content: z.string().max(20_000),
    at: z.string().datetime({ offset: true }),
    isSystem: z.boolean().optional(),
    isReaction: z.boolean().optional(),
  })).min(5).max(15_000),
  userNote: z.string().trim().max(2000).optional(),
  myName: name.optional(),
  reportLanguage: z.enum(['en', 'fr', 'es']).default('en'),
}).superRefine((input, ctx) => {
  const readable = input.messages.filter(isMeaningfulMessage);
  if (readable.length < 5) ctx.addIssue({ code: 'custom', path: ['messages'], message: 'Upload at least five text messages, excluding system notices, reactions and media placeholders.' });
  const participants = [...new Set(input.messages.filter(message => !message.isSystem).map(message => message.sender))];
  if (participants.length < 2 || participants.length > MAX_CHAT_PARTICIPANTS) ctx.addIssue({ code: 'custom', path: ['messages'], message: `Choose a conversation with 2–${MAX_CHAT_PARTICIPANTS} participants.` });
  const normalized = new Set(participants.map(normalizedParticipantName));
  if (normalized.size !== participants.length) ctx.addIssue({ code: 'custom', path: ['messages'], message: 'Give each participant a distinct name.' });
  if (new Set(readable.map(message => message.sender)).size < 2) ctx.addIssue({ code: 'custom', path: ['messages'], message: 'Include text messages from at least two participants.' });
  if (input.myName && !participants.includes(input.myName)) ctx.addIssue({ code: 'custom', path: ['myName'], message: 'Choose your name from the conversation participants.' });
  let first = Infinity;
  let last = -Infinity;
  for (const message of input.messages) {
    const timestamp = Date.parse(message.at);
    first = Math.min(first, timestamp);
    last = Math.max(last, timestamp);
  }
  if (first < Date.UTC(1970, 0, 1) || last >= Date.UTC(2101, 0, 1) || last - first > MAX_CHAT_SPAN_MS) {
    ctx.addIssue({ code: 'custom', path: ['messages'], message: 'Choose a chat timeframe of up to 50 years with dates between 1970 and 2100.' });
  }
});

export type AnalysisPayload = z.infer<typeof AnalysisInput>;
