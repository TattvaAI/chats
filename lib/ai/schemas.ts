import { z } from 'zod';

// Chat speech bubble schema
export const ChatBubbleQuoteSchema = z.object({
  sender: z.string().describe('Sender of the text message'),
  text: z.string().describe('Verbatim message text (including emojis)'),
});
export type ChatBubbleQuote = z.infer<typeof ChatBubbleQuoteSchema>;

// Scene reaction in "Brandon Reacts: Reading This in Real Time"
export const RealTimeReactionSceneSchema = z.object({
  number: z.number().describe('Scene number (1, 2, 3...)'),
  title: z.string().describe('Catchy scene title (e.g. "The Deleted Message Epidemic", "The Dark Picture Stunt")'),
  narrative: z.string().describe('Setting the scene with specific dates, context, and what Brandon observed'),
  quotes: z.array(ChatBubbleQuoteSchema).describe('Verbatim message lines to be rendered as speech bubbles'),
  reaction: z.string().describe("Brandon's honest, hilarious, human reaction (e.g. facepalm, yelling at screen, decoding defense mechanism)"),
});
export type RealTimeReactionScene = z.infer<typeof RealTimeReactionSceneSchema>;

// Metaphor Section
export const MetaphorSectionSchema = z.object({
  emoji: z.string().default('🎪'),
  title: z.string().describe('Metaphor section title (e.g. "The Safety Net and the Smoke Alarm")'),
  tagline: z.string().describe('One bold thematic sentence summarizing the core dynamic'),
  paragraphs: z.array(z.string()).describe('3-5 rich, warm, deeply perceptive paragraphs exploring the dynamic without clinical jargon'),
});
export type MetaphorSection = z.infer<typeof MetaphorSectionSchema>;

// Dialect item
export const DialectItemSchema = z.object({
  term: z.string().describe('Inside joke, nickname, repeated slang, Hinglish/local phrase, or coded word'),
  meaning: z.string().describe('What it literally or functionally means'),
  subtext: z.string().describe('What it actually signals emotionally (affection, panic, deflecting, intimacy)'),
  quote: z.string().describe('Verbatim quote demonstrating its usage'),
});
export type DialectItem = z.infer<typeof DialectItemSchema>;

// Linguistic Decoding Section
export const PrivateDialectSchema = z.object({
  emoji: z.string().default('🔍'),
  title: z.string().default('Linguistic Decoding: Your Private Dialect'),
  intro: z.string().describe('Introductory commentary on how their private vocabulary works'),
  entries: z.array(DialectItemSchema).describe('3-6 decoded terms and inside jokes'),
});
export type PrivateDialect = z.infer<typeof PrivateDialectSchema>;

// Participant Portrait
export const PairProfileItemSchema = z.object({
  name: z.string(),
  roleTitle: z.string().describe('Character title (e.g. "The Reluctant Vampire", "The Overthinking Softie")'),
  theFacade: z.string().describe('The character/mask they present in the chat'),
  theReality: z.string().describe('Who they actually are underneath'),
  signatureMove: z.string().describe('Their signature texting habit or emergency tell'),
  vulnerabilityTell: z.string().describe('How they secretly signal care or emotion without admitting it'),
});
export type PairProfileItem = z.infer<typeof PairProfileItemSchema>;

export const PairProfileSchema = z.object({
  emoji: z.string().default('🪞'),
  title: z.string().default('Profile of the Pair'),
  profiles: z.array(PairProfileItemSchema).describe('Character breakdown for each participant'),
});
export type PairProfile = z.infer<typeof PairProfileSchema>;

// Yelp Review Format
export const YelpReviewSchema = z.object({
  emoji: z.string().default('⭐'),
  title: z.string().describe('e.g. "The Yelp Review: The Shivansh & Bhawna Dynamic"'),
  stars: z.number().min(1).max(5).default(4),
  ambiance: z.string().describe('The emotional atmosphere and environment they build together'),
  service: z.string().describe('Responsiveness, attentiveness, and who is serving whom'),
  menu: z.string().describe('What is on offer (banter, late-night crises, reels, selective silence)'),
  verdict: z.string().describe("Brandon's final Yelp summary verdict"),
});
export type YelpReview = z.infer<typeof YelpReviewSchema>;

// Turning Points
export const TurningPointMomentSchema = z.object({
  dateOrPeriod: z.string().describe('Specific date or timeframe (e.g. "Around April 14th", "May 7th")'),
  momentTitle: z.string().describe('Title of the turning point'),
  whatHappened: z.string().describe('The story of what shifted and when the mask slipped'),
  keyExchange: z.array(ChatBubbleQuoteSchema).optional().describe('Key quote exchange during this moment'),
  impact: z.string().describe('How this permanently altered the chat rhythm'),
});
export type TurningPointMoment = z.infer<typeof TurningPointMomentSchema>;

export const TurningPointsSectionSchema = z.object({
  emoji: z.string().default('🕰️'),
  title: z.string().default('The Turning Points: When the Subtext Leaked'),
  points: z.array(TurningPointMomentSchema).describe('2-4 pivotal moments where subtext leaked'),
});
export type TurningPointsSection = z.infer<typeof TurningPointsSectionSchema>;

