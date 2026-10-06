'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Key, LogOut, RefreshCw, MessageSquare, 
  Users, FileText, CheckCircle2, Clock, AlertCircle, 
  Search, ExternalLink, X, Play, Eye, Trash2,
  MessageCircleQuestion, AlertTriangle
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
  const [activeTab, setActiveTab] = useState<'conversations' | 'feedback'>('conversations');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'queued' | 'running' | 'failed'>('all');
  
  // Selection and Inspection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'verdict' | 'scenes' | 'jokes' | 'portraits' | 'qa' | 'raw'>('verdict');

  // Deletion Modal State
  const [itemToDelete, setItemToDelete] = useState<{ id: string; title: string; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Worker tick
  const [tickingWorker, setTickingWorker] = useState(false);
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showAlert = (message: string, type: 'success' | 'error' = 'success') => {
    setAlertNotice({ type, message });
    setTimeout(() => setAlertNotice(null), 5000);
  };

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
    setDetailTab('verdict');
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

  const handleDeleteConversation = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(itemToDelete.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showAlert(`Deleted chat "${itemToDelete.title}" and all its reports.`);
        setConversations(prev => prev.filter(c => c.id !== itemToDelete.id));
        if (selectedId === itemToDelete.id) {
          setSelectedId(null);
          setDetail(null);
        }
        loadStats();
      } else {
        const data = await res.json();
        showAlert(data.error || 'Failed to delete conversation.', 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Network error while deleting.', 'error');
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showAlert('Feedback item deleted.');
        setFeedbackList(prev => prev.filter(f => f.id !== id));
        loadStats();
      } else {
        showAlert('Failed to delete feedback.', 'error');
      }
    } catch {
      showAlert('Network error.', 'error');
    }
  };

  const handleWorkerTick = async () => {
    setTickingWorker(true);
    try {
      const res = await fetch('/api/admin/worker-tick', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showAlert(`Worker tick finished: recovered ${data.stats?.recovered ?? 0}, completed ${data.stats?.completed ?? 0}, retried ${data.stats?.retried ?? 0}`);
        loadStats();
        loadConversations(search);
      } else {
        showAlert(`Worker error: ${data.error || 'Tick error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showAlert('Failed to invoke worker.', 'error');
    } finally {
      setTickingWorker(false);
    }
  };

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      // Status filter
      if (statusFilter === 'ready' && !c.reportId) return false;
      if (statusFilter === 'queued' && (c.jobStatus !== 'queued' || c.reportId)) return false;
      if (statusFilter === 'running' && (c.jobStatus !== 'running' || c.reportId)) return false;
      if (statusFilter === 'failed' && (c.jobStatus !== 'failed' || c.reportId)) return false;

      // Search query
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const inTitle = c.title.toLowerCase().includes(q);
      const inParticipants = c.participants.some(p => p.toLowerCase().includes(q));
      const inEmail = c.userEmail?.toLowerCase().includes(q);
      const inId = c.id.toLowerCase().includes(q);
      return inTitle || inParticipants || inEmail || inId;
    });
  }, [conversations, statusFilter, search]);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Login View
  if (!authorized) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative size-12 overflow-hidden rounded-full ring-2 ring-black/5 mb-3">
              <Image
                src="/images/frank/avatar.webp"
                alt="Frank"
                width={48}
                height={48}
                className="size-full object-cover"
                priority
              />
            </div>
            <h1 className="font-serif text-2xl tracking-tight text-neutral-900">Frank Admin</h1>
            <p className="text-xs text-neutral-500 mt-1">Authorized operator dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">Admin Passkey</label>
              <div className="relative">
                <input
                  type="password"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder="Enter admin secret key"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                  required
                />
                <Key className="w-4 h-4 text-neutral-400 absolute right-3.5 top-3" />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-2.5 rounded-xl text-sm transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
            >
              {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Enter Dashboard'}
            </button>

            <div className="pt-4 border-t border-neutral-100 text-center">
              <p className="text-xs text-neutral-400 mb-2.5">Or sign in with Google Admin email</p>
              <Link
                href="/api/auth/google?next=/admin"
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-medium transition-colors"
              >
                Sign in with Google
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Cast report data safely for modal rendering
  const fullReport = detail?.reports?.[0]?.fullReportData as Record<string, unknown> | null;
  const scenes = Array.isArray(fullReport?.scenes) ? (fullReport.scenes as Array<Record<string, unknown>>) : [];
  const insideJokes = Array.isArray(fullReport?.dialect) ? (fullReport.dialect as Array<Record<string, unknown>>) : [];
  const profilesList = Array.isArray(fullReport?.pairProfiles) ? (fullReport.pairProfiles as Array<Record<string, unknown>>) : [];

  return (
    <div className="min-h-screen bg-neutral-50/70 text-neutral-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="relative size-8 overflow-hidden rounded-full ring-1 ring-black/5">
              <Image
                src="/images/frank/avatar.webp"
                alt="Frank"
                width={32}
                height={32}
                className="size-full object-cover"
              />
            </div>
            <span className="font-serif text-xl tracking-tight text-neutral-900">Frank</span>
          </Link>
          <span className="px-2 py-0.5 text-[10px] uppercase font-mono font-semibold bg-neutral-100 text-neutral-600 rounded-md border border-neutral-200">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleWorkerTick}
            disabled={tickingWorker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors disabled:opacity-50"
            title="Trigger background worker cycle"
          >
            <Play className={`w-3.5 h-3.5 ${tickingWorker ? 'animate-spin' : 'text-neutral-600'}`} />
            <span className="hidden sm:inline">Trigger Worker</span>
          </button>
          
          <Link
            href="/"
            target="_blank"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          >
            <span>Live Site</span>
            <ExternalLink className="w-3 h-3" />
          </Link>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Toast / Alert Banner */}
        {alertNotice && (
          <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between shadow-xs transition-all ${
            alertNotice.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {alertNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
              <span>{alertNotice.message}</span>
            </div>
            <button onClick={() => setAlertNotice(null)} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Top Metric Overview Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500 text-xs mb-1.5">
                <span>Conversations</span>
                <MessageSquare className="w-4 h-4 text-neutral-400" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-neutral-900">{stats.conversations}</div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500 text-xs mb-1.5">
                <span>Reports Ready</span>
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-neutral-900">{stats.reports}</div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500 text-xs mb-1.5">
                <span>Registered Users</span>
                <Users className="w-4 h-4 text-neutral-400" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-neutral-900">{stats.profiles}</div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500 text-xs mb-1.5">
                <span>Follow-up Q&As</span>
                <MessageCircleQuestion className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-neutral-900">{stats.followups}</div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-2xs col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-neutral-500 text-xs mb-1.5">
                <span>Feedback Items</span>
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-neutral-900">{stats.feedback}</div>
            </div>
          </div>
        )}

        {/* Tab & Filter Controls */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-3 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('conversations')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'conversations'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Chats & Reports ({conversations.length})
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'feedback'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              User Feedback ({feedbackList.length})
            </button>
          </div>

          {/* Search & Status Filters for Conversations */}
          {activeTab === 'conversations' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter Pill Buttons */}
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl text-xs">
                {(['all', 'ready', 'queued', 'running', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg capitalize transition-colors ${
                      statusFilter === st
                        ? 'bg-white text-neutral-900 font-medium shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search title, sender, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={() => { loadConversations(); loadStats(); }}
                className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
                title="Refresh list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Conversations Table */}
        {activeTab === 'conversations' && (
          <div className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/80 border-b border-neutral-200/80 text-neutral-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Conversation</th>
                    <th className="py-3 px-4">Participants</th>
                    <th className="py-3 px-4">Messages</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">Report Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredConversations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-neutral-400">
                        No conversations found matching your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredConversations.map((item) => (
                      <tr key={item.id} className="hover:bg-neutral-50/60 transition-colors">
                        {/* Title & Category */}
                        <td className="py-3 px-4 font-medium text-neutral-900">
                          <div className="truncate max-w-[240px]" title={item.title}>
                            {item.title}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 capitalize">
                              {item.category || 'chat'}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400 uppercase">
                              {item.source}
                            </span>
                          </div>
                        </td>

                        {/* Participants */}
                        <td className="py-3 px-4 text-neutral-700">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {item.participants.length > 0 ? (
                              item.participants.map((p, idx) => (
                                <span key={idx} className="bg-neutral-100 px-1.5 py-0.5 rounded-md text-[10px] text-neutral-600">
                                  {p}
                                </span>
                              ))
                            ) : (
                              <span className="text-neutral-400 text-[11px]">—</span>
                            )}
                          </div>
                        </td>

                        {/* Message Count */}
                        <td className="py-3 px-4 font-mono text-neutral-600">
                          {item.messageCount?.toLocaleString() || 0}
                        </td>

                        {/* Owner Email */}
                        <td className="py-3 px-4 text-neutral-600">
                          {item.userEmail ? (
                            <span className="font-mono text-[11px] text-neutral-800">{item.userEmail}</span>
                          ) : (
                            <span className="text-neutral-400 italic">Guest</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4">
                          {item.reportId ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
                            </span>
                          ) : item.jobStatus === 'running' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-600" /> Analyzing
                            </span>
                          ) : item.jobStatus === 'queued' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" /> Queued
                            </span>
                          ) : item.jobStatus === 'failed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600" /> Failed
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[11px]">No report</span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>

                        {/* Row Actions */}
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {/* View Report Details */}
                          <button
                            onClick={() => openDetail(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-medium transition-all shadow-2xs"
                            title="Inspect forensic breakdown and quotes"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>

                          {/* Open Public View in new tab */}
                          <Link
                            href={`/c/${item.id}`}
                            target="_blank"
                            className="inline-flex items-center justify-center size-7 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                            title="Open in Public Viewer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>

                          {/* Delete Row Button */}
                          <button
                            onClick={() => setItemToDelete({ id: item.id, title: item.title, count: item.messageCount })}
                            className="inline-flex items-center justify-center size-7 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete this chat and all reports permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
              <div className="p-12 text-center text-neutral-400 bg-white border border-neutral-200/80 rounded-2xl shadow-2xs">
                No user feedback received yet.
              </div>
            ) : (
              feedbackList.map((fb) => (
                <div key={fb.id} className="p-4 bg-white border border-neutral-200/80 rounded-2xl shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700">
                        {fb.kind}
                      </span>
                      {fb.email && (
                        <span className="text-neutral-500 font-mono text-[11px]">{fb.email}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-400 font-mono text-[11px]">
                        {new Date(fb.createdAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleDeleteFeedback(fb.id)}
                        className="text-neutral-400 hover:text-red-600 transition-colors"
                        title="Delete feedback item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-800 leading-relaxed">{fb.message}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-neutral-900">Delete Conversation?</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Are you sure you want to permanently delete <strong className="text-neutral-800">&ldquo;{itemToDelete.title}&rdquo;</strong> ({itemToDelete.count.toLocaleString()} messages)?
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
              <p>• All forensic reports generated for this chat will be wiped.</p>
              <p>• Any follow-up questions and answers will be removed.</p>
              <p className="text-red-600 font-medium">• This action cannot be reversed.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forensic Report Inspection Modal */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in">
          <div className="w-full max-w-3xl bg-white border-l border-neutral-200 h-full overflow-y-auto flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Forensic Chat Inspection</h2>
                <p className="text-xs text-neutral-400 font-mono">ID: {selectedId}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/c/${selectedId}`}
                  target="_blank"
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs"
                >
                  <span>Public View</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>

                <button
                  onClick={() => {
                    if (detail) {
                      setItemToDelete({
                        id: selectedId,
                        title: detail.conversation.title,
                        count: detail.conversation.messageCount,
                      });
                    }
                  }}
                  className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title="Delete this conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => { setSelectedId(null); setDetail(null); }}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-6 space-y-6">
              {detailLoading ? (
                <div className="py-24 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
                </div>
              ) : detail ? (
                <div className="space-y-6 text-sm">
                  {/* Metadata Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs">
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-mono">Category</span>
                      <span className="font-semibold text-neutral-800 capitalize">{detail.conversation.category}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-mono">Source</span>
                      <span className="font-semibold text-neutral-800 uppercase">{detail.conversation.source}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-mono">Messages</span>
                      <span className="font-semibold text-neutral-800 font-mono">{detail.conversation.messageCount?.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase font-mono">Owner Account</span>
                      <span className="font-semibold text-neutral-800 font-mono truncate block">{detail.conversation.userEmail || 'Guest'}</span>
                    </div>
                  </div>

                  {/* Navigation Tabs inside Inspection Modal */}
                  <div className="flex items-center gap-1 border-b border-neutral-200 pb-2 text-xs overflow-x-auto">
                    <button
                      onClick={() => setDetailTab('verdict')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        detailTab === 'verdict' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      Headline & Metaphor
                    </button>
                    {scenes.length > 0 && (
                      <button
                        onClick={() => setDetailTab('scenes')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                          detailTab === 'scenes' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        Quotes & Scenes ({scenes.length})
                      </button>
                    )}
                    {insideJokes.length > 0 && (
                      <button
                        onClick={() => setDetailTab('jokes')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                          detailTab === 'jokes' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        Private Language ({insideJokes.length})
                      </button>
                    )}
                    {profilesList.length > 0 && (
                      <button
                        onClick={() => setDetailTab('portraits')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                          detailTab === 'portraits' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        Portraits ({profilesList.length})
                      </button>
                    )}
                    {detail.followups.length > 0 && (
                      <button
                        onClick={() => setDetailTab('qa')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                          detailTab === 'qa' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        Follow-up Q&A ({detail.followups.length})
                      </button>
                    )}
                    <button
                      onClick={() => setDetailTab('raw')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        detailTab === 'raw' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      Technical & Jobs
                    </button>
                  </div>

                  {/* Tab 1: Verdict & Metaphor */}
                  {detailTab === 'verdict' && (
                    <div className="space-y-4">
                      {fullReport ? (
                        <>
                          <div className="p-5 bg-neutral-50 border border-neutral-200/80 rounded-2xl space-y-2">
                            <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Headline</span>
                            <h3 className="text-xl font-serif font-bold text-neutral-900">{String(fullReport.headline || 'Chat Report')}</h3>
                            {typeof fullReport.verdict === 'string' && (
                              <p className="text-neutral-600 text-xs leading-relaxed pt-1">{fullReport.verdict}</p>
                            )}
                          </div>

                          {typeof fullReport.metaphor === 'object' && fullReport.metaphor !== null && (
                            <div className="p-5 bg-neutral-50 border border-neutral-200/80 rounded-2xl space-y-2">
                              <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Core Metaphor</span>
                              <h4 className="font-semibold text-neutral-900 text-sm">{String((fullReport.metaphor as Record<string, unknown>).title || '')}</h4>
                              <p className="italic text-xs text-neutral-500">{String((fullReport.metaphor as Record<string, unknown>).tagline || '')}</p>
                              {Array.isArray((fullReport.metaphor as Record<string, unknown>).paragraphs) && (
                                <div className="space-y-2 pt-2 text-xs text-neutral-700 leading-relaxed">
                                  {((fullReport.metaphor as Record<string, unknown>).paragraphs as string[]).map((para, i) => (
                                    <p key={i}>{para}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-8 text-center text-neutral-400 bg-neutral-50 rounded-xl">
                          No report generated yet for this chat.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Scenes & Quoted Dialogues */}
                  {detailTab === 'scenes' && (
                    <div className="space-y-3">
                      {scenes.map((scene, idx) => (
                        <div key={idx} className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-xl space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="size-5 rounded-full bg-neutral-200 text-neutral-800 font-mono text-[10px] flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-neutral-900 text-xs">{String(scene.title || `Scene ${idx + 1}`)}</span>
                          </div>
                          <p className="text-xs text-neutral-600 leading-relaxed">{String(scene.narrative || '')}</p>
                          
                          {Array.isArray(scene.quotes) && (
                            <div className="space-y-1.5 pl-3 border-l-2 border-neutral-300">
                              {(scene.quotes as Array<Record<string, unknown>>).map((q, qIdx) => (
                                <div key={qIdx} className="text-xs bg-white p-2.5 rounded-lg border border-neutral-200 shadow-2xs">
                                  <span className="font-semibold text-neutral-900 mr-2">{String(q.sender || '')}:</span>
                                  <span className="text-neutral-700">“{String(q.text || '')}”</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {Boolean(scene.reaction) && (
                            <p className="text-xs text-neutral-600 bg-white p-2.5 rounded-lg border border-neutral-200/80 italic">
                              Frank: {String(scene.reaction)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 3: Inside Jokes & Dialect */}
                  {detailTab === 'jokes' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {insideJokes.map((item, idx) => (
                        <div key={idx} className="p-3.5 bg-neutral-50 border border-neutral-200/80 rounded-xl text-xs space-y-1.5">
                          <span className="font-bold text-neutral-900">{String(item.term || '')}</span>
                          <p className="text-neutral-700">{String(item.meaning || '')}</p>
                          {Boolean(item.quote) && (
                            <p className="text-neutral-500 italic bg-white p-2 rounded border border-neutral-200">
                              “{String(item.quote)}”
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 4: Participant Portraits */}
                  {detailTab === 'portraits' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {profilesList.map((p, idx) => (
                        <div key={idx} className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-xl text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-neutral-900 text-sm">{String(p.name || '')}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-200/70 text-neutral-700">{String(p.roleTitle || '')}</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-neutral-600"><strong className="text-neutral-800">Facade:</strong> {String(p.theFacade || '')}</p>
                            <p className="text-neutral-600"><strong className="text-neutral-800">Reality:</strong> {String(p.theReality || '')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 5: Follow-up Questions */}
                  {detailTab === 'qa' && (
                    <div className="space-y-3">
                      {detail.followups.map((f) => (
                        <div key={f.id} className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-xl text-xs space-y-1.5">
                          <p className="font-semibold text-neutral-900">Q: {f.question}</p>
                          <p className="text-neutral-700 leading-relaxed bg-white p-3 rounded-lg border border-neutral-200">
                            A: {f.answer || 'Pending generation...'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 6: Technical & Job Details */}
                  {detailTab === 'raw' && (
                    <div className="space-y-4">
                      {detail.job && (
                        <div className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-xl space-y-2 text-xs">
                          <h4 className="font-semibold text-neutral-900">Background Job Execution</h4>
                          <div className="grid grid-cols-2 gap-2 text-neutral-600 font-mono text-[11px]">
                            <div>Status: <span className="text-neutral-900 font-bold">{detail.job.status}</span></div>
                            <div>Stage: <span className="text-neutral-900">{detail.job.stage}</span></div>
                            <div>Attempts: <span className="text-neutral-900">{detail.job.attempts}</span></div>
                            <div>Updated: <span className="text-neutral-900">{new Date(detail.job.updatedAt).toLocaleString()}</span></div>
                          </div>
                          {detail.job.errorMessage && (
                            <div className="p-2.5 bg-red-50 text-red-700 rounded-lg border border-red-200">
                              Error: {detail.job.errorMessage}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-xl space-y-2 text-xs">
                        <h4 className="font-semibold text-neutral-900">Database IDs</h4>
                        <div className="space-y-1 text-neutral-500 font-mono text-[11px]">
                          <div>Conversation UUID: {detail.conversation.id}</div>
                          {detail.reports[0] && <div>Report UUID: {detail.reports[0].id}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-neutral-500 text-xs">Failed to load details.</p>
              )}
            </div>

            {/* Modal Sticky Footer */}
            {detail && (
              <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setItemToDelete({
                      id: selectedId,
                      title: detail.conversation.title,
                      count: detail.conversation.messageCount,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Chat & Reports</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setDetail(null); }}
                  className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
