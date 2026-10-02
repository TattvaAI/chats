import { create } from 'zustand';
import { ParsedMessage } from '../parser/whatsapp';
import { ChatForensicStats } from '../forensics/metrics';
import { TurningPointResult } from '../forensics/turning-point';
import { FreePreview, FullReport } from '../ai/schemas';

export type ChatCategory =
  | 'romantic'
  | 'friends_group'
  | 'friend'
  | 'family'
  | 'work'
  | 'other';

export type ChatSource = 'whatsapp' | 'imessage';

export type ReportLanguage = 'en' | 'fr' | 'es';

interface ChatState {
  conversationId: string;
  deleteToken: string | null;
  category: ChatCategory;
  source: ChatSource;
  userNote: string;
  rawText: string;
  fileName: string;
  parsedMessages: ParsedMessage[];
  stats: ChatForensicStats | null;
  turningPoint: TurningPointResult | null;
  preview: FreePreview | null;
  fullReport: FullReport | null;
  aiLive: boolean | null;
  isAnalyzing: boolean;
  scanProgress: number;
  scanStage: string;
  isUnlocked: boolean;
  reportLanguage: ReportLanguage;
  myName: string;
  nameMap: Record<string, string>;
  email: string;
  lastEmail: string;

  setConversationId: (id: string) => void;
  setDeleteToken: (token: string | null) => void;
  ensureReportIdentity: () => string;
  persistToLocal: () => void;
  loadFromLocal: (id: string) => boolean;
  setCategory: (category: ChatCategory) => void;
  setSource: (source: ChatSource) => void;
  setUserNote: (note: string) => void;
  setUploadedChat: (fileName: string, rawText: string) => void;
  setParsedData: (
    messages: ParsedMessage[],
    stats: ChatForensicStats | null,
    turningPoint: TurningPointResult | null
  ) => void;
  setScanProgress: (progress: number, stage: string) => void;
  setPreview: (preview: FreePreview) => void;
  setFullReport: (report: FullReport) => void;
  setAiLive: (live: boolean | null) => void;
  unlockReport: () => void;
  setReportLanguage: (language: ReportLanguage) => void;
  setMyName: (name: string) => void;
  setNameMap: (map: Record<string, string>) => void;
  setNameAlias: (raw: string, alias: string) => void;
  cleanName: (raw: string) => string;
  setEmail: (email: string) => void;
  reset: () => void;
}

export function cleanName(raw: string, nameMap?: Record<string, string>): string {
  if (!raw) return '';
  if (nameMap && nameMap[raw] && nameMap[raw].trim()) {
    return nameMap[raw].trim();
  }
  return raw.trim();
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: '',
  deleteToken: null,
  category: 'romantic',
  source: 'whatsapp',
  userNote: '',
  rawText: '',
  fileName: '',
  parsedMessages: [],
  stats: null,
  turningPoint: null,
  preview: null,
  fullReport: null,
  aiLive: null,
  isAnalyzing: false,
  scanProgress: 0,
  scanStage: 'Initializing scanner...',
  isUnlocked: true,
  reportLanguage: 'en',
  myName: '',
  nameMap: {},
  email: '',
  lastEmail: '',

  setCategory: (category) => set({ category }),
  setConversationId: (conversationId) => set({ conversationId }),
  setDeleteToken: (deleteToken) => set({ deleteToken }),
  ensureReportIdentity: () => {
    const existing = get().conversationId;
    if (existing) return existing;
    let id = '';
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      }
    } catch {
      id = '';
    }
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    set({ conversationId: id });
    return id;
  },
  persistToLocal: () => {
    if (typeof window === 'undefined') return;
    try {
      const s = get();
      const payload = {
        conversationId: s.conversationId,
        deleteToken: s.deleteToken,
        category: s.category,
        source: s.source,
        userNote: s.userNote,
        reportLanguage: s.reportLanguage,
        fileName: s.fileName,
        rawText: s.rawText,
        parsedMessages: s.parsedMessages,
        stats: s.stats,
        turningPoint: s.turningPoint,
        preview: s.preview,
        fullReport: s.fullReport,
        aiLive: s.aiLive,
        myName: s.myName,
        nameMap: s.nameMap,
        email: s.email,
        lastEmail: s.email || s.lastEmail,
      };
      if (!payload.conversationId) return;
      window.localStorage.setItem(`frank:conv:${payload.conversationId}`, JSON.stringify(payload));
    } catch {
      // ignore quota / serialization errors
    }
  },
  loadFromLocal: (id: string) => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(`frank:conv:${id}`);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const reviveMessages: ParsedMessage[] = Array.isArray(data.parsedMessages)
        ? data.parsedMessages.map((m: ParsedMessage & { timestamp: string | Date }) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }))
        : [];
      set({
        conversationId: data.conversationId ?? id,
        deleteToken: typeof data.deleteToken === 'string' ? data.deleteToken : null,
        category: data.category ?? 'romantic',
        source: data.source ?? 'whatsapp',
        userNote: data.userNote ?? '',
        reportLanguage: data.reportLanguage ?? 'en',
        fileName: data.fileName ?? '',
        rawText: data.rawText ?? '',
        parsedMessages: reviveMessages,
        stats: data.stats ?? null,
        turningPoint: data.turningPoint ?? null,
        preview: data.preview ?? null,
        fullReport: data.fullReport ?? null,
        aiLive: typeof data.aiLive === 'boolean' ? data.aiLive : null,
        myName: typeof data.myName === 'string' ? data.myName : '',
        nameMap: data.nameMap && typeof data.nameMap === 'object' ? data.nameMap : {},
        email: typeof data.email === 'string' ? data.email : '',
        lastEmail:
          typeof data.lastEmail === 'string'
            ? data.lastEmail
            : typeof data.email === 'string'
              ? data.email
              : '',
      });
      return true;
    } catch {
      return false;
    }
  },
  setSource: (source) => set({ source }),
  setUserNote: (userNote) => set({ userNote }),
  setUploadedChat: (fileName, rawText) => set({ fileName, rawText }),
  setParsedData: (parsedMessages, stats, turningPoint) =>
    set({ parsedMessages, stats, turningPoint }),
  setScanProgress: (scanProgress, scanStage) => set({ scanProgress, scanStage }),
  setPreview: (preview) => set({ preview }),
  setFullReport: (fullReport) => set({ fullReport }),
  setAiLive: (aiLive) => set({ aiLive }),
  unlockReport: () => set({ isUnlocked: true }),
  setReportLanguage: (reportLanguage) => set({ reportLanguage }),
  setMyName: (myName) => set({ myName }),
  setNameMap: (nameMap) => set({ nameMap }),
  setNameAlias: (raw, alias) =>
    set((s) => ({ nameMap: { ...s.nameMap, [raw]: alias } })),
  cleanName: (raw) => cleanName(raw, get().nameMap),
  setEmail: (email) => set({ email, lastEmail: email }),
  reset: () =>
    set({
      conversationId: '',
      deleteToken: null,
      category: 'romantic',
      source: 'whatsapp',
      userNote: '',
      rawText: '',
      fileName: '',
      parsedMessages: [],
      stats: null,
      turningPoint: null,
      preview: null,
      fullReport: null,
      aiLive: null,
      isAnalyzing: false,
      scanProgress: 0,
      scanStage: '',
      isUnlocked: true,
      reportLanguage: 'en',
      myName: '',
      nameMap: {},
      email: '',
      lastEmail: '',
    }),
}));
