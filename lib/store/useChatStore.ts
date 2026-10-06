import { create } from 'zustand';
import type { ParsedMessage } from '../parser/whatsapp';
import type { ChatForensicStats } from '../forensics/metrics';
import type { TurningPointResult } from '../forensics/turning-point';
import { computeDetailedStats, type DetailedStats } from '../forensics/detailed-stats';

export type ChatCategory = 'romantic' | 'friends_group' | 'friend' | 'family' | 'work' | 'other';
export type ChatSource = 'whatsapp' | 'imessage';
export type ReportLanguage = 'en' | 'fr' | 'es';

interface Draft {
  conversationId: string;
  deleteToken: string | null;
  category: ChatCategory;
  source: ChatSource;
  userNote: string;
  rawText: string;
  fileName: string;
  parsedMessages: ParsedMessage[];
  stats: ChatForensicStats | null;
  detailedStats: DetailedStats | null;
  turningPoint: TurningPointResult | null;
  reportLanguage: ReportLanguage;
  myName: string;
  nameMap: Record<string, string>;
}

interface ChatState extends Draft {
  setConversationId: (id: string) => void;
  setDeleteToken: (token: string | null) => void;
  ensureReportIdentity: () => string;
  setCategory: (category: ChatCategory) => void;
  setSource: (source: ChatSource) => void;
  setUserNote: (note: string) => void;
  setUploadedChat: (fileName: string, rawText: string) => void;
  setParsedData: (messages: ParsedMessage[], stats: ChatForensicStats | null, turningPoint: TurningPointResult | null) => void;
  setReportLanguage: (language: ReportLanguage) => void;
  setMyName: (name: string) => void;
  setNameMap: (map: Record<string, string>) => void;
  setNameAlias: (raw: string, alias: string) => void;
  cleanName: (raw: string) => string;
  reset: () => void;
}

const emptyDraft = (): Draft => ({
  conversationId: '', deleteToken: null, category: 'romantic', source: 'whatsapp',
  userNote: '', rawText: '', fileName: '', parsedMessages: [], stats: null,
  detailedStats: null, turningPoint: null, reportLanguage: 'en', myName: '', nameMap: {},
});

export function cleanName(raw: string, nameMap?: Record<string, string>): string {
  if (!raw) return '';
  const alias = nameMap && Object.prototype.hasOwnProperty.call(nameMap, raw) ? nameMap[raw] : undefined;
  return typeof alias === 'string' && alias.trim() ? alias.trim() : raw.trim();
}

/** Only the current upload draft lives here. Saved reports are always fetched with server authorization. */
export const useChatStore = create<ChatState>((set, get) => ({
  ...emptyDraft(),
  setConversationId: conversationId => set({ conversationId }),
  setDeleteToken: deleteToken => set({ deleteToken }),
  ensureReportIdentity: () => {
    const existing = get().conversationId;
    if (existing) return existing;
    // Weak/random fallback identities would make retry and access guarantees unsafe.
    const id = crypto.randomUUID();
    set({ conversationId: id });
    return id;
  },
  setCategory: category => set({ category }),
  setSource: source => set({ source }),
  setUserNote: userNote => set({ userNote }),
  setUploadedChat: (fileName, rawText) => {
    const { category, source } = get();
    set({ ...emptyDraft(), category, source, fileName, rawText });
  },
  setParsedData: (parsedMessages, stats, turningPoint) => {
    const detailedStats = stats && parsedMessages.length ? computeDetailedStats(parsedMessages, stats) : null;
    set({ parsedMessages, stats, turningPoint, detailedStats });
  },
  setReportLanguage: reportLanguage => set({ reportLanguage }),
  setMyName: myName => set({ myName }),
  setNameMap: nameMap => set({ nameMap: { ...nameMap } }),
  setNameAlias: (raw, alias) => set(state => ({ nameMap: { ...state.nameMap, [raw]: alias } })),
  cleanName: raw => cleanName(raw, get().nameMap),
  reset: () => set(emptyDraft()),
}));
