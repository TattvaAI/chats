import { ParsedMessage } from '../parser/whatsapp';

export interface WeeklyBucket {
  weekLabel: string; // e.g. "Oct 14 - Oct 20, 2024"
  startDate: Date;
  messageCount: number;
  initiatorBreakdown: Record<string, number>;
  sampleMessages: string[];
}

export interface TurningPointResult {
  turningWeekLabel: string;
  turningDate: Date;
  beforeVolumeAvg: number;
  afterVolumeAvg: number;
  description: string;
  pivotalQuotes: string[];
}

export function detectTurningPoint(messages: ParsedMessage[]): TurningPointResult | null {
  if (!messages || !Array.isArray(messages) || messages.length < 50) return null;

  const userMessages = messages.filter((m) => !m.isSystem && !m.isReaction).slice().sort((a,b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (userMessages.length < 50) return null;

  // Group into 7-day buckets
  const firstTime = userMessages[0].timestamp.getTime();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  // Invalid or extreme spans cannot allocate an unbounded array of empty weeks.
  const span = userMessages.at(-1)!.timestamp.getTime() - firstTime;
  if (!Number.isFinite(span) || span > ONE_WEEK_MS * 6000) return null;

  const buckets: WeeklyBucket[] = [];

  userMessages.forEach((msg) => {
    const diff = msg.timestamp.getTime() - firstTime;
    const weekIndex = Math.floor(diff / ONE_WEEK_MS);

    while (buckets.length <= weekIndex) {
      const weekStart = new Date(firstTime + buckets.length * ONE_WEEK_MS);
      const weekEnd = new Date(firstTime + (buckets.length + 1) * ONE_WEEK_MS - 1000);
      buckets.push({
        weekLabel: `${weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${weekEnd.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`,
        startDate: weekStart,
        messageCount: 0,
        initiatorBreakdown: Object.create(null),
        sampleMessages: [],
      });
    }

    const currentBucket = buckets[weekIndex];
    currentBucket.messageCount++;
    currentBucket.initiatorBreakdown[msg.sender] =
      (currentBucket.initiatorBreakdown[msg.sender] || 0) + 1;

    if (currentBucket.sampleMessages.length < 5 && msg.content.length > 15) {
      currentBucket.sampleMessages.push(`${msg.sender}: "${msg.content}"`);
    }
  });

  if (buckets.length === 0 || !buckets[0]) return null;

  if (buckets.length < 4) return null;

  // Find biggest drop or velocity shift (excluding first and last incomplete weeks)
  let maxDisruption = 0;
  let pivotIndex = 1;

  for (let i = 1; i < buckets.length - 2; i++) {
    const prev = buckets[i - 1].messageCount || 1;
    const curr = buckets[i].messageCount;
    const next = buckets[i + 1].messageCount;

    // Disruption: sudden drop in volume followed by sustained drop
    const drop = (prev - curr) / prev;
    const sustainedDrop = (prev - next) / prev;
    const disruptionScore = drop * 0.6 + sustainedDrop * 0.4;

    if (drop > 0 && sustainedDrop > 0 && disruptionScore > maxDisruption) {
      maxDisruption = disruptionScore;
      pivotIndex = i;
    }
  }

  if (maxDisruption < 0.25) return null;

  const pivotBucket = buckets[pivotIndex];
  const beforeAvg = Math.round(
    buckets.slice(0, pivotIndex).reduce((acc, b) => acc + b.messageCount, 0) / pivotIndex
  );
  const afterSlice = buckets.slice(pivotIndex, -1);
  const afterAvg = Math.round(
    afterSlice.reduce((acc, b) => acc + b.messageCount, 0) / afterSlice.length
  );

  if (afterAvg >= beforeAvg) return null;

  return {
    turningWeekLabel: pivotBucket.weekLabel,
    turningDate: pivotBucket.startDate,
    beforeVolumeAvg: beforeAvg,
    afterVolumeAvg: afterAvg,
    description: `Activity dropped from an average of ${beforeAvg} messages/week to ${afterAvg} messages/week starting this week.`,
    pivotalQuotes: pivotBucket.sampleMessages.slice(0, 3),
  };
}
