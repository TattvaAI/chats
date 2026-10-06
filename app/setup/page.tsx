'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  MessageSquare,
  Users,
  User,
} from 'lucide-react';
import {
  useChatStore,
  ChatCategory,
  ReportLanguage,
  cleanName,
} from '@/lib/store/useChatStore';
import { parseWhatsAppChat, ParsedMessage } from '@/lib/parser/whatsapp';
import { extractChatTxtFromZip, isZipFile } from '@/lib/parser/unzip';
import { computeChatMetrics } from '@/lib/forensics/metrics';
import { detectTurningPoint } from '@/lib/forensics/turning-point';
import { AnalysisInput, isMeaningfulMessage, MAX_CHAT_PARTICIPANTS, normalizedParticipantName } from '@/lib/ai/input';
import { createGuestCapability, saveGuestCapability } from '@/lib/store/access';
import { refreshSession, useSession } from '@/lib/hooks/useSession';
import { responseError } from '@/lib/hooks/report-client';
import { SiteHeader, SiteFooter } from '@/components/frank/header';

interface CategoryOption {
  id: ChatCategory;
  emoji: string;
  title: string;
  desc: string;
  bgPastel: string;
  borderPastel: string;
  textPastel: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: 'romantic',
    emoji: '💌',
    title: 'Romantic',
    desc: 'Crush, situationship, partner, first dates, or the ex you still obsess over.',
    bgPastel: 'bg-white hover:bg-neutral-50',
    borderPastel: 'border-neutral-200',
    textPastel: 'text-neutral-900',
  },
  {
    id: 'friend',
    emoji: '🫶',
    title: 'Any friend',
    desc: 'Best friends, childhood pals, or a friendship that suddenly turned cold.',
    bgPastel: 'bg-white hover:bg-neutral-50',
    borderPastel: 'border-neutral-200',
    textPastel: 'text-neutral-900',
  },
  {
    id: 'friends_group',
    emoji: '🍿',
    title: 'Friends group',
    desc: 'The group thread, holiday planning, banter crew, or circle drama.',
    bgPastel: 'bg-white hover:bg-neutral-50',
    borderPastel: 'border-neutral-200',
    textPastel: 'text-neutral-900',
  },
  {
    id: 'family',
    emoji: '🏡',
    title: 'Family',
    desc: 'Parents, siblings, in-laws, or family threads with long historical subtext.',
    bgPastel: 'bg-white hover:bg-neutral-50',
    borderPastel: 'border-neutral-200',
    textPastel: 'text-neutral-900',
  },
  {
    id: 'work',
    emoji: '💼',
    title: 'Work / team',
    desc: 'Co-founders, direct reports, clients, or passive-aggressive office chats.',
    bgPastel: 'bg-white hover:bg-neutral-50',
    borderPastel: 'border-neutral-200',
    textPastel: 'text-neutral-900',
  },
  {
    id: 'other',
    emoji: '🧩',
    title: 'Other',
    desc: 'Roommates, landlords, acquaintances, or unclassifiable conversations.',
    bgPastel: 'bg-white hover:bg-neutral-50',
    borderPastel: 'border-neutral-200',
    textPastel: 'text-neutral-900',
  },
];

const LANGUAGES: { id: ReportLanguage; label: string; flag: string; desc: string }[] = [
  {
    id: 'en',
    label: 'English',
    flag: '🇬🇧',
    desc: "Frank's unfiltered opinions, razor-sharp wit, and psychological breakdown.",
  },
  {
    id: 'fr',
    label: 'Français',
    flag: '🇫🇷',
    desc: 'Analyse incisive, esprit mordant et vérités sans complaisance par Frank.',
  },
  {
    id: 'es',
    label: 'Español',
    flag: '🇪🇸',
    desc: 'Análisis implacable, sátira afilada y diagnóstico directo sin filtros por Frank.',
  },
];

function getSenders(msgs: ParsedMessage[]): string[] {
  const senders = new Set<string>();
  for (const m of msgs) {
    if (m.sender && !m.isSystem) {
      senders.add(m.sender);
    }
  }
  return Array.from(senders);
}

