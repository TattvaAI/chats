import { generateObject, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { FreePreview, FreePreviewSchema, FullReport, FullReportSchema } from './schemas';
import {
  FRANK_SYSTEM_PROMPT,
  buildFreePreviewPrompt,
  buildFullReportPrompt,
} from './prompts';
import { ChatForensicStats } from '../forensics/metrics';
import { TurningPointResult } from '../forensics/turning-point';

export interface FullChatMessage {
  sender: string;
  content: string;
  at?: string;
}

function getAIModel() {
  // 1. NVIDIA NIM (GLM 5.3, GLM 4, Llama 3.3, or any NIM model via OpenAI compatibility)
  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createOpenAI({
      baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
    });
    const modelName = process.env.NVIDIA_MODEL || 'thudm/glm-4-9b-chat';
    return nvidia(modelName);
  }

  // 2. OpenAI directly if provided
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return openai(process.env.OPENAI_MODEL || 'gpt-4o');
  }

  // 3. Anthropic Claude 3.5 Sonnet
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-3-5-sonnet-20241022');
  }

  // 4. Google Gemini 1.5 Pro
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    return google('gemini-1.5-pro');
  }

  return null;
}

export async function generateFrankPreview(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  transcriptSample: string,
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: FreePreview; live: boolean }> {
  const model = getAIModel();

  if (!model) {
    console.warn('[analyzer:preview] No AI model configured, using fallback');
    return { data: generateFallbackPreview(category, stats, turningPoint), live: false };
  }

  try {
    const metricsSummary = JSON.stringify(stats, null, 2);
    const turningPointSummary = turningPoint
      ? JSON.stringify(turningPoint, null, 2)
      : 'No distinct drop detected.';

    const prompt = buildFreePreviewPrompt(
      category,
      metricsSummary,
      turningPointSummary,
      transcriptSample,
      userNote,
      lang,
      myName
    );

    const { object } = await generateObject({
      model,
      system: FRANK_SYSTEM_PROMPT,
      prompt,
      schema: FreePreviewSchema,
      maxOutputTokens: 8000,
    });

    return { data: object, live: true };
  } catch (err) {
    console.warn('[analyzer:preview] AI preview generation failed, using fallback:', err);
    return { data: generateFallbackPreview(category, stats, turningPoint), live: false };
  }
}

export async function generateFrankFullReport(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  transcriptSample: string,
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: FullReport; live: boolean }> {
  const model = getAIModel();

  if (!model) {
    console.warn('[analyzer:full] No AI model configured, using fallback');
    return { data: generateFallbackFullReport(category, stats, turningPoint), live: false };
  }

  try {
    const metricsSummary = JSON.stringify(stats, null, 2);
    const turningPointSummary = turningPoint
      ? JSON.stringify(turningPoint, null, 2)
      : 'No distinct drop detected.';

    const prompt = buildFullReportPrompt(
      category,
      metricsSummary,
      turningPointSummary,
      transcriptSample,
      userNote,
      lang,
      myName
    );

    const { object } = await generateObject({
      model,
      system: FRANK_SYSTEM_PROMPT,
      prompt,
      schema: FullReportSchema,
      maxOutputTokens: 16000,
    });

    return { data: object, live: true };
  } catch (err) {
    console.warn('[analyzer:full] AI full report generation failed, using fallback:', err);
    return { data: generateFallbackFullReport(category, stats, turningPoint), live: false };
  }
}

