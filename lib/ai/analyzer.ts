import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { jsonrepair } from 'jsonrepair';
import {
  FreePreview,
  FreePreviewSchema,
  BrandonReport,
  BrandonReportSchema,
  FullReport,
} from './schemas';
import {
  BRANDON_SYSTEM_PROMPT,
  buildFreePreviewPrompt,
  buildFullReportPrompt,
  getPersonaName,
} from './prompts';
import { ChatForensicStats } from '../forensics/metrics';
import { TurningPointResult } from '../forensics/turning-point';

export interface FullChatMessage {
  sender: string;
  content: string;
  at?: string;
}

export function cleanAndParseJSON(text: string): any {
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (jsonMatch) clean = jsonMatch[1].trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(jsonrepair(clean));
}

function getAIModel(preferredModel?: string) {
  // 1. NVIDIA NIM
  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createOpenAI({
      baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
    });
    const modelName = preferredModel || (process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b').replace(/['"]/g, '');
    return nvidia.chat(modelName);
  }

  // 2. OpenAI directly
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return openai.chat(process.env.OPENAI_MODEL || 'gpt-4o');
  }

  // 3. Anthropic Claude 3.5 Sonnet
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-3-5-sonnet-20241022');
  }

  // 4. Google Gemini
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    return google('gemini-1.5-pro');
  }

  return null;
}

export async function generateBrandonPreview(
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
    console.warn('[analyzer:preview] No AI model configured, using dynamic synthesis fallback');
    return { data: generateFallbackPreview(category, stats, turningPoint, myName), live: false };
  }

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

  // Attempt 1: Configured primary model
  try {
    const res = await generateText({
      model,
      system: BRANDON_SYSTEM_PROMPT,
      prompt: prompt + '\nIMPORTANT: Respond with ONLY the raw JSON object. Start with { and end with }.',
      temperature: 0.7,
      maxOutputTokens: 3500,
      abortSignal: AbortSignal.timeout(45000),
    });

    const parsed = cleanAndParseJSON(res.text);
    if (parsed && typeof parsed === 'object') {
      const preview: FreePreview = {
        headline: parsed.headline || `${stats.participants[0]?.name || 'Chat'} & ${stats.participants[1]?.name || 'Partner'}: The Dynamic Decoded`,
        subheading: parsed.subheading || 'A candid breakdown of who texted, who waited, and what went unsaid.',
        verdictTag: parsed.verdictTag || 'High-Stakes Dynamic',
        grandMetaphor: parsed.grandMetaphor || {
          intro: `Here is the honest truth about this conversation:`,
          roleReader: `You bring the energy and keep the rhythm alive.`,
          roleOther: `They set the pace and manage the distance.`,
          dynamicSummary: stats.balanceRating,
          closingPunchline: `Let's unpack the whole thing.`,
        },
        teaserVerdict: parsed.teaserVerdict || parsed.headline || 'An unfiltered view into your dynamic.',
        previewHighlights: Array.isArray(parsed.previewHighlights) && parsed.previewHighlights.length > 0
          ? parsed.previewHighlights
          : [
              `${stats.totalMessages.toLocaleString()} messages across ${stats.dateRange.durationDays} days`,
              `Active on ${stats.mostActiveDay}`,
              `Balance readout: ${stats.balanceRating}`,
            ],
        lockedSections: [
          'Reading This in Real Time 🎬',
          'The Metaphor 🎪',
          'Linguistic Decoding: Your Private Dialect 🔍',
          'Profile of the Pair 🪞',
          'The Yelp Review ⭐',
          'The Turning Points 🕰️',
          'The Advice 🎟️',
        ],
      };
      return { data: preview, live: true };
    }
  } catch (err: any) {
    console.warn('[analyzer:preview] Primary model generation failed or timed out:', err?.message || err);
  }

  // Attempt 2: Fast failover model if using NVIDIA
  if (process.env.NVIDIA_API_KEY) {
    try {
      console.log('[analyzer:preview] Trying fast failover model (llama-3.2-11b)...');
      const failoverModel = getAIModel('meta/llama-3.2-11b-vision-instruct');
      if (failoverModel) {
        const res = await generateText({
          model: failoverModel,
          system: BRANDON_SYSTEM_PROMPT,
          prompt: prompt + '\nIMPORTANT: Provide ONLY valid JSON. Start with { and end with }.',
          temperature: 0.7,
          maxOutputTokens: 2500,
          abortSignal: AbortSignal.timeout(30000),
        });

        const parsed = cleanAndParseJSON(res.text);
        if (parsed && typeof parsed === 'object') {
          const preview: FreePreview = {
            headline: parsed.headline || `The Dynamic Between ${stats.participants[0]?.name || 'You'} and ${stats.participants[1]?.name || 'Them'}`,
            subheading: parsed.subheading || 'Decoded with zero filter.',
            verdictTag: parsed.verdictTag || 'Pattern Identified',
            grandMetaphor: parsed.grandMetaphor || {
              intro: `Here is the reality of this chat:`,
              roleReader: `The one testing the waters.`,
              roleOther: `The one holding the line.`,
              dynamicSummary: stats.balanceRating,
              closingPunchline: `Let's dig in.`,
            },
            teaserVerdict: parsed.teaserVerdict || parsed.headline || 'An honest forensic take.',
            previewHighlights: Array.isArray(parsed.previewHighlights) && parsed.previewHighlights.length > 0
              ? parsed.previewHighlights
              : [
                  `${stats.totalMessages.toLocaleString()} total messages`,
                  `Peak conversation day: ${stats.mostActiveDay}`,
                  `Balance ratio: ${stats.balanceRating}`,
                ],
            lockedSections: [
              'Reading This in Real Time 🎬',
              'The Metaphor 🎪',
              'Linguistic Decoding: Your Private Dialect 🔍',
              'Profile of the Pair 🪞',
              'The Yelp Review ⭐',
              'The Turning Points 🕰️',
              'The Advice 🎟️',
            ],
          };
          return { data: preview, live: true };
        }
      }
    } catch (failoverErr: any) {
      console.warn('[analyzer:preview] Failover model also failed:', failoverErr?.message || failoverErr);
    }
  }

  return { data: generateFallbackPreview(category, stats, turningPoint, myName), live: false };
}

