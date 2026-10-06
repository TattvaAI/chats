'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { 
  ShieldAlert, Key, LogOut, RefreshCw, MessageSquare, 
  Users, FileText, CheckCircle2, Clock, AlertCircle, 
  Search, ExternalLink, X, Play, Eye
} from 'lucide-react';

interface AdminStats {
  profiles: number;
  conversations: number;
  reports: number;
  feedback: number;
  followups: number;
  jobs: Record<string, number>;
}

interface ConversationItem {
  id: string;
  title: string;
  category: string;
  source: string;
  participants: string[];
  messageCount: number;
  createdAt: string;
  userEmail: string | null;
  reportId: string | null;
  reportNumber: number | null;
  isUnlocked: boolean | null;
  jobStatus: string | null;
  jobStage: string | null;
  jobError: string | null;
}

interface FeedbackItem {
  id: string;
  kind: string;
  email: string | null;
  message: string;
  createdAt: string;
}

interface ConversationDetail {
  conversation: {
    id: string;
    title: string;
    category: string;
    source: string;
    participants: string[];
    messageCount: number;
    createdAt: string;
    expiresAt: string;
    userEmail: string | null;
  };
  reports: Array<{
    id: string;
    reportNumber: number;
    type: string;
    isUnlocked: boolean;
    previewData: Record<string, unknown>;
    fullReportData: Record<string, unknown> | null;
    createdAt: string;
  }>;
  job: {
    id: string;
    status: string;
    stage: string;
    attempts: number;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  followups: Array<{
    id: string;
    question: string;
    answer: string | null;
    status: string;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [passkey, setPasskey] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [activeTab, setActiveTab] = useState<'conversations' | 'feedback' | 'jobs'>('conversations');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tickingWorker, setTickingWorker] = useState(false);
  const [workerResult, setWorkerResult] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadConversations = useCallback(async (query = '') => {
    try {
      const url = query ? `/api/admin/conversations?q=${encodeURIComponent(query)}` : '/api/admin/conversations';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.items || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/auth')
      .then(res => res.json())
      .then(data => {
        if (active) setAuthorized(Boolean(data.authorized));
      })
      .catch(() => {
        if (active) setAuthorized(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    Promise.all([
      fetch('/api/admin/stats').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/conversations').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/feedback').then(r => r.ok ? r.json() : null),
    ]).then(([statsData, convsData, fbData]) => {
      if (!active) return;
      if (statsData?.stats) setStats(statsData.stats);
      if (convsData?.items) setConversations(convsData.items);
      if (fbData?.items) setFeedbackList(fbData.items);
    }).catch(console.error);
    return () => { active = false; };
  }, [authorized]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: passkey }),
      });
      if (res.ok) {
        setAuthorized(true);
        setPasskey('');
      } else {
        const data = await res.json();
        setAuthError(data.error || 'Invalid admin passkey.');
      }
    } catch {
      setAuthError('Connection error.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setAuthorized(false);
    setSelectedId(null);
    setDetail(null);
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleWorkerTick = async () => {
    setTickingWorker(true);
    setWorkerResult(null);
    try {
      const res = await fetch('/api/admin/worker-tick', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setWorkerResult(`Success: recovered ${data.stats?.recovered ?? 0}, completed ${data.stats?.completed ?? 0}, retried ${data.stats?.retried ?? 0}`);
        loadStats();
        loadConversations(search);
      } else {
        setWorkerResult(`Failed: ${data.error || 'Tick error'}`);
      }
    } catch (err) {
      setWorkerResult('Error invoking worker tick.');
      console.error(err);
    } finally {
      setTickingWorker(false);
    }
  };

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Frank Admin Portal</h1>
              <p className="text-xs text-slate-400">Restricted operator access only</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Admin Passkey</label>
              <div className="relative">
                <input
                  type="password"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder="Enter admin secret key"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
                <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Unlock Admin Portal'}
            </button>

            <div className="pt-4 border-t border-slate-800/80 text-center">
              <p className="text-xs text-slate-400 mb-3">Or sign in with your verified Google Admin email</p>
              <Link
                href="/api/auth/google?next=/admin"
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors"
              >
                Sign in via Google
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Cast report data safely for rendering
  const fullReport = detail?.reports?.[0]?.fullReportData as Record<string, unknown> | null;
  const scenes = Array.isArray(fullReport?.scenes) ? (fullReport.scenes as Array<Record<string, unknown>>) : [];
  const insideJokes = Array.isArray(fullReport?.dialect) ? (fullReport.dialect as Array<Record<string, unknown>>) : [];
  const profilesList = Array.isArray(fullReport?.pairProfiles) ? (fullReport.pairProfiles as Array<Record<string, unknown>>) : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white">What Frank Thinks</span>
              <span className="px-1.5 py-0.5 text-[10px] uppercase font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">Admin</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleWorkerTick}
            disabled={tickingWorker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Run worker tick to recover and process queued jobs"
          >
            <Play className={`w-3.5 h-3.5 ${tickingWorker ? 'animate-spin' : 'text-emerald-400'}`} />
            Run Worker Tick
          </button>
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-1"
          >
            Live App <ExternalLink className="w-3 h-3" />
          </Link>
          <button
            onClick={handleLogout}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors px-2 py-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {workerResult && (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-between">
            <span>{workerResult}</span>
            <button onClick={() => setWorkerResult(null)} className="text-slate-500 hover:text-white">✕</button>
          </div>
        )}

        {/* Metric KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Total Reports</span>
                <FileText className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.reports}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Conversations</span>
                <MessageSquare className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.conversations}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Registered Profiles</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.profiles}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Follow-up Q&As</span>
                <MessageSquare className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.followups}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Feedback Items</span>
                <AlertCircle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.feedback}</div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('conversations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'conversations' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reports & Chats ({conversations.length})
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'feedback' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              User Feedback ({feedbackList.length})
            </button>
          </div>

          {activeTab === 'conversations' && (
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search title, participant, email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  loadConversations(e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>

        {/* Tab 1: Conversations & Reports Table */}
        {activeTab === 'conversations' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Title / Category</th>
                    <th className="py-3 px-4">Participants</th>
                    <th className="py-3 px-4">Messages</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {conversations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No conversations found.
                      </td>
                    </tr>
                  ) : (
                    conversations.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-white">
                          <div className="truncate max-w-[220px]" title={item.title}>
                            {item.title}
                          </div>
                          <span className="inline-block mt-0.5 text-[10px] text-amber-400 font-mono">
                            {item.category || 'chat'} • {item.source}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {item.participants.map((p, idx) => (
                              <span key={idx} className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-300">
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {item.messageCount || 0}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {item.userEmail ? (
                            <span className="text-emerald-400 font-mono text-[11px]">{item.userEmail}</span>
                          ) : (
                            <span className="text-slate-500 italic">Guest</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {item.reportId ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                            </span>
                          ) : item.jobStatus === 'running' ? (
                            <span className="inline-flex items-center gap-1 text-blue-400 font-medium">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing
                            </span>
                          ) : item.jobStatus === 'queued' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                              <Clock className="w-3.5 h-3.5" /> Queued
                            </span>
                          ) : item.jobStatus === 'failed' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                              <AlertCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="text-slate-500">No report</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => openDetail(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium border border-amber-500/20 transition-colors"
                          >
                            <Eye className="w-3 h-3" /> View Report
                          </button>
                          <Link
                            href={`/c/${item.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-white text-xs transition-colors"
                            title="Open User View"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: User Feedback */}
        {activeTab === 'feedback' && (
          <div className="space-y-3">
            {feedbackList.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                No feedback received yet.
              </div>
            ) : (
              feedbackList.map((fb) => (
                <div key={fb.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-400 uppercase tracking-wider text-[10px]">
                      {fb.kind}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {new Date(fb.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200">{fb.message}</p>
                  {fb.email && (
                    <div className="text-xs text-slate-400">
                      From: <span className="text-emerald-400 font-mono">{fb.email}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Report Inspection Modal / Drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in">
          <div className="w-full max-w-3xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Report & Chat Inspection</h2>
                <p className="text-xs text-slate-400 font-mono">ID: {selectedId}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/c/${selectedId}`}
                  target="_blank"
                  className="px-3 py-1 bg-amber-500 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  Open in Public Viewer <ExternalLink className="w-3 h-3" />
                </Link>
                <button
                  onClick={() => { setSelectedId(null); setDetail(null); }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="py-20 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              </div>
            ) : detail ? (
              <div className="space-y-6 text-sm">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-500 block">Category</span>
                    <span className="font-semibold text-slate-200 capitalize">{detail.conversation.category}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Source</span>
                    <span className="font-semibold text-slate-200 uppercase">{detail.conversation.source}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Messages</span>
                    <span className="font-semibold text-slate-200 font-mono">{detail.conversation.messageCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">User Email</span>
                    <span className="font-semibold text-emerald-400 font-mono">{detail.conversation.userEmail || 'Guest'}</span>
                  </div>
                </div>

                {/* Privacy note */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                  ℹ️ <strong>Zero-retention note:</strong> Full unquoted raw chat texts are wiped on completion per privacy architecture. Frank’s analysis, exact quote evidence bubbles, dialect entries, portraits, and follow-ups are preserved below.
                </div>

                {/* Frank Headline & Metaphor */}
                {fullReport && (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                      <span className="text-[10px] font-mono uppercase text-amber-500 font-bold">Headline</span>
                      <h3 className="text-lg font-bold text-white">{String(fullReport.headline || 'Chat Report')}</h3>
                      {typeof fullReport.verdict === 'string' && (
                        <p className="text-slate-300 text-xs">{fullReport.verdict}</p>
                      )}
                    </div>

                    {/* Metaphor Section */}
                    {typeof fullReport.metaphor === 'object' && fullReport.metaphor !== null && (
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <span className="text-[10px] font-mono uppercase text-amber-500 font-bold">Core Metaphor</span>
                        <h4 className="font-semibold text-white">{String((fullReport.metaphor as Record<string, unknown>).title || '')}</h4>
                        <p className="italic text-xs text-slate-400">{String((fullReport.metaphor as Record<string, unknown>).tagline || '')}</p>
                        {Array.isArray((fullReport.metaphor as Record<string, unknown>).paragraphs) && (
                          <div className="space-y-2 pt-2 text-xs text-slate-300">
                            {((fullReport.metaphor as Record<string, unknown>).paragraphs as string[]).map((para, i) => (
                              <p key={i}>{para}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Scenes & Evidence Quotes */}
                    {scenes.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-white text-xs uppercase tracking-wider text-amber-500">
                          Scenes & Quoted Dialogues ({scenes.length})
                        </h4>
                        <div className="space-y-3">
                          {scenes.map((scene, idx) => (
                            <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[10px] flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span className="font-semibold text-white text-xs">{String(scene.title || `Scene ${idx + 1}`)}</span>
                              </div>
                              <p className="text-xs text-slate-400">{String(scene.narrative || '')}</p>
                              
                              {/* Quoted speech bubbles */}
                              {Array.isArray(scene.quotes) && (
                                <div className="space-y-1.5 pl-3 border-l-2 border-amber-500/40">
                                  {(scene.quotes as Array<Record<string, unknown>>).map((q, qIdx) => (
                                    <div key={qIdx} className="text-xs bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                                      <span className="font-semibold text-amber-400 mr-2">{String(q.sender || '')}:</span>
                                      <span className="text-slate-200">“{String(q.text || '')}”</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <p className="text-xs text-slate-300 bg-amber-500/5 p-2 rounded border border-amber-500/10 italic">
                                Frank: {String(scene.reaction || '')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dialect / Inside Jokes */}
                    {insideJokes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-white text-xs uppercase tracking-wider text-amber-500">
                          Decoded Private Language & Inside Jokes
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {insideJokes.map((item, idx) => (
                            <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                              <span className="font-bold text-amber-400">{String(item.term || '')}</span>
                              <p className="text-slate-300">{String(item.meaning || '')}</p>
                              <p className="text-slate-500 italic">“{String(item.quote || '')}”</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pair Portraits */}
                    {profilesList.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-white text-xs uppercase tracking-wider text-amber-500">
                          Participant Portraits
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {profilesList.map((p, idx) => (
                            <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-sm">{String(p.name || '')}</span>
                                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{String(p.roleTitle || '')}</span>
                              </div>
                              <p className="text-slate-400"><strong className="text-slate-300">Facade:</strong> {String(p.theFacade || '')}</p>
                              <p className="text-slate-400"><strong className="text-slate-300">Reality:</strong> {String(p.theReality || '')}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Follow-up Q&A Section */}
                {detail.followups.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-white text-xs uppercase tracking-wider text-purple-400">
                      User Questions Asked to Frank ({detail.followups.length})
                    </h4>
                    <div className="space-y-2">
                      {detail.followups.map((f) => (
                        <div key={f.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                          <p className="font-semibold text-purple-300">Q: {f.question}</p>
                          <p className="text-slate-300">A: {f.answer || 'Pending...'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 text-xs">Failed to load details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
