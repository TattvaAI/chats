import { z } from 'zod';

export const FreePreviewSchema = z.object({
  headline: z.string().describe('Catchy, shocking editorial headline summarizing the whole situation'),
  subheading: z.string().describe('Subheadline that cuts right to the chase'),
  verdictTag: z.string().describe('A 2-4 word ruthless label, e.g., "Emotionally Bankrupt" or "Perjury Trial"'),
  brutalityScore: z.number().min(1).max(10).describe('Score from 1.0 to 10.0 rating how harsh the reality is'),
  teaserVerdict: z.string().describe('The first 2-3 paragraphs of Frank\'s honest evaluation that cuts deep and hooks the user'),
  previewHighlights: z.array(z.string()).describe('3-5 bullet points highlighting shocking forensic facts discovered in the chat'),
  lockedSections: z.array(z.string()).describe('List of section titles in the dossier'),
});

export type FreePreview = z.infer<typeof FreePreviewSchema>;

export const RatingMetricSchema = z.object({
  label: z.string().describe('Satirical rating name, e.g. "Emotional Availability", "Audacity Index", "Diet Discipline"'),
  score: z.number().min(0).max(5).describe('Score from 0.0 to 5.0'),
  note: z.string().optional().describe('Short caustic comment on why they received this score'),
});

export const MemberDossierSchema = z.object({
  name: z.string(),
  roleTitle: z.string().describe('Satirical title, e.g., "Minister of Interior & Weather Alerts" or "Chief Ghosting Officer"'),
  emblematicQuote: z.string().optional().describe('Their most telling quote from the transcripts'),
  roast: z.string().describe('A brutally witty, multi-paragraph roast grounded in their actual texting habits'),
  diagnosis: z.string().describe('What they are actually doing underneath the facade—attachment style, avoidance, or performance'),
  ratingLabel: z.string().optional().describe('Legacy single rating category'),
  ratingScore: z.number().min(0).max(5).optional().describe('Legacy rating score'),
  ratings: z.array(RatingMetricSchema).optional().describe('Detailed scorecard with 3-4 distinct forensic ratings'),
  telltaleHabit: z.string().optional().describe('Their signature conversational tell, e.g. "Answers 3 questions with 1 thumbs-up"'),
  redFlags: z.array(z.string()).optional().describe('2-3 specific behavioral red flags'),
});

export const GlossaryItemSchema = z.object({
  phraseOrSlang: z.string().describe('Inside joke, recurring catchphrase, slang, or passive-aggressive phrase from the chat'),
  frankDefinition: z.string().optional().describe('What it actually means or what Frank thinks of it'),
  brandonDefinition: z.string().optional().describe('Backwards compatible field for definition'),
  contextQuote: z.string().describe('A brief quote showing when and how it was used in the chat'),
  subtextAnalysis: z.string().optional().describe('The unspoken psychological translation of this phrase'),
});

export const AwardSchema = z.object({
  title: z.string().describe('Mock award name, e.g., "Most Likely to Leave You on Delivered for 18 Hours"'),
  recipient: z.string(),
  reason: z.string().describe('The evidence and forensic reasoning behind the award'),
  quoteCitation: z.string().optional().describe('Direct quote proving the award'),
});

export const TimelinePhaseSchema = z.object({
  phaseTitle: z.string().describe('Title of phase, e.g. "Phase 1: The Dopamine Ping-Pong" or "Phase 3: The Slow Fade"'),
  timeframe: z.string().describe('Dates/weeks corresponding to this phase'),
  vibe: z.string().describe('One-line summary of energy, e.g. "Equal response times, rapid-fire memes, high mutual investment"'),
  description: z.string().describe('Detailed breakdown of what was actually happening during this period'),
});

export const FullReportSchema = z.object({
  headline: z.string().describe('Editorial headline summarizing the entire dynamic'),
  subheading: z.string().describe('Cutting, witty summary subhead'),
  verdictTag: z.string().describe('Ruthless categorical label'),
  brutalityScore: z.number().min(1).max(10),
  fullVerdict: z.string().describe('Comprehensive 4-6 paragraph deep-dive forensic verdict from Frank, structured with depth and literary wit'),
  theDynamic: z.object({
    powerBalance: z.string().describe('e.g. "82% Clara / 18% Lucas" or "Three People Carrying Two Deadweights"'),
    emotionalLaborCarrier: z.string().optional().describe('Name of the person carrying the emotional and logistical momentum'),
    tempoController: z.string().optional().describe('Name of the person who controls the conversational temperature'),
    analysis: z.string().describe('In-depth breakdown of who cares more, who controls the tempo, who pretends not to care, and the effort gap'),
    unspokenTruth: z.string().describe('The elephant in the room nobody in the chat will admit out loud'),
    doubleTextDiagnosis: z.string().optional().describe('Analysis of who sends multiple texts in silence and what it reveals'),
  }),
  timeline: z.array(TimelinePhaseSchema).optional().describe('Chronological phases showing the evolution of the chat dynamic'),
  theTurningPoint: z.object({
    week: z.string().describe('The exact week/month everything changed, e.g. "Week of September 23, 2024"'),
    dropPercentage: z.string().optional().describe('e.g. "72% drop in initiative, 4x latency increase"'),
    whatChanged: z.string().describe('Forensic description of what occurred before vs after this moment'),
    transcriptEvidence: z.string().describe('Direct quotes illustrating the shift'),
    pivotalExchanges: z.array(z.string()).optional().describe('2-3 specific quotes with timestamps marking the turn'),
  }),
  memberDossiers: z.array(MemberDossierSchema).describe('Detailed dossier on each participant'),
  privateGlossary: z.array(GlossaryItemSchema).describe('Forensic glossary decoding inside slang, emojis, and passive-aggressive habits'),
  awardsAndSuperlatives: z.array(AwardSchema).describe('Satirical superlative awards'),
  tacticalAdvice: z.object({
    whatToSend: z.string().describe('Frank\'s exact recommended next text message (or strict instructions to send nothing)'),
    rulesOfEngagement: z.array(z.string()).optional().describe('3-4 strict rules to follow going forward'),
    whatToNeverDoAgain: z.string().describe('Habits, excuses, or double-texting to immediately cease'),
    closingVerdict: z.string().describe('Frank\'s definitive final parting words'),
  }),
});

export type FullReport = z.infer<typeof FullReportSchema>;
