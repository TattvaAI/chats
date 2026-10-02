'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Sparkles,
  Shield,
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
  ChatSource,
  ReportLanguage,
} from '@/lib/store/useChatStore';
import { parseWhatsAppChat, ParsedMessage } from '@/lib/parser/whatsapp';
import { extractChatTxtFromZip, isZipFile } from '@/lib/parser/unzip';
import { computeChatMetrics } from '@/lib/forensics/metrics';
import { detectTurningPoint } from '@/lib/forensics/turning-point';

const SAMPLE_CHAT = `[14/09/24, 21:14:02] Clara: Hey! Are we still on for tomorrow night?
[14/09/24, 21:18:15] Lucas: Hey yeah definitely! 8pm at Bar Raval?
[14/09/24, 21:19:00] Clara: Perfect, see you then 😊
[15/09/24, 01:24:12] Clara: Had the best time tonight!
[15/09/24, 01:26:05] Lucas: Me too, let's do it again really soon. Sleep well!
[18/09/24, 18:32:10] Clara: Hey stranger, how's your week going?
[18/09/24, 22:45:11] Lucas: Insane week at work haha, barely breathing. How are you?
[18/09/24, 22:46:00] Clara: Surviving! Thinking of trying that new Italian spot Friday if you're free?
[19/09/24, 11:15:32] Lucas: Might have plans with the boys Friday, let me check and let you know!
[22/09/24, 14:12:00] Clara: Hey did you ever check?
[23/09/24, 09:30:15] Lucas: Sorry totally crashed this weekend. Super hectic.
[28/09/24, 19:40:11] Clara: Saw this meme and thought of you [Image]
[29/09/24, 14:20:00] Lucas: Haha classic
[05/10/24, 23:14:00] Clara: Are we ever going to talk properly again or are we doing the slow fade?
[06/10/24, 16:45:12] Lucas: What do you mean? Nothing's changed, just crazy busy right now! We're good!
[14/10/24, 20:15:00] Clara: Happy birthday Lucas! Hope it's a great one 🎉
[15/10/24, 02:10:00] Lucas: Thanks Clara! Appreciate it 🙏`;

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
    desc: "Frank's signature raw, razor-sharp forensic prose and psychological breakdown.",
  },
  {
    id: 'fr',
    label: 'Français',
    flag: '🇫🇷',
    desc: 'Analyse médico-légale incisive, esprit mordant et vérités sans complaisance.',
  },
  {
    id: 'es',
    label: 'Español',
    flag: '🇪🇸',
    desc: 'Auditoría forense implacable, sátira afilada y diagnóstico directo sin filtros.',
  },
];

