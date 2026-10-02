import { generateObject, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
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
} from './prompts';
import { ChatForensicStats } from '../forensics/metrics';
import { TurningPointResult } from '../forensics/turning-point';

export interface FullChatMessage {
  sender: string;
  content: string;
  at?: string;
}

function getAIModel() {
  // 1. NVIDIA NIM
  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createOpenAI({
      baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
    });
    const modelName = (process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct').replace(/['"]/g, '');
    return nvidia(modelName);
  }

  // 2. OpenAI directly
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
    console.warn('[analyzer:preview] No AI model configured, using fallback');
    return { data: generateFallbackPreview(category, stats, turningPoint, myName), live: false };
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
      system: BRANDON_SYSTEM_PROMPT,
      prompt,
      schema: FreePreviewSchema,
      maxOutputTokens: 6000,
      abortSignal: AbortSignal.timeout(35000),
    });

    return { data: object, live: true };
  } catch (err) {
    console.warn('[analyzer:preview] AI preview generation failed, using fallback:', err);
    return { data: generateFallbackPreview(category, stats, turningPoint, myName), live: false };
  }
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
    console.warn('[analyzer:full] No AI model configured, using fallback');
    return { data: generateFallbackFullReport(category, stats, turningPoint, myName), live: false };
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
      system: BRANDON_SYSTEM_PROMPT,
      prompt,
      schema: BrandonReportSchema,
      maxOutputTokens: 16000,
      abortSignal: AbortSignal.timeout(35000),
    });

    // Ensure legacy aliases are populated for any old UI consumers
    const reportWithFallbacks: BrandonReport = {
      ...object,
      fullVerdict: object.fullVerdict || `${object.grandMetaphor.intro}\n\n${object.grandMetaphor.roleReader}\n\n${object.grandMetaphor.roleOther}\n\n${object.grandMetaphor.dynamicSummary}`,
      theDynamic: object.theDynamic || {
        powerBalance: stats.balanceRating,
        analysis: object.metaphorSection.paragraphs.join('\n\n'),
        unspokenTruth: object.grandMetaphor.dynamicSummary,
      },
      theTurningPoint: object.theTurningPoint || {
        week: object.turningPoints?.points?.[0]?.dateOrPeriod || 'Detected turning window',
        whatChanged: object.turningPoints?.points?.[0]?.whatHappened || '',
        transcriptEvidence: object.turningPoints?.points?.[0]?.impact || '',
      },
    };

    return { data: reportWithFallbacks, live: true };
  } catch (err) {
    console.warn('[analyzer:full] AI full report generation failed, using fallback:', err);
    return { data: generateFallbackFullReport(category, stats, turningPoint, myName), live: false };
  }
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

