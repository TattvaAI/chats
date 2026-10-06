export interface ParsedMessage {
  id: string;
  timestamp: Date;
  sender: string;
  content: string;
  isSystem: boolean;
  isDeleted?: boolean;
  isReaction?: boolean;
}
export interface ParseResult {
  messages: ParsedMessage[];
  participants: string[];
  totalMessages: number;
  startDate: Date | null;
  endDate: Date | null;
}
export function isDeletedPlaceholder(content: string): boolean {
  return /^(?:this message (?:was|has been) deleted|you deleted this message|message deleted)[.!]?$/i.test(
    content.replace(/^[🚫🗑❌\s[\]()*_~"“”'‘`]+/, '').trim(),
  );
}

const DATE = '(\\d{1,4}[/.\\-]\\d{1,2}[/.\\-]\\d{1,4})';
const TIME = '(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s?[ap]m)?)';
const BRACKETED = new RegExp('^\\[' + DATE + ',?\\s+' + TIME + '\\]\\s*(.*)$', 'i');
const UNBRACKETED = new RegExp('^' + DATE + ',?\\s+' + TIME + '\\s*(?:-|:)\\s*(.*)$', 'i');
const REACTION = /^(?:Liked|Loved|Disliked|Laughed at|Emphasized|Questioned|A aimé|A adoré|A ri de|Le ha gustado|Le encanta)\s+[“"«]/i;

function parseDateTime(date: string, time: string, order: 'dmy' | 'mdy'): Date | null {
  const parts = date.split(/[/.\-]/).map(Number);
  let [day, month, year] = parts;
  if (date.split(/[/.\-]/)[0].length === 4) [year, month, day] = parts;
  else if (order === 'mdy') [month, day, year] = parts;
  if (year < 100) year += year < 70 ? 2000 : 1900;
  const t = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]m))?$/i);
  if (!t) return null;
  let hour = Number(t[1]);
  const minute = Number(t[2]), second = Number(t[3] || 0), period = t[4]?.toLowerCase();
  if (period && (hour < 1 || hour > 12)) return null;
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  // Exports have wall-clock times, not a timezone. UTC preserves those values
  // consistently in the browser and worker; it does not claim the sender's zone.
  const result = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day ? result : null;
}

export function parseWhatsAppChat(rawText: string, dateOrder?: 'dmy' | 'mdy'): ParseResult {
  const lines = rawText.split(/\r?\n/).map(line => line.replace(/^[\u200B-\u200F\uFEFF\u202A-\u202E]+/, '').replace(/^(?:\[iMessage\]|iMessage:\s*)/i, ''));
  // A final file newline is a separator; interior blank lines and indentation
  // belong to the message and must survive quotation in the report.
  if (lines.at(-1) === '') lines.pop();
  let order = dateOrder;
  if (!order) {
    const evidence = new Set<string>();
    for (const line of lines) {
      const m = line.match(BRACKETED) || line.match(UNBRACKETED);
      if (!m || m[1].split(/[/.\-]/)[0].length === 4) continue;
      const [a,b] = m[1].split(/[/.\-]/).map(Number);
      if (a > 12 && b <= 12) evidence.add('dmy');
      if (b > 12 && a <= 12) evidence.add('mdy');
    }
    if (evidence.size > 1) throw new Error('This export mixes date formats. Export it again using one date format.');
    order = evidence.has('mdy') ? 'mdy' : 'dmy';
  }
  const messages: ParsedMessage[] = [];
  let current: ParsedMessage | null = null;
  const finishMessage = () => {
    if (!current) return;
    current.isSystem ||= current.content.trim().length === 0;
    current.isReaction = REACTION.test(current.content.trimStart());
    current.isDeleted = isDeletedPlaceholder(current.content);
    messages.push(current);
  };
  for (const line of lines) {
    const match = line.match(BRACKETED) || line.match(UNBRACKETED);
    if (match) {
      finishMessage();
      current = null;
      const timestamp = parseDateTime(match[1], match[2], order);
      if (!timestamp) continue;
      const body = match[3].replace(/^:\s*/, '');
      const senderMatch = body.match(/^(.+?)\s*:\s(.*)$/);
      const sender = senderMatch ? senderMatch[1].replace(/^(?:iMessage:\s*|tel:)/i, '').trim() : 'System';
      const content = senderMatch ? senderMatch[2] : body;
      current = { id: `msg-${messages.length + 1}`, timestamp, sender, content, isSystem: !senderMatch, isReaction: REACTION.test(content), isDeleted: isDeletedPlaceholder(content) };
    } else if (current) {
      current.content += '\n' + line;
    }
  }
  finishMessage();
  messages.sort((a,b) => a.timestamp.getTime() - b.timestamp.getTime());
  const users = messages.filter(m => !m.isSystem && !m.isReaction);
  return { messages, participants: [...new Set(users.map(m=>m.sender))], totalMessages: users.length, startDate: users[0]?.timestamp || null, endDate: users.at(-1)?.timestamp || null };
}