export default function SetupFunnel() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Store bindings
  const {
    category,
    source,
    userNote,
    reportLanguage,
    fileName,
    parsedMessages,
    stats,
    setCategory,
    setSource,
    setUserNote,
    setReportLanguage,
    setUploadedChat,
    setParsedData,
    setMyName,
    setNameMap,
  } = useChatStore();

  const session = useSession();
  const [authConfig, setAuthConfig] = useState<{ requireAuth: boolean } | null>(null);
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const rawParsedMessagesRef = useRef<ParsedMessage[]>([]);
  const pendingUploadRef = useRef<{ text: string; name: string } | null>(null);
  const fileVersionRef = useRef(0);
  const submittingRef = useRef(false);
  const [selectedMyName, setSelectedMyName] = useState('');
  const [nameAliases, setNameAliases] = useState<Record<string, string>>({});
  const [rawSenders, setRawSenders] = useState<string[]>([]);
  const [dateOrder, setDateOrder] = useState<'auto' | 'dmy' | 'mdy'>('auto');
  const [dateAmbiguous, setDateAmbiguous] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [submissionStage, setSubmissionStage] = useState('Preparing your report request…');
  const meaningfulCount = parsedMessages.filter(isMeaningfulMessage).length;

  useEffect(() => {
    const controller = new AbortController();
    async function checkConfig() {
      setConfigError('');
      try {
        const response = await fetch('/api/auth/config', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('We could not check whether sign-in is required. Please retry before uploading.');
        const data = await response.json();
        if (typeof data.requireAuth !== 'boolean') throw new Error('The upload settings could not be verified. Please retry.');
        if (!controller.signal.aborted) setAuthConfig(data);
      } catch (error) { if (!controller.signal.aborted) setConfigError(error instanceof Error ? error.message : 'Could not check upload settings.'); }
    }
    void checkConfig();
    return () => controller.abort();
  }, [configAttempt]);

  // A new setup visit starts a new in-memory draft; previous saved reports stay on the server.
  useEffect(() => {
    useChatStore.getState().reset();
    return () => { fileVersionRef.current += 1; };
  }, []);

  const triggerAnalysis = async () => {
    const profile = await refreshSession();
    if (authConfig?.requireAuth && !profile) throw new Error('Please sign in before creating your report.');
    const active = useChatStore.getState();
    if (!active.parsedMessages.length || !active.myName) throw new Error('Your upload session changed. Please upload the chat and select your name again.');
    const conversationId = active.ensureReportIdentity();
    const payload = AnalysisInput.safeParse({ conversationId, category: active.category, source: active.source, myName: active.myName, userNote: active.userNote, reportLanguage: active.reportLanguage,
      messages: active.parsedMessages.map(message => ({ sender: message.sender, content: message.content, at: new Date(message.timestamp).toISOString(), isSystem: message.isSystem, isReaction: message.isReaction })) });
    if (!payload.success) throw new Error(payload.error.issues[0]?.message || 'Check the chat and participant names before continuing.');
    let token: string | null = null;
    if (!profile) {
      token = active.deleteToken || createGuestCapability();
      // Save the recoverable capability BEFORE sending any chat data or waiting for a response.
      saveGuestCapability(conversationId, token);
      active.setDeleteToken(token);
    }
    setSubmissionStage('Saving your analysis request…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-conversation-token': token } : {}) }, body: JSON.stringify(payload.data), signal: controller.signal });
      if (!response.ok) throw new Error(await responseError(response, 'Could not start the report. Please retry.'));
      const data = await response.json();
      if (data.conversationId !== conversationId || !['queued', 'running', 'failed', 'completed'].includes(data.status)) throw new Error('We could not confirm the report request. Retry to check the same request safely.');
      return conversationId;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('The connection timed out before we could confirm your report. Retry Create report to check the same request safely.');
      throw error;
    } finally { clearTimeout(timeout); }
  };

  const resetUpload = () => {
    fileVersionRef.current += 1;
    setUploadedChat('', '');
    rawParsedMessagesRef.current = [];
    pendingUploadRef.current = null;
    setRawSenders([]); setSelectedMyName(''); setNameAliases({});
    setDateAmbiguous(false); setErrorMsg(''); setIsReading(false);
  };

  const handleProcessFileContent = (rawContent: string, uploadFileName: string, selectedOrder = dateOrder) => {
    setErrorMsg('');
    // Do not silently interpret an export whose dates work in both regional formats.
    const dates = [...rawContent.matchAll(/^\[?(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/gm)];
    const regional = dates.filter(match => match[1].length !== 4);
    const ambiguous = regional.length > 0 && regional.every(match => Number(match[1]) <= 12 && Number(match[2]) <= 12) && regional.some(match => match[1] !== match[2]);
    if (selectedOrder === 'auto' && ambiguous) {
      pendingUploadRef.current = { text: rawContent, name: uploadFileName };
      setDateAmbiguous(true);
      setErrorMsg('The dates in this export could use day/month or month/day. Choose the matching date format below to keep the timeline accurate.');
      return;
    }
    setDateAmbiguous(false);
    const parsed = parseWhatsAppChat(rawContent, selectedOrder === 'auto' ? undefined : selectedOrder);
    const readable = parsed.messages.filter(isMeaningfulMessage);
    if (readable.length < 5) { setErrorMsg('Frank needs at least 5 text messages, excluding system notices, reactions, deleted messages and media placeholders.'); return; }
    if (parsed.messages.length > 15000) { setErrorMsg(`This export contains ${parsed.messages.length.toLocaleString()} entries. Please choose a shorter export with up to 15,000 entries.`); return; }
    const senders = getSenders(parsed.messages);
    if (senders.length < 2 || senders.length > MAX_CHAT_PARTICIPANTS) { setErrorMsg(`Choose a chat with 2–${MAX_CHAT_PARTICIPANTS} participants.`); return; }
    if (new Set(readable.map(message => message.sender)).size < 2) { setErrorMsg('Include text messages from at least two participants.'); return; }
    const timestamps = parsed.messages.map(message => message.timestamp.getTime());
    if (Math.min(...timestamps) < Date.UTC(1970, 0, 1) || Math.max(...timestamps) >= Date.UTC(2101, 0, 1) || Math.max(...timestamps) - Math.min(...timestamps) > 50 * 366 * 86400000) { setErrorMsg('Choose an export with dates between 1970 and 2100 spanning no more than 50 years.'); return; }
    const calculatedStats = computeChatMetrics(parsed.messages);
    const calculatedTurningPoint = detectTurningPoint(parsed.messages);
    setUploadedChat(uploadFileName, rawContent);
    rawParsedMessagesRef.current = parsed.messages;
    pendingUploadRef.current = null;
    setRawSenders(senders);
    setSelectedMyName('');
    setNameAliases(Object.fromEntries(senders.map(sender => [sender, sender])));
    setParsedData(parsed.messages, calculatedStats, calculatedTurningPoint);
    setCurrentStep(4);
  };

  const loadFile = async (file: File) => {
    if (isProcessing) return;
    resetUpload();
    const version = fileVersionRef.current;
    if (file.size > 10 * 1024 * 1024) { setErrorMsg('Please upload a file smaller than 10 MB.'); return; }
    if (!/\.(?:txt|zip)$/i.test(file.name)) { setErrorMsg('Choose a WhatsApp or iMessage export in .txt or .zip format.'); return; }
    setIsReading(true);
    try {
      const extracted = isZipFile(file.name) ? await extractChatTxtFromZip(file) : { content: await file.text(), fileName: file.name };
      if (version === fileVersionRef.current) handleProcessFileContent(extracted.content, extracted.fileName);
    } catch (error) { if (version === fileVersionRef.current) setErrorMsg(error instanceof Error ? error.message : 'Could not read this file. Please try another export.'); }
    finally { if (version === fileVersionRef.current) setIsReading(false); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await loadFile(file);
  };

  const handleApplyRenameAndContinue = () => {
    setErrorMsg('');
    if (!rawSenders.includes(selectedMyName)) { setErrorMsg('Select which participant is you before continuing.'); return; }
    const aliases = Object.fromEntries(rawSenders.map(sender => [sender, (Object.prototype.hasOwnProperty.call(nameAliases, sender) ? nameAliases[sender] : sender).trim()]));
    const values = Object.values(aliases);
    if (values.some(name => !name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name))) { setErrorMsg('Give each participant a name between 1 and 100 characters, without control characters.'); return; }
    if (new Set(values.map(normalizedParticipantName)).size !== values.length) { setErrorMsg('Give each participant a distinct name. Names must also differ when capitalization and spacing are ignored.'); return; }
    const renamedMessages = rawParsedMessagesRef.current.map(message => ({ ...message, sender: message.isSystem ? message.sender : cleanName(message.sender, aliases) }));
    setMyName(cleanName(selectedMyName, aliases));
    setNameMap(aliases);
    setParsedData(renamedMessages, computeChatMetrics(renamedMessages), detectTurningPoint(renamedMessages));
    setCurrentStep(6);
  };

  const handleStartAnalysis = async () => {
    if (!stats || !parsedMessages.length) { setErrorMsg('No chat data found. Please upload your chat first.'); setCurrentStep(3); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setIsProcessing(true); setErrorMsg(''); setSubmissionStage('Checking your account and preparing the request…');
      const conversationId = await triggerAnalysis();
      useChatStore.getState().reset();
      router.push(`/c/${conversationId}`);
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'The report request could not be confirmed. Retry to check the same request safely.'); }
    finally { setIsProcessing(false); submittingRef.current = false; }
  };

  if (!authConfig || session.status === 'checking' || session.status === 'error' || (authConfig.requireAuth && !session.profile)) {
    const loading = (!authConfig && !configError) || session.status === 'checking';
    const authError = configError || session.error;
    return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 px-6 py-24"><h1 className="font-serif text-3xl">{loading ? 'Preparing your upload' : authError ? 'We could not check your account' : 'Sign in to create your report'}</h1><p role={authError ? 'alert' : 'status'} className="text-sm leading-relaxed text-muted-foreground">{authError || (loading ? 'Checking the site’s upload settings…' : 'Your report will be saved to your account so you can return to it from any device. Sign in before choosing a private chat file.')}</p>{authError ? <button onClick={() => { setConfigAttempt(value => value + 1); void session.retry().catch(() => undefined); }} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm text-white">Retry</button> : !loading && <Link href="/login?next=%2Fsetup" className="rounded-xl bg-neutral-900 px-6 py-3 text-center text-sm text-white">Continue to sign in</Link>}</main><SiteFooter /></div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* MINIMAL TOP ROW: back + progress + N of 7 */}
      <header className="w-full border-b border-border/40 bg-background/80 backdrop-blur-xs sticky top-0 z-30">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4 sm:px-6">
          {currentStep > 1 && !isProcessing ? (
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                setCurrentStep((prev) => Math.max(1, prev - 1));
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-4" />
              <span>Back</span>
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-4" />
              <span>Home</span>
            </Link>
          )}

          {/* Central progress bar */}
          <div className="flex-1 max-w-[140px] sm:max-w-[200px] px-3">
            <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300 rounded-full"
                style={{ width: `${(currentStep / 7) * 100}%` }}
              />
            </div>
          </div>

          <span className="font-mono text-xs font-semibold text-muted-foreground shrink-0">
            {currentStep} of 7
          </span>
        </div>
      </header>

      {/* MAIN CONTAINER: max-w-xl */}
      <main className="flex-1 px-4 py-8 sm:py-12">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
          {errorMsg && <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{errorMsg}</span></div>}
          {/* STEP 1: TYPE (6 CARDS) */}
          {currentStep === 1 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                  What kind of chat is this?
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Pick the one that fits best. It helps Frank understand who everyone is to each other.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategory(cat.id);
                        setCurrentStep(2);
                      }}
                      className={`flex items-center gap-4 rounded-2xl border bg-white p-4 text-left cursor-pointer transition-all active:scale-[0.99] ${
                        isSelected
                          ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-sm'
                          : 'border-neutral-200 hover:border-neutral-400 hover:shadow-xs'
                      }`}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-2xl select-none">
                        {cat.emoji}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-semibold text-[15px] text-neutral-900">
                          {cat.title}
                        </span>
                        <span className="text-[13px] text-neutral-500 leading-snug">
                          {cat.desc}
                        </span>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="ml-auto size-5 shrink-0 text-neutral-900" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: SOURCE (PENDINGSOURCE + CONTINUE DISABLED UNTIL CHOSEN) */}
          {currentStep === 2 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                  Where&apos;s your chat from?
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Pick WhatsApp or iMessage.
                </p>
              </div>

              <div className="flex flex-col gap-3.5">
                {/* WhatsApp card */}
                <button
                  type="button"
                  onClick={() => {
                    setSource('whatsapp');
                    setCurrentStep(3);
                  }}
                  className={`flex items-start justify-between rounded-2xl border bg-white p-5 text-left cursor-pointer transition-all active:scale-[0.99] ${
                    source === 'whatsapp'
                      ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-400 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#E7F9EF] text-2xl select-none">
                      💬
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-base text-neutral-900">
                        WhatsApp
                      </span>
                      <span className="text-[13px] text-neutral-500 leading-relaxed">
                        Export the chat from WhatsApp as a .txt file, or upload the .zip.
                      </span>
                    </div>
                  </div>
                  {source === 'whatsapp' && (
                    <CheckCircle2 className="size-5 text-neutral-900 shrink-0 mt-0.5" />
                  )}
                </button>

                {/* iMessage card */}
                <button
                  type="button"
                  onClick={() => {
                    setSource('imessage');
                    setCurrentStep(3);
                  }}
                  className={`flex items-start justify-between rounded-2xl border bg-white p-5 text-left cursor-pointer transition-all active:scale-[0.99] ${
                    source === 'imessage'
                      ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-sm'
                      : 'border-neutral-200 hover:border-neutral-400 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#E5EEFF] text-2xl select-none">
                      💭
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-base text-neutral-900">
                        iMessage
                      </span>
                      <span className="text-[13px] text-neutral-500 leading-relaxed">
                        Bring a text export of one iMessage conversation from your Mac.
                      </span>
                    </div>
                  </div>
                  {source === 'imessage' && (
                    <CheckCircle2 className="size-5 text-neutral-900 shrink-0 mt-0.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: UPLOAD (CONFIDENCE N MESSAGES EXCELLENT|THIN + CHANGE-FILE + HINT) */}
          {currentStep === 3 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                  Upload your chat.
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Your file stays on this device until you hit Create.
                </p>
              </div>



              <label className="flex flex-col gap-2 text-sm font-medium">Dates in your export<select value={dateOrder} onChange={event => { const value = event.target.value as 'auto' | 'dmy' | 'mdy'; setDateOrder(value); const current = useChatStore.getState(); const pending = pendingUploadRef.current || (current.rawText ? { text: current.rawText, name: current.fileName } : null); if (pending) { resetUpload(); handleProcessFileContent(pending.text, pending.name, value); } }} className={`rounded-xl border bg-background px-3 py-3 text-sm ${dateAmbiguous ? 'border-amber-500' : 'border-border'}`}><option value="auto">Detect from the export</option><option value="dmy">Day / month / year (31/12/2026)</option><option value="mdy">Month / day / year (12/31/2026)</option></select><span className="text-xs font-normal text-muted-foreground">Choose the format used by your phone. Ambiguous dates require a choice.</span></label>
              {isReading && <p role="status" className="text-sm text-muted-foreground">Reading the file on your device…</p>}
              {/* If chat is parsed: show confidence, N messages, Excellent|Thin, change-file */}
              {meaningfulCount >= 5 && fileName && !errorMsg ? (
                <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                        <FileText className="size-5" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm text-foreground break-all">
                          {fileName}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {meaningfulCount.toLocaleString()} text messages ready for analysis
                        </span>
                      </div>
                    </div>

                    {/* Excellent or Thin Pill */}
                    {meaningfulCount >= 80 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950 shrink-0">
                        <CheckCircle2 className="size-3.5" />
                        <span>Excellent</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950 shrink-0">
                        <Clock className="size-3.5" />
                        <span>Thin</span>
                      </span>
                    )}
                  </div>

                  {/* Change file action + Continue black pill */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer transition-colors"
                    >
                      Change file
                    </button>

                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm cursor-pointer"
                    >
                      <span>Continue</span>
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Drag & drop dropzone */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault(); setDragActive(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) void loadFile(file);
                  }}
                  className={`relative flex flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed p-10 text-center transition-all bg-card ${
                    dragActive
                      ? 'border-neutral-900 bg-neutral-100/50'
                      : 'border-border hover:border-neutral-400'
                  }`}
                >
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Upload className="size-6" />
                  </div>
                  <div className="flex flex-col gap-1 max-w-sm">
                    <span className="font-semibold text-sm text-foreground">
                      Click to upload or drag &amp; drop
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Plaintext export (<code>.txt</code>) or WhatsApp zip bundle (<code>.zip</code>). At least 5 text messages, up to 15,000 entries and 8 participants.
                    </span>
                  </div>

                  <input
                    type="file"
                    aria-label="Choose your chat export"
                    disabled={isReading}
                    accept=".txt,.zip"
                    onChange={handleFileUpload}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </div>
              )}
              <details className="mb-5 rounded-xl border border-border p-4 text-left text-sm"><summary className="cursor-pointer font-medium">How to export a WhatsApp chat</summary><ol className="mt-3 list-decimal space-y-2 pl-5"><li>Open the conversation in WhatsApp.</li><li>Tap the person or group name on iPhone; on Android, open the three-dot menu.</li><li>Choose Export chat (under More on Android).</li><li>Select Without media.</li><li>Save the TXT or ZIP file to your device.</li><li>Upload it here and check the participant names.</li><li>Choose Create report when you are ready to send it for analysis.</li></ol></details>
              {source === 'imessage' && <Link href="/imessage" className="text-sm underline">How to export iMessage from your Mac</Link>}
            </div>
          )}

          {/* STEP 4: NUMBERS (MINT/LAVENDER/PINK REUSE STATS) */}
          {currentStep === 4 && stats && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                  Your numbers.
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  What your chat looks like from the outside, before Frank reads a single message.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                {/* 1. MINT CARD: Messages */}
                <div className="flex flex-col gap-2 rounded-2xl bg-[#C9F2DE] p-6 text-[#0B3B2E] shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      Messages
                    </span>
                    <MessageSquare className="size-4 text-[#0B3B2E]" />
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                      {stats.totalMessages.toLocaleString()}
                    </span>
                    <span className="text-sm font-semibold text-[#0B3B2E]">
                      total messages
                    </span>
                  </div>
                  <p className="text-xs text-[#0B3B2E] leading-relaxed pt-1">
                    {stats.activeDays ?? 0} active days, {stats.totalConversations} separate conversations ({stats.dateRange.start || 'Start'} to {stats.dateRange.end || 'End'}).
                  </p>
                </div>

                {/* 2. LAVENDER CARD: Reply speed */}
                <div className="flex flex-col gap-2 rounded-2xl bg-[#DCD4FF] p-6 text-[#2A1A5E] shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      Reply speed
                    </span>
                    <Clock className="size-4 text-[#2A1A5E]" />
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                      {stats.participants[0]?.medianResponseTimeMinutes != null
                        ? `${stats.participants[0].medianResponseTimeMinutes}m`
                        : '—'}
                    </span>
                    <span className="text-sm font-semibold text-[#2A1A5E]">
                      typical reply time
                    </span>
                  </div>
                  <p className="text-xs text-[#2A1A5E] leading-relaxed pt-1">
                    Most active on {stats.mostActiveDay || 'weekdays'} around {stats.mostActiveHour != null ? `${stats.mostActiveHour}:00` : 'evening'}. {stats.participants.reduce((sum, p) => sum + (p.doubleTextCount || 0), 0)} consecutive messages sent within a conversation.
                  </p>
                </div>

                {/* 3. PINK CARD: Who talks most */}
                <div className="flex flex-col gap-2 rounded-2xl bg-[#FFD9E2] p-6 text-[#5E1A2A] shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      Who talks most
                    </span>
                    <Users className="size-4 text-[#5E1A2A]" />
                  </div>
                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {stats.balanceRating || 'Even split'}
                    </span>
                  </div>
                  <p className="text-xs text-[#5E1A2A] leading-relaxed pt-1">
                    {stats.participants.map((p) => `${p.name} sent ${p.messageSharePercentage}% of messages`).join(' · ') || 'Equal share'}. About {stats.participants.map((p) => `${p.name} ${p.avgWordsPerMessage} words/msg`).join(' · ')}.
                  </p>
                </div>
              </div>

              {/* Continue black pill */}
              <div className="flex items-center justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: PERSON PICKER (MYNAME YOU + NAME INPUTS I/N APPLY RENAME BEFORE METRICS VIA USEREF) */}
          {currentStep === 5 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                  Who is who in this chat?
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Tell Frank which person is you, and give each participant a clean first name so your report reads naturally.
                </p>
              </div>

              {/* Person Picker: Which one is you? */}
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Which participant is you? (You)
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {rawSenders.map((sender) => {
                    const isYou = selectedMyName === sender;
                    const displayName = cleanName(sender, nameAliases);
                    return (
                      <button
                        key={sender}
                        type="button"
                        onClick={() => setSelectedMyName(sender)}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium cursor-pointer transition-all active:scale-[0.98] ${
                          isYou
                            ? 'bg-neutral-900 text-white shadow-xs'
                            : 'border border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400'
                        }`}
                      >
                        <User className="size-3.5" />
                        <span>{displayName}</span>
                        {isYou && (
                          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name Inputs i/N: Participant renaming */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Participant Names ({rawSenders.length} total)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Replaces raw phone numbers &amp; handles
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {rawSenders.map((sender, idx) => {
                    const isYou = selectedMyName === sender;
                    return (
                      <div
                        key={sender}
                        className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-all"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">
                            Person {idx + 1} of {rawSenders.length}
                          </span>
                          {isYou && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              You
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                            {sender}
                          </span>
                          <span className="hidden sm:inline text-muted-foreground text-xs">→</span>
                          <input
                            type="text"
                            value={Object.prototype.hasOwnProperty.call(nameAliases, sender) ? nameAliases[sender] : sender}
                            maxLength={100}
                            aria-label={`Name for ${sender}`}
                            onChange={(e) =>
                              setNameAliases((prev) => ({
                                ...prev,
                                [sender]: e.target.value,
                              }))
                            }
                            placeholder="Clean name (e.g. Sarah)"
                            className="flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neutral-900 focus:outline-hidden"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Continue button: applies rename BEFORE metrics via useRef */}
              <div className="flex items-center justify-end pt-3">
                <button
                  type="button"
                  onClick={handleApplyRenameAndContinue}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm cursor-pointer"
                >
                  <span>Apply &amp; Continue</span>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: NOTE + LANGUAGE */}
          {currentStep === 6 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                  Anything Frank should know?
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Add anything you noticed, and pick what language the report is in.
                </p>
              </div>

              {/* Note Section */}
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What should Frank look at? (Optional)
                </label>
                <textarea
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  placeholder="e.g., We talked non-stop for 2 months, but after their birthday party, reply times jumped to 18 hours. Did they pull away or am I being paranoid?"
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-hidden leading-relaxed shadow-2xs"
                />
              </div>

              {/* Language Section */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Report language
                </label>
                <div className="flex flex-col gap-2.5">
                  {LANGUAGES.map((lang) => {
                    const isSelected = reportLanguage === lang.id;
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => setReportLanguage(lang.id)}
                        className={`flex items-start gap-4 rounded-2xl border p-4 text-left cursor-pointer transition-all active:scale-[0.98] bg-white ${
                          isSelected
                            ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-sm'
                            : 'border-neutral-200 hover:border-neutral-400 hover:shadow-2xs'
                        }`}
                      >
                        <span className="text-2xl select-none mt-0.5">{lang.flag}</span>
                        <div className="flex flex-1 flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-neutral-900">
                              {lang.label}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="size-4 text-neutral-900" />
                            )}
                          </div>
                          <span className="text-xs text-neutral-500 leading-snug">
                            {lang.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Continue black pill */}
              <div className="flex items-center justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(7)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm cursor-pointer"
                >
                  <span>Continue to Final Step</span>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: EMAIL + CREATE REPORT (VALIDATE STORE NO SEND + CREATE REPORT EXISTING FLOW PUSH /C/ID) */}
          {currentStep === 7 && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              {!isProcessing ? (
                <>
                  <div className="flex flex-col gap-2">
                    <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
                      Get your report
                    </h1>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      {session.profile ? 'Your free report will be saved to your account so you can return to it later.' : 'Read the full report for free. Sign in afterwards to save it across devices.'}
                    </p>
                  </div>



                  <p className="rounded-xl border border-border p-4 text-sm leading-relaxed">When you choose Create report, your messages are sent to Frank and Google Vertex AI for analysis. Your report stays private unless you share its link. No payment is required.</p>

                  {/* Generate button */}
                  <div className="flex items-center justify-end pt-3">
                    <button
                      type="button"
                      onClick={handleStartAnalysis}
                      disabled={isProcessing}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-7 py-3.5 text-sm font-semibold transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="size-4" />
                      <span>Create report</span>
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </>
              ) : (
                /* BRANDON LOADER ANIMATION DURING PROCESSING */
                <div className="flex flex-col items-center justify-center gap-8 py-12 text-center animate-in fade-in duration-300">
                  <div className="relative flex size-28 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping opacity-25" />
                    <span className="size-24 rounded-full overflow-hidden shadow-md ring-2 ring-primary/30">
                      <Image
                        src="/images/frank/avatar.webp"
                        alt="Frank"
                        width={96}
                        height={96}
                        className="size-full object-contain"
                      />
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-2.5 max-w-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono font-medium text-primary">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{submissionStage}</span>
                    </span>
                    <h2 className="font-serif text-2xl font-bold">
                      Starting your report…
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Once the request is saved, your report continues processing even if you leave the page.
                    </p>

                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
