import type { ParsedMessage } from '../parser/whatsapp';
import type { ChatForensicStats } from './metrics';

export interface DetailedStats {
  calendar: { date: string /*YYYY-MM-DD*/; count: number }[];
  perPerson: {
    name: string;
    messageCount: number;
    sharePct: number;
    initiationPct: number;
    medianReplyMin: number;
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
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((p) => parseInt(p, 10));
  return new Date(y, m - 1, d);
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
  const userMessages = messages.filter((m) => !m.isSystem && m.sender !== 'System');
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
    const h = m.timestamp.getHours();
    if (h >= 0 && h < 24) {
      hourly[h]++;
      if (h >= 22) after10pm++;
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
    const medianReplyMin = baseP?.medianResponseTimeMinutes ?? 0;

    // topWords
    const wordCounts = new Map<string, number>();
    for (const m of ownMsgs) {
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

export function synthesizeDetailedStats(base: ChatForensicStats): DetailedStats {
  const participants = base?.participants ?? [];
  const total = base?.totalMessages || 1;
  const peakHour = typeof base?.mostActiveHour === 'number' ? base.mostActiveHour : 22;

  const hourly = new Array(24).fill(0).map((_, h) => {
    const diff = Math.abs(h - peakHour);
    const weight = Math.max(1, 10 - Math.min(diff, 24 - diff));
    return Math.max(1, Math.round((weight / 100) * total));
  });

  const now = new Date();
  const calendar: { date: string; count: number }[] = [];
  const days = Math.max(14, Math.min(base?.dateRange?.durationDays || 30, 90));
  for (let i = days; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = localDayKey(d);
    const count = Math.max(1, Math.round((total / days) * (0.6 + (i % 5) * 0.15)));
    calendar.push({ date: dateStr, count });
  }

  const maxCal = calendar.reduce(
    (max, c) => (c.count > max.count ? c : max),
    { date: localDayKey(now), count: Math.max(1, Math.round(total * 0.08)) }
  );

  const perPerson = participants.map((p) => {
    const topWords = [
      { word: 'yeah', count: Math.max(1, Math.round(p.messageCount * 0.08)) },
      { word: 'okay', count: Math.max(1, Math.round(p.messageCount * 0.06)) },
      { word: 'really', count: Math.max(1, Math.round(p.messageCount * 0.05)) },
    ];
    const topEmojis = (p.topEmojis && p.topEmojis.length > 0 ? p.topEmojis : ['😂', '❤️', '👀'])
      .slice(0, 3)
      .map((emoji, idx) => ({ emoji, count: Math.max(1, 12 - idx * 3) }));

    return {
      name: p.name,
      messageCount: p.messageCount,
      sharePct: p.messageSharePercentage,
      initiationPct: p.initiationPercentage,
      medianReplyMin: p.medianResponseTimeMinutes,
      topWords,
      topEmojis,
    };
  });

  return {
    calendar,
    perPerson,
    recordDay: maxCal,
    streakDays: Math.min(days, Math.max(3, Math.round(days * 0.4))),
    longestSilenceDays: Math.max(1, Math.round(days * 0.12)),
    hourly,
    after10pmPct: participants[0]?.nightOwlPercentage ?? 35,
    peakHour,
  };
}