function getSenders(msgs: ParsedMessage[]): string[] {
  const senders = new Set<string>();
  for (const m of msgs) {
    if (m.sender && !m.isSystem && m.sender !== 'System') {
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
    turningPoint,
    scanProgress,
    scanStage,
    myName,
    nameMap,
    email,
    setCategory,
    setSource,
    setUserNote,
    setReportLanguage,
    setUploadedChat,
    setParsedData,
    setScanProgress,
    setPreview,
    setFullReport,
    setAiLive,
    ensureReportIdentity,
    setDeleteToken,
    persistToLocal,
    setMyName,
    setNameMap,
    setEmail,
  } = useChatStore();

  // S2 pending source state: Continue disabled until chosen
  const [pendingSource, setPendingSource] = useState<ChatSource | null>(source || null);

  // S5 raw messages reference: holds unrenamed parsed messages so renames apply BEFORE recomputing metrics
  const rawParsedMessagesRef = useRef<ParsedMessage[]>([]);

  // S5 local state for person picker and aliasing inputs
  const [selectedMyName, setSelectedMyName] = useState<string>(myName || '');
  const [nameAliases, setNameAliases] = useState<Record<string, string>>(nameMap || {});
  const [rawSenders, setRawSenders] = useState<string[]>([]);

  // S7 email input & validation state
  const [inputEmail, setInputEmail] = useState<string>(email || '');
  const [emailError, setEmailError] = useState<string>('');

  // Keep rawParsedMessagesRef in sync when parsedMessages is initially loaded.
  // Ref is read here inside the effect (not during render); state sync is
  // deferred to a microtask so setState never runs synchronously in the effect.
  useEffect(() => {
    if (parsedMessages.length > 0 && rawParsedMessagesRef.current.length === 0) {
      rawParsedMessagesRef.current = parsedMessages;
      const senders = getSenders(parsedMessages);
      queueMicrotask(() => setRawSenders(senders));
    }
  }, [parsedMessages]);

  // Sync default myName when rawSenders are known
  useEffect(() => {
    if (rawSenders.length > 0 && !selectedMyName) {
      const next = myName || rawSenders[0];
      queueMicrotask(() => setSelectedMyName(next));
    }
  }, [rawSenders, selectedMyName, myName]);

  // Initialize aliases from raw senders
  useEffect(() => {
    if (rawSenders.length > 0) {
      queueMicrotask(() => {
        setNameAliases((prev) => {
          const next = { ...prev };
          for (const sender of rawSenders) {
            if (!next[sender]) {
              next[sender] = nameMap[sender] || sender;
            }
          }
          return next;
        });
      });
    }
  }, [rawSenders, nameMap]);

  // S3: Process file content
  const handleProcessFileContent = (rawContent: string, uploadFileName: string) => {
    setErrorMsg('');

    const parsed = parseWhatsAppChat(rawContent);

    // Guard: < 5 reject
    if (parsed.messages.length < 5) {
      setErrorMsg('Chat has fewer than 5 messages. Minimum 5 messages required for forensic audit.');
      return;
    }

    // Guard: > 15000 reject
    if (parsed.messages.length > 15000) {
      setErrorMsg(
        `Chat exceeds maximum limit of 15,000 messages (${parsed.messages.length.toLocaleString()} messages found). Please export a shorter timeframe or trim the file.`
      );
      return;
    }

    const calculatedStats = computeChatMetrics(parsed.messages);
    const calculatedTurningPoint = detectTurningPoint(parsed.messages);

    // Store raw original messages in ref BEFORE any participant renaming occurs
    rawParsedMessagesRef.current = parsed.messages;
    setRawSenders(getSenders(parsed.messages));

    setUploadedChat(uploadFileName, rawContent);
    setParsedData(parsed.messages, calculatedStats, calculatedTurningPoint);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isZipFile(file.name)) {
      try {
        const extracted = await extractChatTxtFromZip(file);
        handleProcessFileContent(extracted.content, extracted.fileName);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Could not extract chat from ZIP file.'
        );
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleProcessFileContent(content, file.name);
    };
    reader.readAsText(file);
  };

  // S5: Apply rename BEFORE metrics via useRef
  const handleApplyRenameAndContinue = () => {
    const baseMessages =
      rawParsedMessagesRef.current.length > 0
        ? rawParsedMessagesRef.current
        : parsedMessages;

    // Apply renaming mapping directly onto the raw messages
    const renamedMessages: ParsedMessage[] = baseMessages.map((m) => {
      const alias = nameAliases[m.sender]?.trim();
      return {
        ...m,
        sender: alias && alias.length > 0 ? alias : m.sender,
      };
    });

    // Determine clean myName
    const activeRaw = selectedMyName || rawSenders[0] || '';
    const cleanChosenName = nameAliases[activeRaw]?.trim() || activeRaw;

    setMyName(cleanChosenName);
    setNameMap(nameAliases);

    // Compute metrics with renamed messages BEFORE updating store
    const newStats = computeChatMetrics(renamedMessages);
    const newTurningPoint = detectTurningPoint(renamedMessages);

    setParsedData(renamedMessages, newStats, newTurningPoint);
    setCurrentStep(6);
  };

  // S7: Trigger final analysis flow
  const handleStartAnalysis = async () => {
    if (!stats || !parsedMessages.length) {
      setErrorMsg('No chat data found. Please upload your chat first.');
      setCurrentStep(3);
      return;
    }

    // Validate email
    const trimmedEmail = inputEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    // Store email (NO external send call, stored for user identity)
    setEmail(trimmedEmail);

    try {
      setIsProcessing(true);
      setErrorMsg('');

      // Stage 1: Ingestion
      setScanProgress(15, 'Reading your messages...');
      await new Promise((r) => setTimeout(r, 400));

      // Stage 2: Forensic Metrics
      setScanProgress(45, 'Checking who writes first and who waits...');
      await new Promise((r) => setTimeout(r, 500));

      // Stage 3: AI Forensic Processing
      setScanProgress(75, 'Frank is reading every message...');

      // Transcript: first 50 + last 20
      let transcriptSample = '';
      if (parsedMessages.length <= 70) {
        transcriptSample = parsedMessages
          .map((m) => `${m.sender}: ${m.content}`)
          .join('\n');
      } else {
        const first50 = parsedMessages
          .slice(0, 50)
          .map((m) => `${m.sender}: ${m.content}`)
          .join('\n');
        const last20 = parsedMessages
          .slice(-20)
          .map((m) => `${m.sender}: ${m.content}`)
          .join('\n');
        transcriptSample = `${first50}\n\n[... intermediate messages omitted ...]\n\n${last20}`;
      }

      const messages = parsedMessages.map((m) => ({
        sender: m.sender,
        content: m.content,
        at: new Date(m.timestamp).toISOString(),
      }));

      const conversationId = ensureReportIdentity();

      // Include myName context in userNote if present
      let combinedNote = userNote;
      if (myName && !combinedNote.includes(myName)) {
        combinedNote = `[Auditor context: The user requesting this analysis is "${myName}"].\n\n${userNote}`.trim();
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          stats,
          turningPoint,
          transcriptSample,
          messages,
          userNote: combinedNote,
          reportLanguage,
          conversationId,
          source,
          myName: myName || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete conversational analysis.');
      }

      const data = await response.json();

      setPreview(data.preview);
      setFullReport(data.fullReport);
      const aiLive = typeof data?.aiLive === 'boolean' ? data.aiLive : false;
      setAiLive(aiLive);
      if (typeof data?.deleteToken === 'string') {
        setDeleteToken(data.deleteToken);
      }

      persistToLocal();

      setScanProgress(100, 'Dossier ready!');
      await new Promise((r) => setTimeout(r, 300));

      let hubPath = `/c/${conversationId}`;
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok && trimmedEmail) {
          hubPath = `/c/${conversationId}?welcome=1`;
        }
      } catch {
        if (trimmedEmail) hubPath = `/c/${conversationId}?welcome=1`;
      }
      router.push(hubPath);
    } catch (err: unknown) {
      console.error('Processing error:', err);
      setErrorMsg('An unexpected error occurred during chat analysis. Please check your file.');
    } finally {
      setIsProcessing(false);
    }
  };

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
                  onClick={() => setPendingSource('whatsapp')}
                  className={`flex items-start justify-between rounded-2xl border bg-white p-5 text-left cursor-pointer transition-all active:scale-[0.99] ${
                    pendingSource === 'whatsapp'
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
                  {pendingSource === 'whatsapp' && (
                    <CheckCircle2 className="size-5 text-neutral-900 shrink-0 mt-0.5" />
                  )}
                </button>

                {/* iMessage card */}
                <button
                  type="button"
                  onClick={() => setPendingSource('imessage')}
                  className={`flex items-start justify-between rounded-2xl border bg-white p-5 text-left cursor-pointer transition-all active:scale-[0.99] ${
                    pendingSource === 'imessage'
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
                        Export with our Mac app — only from a Mac.
                      </span>
                    </div>
                  </div>
                  {pendingSource === 'imessage' && (
                    <CheckCircle2 className="size-5 text-neutral-900 shrink-0 mt-0.5" />
                  )}
                </button>
              </div>

              {/* Continue black pill (disabled until chosen) */}
              <div className="flex items-center justify-end pt-3">
                <button
                  type="button"
                  disabled={!pendingSource}
                  onClick={() => {
                    if (pendingSource) {
                      setSource(pendingSource);
                      setCurrentStep(3);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="size-4" />
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

              {errorMsg && (
                <div className="flex items-center gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-xs font-medium text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* If chat is parsed: show confidence, N messages, Excellent|Thin, change-file */}
              {parsedMessages.length >= 5 && fileName && !errorMsg ? (
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
                          {parsedMessages.length.toLocaleString()} messages verified
                        </span>
                      </div>
                    </div>

                    {/* Excellent or Thin Pill */}
                    {parsedMessages.length >= 80 ? (
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

                  {/* Confidence copy */}
                  <div className="rounded-xl bg-neutral-100 p-3.5 text-xs text-neutral-900 leading-relaxed dark:bg-neutral-800 dark:text-neutral-100">
                    {parsedMessages.length >= 80 ? (
                      <p>
                        Great chat for a report: lots of back-and-forth, so Frank can see who starts, who waits, and when it changed.
                      </p>
                    ) : (
                      <p>
                        Short chat, but still workable. Longer chats give Frank more to go on.
                      </p>
                    )}
                  </div>

                  {/* Change file action + Continue black pill */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedChat('', '');
                        setParsedData([], null, null);
                        rawParsedMessagesRef.current = [];
                        setRawSenders([]);
                        setErrorMsg('');
                      }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer transition-colors"
                    >
                      Change file
                    </button>

                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 cursor-pointer"
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
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      if (isZipFile(file.name)) {
                        extractChatTxtFromZip(file)
                          .then((extracted) => {
                            handleProcessFileContent(extracted.content, extracted.fileName);
                          })
                          .catch((err: unknown) => {
                            setErrorMsg(
                              err instanceof Error
                                ? err.message
                                : 'Could not extract chat from ZIP file.'
                            );
                          });
                      } else {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          handleProcessFileContent(evt.target?.result as string, file.name);
                        };
                        reader.readAsText(file);
                      }
                    }
                  }}
                  className={`relative flex flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
                    dragActive
                      ? 'border-neutral-900 bg-neutral-100/50 dark:border-neutral-100 dark:bg-neutral-900/50'
                      : 'border-border bg-card hover:border-neutral-400 dark:hover:border-neutral-600'
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
                      Plaintext export (<code>.txt</code>) or WhatsApp zip bundle (<code>.zip</code>). Between 5 and 15,000 messages.
                    </span>
                  </div>
                  <input
                    type="file"
                    accept=".txt,.zip"
                    onChange={handleFileUpload}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </div>
              )}

              {/* Test with Sample Situationship Chat */}
              {(!fileName || parsedMessages.length < 5) && (
                <div className="flex flex-col items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleProcessFileContent(SAMPLE_CHAT, 'clara-lucas-situationship.txt')
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-5 py-2.5 text-xs font-medium text-foreground hover:bg-muted transition-all cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="size-3.5 text-amber-600" />
                    <span>Try with Situationship Sample Chat</span>
                  </button>
                </div>
              )}

              {/* Hint card */}
              <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-100 p-4 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                <Shield className="size-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 leading-relaxed">
                  <span>Export without media. Your file never leaves this device until you create the report.</span>
                </div>
              </div>
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
                    {stats.dateRange.durationDays || 1} active days, {stats.totalConversations} separate conversations ({stats.dateRange.start || 'Start'} to {stats.dateRange.end || 'End'}).
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
                        : 'Fast'}
                    </span>
                    <span className="text-sm font-semibold text-[#2A1A5E]">
                      typical reply time
                    </span>
                  </div>
                  <p className="text-xs text-[#2A1A5E] leading-relaxed pt-1">
                    Most active on {stats.mostActiveDay || 'weekdays'} around {stats.mostActiveHour ? `${stats.mostActiveHour}:00` : 'evening'}. {stats.participants.reduce((sum, p) => sum + (p.doubleTextCount || 0), 0)} follow-up texts sent while waiting.
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
                    {stats.participants.map((p) => `${p.name} wrote ${p.messageSharePercentage}%`).join(' · ') || 'Equal share'}. About {stats.participants.map((p) => `${p.name} ${p.avgWordsPerMessage} words/msg`).join(' · ')}.
                  </p>
                </div>
              </div>

              {/* Continue black pill */}
              <div className="flex items-center justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 cursor-pointer"
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
                  Tell Frank which person is you, and give each participant a clean first name so your dossier reads naturally.
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
                    const displayName = nameAliases[sender]?.trim() || sender;
                    return (
                      <button
                        key={sender}
                        type="button"
                        onClick={() => setSelectedMyName(sender)}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium cursor-pointer transition-all active:scale-[0.98] ${
                          isYou
                            ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                            : 'border border-border bg-muted/50 text-foreground hover:bg-muted'
                        }`}
                      >
                        <User className="size-3.5" />
                        <span>{displayName}</span>
                        {isYou && (
                          <span className="rounded-full bg-white/20 dark:bg-neutral-900/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
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
                            value={nameAliases[sender] ?? sender}
                            onChange={(e) =>
                              setNameAliases((prev) => ({
                                ...prev,
                                [sender]: e.target.value,
                              }))
                            }
                            placeholder="Clean name (e.g. Sarah)"
                            className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neutral-900 dark:focus:border-neutral-100 focus:outline-hidden"
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
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 cursor-pointer"
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
                  className="w-full rounded-2xl border border-border bg-card p-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-neutral-900 dark:focus:border-neutral-100 focus:outline-hidden leading-relaxed"
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
                        className={`flex items-start gap-4 rounded-2xl border p-4 text-left cursor-pointer transition-all active:scale-[0.98] ${
                          isSelected
                            ? 'border-neutral-900 bg-neutral-100/50 dark:border-neutral-100 dark:bg-neutral-900/50 ring-1 ring-neutral-900 dark:ring-neutral-100'
                            : 'border-border bg-card hover:bg-muted/40'
                        }`}
                      >
                        <span className="text-2xl select-none mt-0.5">{lang.flag}</span>
                        <div className="flex flex-1 flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-foreground">
                              {lang.label}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="size-4 text-neutral-900 dark:text-neutral-100" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground leading-snug">
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
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-6 py-3 text-sm font-medium transition-all shadow-sm dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 cursor-pointer"
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
                      Add your email so you can find this report again later.
                    </p>
                  </div>

                  {errorMsg && (
                    <div className="flex items-center gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-xs font-medium text-destructive">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {/* Email Input Box */}
                  <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Your Email Address
                    </label>
                    <input
                      type="email"
                      value={inputEmail}
                      onChange={(e) => {
                        setInputEmail(e.target.value);
                        setEmailError('');
                      }}
                      placeholder="alex@example.com"
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-neutral-900 dark:focus:border-neutral-100 focus:outline-hidden"
                    />
                    {emailError && (
                      <span className="text-xs font-medium text-destructive pt-1">
                        {emailError}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground pt-1">
                      Only used to find your report again. No spam.
                    </span>
                  </div>

                  {/* Summary recap pill */}
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-amber-600" />
                      <span>
                        Auditing {stats?.totalMessages.toLocaleString() || 'chat'} messages with Frank
                      </span>
                    </div>
                    <span className="font-mono text-[11px] uppercase">
                      {reportLanguage.toUpperCase()} · {category}
                    </span>
                  </div>

                  {/* Generate button */}
                  <div className="flex items-center justify-end pt-3">
                    <button
                      type="button"
                      onClick={handleStartAnalysis}
                      disabled={isProcessing}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] px-7 py-3.5 text-sm font-semibold transition-all shadow-md disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 cursor-pointer"
                    >
                      <Sparkles className="size-4" />
                      <span>Create report</span>
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </>
              ) : (
                /* RADAR SCANNER ANIMATION DURING PROCESSING */
                <div className="flex flex-col items-center justify-center gap-8 py-12 text-center animate-in fade-in duration-300">
                  <div className="relative flex size-32 items-center justify-center rounded-full border border-border bg-muted/40 shadow-inner">
                    <div className="absolute inset-0 rounded-full border-t-2 border-primary/60 radar-sweep" />
                    <div className="absolute size-24 rounded-full border border-primary/20 pulse-ring" />
                    <span className="font-serif text-2xl font-bold tracking-tight text-primary">
                      Frank
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-2.5 max-w-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono font-medium text-primary">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      {scanStage || 'Forensic Scan in Progress'}
                    </span>
                    <h2 className="font-serif text-xl sm:text-2xl font-bold">
                      Frank is reading your chat...
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Reading who writes what, and when.
                    </p>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-4 overflow-hidden">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${scanProgress || 15}%` }}
                      />
                    </div>
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