export async function generateBrandonFullReport(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  transcriptSample: string,
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: BrandonReport; live: boolean }> {
  const model = getAIModel();

  if (!model) {
    console.warn('[analyzer:full] No AI model configured, using dynamic synthesis fallback');
    return { data: generateFallbackFullReport(category, stats, turningPoint, myName), live: false };
  }

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

  // Attempt 1: Configured primary model
  try {
    const res = await generateText({
      model,
      system: BRANDON_SYSTEM_PROMPT,
      prompt: prompt + '\nIMPORTANT: Provide ONLY the raw JSON object. Do not wrap in markdown or backticks. Start with { and end with }.',
      temperature: 0.7,
      maxOutputTokens: 5000,
      abortSignal: AbortSignal.timeout(60000),
    });

    const parsed = cleanAndParseJSON(res.text);
    if (parsed && typeof parsed === 'object') {
      const report = buildValidatedBrandonReport(parsed, stats, turningPoint, myName);
      return { data: report, live: true };
    }
  } catch (err: any) {
    console.warn('[analyzer:full] Primary model failed or timed out:', err?.message || err);
  }

  // Attempt 2: Fast failover model if using NVIDIA
  if (process.env.NVIDIA_API_KEY) {
    try {
      console.log('[analyzer:full] Trying fast failover model (llama-3.2-11b)...');
      const failoverModel = getAIModel('meta/llama-3.2-11b-vision-instruct');
      if (failoverModel) {
        const res = await generateText({
          model: failoverModel,
          system: BRANDON_SYSTEM_PROMPT,
          prompt: prompt + '\nIMPORTANT: Provide ONLY the raw JSON object. Start with { and end with }.',
          temperature: 0.7,
          maxOutputTokens: 4000,
          abortSignal: AbortSignal.timeout(45000),
        });

        const parsed = cleanAndParseJSON(res.text);
        if (parsed && typeof parsed === 'object') {
          const report = buildValidatedBrandonReport(parsed, stats, turningPoint, myName);
          return { data: report, live: true };
        }
      }
    } catch (failoverErr: any) {
      console.warn('[analyzer:full] Failover model also failed:', failoverErr?.message || failoverErr);
    }
  }

  return { data: generateFallbackFullReport(category, stats, turningPoint, myName), live: false };
}

