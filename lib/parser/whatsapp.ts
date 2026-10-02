export interface ParsedMessage {
  id: string;
  timestamp: Date;
  sender: string;
  content: string;
  isSystem: boolean;
  isDeleted?: boolean;
}

export function isDeletedPlaceholder(content: string): boolean {
  const raw = (content || '').trim();
  if (!raw || raw.length > 80) return false;
  const normalized = raw
    .replace(/^[🚫🗑❌\s[\]()*_~"“”'‘`]+/, '')
    .replace(/[\s[\]()*_~"“”'‘`.!]+$/, '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'this message was deleted' ||
    normalized === 'you deleted this message' ||
    normalized === 'this message has been deleted' ||
    normalized === 'message deleted'
  );
}

export interface ParseResult {
  messages: ParsedMessage[];
  participants: string[];
  totalMessages: number;
  startDate: Date | null;
  endDate: Date | null;
}

// iOS format: [01/02/24, 14:23:45] John Doe: Hello
// iOS 12-hour: [1/2/24, 2:23:45 PM] John Doe: Hello
// Android format: 01/02/2024, 14:23 - John Doe: Hello
// Android 12-hour: 1/2/24, 2:23 pm - John Doe: Hello
// iMessage export format: 2024-01-02 14:23:45 : John Doe : Hello OR [2024-01-02 14:23:45] John Doe: Hello
const IOS_REGEX = /^\[(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[apAP][mM])?)\]\s+([^:]+):\s+(.*)$/;
const ANDROID_REGEX = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[apAP][mM])?)\s+-\s+([^:]+):\s+(.*)$/;
const IMESSAGE_REGEX = /^\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[apAP][mM])?)\]?\s*(?::|-)\s*([^:]+)\s*(?::|-)\s*(.*)$/;
const SYSTEM_REGEX = /^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[apAP][mM])?)\]?\s*(?:-|\s)\s*(.*)$/;

function parseDateTime(dateStr: string, timeStr: string): Date | null {
  try {
    // Normalize date separators to '/'
    const cleanDate = dateStr.replace(/[.-]/g, '/');
    const parts = cleanDate.split('/');
    if (parts.length !== 3) return null;

    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1; // 0-indexed
    let year = parseInt(parts[2], 10);

    // If year is the first part (e.g. YYYY/MM/DD)
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (month > 11 && day <= 12) {
      // If month > 11, it might be US MM/DD/YYYY format
      const temp = day;
      day = month + 1;
      month = temp - 1;
    }

    if (year < 100) {
      year += year < 70 ? 2000 : 1900;
    }

    // Parse time
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([apAP][mM]))?$/);
    if (!timeMatch) return null;

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const ampm = timeMatch[4]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const date = new Date(year, month, day, hours, minutes, seconds);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function parseWhatsAppChat(rawText: string): ParseResult {
  const lines = rawText.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  const participantsSet = new Set<string>();

  let currentMessage: ParsedMessage | null = null;
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    // Strip hidden unicode direction marks and iMessage prefix tags
    const line = lines[i]
      .replace(/^[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]+/, '')
      .replace(/^(?:\[iMessage\]|iMessage:\s*)/i, '')
      .trim();
    if (!line) continue;

    // Check iOS format
    const iosMatch = line.match(IOS_REGEX);
    if (iosMatch) {
      const timestamp = parseDateTime(iosMatch[1], iosMatch[2]);
      if (timestamp) {
        if (currentMessage) messages.push(currentMessage);
        const sender = iosMatch[3].replace(/^(?:iMessage:\s*|tel:)/i, '').trim();
        participantsSet.add(sender);
        currentMessage = {
          id: `msg-${idCounter++}`,
          timestamp,
          sender,
          content: iosMatch[4].trim(),
          isSystem: false,
        };
        continue;
      }
    }

    // Check Android format
    const androidMatch = line.match(ANDROID_REGEX);
    if (androidMatch) {
      const timestamp = parseDateTime(androidMatch[1], androidMatch[2]);
      if (timestamp) {
        if (currentMessage) messages.push(currentMessage);
        const sender = androidMatch[3].replace(/^(?:iMessage:\s*|tel:)/i, '').trim();
        participantsSet.add(sender);
        currentMessage = {
          id: `msg-${idCounter++}`,
          timestamp,
          sender,
          content: androidMatch[4].trim(),
          isSystem: false,
        };
        continue;
      }
    }

    // Check iMessage export format (e.g. 2024-01-02 14:23:45 : Me : Hello)
    const imessageMatch = line.match(IMESSAGE_REGEX);
    if (imessageMatch) {
      const timestamp = parseDateTime(imessageMatch[1], imessageMatch[2]);
      if (timestamp) {
        if (currentMessage) messages.push(currentMessage);
        const sender = imessageMatch[3].replace(/^(?:iMessage:\s*|tel:)/i, '').trim();
        participantsSet.add(sender);
        currentMessage = {
          id: `msg-${idCounter++}`,
          timestamp,
          sender,
          content: imessageMatch[4].trim(),
          isSystem: false,
        };
        continue;
      }
    }

    // Check system message (encryption, group creation, etc.)
    const systemMatch = line.match(SYSTEM_REGEX);
    if (systemMatch && !line.includes(': ')) {
      const timestamp = parseDateTime(systemMatch[1], systemMatch[2]);
      if (timestamp) {
        if (currentMessage) messages.push(currentMessage);
        currentMessage = {
          id: `msg-${idCounter++}`,
          timestamp,
          sender: 'System',
          content: systemMatch[3].trim(),
          isSystem: true,
        };
        continue;
      }
    }

    // Multiline continuation
    if (currentMessage) {
      currentMessage.content += '\n' + line;
    }
  }

  if (currentMessage) {
    messages.push(currentMessage);
  }

  // Filter out omitted media noise and strip iMessage tapback/reaction prefixes
  const cleanMessages = messages.map((m) => {
    let content = m.content
      .replace(/<Media omitted>/gi, '[Media]')
      .replace(/image omitted/gi, '[Image]')
      .replace(/video omitted/gi, '[Video]')
      .replace(/sticker omitted/gi, '[Sticker]')
      .replace(/audio omitted/gi, '[Audio]');

    // Strip iMessage tapback / reaction prefixes e.g. 'Liked “hello”' -> 'hello'
    content = content
      .replace(/^(?:Liked|Loved|Disliked|Laughed at|Emphasized|Questioned|A aimé|A adoré|A ri de|A souligné|A désapprouvé|A interrogé|Le ha gustado|Le encanta)\s+[“"«](.*?)[”"»]?$/is, '$1')
      .replace(/^(?:Liked|Loved|Disliked|Laughed at|Emphasized|Questioned)\s+/i, '')
      .replace(/^\[?iMessage\]?:\s*/i, '')
      .trim();

    const sender = m.sender.replace(/^(?:iMessage:\s*|tel:)/i, '').trim();

    return {
      ...m,
      sender,
      content,
      isDeleted: isDeletedPlaceholder(content),
    };
  });

  const validTimestamps = cleanMessages
    .filter((m) => !m.isSystem)
    .map((m) => m.timestamp.getTime());

  return {
    messages: cleanMessages,
    participants: Array.from(participantsSet),
    totalMessages: cleanMessages.filter((m) => !m.isSystem).length,
    startDate: validTimestamps.length ? new Date(Math.min(...validTimestamps)) : null,
    endDate: validTimestamps.length ? new Date(Math.max(...validTimestamps)) : null,
  };
}
