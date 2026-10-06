import type { ParsedMessage } from '../parser/whatsapp';
import { isDeletedPlaceholder } from '../parser/whatsapp';
import type { ChatForensicStats } from './metrics';

export interface DetailedStats {
  calendar: { date: string /*YYYY-MM-DD*/; count: number }[];
  perPerson: {
    name: string;
    messageCount: number;
    sharePct: number;
    initiationPct: number;
    medianReplyMin: number | null;
    topWords: { word: string; count: number }[];
    topEmojis: { emoji: string; count: number }[];
  }[];
  recordDay: { date: string; count: number };
  streakDays: number;
  longestSilenceDays: number;
  hourly: number[];
  after10pmPct: number;
  peakHour: number;
}

// Small EN+FR+ES+Hinglish stoplist (~95 words).
// Intentionally NOT including main/mujhe/tujhe/mere — they are content.
const STOPWORDS = new Set<string>([
  // EN (~52)
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'because', 'as',
  'of', 'at', 'by', 'for', 'with', 'about', 'before', 'after', 'over', 'under',
  'again', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'each', 'few', 'more', 'most', 'some', 'such', 'no', 'not', 'only', 'same',
  'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'to', 'in', 'on',
  // FR (15)
  'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'je', 'tu', 'il',
  'elle', 'nous', 'vous',
  // ES (15)
  'el', 'los', 'las', 'una', 'y', 'pero', 'yo', 'de', 'en', 'es', 'por', 'con',
  'para', 'como', 'que',
  // Hinglish (15)
  'kya', 'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'ne', 'pe', 'par', 'bhi',
  'toh', 'aur', 'lekin',
]);

const MEDIA_NOISE = new Set<string>([
  'media', 'image', 'video', 'audio', 'sticker', 'gif', 'omitted',
]);

const EMOJI_REGEX =
  /(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|[\uFE0E\uFE0F]|\p{Emoji_Modifier})*|\p{Emoji_Presentation})/gu;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function localDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function cleanForWords(content: string): string {
  return content
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .toLowerCase();
}

export function computeDetailedStats(
  messages: ParsedMessage[],
  base: ChatForensicStats,
): DetailedStats {
  const userMessages = messages.filter((m) => !m.isSystem && !m.isReaction);
  const total = userMessages.length;

  const empty: DetailedStats = {
    calendar: [],
    perPerson: [],
    recordDay: { date: '', count: 0 },
    streakDays: 0,
    longestSilenceDays: 0,
    hourly: new Array(24).fill(0),
    after10pmPct: 0,
    peakHour: base?.mostActiveHour ?? 12,
  };
  if (total === 0) return empty;

  // Calendar buckets per local day + hourly histogram.
  const dayCounts = new Map<string, number>();
  const hourly: number[] = new Array(24).fill(0);
  let after10pm = 0;

  for (const m of userMessages) {
    const key = localDayKey(m.timestamp);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    const h = m.timestamp.getUTCHours();
    if (h >= 0 && h < 24) {
      hourly[h]++;
      if (h >= 22 || h < 6) after10pm++;
    }
  }

  const sortedDays = Array.from(dayCounts.keys()).sort();
  const calendar = sortedDays.map((date) => ({ date, count: dayCounts.get(date) ?? 0 }));

  let recordDay = { date: '', count: 0 };
  for (const entry of calendar) {
    if (entry.count > recordDay.count) recordDay = { ...entry };
  }

  // Streak: max consecutive local days with >=1 msg.
  let streakDays = 1;
  let curStreak = 1;
  // Longest silence: max (diffDays - 1), 0 when <2 distinct days.
  let longestSilenceDays = 0;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = parseDayKey(sortedDays[i - 1]).getTime();
    const cur = parseDayKey(sortedDays[i]).getTime();
    const diffDays = Math.round((cur - prev) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      curStreak++;
      streakDays = Math.max(streakDays, curStreak);
    } else {
      curStreak = 1;
    }
    if (diffDays > 1) {
      longestSilenceDays = Math.max(longestSilenceDays, diffDays - 1);
    }
  }
  if (sortedDays.length === 1) streakDays = 1;

  let peakHour = 0;
  let peakCount = hourly[0] ?? 0;
  for (let h = 1; h < 24; h++) {
    if ((hourly[h] ?? 0) > peakCount) {
      peakCount = hourly[h] ?? 0;
      peakHour = h;
    }
  }

  const after10pmPct = total > 0 ? Math.round((after10pm / total) * 100) : 0;

  // Per-person: reuse base counts/initiation/median; compute topWords/topEmojis.
  const baseByName = new Map((base?.participants ?? []).map((p) => [p.name, p]));
  const sendersInOrder: string[] = [];
  const seen = new Set<string>();
  for (const m of userMessages) {
    if (!seen.has(m.sender)) {
      seen.add(m.sender);
      sendersInOrder.push(m.sender);
    }
  }
  // Include any base participants with zero messages (keeps base order first).
  const orderedNames: string[] = [];
  for (const p of base?.participants ?? []) {
    if (!orderedNames.includes(p.name)) orderedNames.push(p.name);
  }
  for (const s of sendersInOrder) {
    if (!orderedNames.includes(s)) orderedNames.push(s);
  }

  const perPerson = orderedNames.map((name) => {
    const baseP = baseByName.get(name);
    const ownMsgs = userMessages.filter((m) => m.sender === name);
    const messageCount = baseP?.messageCount ?? ownMsgs.length;
    const sharePct =
      baseP?.messageSharePercentage ?? (total > 0 ? Math.round((ownMsgs.length / total) * 100) : 0);
    const initiationPct = baseP?.initiationPercentage ?? 0;
    const medianReplyMin = baseP?.medianResponseTimeMinutes ?? null;

    // topWords
    const wordCounts = new Map<string, number>();
    for (const m of ownMsgs) {
      if (m.isDeleted || isDeletedPlaceholder(m.content)) continue;
      const cleaned = cleanForWords(m.content);
      const tokens = cleaned.match(/[\p{L}\p{N}']+/gu) ?? [];
      for (const raw of tokens) {
        const w = raw.toLowerCase();
        if (w.length < 2) continue;
        if (STOPWORDS.has(w)) continue;
        if (MEDIA_NOISE.has(w)) continue;
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      }
    }
    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, 3)
      .map(([word, count]) => ({ word, count }));

    // topEmojis
    const emojiCounts = new Map<string, number>();
    for (const m of ownMsgs) {
      EMOJI_REGEX.lastIndex = 0;
      const found = m.content.match(EMOJI_REGEX);
      if (!found) continue;
      for (const e of found) {
        if (/^[©®™#*0-9]/.test(e)) continue;
        emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
      }
    }
    const topEmojis = Array.from(emojiCounts.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, 3)
      .map(([emoji, count]) => ({ emoji, count }));

    return { name, messageCount, sharePct, initiationPct, medianReplyMin, topWords, topEmojis };
  });

  return {
    calendar,
    perPerson,
    recordDay,
    streakDays,
    longestSilenceDays,
    hourly,
    after10pmPct,
    peakHour,
  };
}

/** Missing source data stays empty. Never invent a chart or a favourite word. */
export function synthesizeDetailedStats(base: ChatForensicStats): DetailedStats {
  return computeDetailedStats([], base);
}