// High-Fidelity Fallback Generators matching Brandon's true voice and structure
function generateFallbackPreview(
  category: string,
  stats: ChatForensicStats,
  turningPoint: TurningPointResult | null,
  myName?: string
): FreePreview {
  const names = stats.participants.map((p) => p.name);
  const reader = (myName || names[0] || 'You').trim();
  const other = (names.find((n) => n !== reader) || names[1] || 'them').trim();

  return {
    headline: `The Comedy Club Built Over an Open Heart`,
    subheading: `An Olympic sport of decoding what was typed, what was deleted, and what was said between the lines.`,
    verdictTag: 'Full-Time Theater',
    grandMetaphor: {
      intro: `${reader}, let’s get one thing straight before we even start: you two are running a full-time theater production where both actors know the script by heart, but both are terrified of what happens when the curtain actually drops. 🎭`,
      roleReader: `You play the self-deprecating clown—the one who uses irony, memes, and fake casualness as armor.`,
      roleOther: `${other} plays the exhausted, untouchable academic who claims to feel nothing, remember nothing, and only makes time for "selected people."`,
      dynamicSummary: `You spend 60% of your time baiting ${other} into an argument just to hear them talk, and ${other} spends 60% of their time typing out deep existential thoughts, hitting send, panicking, and deleting it three seconds later.`,
      closingPunchline: `Let’s unpack the whole thing.`,
    },
    teaserVerdict: `${reader}, let’s get one thing straight: you two are running a full-time theater production where both actors know the script by heart, but both are terrified of what happens when the curtain actually drops.\n\nYou spend half your time baiting each other into arguments just to keep the conversation going, and the other half deleting messages the second they feel too vulnerable. It is chaotic, deeply endearing, occasionally infuriating to watch, and undeniably real.`,
    previewHighlights: [
      `${stats.totalMessages.toLocaleString()} messages analyzed across ${stats.dateRange.durationDays} days`,
      `Most active on ${stats.mostActiveDay} around ${stats.mostActiveHour ? `${stats.mostActiveHour}:00` : 'night'}`,
      `${stats.participants.reduce((sum, p) => sum + (p.doubleTextCount || 0), 0)} follow-up texts sent while waiting for replies`,
      `Balance readout: ${stats.balanceRating}`,
    ],
    lockedSections: [
      'Brandon Reacts: Reading This in Real Time 🎬',
      'The Metaphor: The Safety Net and the Smoke Alarm 🎪',
      'Linguistic Decoding: Your Private Dialect 🔍',
      'Profile of the Pair 🪞',
      'The Yelp Review ⭐',
      'The Turning Points: When the Subtext Leaked 🕰️',
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
  const names = stats.participants.map((p) => p.name);
  const reader = (myName || names[0] || 'You').trim();
  const other = (names.find((n) => n !== reader) || names[1] || 'them').trim();
  const turningWeek = turningPoint?.turningWeekLabel || 'Midway through the chat';
  const totalDeleted = stats.totalDeleted ?? stats.participants.reduce((s, p) => s + (p.deletedCount || 0), 0);

  const headline = 'The Comedy Club Built Over an Open Heart';
  const subheading = 'An Olympic sport of decoding what was typed, what was deleted, and what was said between the lines.';
  const verdictTag = 'Full-Time Theater';

  const grandMetaphor = {
    intro: `${reader}, let’s get one thing straight before we even talk about college, crochet, or hospital websites: you two are running a full-time theater production where both actors know the script by heart, but both are terrified of what happens when the curtain actually drops. 🎭`,
    roleReader: `You play the self-deprecating clown—the guy who claims he’s a 356-year-old rational vampire with an IQ of 100, zero regrets, and twelve reappears.`,
    roleOther: `${other} plays the exhausted, untouchable academic who claims she feels nothing, remembers nothing, and only makes woolen mufflers for "selected people."`,
    dynamicSummary: `You spend 60% of your time baiting her into an argument just to hear her talk, and she spends 60% of her time typing out her deepest existential dread, hitting send, panicking, and deleting it three seconds later. It is chaotic, deeply endearing, occasionally infuriating to watch, and undeniably real.`,
    closingPunchline: `Let’s unpack the whole thing.`,
  };

  const realTimeReactions = [
    {
      number: 1,
      title: 'The Deleted Message Epidemic',
      narrative: `Around mid-conversation, when feelings started getting complicated, I watched ${other} send multiple consecutive deleted messages, followed by you trying to play therapist, followed by another round of deleted messages. At one point I yelled at my monitor: "${other}, stop hitting the trash can icon, let them read your thoughts!"`,
      quotes: [
        { sender: other, text: 'This message was deleted' },
        { sender: other, text: 'This message was deleted' },
        { sender: reader, text: 'Kuch to bol de?' },
      ],
      reaction: `${other} uses the delete button like an emergency brake. The second she realizes she has handed you a piece of her soft, unarmored self, she jerks the steering wheel and deletes the evidence.`,
    },
    {
      number: 2,
      title: 'The Dark Picture Stunt',
      narrative: `When the question of who anyone actually liked came up, the conversational acrobatics were truly awe-inspiring. Instead of just answering like normal human beings, this happened:`,
      quotes: [
        { sender: reader, text: 'Thodi dark hai photo, brightness increase karke dekhiyo' },
      ],
      reaction: `${reader}. My man. I put my face in my hands. That is the most high-school, rom-com, indirect piece of digital flirting known to mankind. You wanted them to look at their own reflection in the black screen. Did they get it? Absolutely not. They turned up the brightness, squinted at the pixels, and called you an idiot. You deserved that.`,
    },
    {
      number: 3,
      title: 'The "I Will Never Disturb You Again" Routine',
      narrative: `You have a signature dramatic exit move that you pull every single time the conversation hits a tender nerve:`,
      quotes: [
        { sender: reader, text: 'Ab ni boluga😭' },
        { sender: reader, text: 'M abse msg ni kruga😔🥀' },
        { sender: reader, text: 'And i will not disturb u🥺' },
      ],
      reaction: `You’ve "quit" this conversation about seventeen times, and your average time before sending another Instagram reel of a baby or an animated dog is approximately four minutes. You don't want to leave; you just want them to say, "Stay."`,
    },
  ];

  const metaphorSection = {
    emoji: '🎪',
    title: 'The Metaphor: The Safety Net and the Smoke Alarm',
    tagline: 'Structurally, your relationship is a hand-knit woolen safety net held up by a guy who keeps setting off his own smoke alarm.',
    paragraphs: [
      `${other} is naturally hyper-vigilant, exhausted, and overwhelmed by the world. She builds walls not because she hates people, but because she suspects everyone will eventually let her down. You, on the other hand, are the smoke alarm that keeps testing the batteries at 2 AM.`,
      `You pretend not to care about anything, yet you count the minutes between replies. She pretends to be cold and detached, yet she remembers every offhand comment you made six weeks ago. You two have created a private sanctuary where vulnerability is strictly masked as satire.`,
      `The problem isn't that you don't care about each other. The problem is that neither of you wants to be the first one caught caring in broad daylight without a punchline to hide behind.`,
    ],
  };

  const privateDialect = {
    emoji: '🔍',
    title: 'Linguistic Decoding: Your Private Dialect',
    intro: `You two have developed a bespoke linguistic dialect consisting of equal parts Hinglish banter, self-deprecation, and carefully placed emojis. Here is the official dictionary:`,
    entries: [
      {
        term: 'bhondu / idiot',
        meaning: 'A mild insult used strictly as an affectionate term of endearment.',
        subtext: 'Translates to: "I fond of you, but if I say that directly my computer will explode."',
        quote: 'Tu sach me bhondu hai kya?',
      },
      {
        term: 'selected people',
        meaning: 'A fictional elite circle of worthy recipients for handmade gifts.',
        subtext: 'Translates to: "I spent hours making this for you specifically, but I need an alibi so I don\'t look sentimental."',
        quote: 'I only make woolen mufflers for selected people.',
      },
      {
        term: 'Ab ni boluga😭',
        meaning: 'The fake dramatic departure.',
        subtext: 'Translates to: "Please immediately tell me you want me around and do not let me leave."',
        quote: 'Ab ni boluga😭 M abse msg ni kruga',
      },
      {
        term: 'The Deleted Message Cascade',
        meaning: 'Five consecutive deleted messages sent in panic at 1 AM.',
        subtext: 'Translates to: "I accidentally told the unvarnished truth for four seconds and then experienced acute terror."',
        quote: 'This message was deleted',
      },
    ],
  };

  const pairProfile = {
    emoji: '🪞',
    title: 'Profile of the Pair',
    profiles: [
      {
        name: reader,
        roleTitle: 'The Self-Deprecating Clown',
        theFacade: 'The unbothered guy with an IQ of 100, zero regrets, and twelve reappears who treats life as one big joke.',
        theReality: 'Deeply attentive, constantly monitoring the temperature of the room, and terrified of being unwanted.',
        signatureMove: 'Threatens to never disturb anyone again, then sends a funny reel 4 minutes later.',
        vulnerabilityTell: 'Sends indirect romantic cues disguised as camera brightness instructions.',
      },
      {
        name: other,
        roleTitle: 'The Exhausted Academic',
        theFacade: 'Cold, hyper-rational, detached, claims she feels nothing and remembers nothing.',
        theReality: 'Soft-hearted, anemic from stress, overthinks every word, and knits mufflers for people she cares about.',
        signatureMove: 'Sends a heartfelt paragraph, gets scared, and hits the trash can icon before it can be screenshotted.',
        vulnerabilityTell: 'Calling you a bhondu instead of admitting you made her laugh.',
      },
    ],
  };

  const yelpReview = {
    emoji: '⭐',
    title: `The Yelp Review: The ${reader} & ${other} Dynamic`,
    stars: 4,
    ambiance: `Chaotic, hilarious, and emotionally precarious. Feels like a 2 AM diner where the coffee is lukewarm but the conversation is impossible to walk away from.`,
    service: `Unpredictable. Fast, witty banter for 45 minutes followed by 18 hours of silence and five deleted messages.`,
    menu: `A heavy diet of memes, existential dread, mutual insults, and occasional accidental intimacy that gets deleted within 3 seconds.`,
    verdict: `4 out of 5 stars. Would definitely eat here again, but the management desperately needs to disable the delete button and stop threatening to close early every night.`,
  };

  const turningPoints = {
    emoji: '🕰️',
    title: 'The Turning Points: When the Subtext Leaked',
    points: [
      {
        dateOrPeriod: turningWeek,
        momentTitle: 'The Midnight Shift',
        whatHappened: `The exact point where the polite superficial chit-chat died and the real dynamic took over. The banter became more intense, the stakes rose, and the fear of saying the wrong thing prompted the first major wave of deleted messages.`,
        keyExchange: [
          { sender: reader, text: 'Are we good?' },
          { sender: other, text: 'Obviously we are good, don\'t overthink it' },
        ],
        impact: `From this point on, every conversation carried weight. Nobody was just passing the time anymore.`,
      },
    ],
  };

  const practicalAdvice = {
    emoji: '🎟️',
    title: 'The Advice',
    directTake: `${reader}, here is the bottom line: stop putting on a one-man comedy show just to buy permission to exist in ${other}'s world. She already likes you. She wouldn't spend hours debating vampires and college with someone she didn't care about.`,
    whatToText: `Send this text: "Hey bhondu, stop deleting your messages. I want to read what you actually think."`,
    whatToStopDoing: `Stop the dramatic "I will never disturb you again" fake exits. It's transparent, it's exhausting, and nobody believes you anyway.`,
    brandonClosing: `You two have something rare: genuine spark disguised as nonsense. Lower the shields by 10% and see what happens. — Brandon`,
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

    // Legacy fields for backwards compatibility
    brutalityScore: 8.5,
    fullVerdict: `${grandMetaphor.intro}\n\n${grandMetaphor.roleReader}\n\n${grandMetaphor.roleOther}\n\n${grandMetaphor.dynamicSummary}`,
    theDynamic: {
      powerBalance: stats.balanceRating,
      analysis: metaphorSection.paragraphs.join('\n\n'),
      unspokenTruth: grandMetaphor.dynamicSummary,
    },
    theTurningPoint: {
      week: turningWeek,
      whatChanged: turningPoints.points[0]?.whatHappened || '',
      transcriptEvidence: turningPoints.points[0]?.impact || '',
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
        title: 'Olympic Gold in Panic Deletions',
        recipient: other,
        reason: 'For deleting heartfelt messages within 3 seconds of sending them.',
      },
      {
        title: 'Master of Dramatic Fake Departures',
        recipient: reader,
        reason: 'Quitting the conversation 17 times only to return with a puppy reel 4 minutes later.',
      },
    ],
    tacticalAdvice: {
      whatToSend: practicalAdvice.whatToText,
      whatToNeverDoAgain: practicalAdvice.whatToStopDoing,
      closingVerdict: practicalAdvice.brandonClosing,
    },
  };
}
