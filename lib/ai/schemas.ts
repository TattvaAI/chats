import { z } from 'zod';

// Chat speech bubble schema
export const ChatBubbleQuoteSchema = z.object({
  messageId: z.string().optional().describe('Exact source messageId from the transcript'),
  at: z.string().optional().describe('Source timestamp, populated by the server'),
  sender: z.string().describe('Sender of the text message'),
  text: z.string().describe('Verbatim message text (including emojis)'),
});
export type ChatBubbleQuote = z.infer<typeof ChatBubbleQuoteSchema>;

// Scene reaction in "Frank Reacts: Reading This in Real Time"
export const RealTimeReactionSceneSchema = z.object({
  number: z.number().describe('Scene number (1, 2, 3...)'),
  title: z.string().describe('A short, playful title grounded in the quoted exchange'),
  narrative: z.string().describe('Setting the scene with specific dates, context, and what Frank observed'),
  quotes: z.array(ChatBubbleQuoteSchema).describe('Verbatim message lines to be rendered as speech bubbles'),
  reaction: z.string().describe("Frank's warm, witty reaction to the observable exchange, with interpretations framed as possibilities"),
});
export type RealTimeReactionScene = z.infer<typeof RealTimeReactionSceneSchema>;

// Metaphor Section
export const MetaphorSectionSchema = z.object({
  emoji: z.string().default('🎪'),
  title: z.string().describe('Metaphor section title (e.g. "The Safety Net and the Smoke Alarm")'),
  tagline: z.string().describe('One bold thematic sentence summarizing the core situation'),
  paragraphs: z.array(z.string()).describe('3-5 rich, warm, deeply perceptive paragraphs exploring what is happening without clinical jargon'),
});
export type MetaphorSection = z.infer<typeof MetaphorSectionSchema>;

// Dialect item
export const DialectItemSchema = z.object({
  messageId: z.string().optional().describe('Exact source messageId for this quote'),
  term: z.string().describe('Inside joke, nickname, repeated slang, Hinglish/local phrase, or coded word'),
  meaning: z.string().describe('What it literally or functionally means'),
  subtext: z.string().describe('A possible reading supported by the exchange, without claiming hidden feelings'),
  quote: z.string().describe('Verbatim quote demonstrating its usage'),
});
export type DialectItem = z.infer<typeof DialectItemSchema>;

// Linguistic Decoding Section
export const PrivateDialectSchema = z.object({
  emoji: z.string().default('🔍'),
  title: z.string().default('Your private language'),
  intro: z.string().describe('Introductory commentary on how their private vocabulary works'),
  entries: z.array(DialectItemSchema).describe('3-6 decoded terms and inside jokes'),
});
export type PrivateDialect = z.infer<typeof PrivateDialectSchema>;

// Participant Portrait
export const PairProfileItemSchema = z.object({
  name: z.string(),
  roleTitle: z.string().describe('Character title (e.g. "The Reluctant Vampire", "The Overthinking Softie")'),
  theFacade: z.string().describe('How this participant presents themselves in the messages'),
  theReality: z.string().describe('What their repeated messages support; separate observations from uncertain interpretations'),
  signatureMove: z.string().describe('A distinctive texting habit observable in the transcript'),
  vulnerabilityTell: z.string().describe('An observable way they discuss uncertainty or care, or an honest statement that evidence is limited'),
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
  title: z.string().describe('A playful review title using the supplied participant names'),
  stars: z.number().min(1).max(5).default(4),
  ambiance: z.string().describe('The emotional atmosphere and environment they build together'),
  service: z.string().describe('Responsiveness, attentiveness, and who is serving whom'),
  menu: z.string().describe('What is on offer (banter, late-night crises, reels, selective silence)'),
  verdict: z.string().describe("Frank's final Yelp summary verdict"),
});
export type YelpReview = z.infer<typeof YelpReviewSchema>;

// Turning Points
export const TurningPointMomentSchema = z.object({
  dateOrPeriod: z.string().describe('Specific date or timeframe (e.g. "Around April 14th", "May 7th")'),
  momentTitle: z.string().describe('Title of the turning point'),
  whatHappened: z.string().describe('What visibly changed in the quoted exchange'),
  keyExchange: z.array(ChatBubbleQuoteSchema).optional().describe('Key quote exchange during this moment'),
  impact: z.string().describe('What the available messages show afterward; do not assume a permanent change'),
});
export type TurningPointMoment = z.infer<typeof TurningPointMomentSchema>;

export const TurningPointsSectionSchema = z.object({
  emoji: z.string().default('🕰️'),
  title: z.string().default('The Turning Points'),
  points: z.array(TurningPointMomentSchema).describe('2-4 notable changes supported by specific messages'),
});
export type TurningPointsSection = z.infer<typeof TurningPointsSectionSchema>;

// Practical Advice
export const PracticalAdviceSchema = z.object({
  emoji: z.string().default('🎟️'),
  title: z.string().default('The Advice'),
  directTake: z.string().describe("Frank's direct, warm, loving advice addressing the reader by first name"),
  whatToText: z.string().describe('The exact recommended text message to send (or strict directive to send nothing)'),
  whatToStopDoing: z.string().describe('One practical adjustment supported by observed texting habits; do not infer the contents or motives of deleted messages'),
  brandonClosing: z.string().describe("Frank's witty, memorable closing parting line"),
});
export type PracticalAdvice = z.infer<typeof PracticalAdviceSchema>;

// Grand Metaphor Introduction
export const GrandMetaphorSchema = z.object({
  intro: z.string().describe('Direct address to reader by name setting the extended central metaphor'),
  roleReader: z.string().describe('The role the reader plays, quoting their specific quirks and lines'),
  roleOther: z.string().describe('The role the other person plays, quoting their specific quirks and lines'),
  dynamicSummary: z.string().describe('A plain-language summary of recurring exchanges, without invented numerical breakdowns'),
  closingPunchline: z.string().describe('Short hook into the report (e.g. "Let\'s unpack the whole thing.")'),
});
export type GrandMetaphor = z.infer<typeof GrandMetaphorSchema>;

// Free Preview Schema (Unlocked Preview / Overview)
export const FreePreviewSchema = z.object({
  headline: z.string().describe('Editorial headline summarizing the whole situation (e.g. "The Comedy Club Built Over an Open Heart")'),
  subheading: z.string().describe('Subheadline cutting right to the chase'),
  verdictTag: z.string().describe('A 2-4 word theme label (e.g. "High-Stakes Theater", "Standby Mode")'),
  grandMetaphor: GrandMetaphorSchema.optional(),
  teaserVerdict: z.string().describe("Frank's opening verdict that hooks the reader with direct address"),
  previewHighlights: z.array(z.string()).describe('3-5 key observations or numbers from the chat'),
  lockedSections: z.array(z.string()).default([
    'Frank Reacts: Reading This in Real Time 🎬',
    'The Metaphor 🎪',
    'Linguistic Decoding: Your Private Dialect 🔍',
    'Profile of the Pair 🪞',
    'The Yelp Review ⭐',
    'The Turning Points 🕰️',
    'The Advice 🎟️',
  ]),
});
export type FreePreview = z.infer<typeof FreePreviewSchema>;

// Comprehensive Frank Report Schema
export const FrankReportSchema = z.object({
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
  brutalityScore: z.number().optional(),
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

export type FrankReport = z.infer<typeof FrankReportSchema>;

// Backward compatibility aliases
export type BrandonReport = FrankReport;
export type FullReport = FrankReport;
export const BrandonReportSchema = FrankReportSchema;
export const FullReportSchema = FrankReportSchema;
