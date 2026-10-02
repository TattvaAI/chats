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

  const userMessages = messages.filter((m) => !m.isSystem && m.sender !== 'System');
  if (userMessages.length < 50) return null;

  // Group into 7-day buckets
  const firstTime = userMessages[0].timestamp.getTime();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const buckets: WeeklyBucket[] = [];

  userMessages.forEach((msg) => {
    const diff = msg.timestamp.getTime() - firstTime;
    const weekIndex = Math.floor(diff / ONE_WEEK_MS);

    while (buckets.length <= weekIndex) {
      const weekStart = new Date(firstTime + buckets.length * ONE_WEEK_MS);
      const weekEnd = new Date(firstTime + (buckets.length + 1) * ONE_WEEK_MS - 1000);
      buckets.push({
        weekLabel: `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
        startDate: weekStart,
        messageCount: 0,
        initiatorBreakdown: {},
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

  if (buckets.length < 3) {
    return {
      turningWeekLabel: buckets[0].weekLabel,
      turningDate: buckets[0].startDate,
      beforeVolumeAvg: buckets[0].messageCount,
      afterVolumeAvg: buckets[buckets.length - 1].messageCount,
      description: 'The conversation pace remained relatively uniform throughout the tracked duration.',
      pivotalQuotes: buckets[0].sampleMessages.slice(0, 2),
    };
  }

  // Find biggest drop or velocity shift (excluding first and last incomplete weeks)
  let maxDisruption = -1;
  let pivotIndex = 1;

  for (let i = 1; i < buckets.length - 1; i++) {
    const prev = buckets[i - 1].messageCount || 1;
    const curr = buckets[i].messageCount;
    const next = buckets[i + 1].messageCount;

    // Disruption: sudden drop in volume followed by sustained drop
    const drop = (prev - curr) / prev;
    const sustainedDrop = (prev - next) / prev;
    const disruptionScore = drop * 0.6 + sustainedDrop * 0.4;

    if (disruptionScore > maxDisruption) {
      maxDisruption = disruptionScore;
      pivotIndex = i;
    }
  }

  const pivotBucket = buckets[pivotIndex];
  const beforeAvg = Math.round(
    buckets.slice(0, pivotIndex).reduce((acc, b) => acc + b.messageCount, 0) / pivotIndex
  );
  const afterSlice = buckets.slice(pivotIndex);
  const afterAvg = Math.round(
    afterSlice.reduce((acc, b) => acc + b.messageCount, 0) / afterSlice.length
  );

  return {
    turningWeekLabel: pivotBucket.weekLabel,
    turningDate: pivotBucket.startDate,
    beforeVolumeAvg: beforeAvg,
    afterVolumeAvg: afterAvg,
    description: `Activity dropped from an average of ${beforeAvg} messages/week to ${afterAvg} messages/week starting this week.`,
    pivotalQuotes: pivotBucket.sampleMessages.slice(0, 3),
  };
}