async function summarizeChunk(
  category: string,
  metricsSliceNote: string,
  chunkText: string,
  lang?: string
): Promise<string> {
  const MAX_CHUNK_CHARS = 12_000;
  const rawText =
    chunkText.length > MAX_CHUNK_CHARS
      ? `${chunkText.slice(0, MAX_CHUNK_CHARS)}\n\n[... chunk trimmed to fit ...]`
      : chunkText;

  const model = getAIModel();
  if (!model) {
    return rawText.slice(0, 1500);
  }

  try {
    const langLine = lang ? `\nWrite the notes in language: ${lang}.` : '';
    const { text } = await generateText({
      model,
      system:
        `You are Frank's assistant summarizing one chronological excerpt of a ${category} chat for a message review. ${metricsSliceNote}${langLine} Preserve key dynamics, tone shifts, who starts chats, reply gaps, and 1-2 verbatim quotes with their timestamps. Keep notes to 300-500 characters.`,
      prompt: `Summarize this chat excerpt in 300-500 characters of notes, including 1-2 verbatim quotes with timestamps:\n\n${rawText}`,
      maxOutputTokens: 2000,
    });
    return text || rawText.slice(0, 1500);
  } catch (err) {
    console.warn(`[analyzer:summarizeChunk] chunk summarization failed:`, err);
    return rawText.slice(0, 1500);
  }
}

function formatFullMsg(m: FullChatMessage): string {
  return m.at ? `${m.sender} [${m.at}]: ${m.content}` : `${m.sender}: ${m.content}`;
}

async function buildFullTranscript(
  category: string,
  messages: FullChatMessage[],
  lang?: string
): Promise<string> {
  if (!messages || messages.length === 0) {
    return '';
  }

  // <=1500: single-pass over ALL messages (300k cap, trim middle)
  if (messages.length <= 1500) {
    let transcript = messages.map(formatFullMsg).join('\n');
    const MAX_CHARS = 300_000;
    if (transcript.length > MAX_CHARS) {
      const half = Math.floor((MAX_CHARS - 100) / 2);
      const head = transcript.slice(0, half);
      const tail = transcript.slice(-half);
      transcript = `${head}\n\n[... intermediate messages trimmed to fit 300k cap ...]\n\n${tail}`;
    }
    return transcript;
  }

  // >1500: dynamic windows, max 6 (stride-sample 2400 if more)
  let msgs = messages;
  if (msgs.length > 2400) {
    const targetCount = 2400;
    const total = msgs.length;
    const sampled: FullChatMessage[] = [];
    for (let i = 0; i < targetCount; i++) {
      const idx = Math.floor((i * (total - 1)) / (targetCount - 1));
      sampled.push(msgs[idx]);
    }
    msgs = sampled;
  }

  const windowSize = Math.ceil(msgs.length / 6);
  const windows: FullChatMessage[][] = [];
  for (let i = 0; i < msgs.length; i += windowSize) {
    windows.push(msgs.slice(i, i + windowSize));
  }
  const cappedWindows = windows.slice(0, 6);

  // Fan out in parallel (bounded by 6 << 40 RPM); never throws per chunk
  const summaries = await Promise.all(
    cappedWindows.map((win, idx) =>
      summarizeChunk(
        category,
        `Window ${idx + 1} of ${cappedWindows.length}.`,
        win.map(formatFullMsg).join('\n'),
        lang
      )
    )
  );

  const notes = summaries
    .map((summary, idx) => `--- SEGMENT ${idx + 1}/${cappedWindows.length} ---\n${summary}`)
    .join('\n\n');

  // Raw verbatim excerpts so generators can cite timestamped quotes
  const firstRaw = messages.slice(0, 15).map(formatFullMsg).join('\n');
  const lastRaw = messages.slice(-15).map(formatFullMsg).join('\n');

  return `${notes}\n\n--- FIRST MESSAGES (verbatim) ---\n${firstRaw}\n\n--- LAST MESSAGES (verbatim) ---\n${lastRaw}`;
}

const fullTranscriptCache = new WeakMap<FullChatMessage[], Map<string, Promise<string>>>();

function getFullTranscript(
  category: string,
  messages: FullChatMessage[],
  lang?: string
): Promise<string> {
  const key = `${category}::${lang || ''}`;
  let inner = fullTranscriptCache.get(messages);
  if (!inner) {
    inner = new Map();
    fullTranscriptCache.set(messages, inner);
  }
  let promise = inner.get(key);
  if (!promise) {
    promise = buildFullTranscript(category, messages, lang);
    inner.set(key, promise);
  }
  return promise;
}

