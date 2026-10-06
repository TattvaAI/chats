'use client';

import { useEffect, useRef, useState } from 'react';
import { conversationHeaders } from '@/lib/store/access';
import { responseError } from '@/lib/hooks/report-client';
import { useSessionState } from '@/lib/hooks/useSession';

interface Answer { id: string; q: string; a: string; createdAt: string }

export function FollowupQuestions({ conversationId, reportNumber }: { conversationId: string; reportNumber: number }) {
  const version = useSessionState(state => state.version);
  // Keying the panel makes account switches discard all question and answer state immediately.
  return <QuestionPanel key={`${conversationId}/${reportNumber}/${version}`} conversationId={conversationId} reportNumber={reportNumber} />;
}

function QuestionPanel({ conversationId, reportNumber }: { conversationId: string; reportNumber: number }) {
  const [history, setHistory] = useState<Answer[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{ id: string; question: string } | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError('');
      try {
        const response = await fetch(`/api/interrogate?conversationId=${encodeURIComponent(conversationId)}&report=${reportNumber}`, { headers: conversationHeaders(conversationId, null), cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(await responseError(response, 'Your saved questions could not be loaded. Please retry.'));
        const data = await response.json();
        if (!Array.isArray(data.history) || data.history.some((item: Answer) => typeof item.id !== 'string' || typeof item.q !== 'string' || typeof item.a !== 'string')) throw new Error('Your saved questions could not be read. Please retry.');
        if (!controller.signal.aborted) setHistory(data.history.slice(-50));
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load saved questions.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { alive.current = false; controller.abort(); };
  }, [conversationId, reportNumber, attempt]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || inFlight.current || loading || loadError) return;
    setQuestion(q);
    setError(''); setAsking(true); inFlight.current = true;
    if (!request.current || request.current.question !== q) request.current = { id: crypto.randomUUID(), question: q };
    const requestId = request.current.id;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    try {
      const response = await fetch('/api/interrogate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...conversationHeaders(conversationId, null) },
        body: JSON.stringify({ conversationId, reportNumber, requestId, question: q }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response, 'Frank could not answer that question. Your question is still here; please retry.'));
      const data = await response.json();
      if (typeof data.answer !== 'string' || !data.answer.trim() || typeof data.id !== 'string') throw new Error('Frank returned an empty answer. Your question has been kept so you can retry.');
      if (!alive.current) return;
      setHistory(current => [...current.filter(item => item.id !== data.id), { id: data.id, q, a: data.answer, createdAt: data.createdAt }].slice(-50));
      setQuestion(current => current.trim() === q ? '' : current);
      request.current = null;
    } catch (error) {
      if (alive.current) setError(error instanceof Error && error.name === 'AbortError' ? 'The connection timed out. Your question is still here; retry to check the same answer safely.' : error instanceof Error ? error.message : 'Could not answer your question. Please retry.');
    } finally { clearTimeout(timeout); inFlight.current = false; if (alive.current) setAsking(false); }
  }

  return <div className="flex flex-col gap-4 border-t border-border bg-muted/10 p-5 sm:p-6">
    <p className="text-xs leading-relaxed text-muted-foreground">Ask about this conversation. Answers use the saved report and its verified quotes. Your questions and answers stay with this report and are private to its owner.</p>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading saved questions…</p>}
    {loadError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{loadError}</p><button onClick={() => setAttempt(value => value + 1)} className="underline">Retry loading questions</button></div>}
    {!loading && !loadError && <>
      <div className="flex flex-wrap gap-2">{['What patterns should I pay attention to?', 'What should I text next?', 'What changed in this conversation?'].map(prompt => <button key={prompt} type="button" onClick={() => { void ask(prompt); }} disabled={asking} className="rounded-full border border-border bg-background px-3 py-2 text-xs hover:bg-accent disabled:opacity-50">{prompt}</button>)}</div>
      {history.length === 0 && <p className="text-xs text-muted-foreground">No follow-up questions yet.</p>}
      <div className="flex flex-col gap-3">{history.map(item => <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4 text-sm">
        <p className="font-medium">{item.q}</p>
        <p className="whitespace-pre-wrap rounded-xl border border-[#a3e9d0] bg-[#e7f8f2] p-3 text-sm leading-relaxed text-[#0a4837]">{item.a}</p>
      </div>)}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); void ask(question); }} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="followup-question">Your question for Frank</label>
        <input id="followup-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} disabled={asking} placeholder="Type your question for Frank…" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm disabled:opacity-60" />
        <button disabled={asking || !question.trim()} className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50">{asking ? 'Thinking…' : error ? 'Retry question' : 'Ask'}</button>
      </form>
    </>}
  </div>;
}