// Practical Advice
export const PracticalAdviceSchema = z.object({
  emoji: z.string().default('🎟️'),
  title: z.string().default('The Advice'),
  directTake: z.string().describe("Brandon's direct, warm, loving advice addressing the reader by first name"),
  whatToText: z.string().describe('The exact recommended text message to send (or strict directive to send nothing)'),
  whatToStopDoing: z.string().describe('Habits, excuses, dramatic exits, or panic deletions to immediately stop'),
  brandonClosing: z.string().describe("Brandon's witty, memorable closing parting line"),
});
export type PracticalAdvice = z.infer<typeof PracticalAdviceSchema>;

// Grand Metaphor Introduction
export const GrandMetaphorSchema = z.object({
  intro: z.string().describe('Direct address to reader by name setting the extended central metaphor'),
  roleReader: z.string().describe('The role the reader plays, quoting their specific quirks and lines'),
  roleOther: z.string().describe('The role the other person plays, quoting their specific quirks and lines'),
  dynamicSummary: z.string().describe('How they spend their time (e.g. 60% baiting into arguments, 60% deleting messages)'),
  closingPunchline: z.string().describe('Short hook into the report (e.g. "Let’s unpack the whole thing.")'),
});
export type GrandMetaphor = z.infer<typeof GrandMetaphorSchema>;

// Free Preview Schema (Unlocked Preview / Overview)
export const FreePreviewSchema = z.object({
  headline: z.string().describe('Editorial headline summarizing the whole situation (e.g. "The Comedy Club Built Over an Open Heart")'),
  subheading: z.string().describe('Subheadline cutting right to the chase'),
  verdictTag: z.string().describe('A 2-4 word theme label (e.g. "High-Stakes Theater", "Standby Mode")'),
  grandMetaphor: GrandMetaphorSchema.optional(),
  teaserVerdict: z.string().describe("Brandon's opening verdict that hooks the reader with direct address"),
  previewHighlights: z.array(z.string()).describe('3-5 key observations or numbers from the chat'),
  lockedSections: z.array(z.string()).default([
    'Brandon Reacts: Reading This in Real Time 🎬',
    'The Metaphor 🎪',
    'Linguistic Decoding: Your Private Dialect 🔍',
    'Profile of the Pair 🪞',
    'The Yelp Review ⭐',
    'The Turning Points 🕰️',
    'The Advice 🎟️',
  ]),
});
export type FreePreview = z.infer<typeof FreePreviewSchema>;

// Comprehensive Brandon Report Schema
export const BrandonReportSchema = z.object({
  headline: z.string().describe('Editorial headline (e.g. "The Comedy Club Built Over an Open Heart")'),
  subheading: z.string().describe('Witty, cutting summary subhead'),
  verdictTag: z.string().describe('Catchy categorical label'),
  grandMetaphor: GrandMetaphorSchema,
  realTimeReactions: z.array(RealTimeReactionSceneSchema).describe('3-4 real-time reaction scenes with quotes'),
  metaphorSection: MetaphorSectionSchema,
  privateDialect: PrivateDialectSchema,
  pairProfile: PairProfileSchema,
  yelpReview: YelpReviewSchema,
  turningPoints: TurningPointsSectionSchema,
  practicalAdvice: PracticalAdviceSchema,

  // Backwards-compatibility legacy fields
  brutalityScore: z.number().optional().default(8.5),
  fullVerdict: z.string().optional().describe('Legacy full verdict text'),
  theDynamic: z.object({
    powerBalance: z.string(),
    emotionalLaborCarrier: z.string().optional(),
    tempoController: z.string().optional(),
    analysis: z.string(),
    unspokenTruth: z.string(),
    doubleTextDiagnosis: z.string().optional(),
  }).optional(),
  timeline: z.array(z.object({
    phaseTitle: z.string(),
    timeframe: z.string(),
    vibe: z.string(),
    description: z.string(),
  })).optional(),
  theTurningPoint: z.object({
    week: z.string(),
    dropPercentage: z.string().optional(),
    whatChanged: z.string(),
    transcriptEvidence: z.string(),
    pivotalExchanges: z.array(z.string()).optional(),
  }).optional(),
  memberDossiers: z.array(z.object({
    name: z.string(),
    roleTitle: z.string(),
    emblematicQuote: z.string().optional(),
    roast: z.string(),
    diagnosis: z.string(),
    ratings: z.array(z.object({
      label: z.string(),
      score: z.number(),
      note: z.string().optional(),
    })).optional(),
    telltaleHabit: z.string().optional(),
    redFlags: z.array(z.string()).optional(),
  })).optional(),
  privateGlossary: z.array(z.object({
    phraseOrSlang: z.string(),
    frankDefinition: z.string().optional(),
    brandonDefinition: z.string().optional(),
    contextQuote: z.string(),
    subtextAnalysis: z.string().optional(),
  })).optional(),
  awardsAndSuperlatives: z.array(z.object({
    title: z.string(),
    recipient: z.string(),
    reason: z.string(),
    quoteCitation: z.string().optional(),
  })).optional(),
  tacticalAdvice: z.object({
    whatToSend: z.string(),
    rulesOfEngagement: z.array(z.string()).optional(),
    whatToNeverDoAgain: z.string(),
    closingVerdict: z.string(),
  }).optional(),
});

export type BrandonReport = z.infer<typeof BrandonReportSchema>;
export type FullReport = BrandonReport;
export const FullReportSchema = BrandonReportSchema;