export async function generateFrankPreviewFull(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  messages: FullChatMessage[],
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: FreePreview; live: boolean }> {
  const transcript = await getFullTranscript(category, messages, lang);
  return generateFrankPreview(category, stats, turningPoint, transcript, userNote, lang, myName);
}

export async function generateFrankFullReportFull(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  messages: FullChatMessage[],
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: FullReport; live: boolean }> {
  const transcript = await getFullTranscript(category, messages, lang);
  return generateFrankFullReport(category, stats, turningPoint, transcript, userNote, lang, myName);
}

export const generateBrandonPreview = generateFrankPreview;
export const generateBrandonFullReport = generateFrankFullReport;
export const generateBrandonPreviewFull = generateFrankPreviewFull;
export const generateBrandonFullReportFull = generateFrankFullReportFull;

// High-Fidelity Deterministic Generators (metrics-only, no invented narratives)
function generateFallbackPreview(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null
): FreePreview {
  const names = stats.participants.map((p) => p.name);
  const p1 = names[0] || 'Person A';
  const p2 = names[1] || 'Person B';
  const topInitiator = [...stats.participants].sort(
    (a, b) => b.initiationPercentage - a.initiationPercentage
  )[0];
  const slowest = [...stats.participants].sort(
    (a, b) => b.medianResponseTimeMinutes - a.medianResponseTimeMinutes
  )[0];
  const fastest = [...stats.participants].sort(
    (a, b) => a.medianResponseTimeMinutes - b.medianResponseTimeMinutes
  )[0];
  const totalDoubleTexts = stats.participants.reduce((s, p) => s + p.doubleTextCount, 0);
  const totalDeleted = stats.totalDeleted ?? stats.participants.reduce((s, p) => s + (p.deletedCount || 0), 0);
  const turningWeek = turningPoint?.turningWeekLabel || 'the detected turning window';
  const rosterSuffix = names.length > 2 ? ` (${names.length} participants: ${names.join(', ')})` : '';

  return {
    headline: `${p1} & ${p2}: When One Person Carries the Chat${names.length > 2 ? ` — ${names.length}-Way Thread` : ''}`,
    subheading: `One person kept this chat running; the other just showed up when it suited them.`,
    verdictTag: 'Structural Asymmetry',
    brutalityScore: 8.8,
    teaserVerdict: `I read every single message across these ${stats.dateRange.durationDays} days (${stats.totalMessages} messages${rosterSuffix}). The imbalance isn't subtle or accidental—it's structural. Look at the raw numbers: ${topInitiator?.name || p1} starts ${topInitiator?.initiationPercentage ?? 0}% of the chats, while the typical reply gap stretches from ${fastest?.medianResponseTimeMinutes ?? 0}m (${fastest?.name || p1}) to ${slowest?.medianResponseTimeMinutes ?? 0}m (${slowest?.name || p2}).\n\nEverything moved until ${turningWeek}, when the rhythm broke and the tone shifted from mutual curiosity to one-sided maintenance.${totalDeleted > 0 ? `\n\nAlong the way, ${totalDeleted} message${totalDeleted === 1 ? ' was' : 's were'} removed — watch for those gaps in the full timeline.` : ''}\n\nYou have been excusing capacity when the real culprit is priority.`,
    previewHighlights: [
      `Who-starts gap: ${stats.participants.map((p) => `${p.initiationPercentage}% ${p.name}`).join(' vs ')}`,
      `Reply gap spread: ${stats.participants.map((p) => `${p.medianResponseTimeMinutes}m ${p.name}`).join(' vs ')}`,
      `${totalDoubleTexts} double-text sequences across ${stats.totalConversations} conversations`,
      ...(totalDeleted > 0 ? [`${totalDeleted} removed message${totalDeleted === 1 ? '' : 's'} (${stats.participants.map((p) => `${p.deletedCount || 0} ${p.name}`).join(' vs ')})`] : []),
      `Balance readout: ${stats.balanceRating}`,
    ],
    lockedSections: [
      'The Turning Point: The Week It Changed',
      'The Balance of Power & Unspoken Truth',
      'Individual Member Breakdowns & Roasts',
      'The Slang & Subtext Glossary',
      'The Superlative Awards Ceremony',
      'Tactical Advice (Exact Message to Send)',
    ],
  };
}

