import { ParsedMessage, isDeletedPlaceholder } from '../parser/whatsapp';

export interface ParticipantMetrics {
  name: string;
  messageCount: number;
  messageSharePercentage: number;
  wordCount: number;
  avgWordsPerMessage: number;
  conversationsInitiated: number;
  initiationPercentage: number;
  medianResponseTimeMinutes: number | null;
  doubleTextCount: number;
  nightOwlPercentage: number;
  topEmojis: string[];
  deletedCount?: number;
}

export interface ChatForensicStats {
  participants: ParticipantMetrics[];
  totalMessages: number;
  totalConversations: number;
  totalDeleted?: number;
  activeDays?: number;
  dateRange: {
    start: string;
    end: string;
    durationDays: number;
  };
  mostActiveDay: string;
  mostActiveHour: number;
  balanceRating: string; // e.g. "82% Her / 18% Him"
}

const INACTIVITY_GAP_HOURS = 4;
const INACTIVITY_GAP_MS = INACTIVITY_GAP_HOURS * 60 * 60 * 1000;

export function computeChatMetrics(messages: ParsedMessage[]): ChatForensicStats {
  const userMessages = messages.filter((m) => !m.isSystem && !m.isReaction).slice().sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (userMessages.length === 0) {
    return {
      participants: [],
      totalMessages: 0,
      totalConversations: 0,
      totalDeleted: 0,
      dateRange: { start: '', end: '', durationDays: 0 },
      mostActiveDay: 'Unknown',
      mostActiveHour: 12,
      balanceRating: 'Empty',
    };
  }

  const senders = Array.from(new Set(userMessages.map((m) => m.sender)));
  const participantData: Record<
    string,
    {
      count: number;
      words: number;
      initiations: number;
      latencies: number[];
      doubleTexts: number;
      nightMessages: number;
      deleted: number;
      emojis: Record<string, number>;
    }
  > = Object.create(null);

  senders.forEach((s) => {
    participantData[s] = {
      count: 0,
      words: 0,
      initiations: 0,
      latencies: [],
      doubleTexts: 0,
      nightMessages: 0,
      deleted: 0,
      emojis: {},
    };
  });

  const dayOfWeekCount: Record<string, number> = {
    Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
  };
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hourOfDayCount = new Array(24).fill(0);

  let totalConversations = 0;
  const emojiRegex = /(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|[\uFE0E\uFE0F]|\p{Emoji_Modifier})*|\p{Emoji_Presentation})/gu;

  for (let i = 0; i < userMessages.length; i++) {
    const msg = userMessages[i];
    const prev = i > 0 ? userMessages[i - 1] : null;
    const data = participantData[msg.sender];
    if (!data) continue;

    data.count++;
    const isDeleted = msg.isDeleted === true || isDeletedPlaceholder(msg.content);
    if (isDeleted) {
      data.deleted++;
    }
    const words = isDeleted || msg.isReaction || /^<?(?:media|image|video|audio|sticker) omitted>?$/i.test(msg.content.trim()) ? 0 : (msg.content.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
    data.words += words;

    // Time analysis
    const msgDate = new Date(msg.timestamp);
    const hour = msgDate.getUTCHours();
    hourOfDayCount[hour]++;
    dayOfWeekCount[days[msgDate.getUTCDay()]]++;

    if (hour >= 23 || hour <= 5) {
      data.nightMessages++;
    }

    // Emoji extraction: filter out symbols, digits, and noise
    const foundEmojis = msg.content.match(emojiRegex);
    if (foundEmojis) {
      foundEmojis.forEach((e) => {
        if (!/^[©®™#*0-9]/.test(e)) {
          data.emojis[e] = (data.emojis[e] || 0) + 1;
        }
      });
    }

    // Initiation check (gap > 4 hours or first message)
    if (!prev || msg.timestamp.getTime() - prev.timestamp.getTime() >= INACTIVITY_GAP_MS) {
      data.initiations++;
      totalConversations++;
    }

    // Response latency & double-text check
    if (prev && msg.timestamp.getTime() - prev.timestamp.getTime() < INACTIVITY_GAP_MS) {
      if (prev.sender !== msg.sender) {
        const diffMinutes = (msg.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 60);
        if (diffMinutes >= 0) {
          data.latencies.push(diffMinutes);
        }
      } else {
        data.doubleTexts++;
      }
    }
  }

  const totalMsgCount = userMessages.length;

  const participants: ParticipantMetrics[] = senders.map((name) => {
    const d = participantData[name];
    d.latencies.sort((a, b) => a - b);
    const medianLatency =
      d.latencies.length > 0
        ? (d.latencies[Math.floor((d.latencies.length - 1) / 2)] + d.latencies[Math.floor(d.latencies.length / 2)]) / 2
        : null;

    const sortedEmojis = Object.entries(d.emojis)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emoji]) => emoji);

    return {
      name,
      messageCount: d.count,
      messageSharePercentage: Math.round((d.count / (totalMsgCount || 1)) * 100),
      wordCount: d.words,
      avgWordsPerMessage: Math.round((d.words / (d.count || 1)) * 10) / 10,
      conversationsInitiated: d.initiations,
      initiationPercentage: Math.round((d.initiations / (totalConversations || 1)) * 100),
      medianResponseTimeMinutes: medianLatency === null ? null : Math.round(medianLatency * 10) / 10,
      doubleTextCount: d.doubleTexts,
      nightOwlPercentage: Math.round((d.nightMessages / (d.count || 1)) * 100),
      topEmojis: sortedEmojis,
      deletedCount: d.deleted,
    };
  });

  const startDate = userMessages[0].timestamp;
  const endDate = userMessages[userMessages.length - 1].timestamp;
  const durationDays = Math.max(
    1,
    Math.floor(endDate.getTime() / 86400000) - Math.floor(startDate.getTime() / 86400000) + 1
  );

  let bestDay = 'Friday';
  let bestDayCount = -1;
  Object.entries(dayOfWeekCount).forEach(([day, count]) => {
    if (count > bestDayCount) {
      bestDayCount = count;
      bestDay = day;
    }
  });

  let bestHour = 12;
  let bestHourCount = -1;
  hourOfDayCount.forEach((count, hour) => {
    if (count > bestHourCount) {
      bestHourCount = count;
      bestHour = hour;
    }
  });

  let balanceRating = 'Even Dynamic';
  if (participants.length === 2) {
    const [p1, p2] = participants;
    balanceRating = `${p1.messageSharePercentage}% ${p1.name} / ${p2.messageSharePercentage}% ${p2.name}`;
  } else if (participants.length > 2) {
    balanceRating = participants
      .map((p) => `${p.messageSharePercentage}% ${p.name}`)
      .join(' / ');
  } else if (participants.length === 1) {
    balanceRating = `100% ${participants[0].name}`;
  }

  return {
    participants,
    totalMessages: totalMsgCount,
    activeDays: new Set(userMessages.map(m => m.timestamp.toISOString().slice(0, 10))).size,
    totalConversations,
    totalDeleted: participants.reduce((s, p) => s + (p.deletedCount || 0), 0),
    dateRange: {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
      durationDays,
    },
    mostActiveDay: bestDay,
    mostActiveHour: bestHour,
    balanceRating,
  };
}