function buildValidatedBrandonReport(
  parsed: any,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  myName?: string
): BrandonReport {
  const p1 = stats.participants[0]?.name || 'Partner 1';
  const p2 = stats.participants[1]?.name || 'Partner 2';
  const reader = (myName || p1).trim();
  const other = (reader === p1 ? p2 : p1).trim();

  const headline = parsed.headline || `The ${p1} & ${p2} Dynamic: Behind The Glass`;
  const subheading = parsed.subheading || 'An honest autopsy of what was typed, what was deleted, and what went unsaid.';
  const verdictTag = parsed.verdictTag || 'Full-Time Theater';

  const grandMetaphor = parsed.grandMetaphor || {
    intro: `${reader}, let's get one thing straight: you two have built an intricate dynamic where actions speak infinitely louder than words.`,
    roleReader: `You play the one keeping the momentum moving forward.`,
    roleOther: `${other} plays the one carefully measuring the dosage of contact.`,
    dynamicSummary: `Balance readout: ${stats.balanceRating}.`,
    closingPunchline: `Let's unpack the whole thing.`,
  };

  const realTimeReactions = Array.isArray(parsed.realTimeReactions) && parsed.realTimeReactions.length > 0
    ? parsed.realTimeReactions
    : [
        {
          number: 1,
          title: 'The Shift in Momentum',
          narrative: `Analyzing the response rhythms across the ${stats.dateRange.durationDays} days of chat history.`,
          quotes: [
            { sender: reader, text: 'Are you around?' },
            { sender: other, text: 'Hey, sorry busy day!' },
          ],
          reaction: `Notice the gap between thought and execution here: one person is reaching out in the flow of their day, the other is responding when it fits their schedule.`,
        },
      ];

  const metaphorSection = parsed.metaphorSection || {
    emoji: '🎪',
    title: 'The Central Dance',
    tagline: `A dynamic operating under ${stats.balanceRating}.`,
    paragraphs: [
      `When you look at the raw rhythms of this chat across ${stats.totalMessages.toLocaleString()} messages, the pattern becomes unmistakable.`,
      `One person carries the initiating momentum while the other controls the tempo. Neither is wrong, but both are feeling the friction.`,
    ],
  };

  const privateDialect = parsed.privateDialect || {
    emoji: '🔍',
    title: 'Linguistic Decoding: Your Private Dialect',
    intro: `Every close texting dynamic develops coded shorthand. Here are the core patterns in this exchange:`,
    entries: [
      {
        term: 'Delayed Replies',
        meaning: 'Taking hours to reply to quick questions.',
        subtext: 'Preserving autonomy or signaling that other things take priority.',
        quote: 'Sorry just seeing this!',
      },
    ],
  };

  const pairProfile = parsed.pairProfile || {
    emoji: '🪞',
    title: 'Profile of the Pair',
    profiles: [
      {
        name: reader,
        roleTitle: 'The Initiator',
        theFacade: 'Effortless and casual.',
        theReality: 'Deeply invested in keeping the connection alive.',
        signatureMove: 'Checking in and carrying conversational momentum.',
        vulnerabilityTell: 'Sending follow-ups or changing topics when a reply lags.',
      },
      {
        name: other,
        roleTitle: 'The Pace-Setter',
        theFacade: 'Busy, independent, unbothered.',
        theReality: 'Guarding their time and emotional bandwidth.',
        signatureMove: 'Short replies after long gaps.',
        vulnerabilityTell: 'Randomly dropping in with energy when least expected.',
      },
    ],
  };

  const yelpReview = parsed.yelpReview || {
    emoji: '⭐',
    title: `The Yelp Review: The ${p1} & ${p2} Dynamic`,
    stars: 4,
    ambiance: `High energy on peak days (${stats.mostActiveDay}), fluctuating across the rest of the week.`,
    service: `Response times average ${stats.participants[0]?.medianResponseTimeMinutes || 5}m vs ${stats.participants[1]?.medianResponseTimeMinutes || 30}m.`,
    menu: `Banter, sporadic deep checks, and mutual hesitation.`,
    verdict: `Strong foundation, but somebody needs to put down the defense shield.`,
  };

  const turningPoints = parsed.turningPoints || {
    emoji: '🕰️',
    title: 'The Turning Points: When the Subtext Leaked',
    points: [
      {
        dateOrPeriod: turningPoint?.turningWeekLabel || 'Midway through the conversation',
        momentTitle: 'The Rhythmic Shift',
        whatHappened: turningPoint ? turningPoint.description : 'A noticeable cooldown in message velocity.',
        impact: 'Permanently reset expectations around response speed.',
      },
    ],
  };

  const practicalAdvice = parsed.practicalAdvice || {
    emoji: '🎟️',
    title: 'The Advice',
    directTake: `${reader}, stop over-analyzing every minute between read receipts. Match energy rather than trying to manufacture it.`,
    whatToText: 'Text only when you genuinely have something to say, not to check if the line is still connected.',
    whatToStopDoing: 'Stop waiting by your screen and stop pretending you do not notice the lag.',
    brandonClosing: 'The best connection is the one where nobody is calculating who cares more. Go live your life.',
  };

  return {
    headline,
    subheading,
    verdictTag,
    grandMetaphor,
    realTimeReactions,
    metaphorSection,
    privateDialect,
    pairProfile,
    yelpReview,
    turningPoints,
    practicalAdvice,
    brutalityScore: parsed.brutalityScore || 8.5,
    fullVerdict: `${grandMetaphor.intro}\n\n${grandMetaphor.roleReader}\n\n${grandMetaphor.roleOther}\n\n${grandMetaphor.dynamicSummary}`,
    theDynamic: {
      powerBalance: stats.balanceRating,
      analysis: metaphorSection.paragraphs.join('\n\n'),
      unspokenTruth: grandMetaphor.dynamicSummary,
    },
    theTurningPoint: {
      week: turningPoints.points?.[0]?.dateOrPeriod || 'Key Window',
      whatChanged: turningPoints.points?.[0]?.whatHappened || 'Shift in velocity',
      transcriptEvidence: turningPoints.points?.[0]?.impact || 'Pivotal shift',
    },
  };
}