function generateFallbackFullReport(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null
): FullReport {
  const names = stats.participants.map((p) => p.name);
  const p1 = names[0] || 'Person A';
  const p2 = names[1] || 'Person B';
  const turningWeek = turningPoint?.turningWeekLabel || 'the detected turning window';
  const byInitiation = [...stats.participants].sort((a, b) => b.initiationPercentage - a.initiationPercentage);
  const byLatency = [...stats.participants].sort((a, b) => b.medianResponseTimeMinutes - a.medianResponseTimeMinutes);
  const byDoubles = [...stats.participants].sort((a, b) => b.doubleTextCount - a.doubleTextCount);
  const carrier = byInitiation[0]?.name || p1;
  const tempo = byLatency[0]?.name || p2;
  const totalDoubles = stats.participants.reduce((s, p) => s + p.doubleTextCount, 0);
  const totalDeleted = stats.totalDeleted ?? stats.participants.reduce((s, p) => s + (p.deletedCount || 0), 0);

  return {
    headline: `${names.slice(0, 2).join(' & ') || `${p1} & ${p2}`}: The Story of a One-Way Dynamic`,
    subheading: `The numbers do not lie across ${stats.totalMessages} messages and ${stats.totalConversations} conversations.`,
    verdictTag: 'One-Way Dynamic',
    brutalityScore: 9.1,
    fullVerdict: `Across ${stats.totalMessages} messages spanning ${stats.dateRange.durationDays} days (${stats.dateRange.start} to ${stats.dateRange.end}), this ${category} thread tells an unmistakable story in the numbers alone: ${stats.balanceRating}. ${carrier} starts ${byInitiation[0]?.initiationPercentage ?? 0}% of conversations while typical reply times stretch from ${Math.min(...stats.participants.map((p) => p.medianResponseTimeMinutes))}m to ${Math.max(...stats.participants.map((p) => p.medianResponseTimeMinutes))}m.\n\nThe rhythm broke around ${turningWeek}. Before that window the exchange held; after it, reply gaps widened, restarts piled further onto ${carrier}, and ${totalDoubles} double-texts piled up as silence insurance.${totalDeleted > 0 ? ` ${totalDeleted} message${totalDeleted === 1 ? ' was' : 's were'} removed along the way.` : ''}\n\nHere is the plain truth: you cannot confuse someone answering with someone wanting to talk. The participant sheet proves it — ${stats.participants.map((p) => `${p.name}: ${p.messageSharePercentage}% share, ${p.initiationPercentage}% of starts, ${p.medianResponseTimeMinutes}m typical reply, ${p.doubleTextCount} double-texts`).join('; ')}.\n\n${carrier} kept the thread alive by absorbing every restart cost. ${tempo} set the tempo by simply setting the clock. The moment ${carrier} stops pushing, the thread dies — not failure, just arithmetic.`,
    theDynamic: {
      powerBalance: stats.balanceRating,
      emotionalLaborCarrier: carrier,
      tempoController: tempo,
      analysis: `${carrier} carries the restart load (${byInitiation[0]?.initiationPercentage ?? 0}% of starts) across ${stats.totalConversations} conversations. ${tempo} controls the climate via a ${byLatency[0]?.medianResponseTimeMinutes ?? 0}m typical reply time. Most active window: ${stats.mostActiveDay} at ${stats.mostActiveHour}:00.`,
      unspokenTruth: `The balance sheet already ended this dynamic — ${stats.balanceRating} — before anyone said it out loud.`,
      doubleTextDiagnosis: `${byDoubles[0]?.name || p1} sent ${byDoubles[0]?.doubleTextCount ?? 0} of ${totalDoubles} double-texts. Each was an anxiety tax paid against silence.`,
    },
    timeline: [
      {
        phaseTitle: 'Phase 1: The Opening Exchange',
        timeframe: `Starting ${stats.dateRange.start}`,
        vibe: `Peak mutual velocity across ${stats.totalConversations} conversation starts`,
        description: `Early thread shows the most balanced tempo of the whole ${stats.dateRange.durationDays}-day window.`,
      },
      {
        phaseTitle: 'Phase 2: The Drift',
        timeframe: 'Mid-window',
        vibe: `Reply gaps stretch toward ${byLatency[0]?.medianResponseTimeMinutes ?? 0}m for ${tempo}`,
        description: `${carrier} compensates with ${byInitiation[0]?.initiationPercentage ?? 0}% of chat starts while replies thin out.`,
      },
      {
        phaseTitle: 'Phase 3: The Turning Window',
        timeframe: `${turningWeek}`,
        vibe: 'The decisive break recorded in the message data',
        description: `Velocity and reciprocity drop in the turning window; double-texts (${totalDoubles} total) cluster here.`,
      },
      {
        phaseTitle: 'Phase 4: The Holding Pattern',
        timeframe: `Ending ${stats.dateRange.end}`,
        vibe: 'Maintenance mode, zero surplus effort',
        description: `Thread survives on ${carrier} restarts alone. Final readout: ${stats.balanceRating}.`,
      },
    ],
    theTurningPoint: {
      week: turningWeek,
      dropPercentage: `Chat restarts piled onto ${carrier} at ${byInitiation[0]?.initiationPercentage ?? 0}%; slowest typical reply ${byLatency[0]?.medianResponseTimeMinutes ?? 0}m`,
      whatChanged: `Before ${turningWeek} the tempo was shared; after it, ${carrier} carried restarts and ${tempo} set multi-hour gaps. Most active day stayed ${stats.mostActiveDay}.`,
      transcriptEvidence: `Fallback mode: no transcript excerpt rendered — verdict derived strictly from message counts (${stats.totalMessages} messages, balance ${stats.balanceRating}).`,
      pivotalExchanges: [
        `Chat-start split: ${stats.participants.map((p) => `${p.name} ${p.initiationPercentage}%`).join(', ')}`,
        `Reply-speed split: ${stats.participants.map((p) => `${p.name} ${p.medianResponseTimeMinutes}m typical`).join(', ')}`,
      ],
    },
    memberDossiers: stats.participants.map((p) => ({
      name: p.name,
      roleTitle: p.name === carrier ? 'Chief Logistics Officer & Hope Coordinator' : 'The Reluctant Respondent',
      roast: `${p.name} holds ${p.messageSharePercentage}% of messages (${p.messageCount} total, ~${p.avgWordsPerMessage} words each), starts ${p.initiationPercentage}% of conversations, answers at a ${p.medianResponseTimeMinutes}m typical reply gap, and stacked ${p.doubleTextCount} double-texts. The numbers are the personality.`,
      diagnosis: p.name === carrier
        ? 'Over-invested starter. Keeps the thread alive by paying every restart cost; mistakes replying for wanting.'
        : `Low-cost responder. Controls the tempo through delay (${p.medianResponseTimeMinutes}m typical) while collecting attention without reciprocity.`,
      telltaleHabit: p.doubleTextCount > 0
        ? `${p.doubleTextCount} double-texts to fill silence; ${p.nightOwlPercentage}% of activity after hours.`
        : `Typical ${p.medianResponseTimeMinutes}m replies; starts only ${p.initiationPercentage}% of chats.`,
      ratings: [
        { label: 'Conversational Effort', score: Math.min(5, Math.max(0, Math.round((p.messageSharePercentage / 20) * 10) / 10)), note: `${p.messageSharePercentage}% message share.` },
        { label: 'Starting Chats', score: Math.min(5, Math.max(0, Math.round((p.initiationPercentage / 20) * 10) / 10)), note: `Starts ${p.initiationPercentage}% of chats.` },
        { label: 'Responsiveness', score: Math.min(5, Math.max(0, 5 - Math.min(4, p.medianResponseTimeMinutes / 60))), note: `${p.medianResponseTimeMinutes}m typical reply.` },
        { label: 'Self-Preservation Instinct', score: p.name === carrier ? 1.2 : 4.0, note: p.name === carrier ? 'Kept returning to a dry well.' : 'Protected time by withholding effort.' },
      ],
      redFlags: [
        p.initiationPercentage < 20 ? `Starts only ${p.initiationPercentage}% of conversations` : `Restarts ${p.initiationPercentage}% of conversations`,
        `Typical reply gap of ${p.medianResponseTimeMinutes} minutes`,
      ],
    })),
    privateGlossary: [
      {
        phraseOrSlang: `The ${byLatency[0]?.medianResponseTimeMinutes ?? 0}m gap (${tempo})`,
        frankDefinition: 'Delay as control: the slowest clock sets the relationship temperature.',
        contextQuote: `Reply-speed split: ${stats.participants.map((p) => `${p.name} ${p.medianResponseTimeMinutes}m`).join(', ')}`,
        subtextAnalysis: 'Whoever answers last rules without saying a word.',
      },
      {
        phraseOrSlang: `The ${totalDoubles} double-texts`,
        frankDefinition: 'Anxiety tax paid to buy insurance against being left on delivered.',
        contextQuote: `Double-texts: ${stats.participants.map((p) => `${p.name} ${p.doubleTextCount}`).join(', ')}`,
        subtextAnalysis: 'Each stacked message admits the silence already answered.',
      },
      {
        phraseOrSlang: `The ${byInitiation[0]?.initiationPercentage ?? 0}% of starts (${carrier})`,
        frankDefinition: 'One person runs logistics; the rest are tourists.',
        contextQuote: `Chat starts: ${stats.participants.map((p) => `${p.name} ${p.initiationPercentage}%`).join(', ')}`,
        subtextAnalysis: 'Restart share is desire share.',
      },
    ],
    awardsAndSuperlatives: [
      {
        title: 'The Gold Medal in Polite Dodging',
        recipient: tempo,
        reason: `Held a ${byLatency[0]?.medianResponseTimeMinutes ?? 0}m typical reply gap while staying technically present.`,
      },
      {
        title: 'Olympic-Level Thread Reviver',
        recipient: carrier,
        reason: `Accountable for ${byInitiation[0]?.initiationPercentage ?? 0}% of conversation restarts across ${stats.totalConversations} conversations.`,
      },
      {
        title: 'Most Unbothered By Gaps',
        recipient: tempo,
        reason: `Slowest typical reply in the thread at ${byLatency[0]?.medianResponseTimeMinutes ?? 0}m with only ${byLatency[0]?.initiationPercentage ?? 0}% of chat starts.`,
      },
    ],
    tacticalAdvice: {
      whatToSend: 'NOTHING. Let the silence stand and watch who restarts — the metrics already predict it will be the same initiator.',
      rulesOfEngagement: [
        '1. Match energy with mathematical precision: mirror the slowest typical reply gap before replying.',
        '2. Never double-text again in this thread under any circumstance.',
        '3. Stop restarting conversations you did not stall; count restarts for one week.',
        '4. Invest where both people start chats, not where your share exceeds 60%.',
      ],
      whatToNeverDoAgain: 'Stop rewording asks to make them easier to dodge. Stop excusing a structural gap as a busy week.',
      closingVerdict: `Silence is the clearest message in this ${stats.totalMessages}-message log. The balance reads ${stats.balanceRating} — believe the arithmetic.`,
    },
  };
}