export const generateFrankPreview = generateBrandonPreview;
export const generateFrankFullReport = generateBrandonFullReport;

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
    const langLine = lang ? `\nWrite notes in language: ${lang}.` : '';
    const { text } = await generateText({
      model,
      system: `You are Brandon's assistant reading chat excerpts. ${metricsSliceNote}${langLine} Preserve verbatim quotes, funny nicknames, inside jokes, awkward flirting, and emotional tone shifts. Keep notes concise.`,
      prompt: `Summarize this chat excerpt for Brandon, preserving 2-3 verbatim funny quotes with sender names:\n\n${rawText}`,
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

  if (messages.length <= 1500) {
    let transcript = messages.map(formatFullMsg).join('\n');
    const MAX_CHARS = 300_000;
    if (transcript.length > MAX_CHARS) {
      const half = Math.floor((MAX_CHARS - 100) / 2);
      const head = transcript.slice(0, half);
      const tail = transcript.slice(-half);
      transcript = `${head}\n\n[... intermediate messages trimmed ...]\n\n${tail}`;
    }
    return transcript;
  }

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

  const firstRaw = messages.slice(0, 20).map(formatFullMsg).join('\n');
  const lastRaw = messages.slice(-20).map(formatFullMsg).join('\n');

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

export async function generateBrandonPreviewFull(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  messages: FullChatMessage[],
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: FreePreview; live: boolean }> {
  const transcript = await getFullTranscript(category, messages, lang);
  return generateBrandonPreview(category, stats, turningPoint, transcript, userNote, lang, myName);
}

export async function generateBrandonFullReportFull(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  messages: FullChatMessage[],
  userNote?: string,
  lang?: string,
  myName?: string
): Promise<{ data: BrandonReport; live: boolean }> {
  const transcript = await getFullTranscript(category, messages, lang);
  return generateBrandonFullReport(category, stats, turningPoint, transcript, userNote, lang, myName);
}

export const generateFrankPreviewFull = generateBrandonPreviewFull;
export const generateFrankFullReportFull = generateBrandonFullReportFull;

// High-Fidelity Dynamic Fallback Generators that synthesize real chat metrics
function generateFallbackPreview(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  myName?: string
): FreePreview {
  const persona = getPersonaName();
  const names = stats.participants.map((p) => p.name);
  const reader = (myName || names[0] || 'You').trim();
  const other = (names.find((n) => n !== reader) || names[1] || 'Partner').trim();
  const pReader = stats.participants.find((p) => p.name === reader) || stats.participants[0];
  const pOther = stats.participants.find((p) => p.name === other) || stats.participants[1];

  const readerShare = pReader?.messageSharePercentage || 50;
  const otherShare = pOther?.messageSharePercentage || 50;
  const readerPace = pReader?.medianResponseTimeMinutes || 5;
  const otherPace = pOther?.medianResponseTimeMinutes || 15;

  const headline = readerShare > 58
    ? `The High-Output Chase: One Gas Pedal, One Handbrake`
    : readerShare < 42
      ? `The Strategic Distance: Managing The Overflow`
      : `The Balanced Standoff: Neither Side Blinks First`;

  const subheading = `Across ${stats.totalMessages.toLocaleString()} messages and ${stats.dateRange.durationDays} days: ${stats.balanceRating}.`;
  const verdictTag = readerShare > 58 ? 'High-Output Dynamic' : readerShare < 42 ? 'Strategic Distance' : 'Evenly Matched';

  return {
    headline,
    subheading,
    verdictTag,
    grandMetaphor: {
      intro: `${reader}, let's cut right through the noise: looking across this entire thread with ${other}, the rhythm of who speaks and who waits tells the whole story.`,
      roleReader: `You bring the initiative—carrying ${readerShare}% of total words and responding in roughly ${readerPace} minutes.`,
      roleOther: `${other} controls the tempo—claiming ${otherShare}% of volume with an average reply cadence of ${otherPace} minutes.`,
      dynamicSummary: `Most active on ${stats.mostActiveDay}s around ${stats.mostActiveHour ? `${stats.mostActiveHour}:00` : 'late evenings'}, where messages flow freely before the rhythm resets.`,
      closingPunchline: `Let's unpack the forensic anatomy of this exchange.`,
    },
    teaserVerdict: `${reader}, here is the bottom line: this chat is running on an asymmetry of momentum. One of you is reaching out to build connection, while the other is selectively checking in when convenient. It is subtle, but the timestamps never lie.`,
    previewHighlights: [
      `${stats.totalMessages.toLocaleString()} total messages analyzed across ${stats.dateRange.durationDays} days`,
      `Pace contrast: ~${readerPace}m (${reader}) vs ~${otherPace}m (${other})`,
      `${(pReader?.doubleTextCount || 0) + (pOther?.doubleTextCount || 0)} follow-up messages sent while waiting for replies`,
      `Volume split: ${stats.balanceRating}`,
    ],
    lockedSections: [
      `${persona} Reacts: Reading This in Real Time 🎬`,
      'The Metaphor: The Central Dance 🎪',
      'Linguistic Decoding: Your Private Dialect 🔍',
      'Profile of the Pair 🪞',
      'The Yelp Review ⭐',
      'The Turning Points: When Momentum Shifted 🕰️',
      'The Advice 🎟️',
    ],
  };
}

function generateFallbackFullReport(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  myName?: string
): BrandonReport {
  const persona = getPersonaName();
  const names = stats.participants.map((p) => p.name);
  const reader = (myName || names[0] || 'You').trim();
  const other = (names.find((n) => n !== reader) || names[1] || 'Partner').trim();
  const pReader = stats.participants.find((p) => p.name === reader) || stats.participants[0];
  const pOther = stats.participants.find((p) => p.name === other) || stats.participants[1];

  const readerShare = pReader?.messageSharePercentage || 50;
  const otherShare = pOther?.messageSharePercentage || 50;
  const readerPace = pReader?.medianResponseTimeMinutes || 5;
  const otherPace = pOther?.medianResponseTimeMinutes || 15;
  const turningWeek = turningPoint?.turningWeekLabel || 'Midway through the conversation';

  const headline = readerShare > 58
    ? `The High-Output Chase: One Gas Pedal, One Handbrake`
    : readerShare < 42
      ? `The Strategic Distance: Managing The Overflow`
      : `The Balanced Standoff: Neither Side Blinks First`;

  const subheading = `A forensic audit of ${stats.totalMessages.toLocaleString()} messages across ${stats.dateRange.durationDays} days.`;
  const verdictTag = readerShare > 58 ? 'Asymmetric Velocity' : 'Matched Cadence';

  const grandMetaphor = {
    intro: `${reader}, let's look at what's actually happening here between you and ${other}. Text conversations aren't just words; they're an economy of attention, and this chat has a clear currency exchange rate.`,
    roleReader: `You play the one who keeps the communication line open, driving ${readerShare}% of volume with an average response time of ${readerPace} minutes.`,
    roleOther: `${other} plays the regulator—responding in ${otherPace} minutes and keeping conversations strictly within comfortable boundaries.`,
    dynamicSummary: `You spend significant energy initiating and sustaining threads, while ${other} maintains a steady defensive perimeter of measured engagement.`,
    closingPunchline: `Let's break down the mechanics.`,
  };

  const realTimeReactions = [
    {
      number: 1,
      title: 'The Response Gap',
      narrative: `Throughout the ${stats.dateRange.durationDays} days examined, a recurring pattern appears whenever important questions or casual invites are dropped:`,
      quotes: [
        { sender: reader, text: 'Are you free to catch up later?' },
        { sender: other, text: 'Hey, sorry just seeing this now! Super packed day.' },
      ],
      reaction: `${reader}, notice how quick you are to accommodate delays, while ${other} never feels any urgency to apologize for taking hours to respond. That silence isn't an accident; it's a boundary.`,
    },
    {
      number: 2,
      title: 'The Double-Text Threshold',
      narrative: `With ${pReader?.doubleTextCount || 0} follow-up messages logged for you versus ${pOther?.doubleTextCount || 0} for ${other}:`,
      quotes: [
        { sender: reader, text: 'Nevermind, talk later!' },
        { sender: other, text: 'Sounds good 👍' },
      ],
      reaction: `The follow-up text is the digital equivalent of tapping someone on the shoulder when they pretend they didn't hear you. Every time you send one, you tip the leverage further in their favor.`,
    },
  ];

  const metaphorSection = {
    emoji: '🎪',
    title: 'The Metaphor: The Gas Pedal and the Speed Bump',
    tagline: `A dynamic held together by ${reader}'s persistence and ${other}'s deliberate rationing of attention.`,
    paragraphs: [
      `In this chat, one person is constantly providing forward momentum, while the other acts as an emotional speed bump. Whenever conversation accelerates into personal territory or daily continuity, the pace immediately downshifts.`,
      `This isn't necessarily malice; it's self-preservation. One party fears being ignored and over-communicates; the other fears being obligated and withdraws into polite brevity.`,
      `The result is a conversation that feels close at midnight during peak hours (${stats.mostActiveDay}s), but curiously distant by the following afternoon.`,
    ],
  };

  const privateDialect = {
    emoji: '🔍',
    title: 'Linguistic Decoding: Your Private Dialect',
    intro: `Every sustained chat develops coded shorthand. Here are the core patterns identified in this exchange:`,
    entries: [
      {
        term: 'The Delayed Thumbs-Up / Reaction',
        meaning: 'Reacting with an emoji instead of writing a reply.',
        subtext: 'Acknowledging receipt without incurring any conversational debt.',
        quote: '👍',
      },
      {
        term: 'Just Seeing This',
        meaning: 'The universal digital alibi.',
        subtext: 'I saw this four hours ago, but I waited until I was mentally ready to deal with the energy required.',
        quote: 'Sorry, was super busy!',
      },
    ],
  };

  const pairProfile = {
    emoji: '🪞',
    title: 'Profile of the Pair',
    profiles: [
      {
        name: reader,
        roleTitle: 'The Momentum Carrier',
        theFacade: 'Relaxed, casual, just checking in.',
        theReality: 'Deeply invested in whether the connection is reciprocal.',
        signatureMove: 'Checking in first thing in the morning or following up when silence stretches too long.',
        vulnerabilityTell: 'Apologizing for double-texting or quickly downplaying own enthusiasm.',
      },
      {
        name: other,
        roleTitle: 'The Boundary Manager',
        theFacade: 'Perpetually overwhelmed and caught up in commitments.',
        theReality: 'Guards independence carefully and avoids getting drawn into continuous banter.',
        signatureMove: 'Disappearing mid-conversation and returning hours later as if no time passed.',
        vulnerabilityTell: 'Brief bursts of warmth when you finally stop texting first.',
      },
    ],
  };

  const yelpReview = {
    emoji: '⭐',
    title: `The Yelp Review: The ${reader} & ${other} Dynamic`,
    stars: 3,
    ambiance: `Variable. Peaks on ${stats.mostActiveDay}s, followed by long lulls of radio silence.`,
    service: `Unbalanced. ${reader} delivers rapid table service (${readerPace}m average); ${other} operates on a take-it-or-leave-it schedule (${otherPace}m).`,
    menu: `A steady diet of casual check-ins, delayed affirmations, and missed signals.`,
    verdict: `3.5 out of 5 stars. High potential when both parties show up, but the service charge on emotional energy is too high for one person to carry alone.`,
  };

  const turningPoints = {
    emoji: '🕰️',
    title: 'The Turning Points: When Momentum Shifted',
    points: [
      {
        dateOrPeriod: turningWeek,
        momentTitle: 'The Velocity Shift',
        whatHappened: turningPoint
          ? turningPoint.description
          : `A noticeable plateau in initiation where conversations became more transactional.`,
        impact: `Permanently reset expectations around who texts first and how quickly responses arrive.`,
      },
    ],
  };

  const practicalAdvice = {
    emoji: '🎟️',
    title: 'The Advice',
    directTake: `${reader}, here is the unvarnished truth: stop carrying 70% of the weight in a 50/50 connection. If someone is interested in your life, they don't need three reminders that you exist.`,
    whatToText: `Match their tempo for seven full days. Do not initiate. If they text, reply with the exact same length and care they gave you.`,
    whatToStopDoing: `Stop the anxiety-driven double texting. Stop making excuses for people who have their phone in their hand 16 hours a day.`,
    brandonClosing: `Value your attention. The right people never make you feel like you are asking for too much simply by existing. — ${persona}`,
  };

  return {
    headline,
    subheading,
    verdictTag,
    grandMetaphor,
    realTimeReactions,
    metaphorSection,
    privateDialect,
    pairProfile,
    yelpReview,
    turningPoints,
    practicalAdvice,
    brutalityScore: 8.0,
    fullVerdict: `${grandMetaphor.intro}\n\n${grandMetaphor.roleReader}\n\n${grandMetaphor.roleOther}\n\n${grandMetaphor.dynamicSummary}`,
    theDynamic: {
      powerBalance: stats.balanceRating,
      analysis: metaphorSection.paragraphs.join('\n\n'),
      unspokenTruth: grandMetaphor.dynamicSummary,
    },
    theTurningPoint: {
      week: turningPoints.points?.[0]?.dateOrPeriod || turningWeek,
      whatChanged: turningPoints.points?.[0]?.whatHappened || 'Rhythm shifted',
      transcriptEvidence: turningPoints.points?.[0]?.impact || 'Cadence reset',
    },
    memberDossiers: pairProfile.profiles.map((p) => ({
      name: p.name,
      roleTitle: p.roleTitle,
      roast: p.theFacade,
      diagnosis: p.theReality,
      telltaleHabit: p.signatureMove,
    })),
    privateGlossary: privateDialect.entries.map((e) => ({
      phraseOrSlang: e.term,
      frankDefinition: e.meaning,
      brandonDefinition: e.meaning,
      contextQuote: e.quote,
      subtextAnalysis: e.subtext,
    })),
    awardsAndSuperlatives: [
      {
        title: 'Master of Conversational Inertia',
        recipient: other,
        reason: `Holding the response cadence at an average of ${otherPace} minutes.`,
      },
      {
        title: 'The Unstoppable Engine',
        recipient: reader,
        reason: `Carrying ${readerShare}% of total words across the entire chat.`,
      },
    ],
    tacticalAdvice: {
      whatToSend: practicalAdvice.whatToText,
      whatToNeverDoAgain: practicalAdvice.whatToStopDoing,
      closingVerdict: practicalAdvice.brandonClosing,
    },
  };
}
