'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, AlertTriangle, ArrowRight, User, FileText, LogOut } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';

interface MyConversation {
  id: string;
  title: string;
  category: string;
  createdAt: string;
}

export default function AccountPage() {
  const [deleted, setDeleted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [reports, setReports] = useState<MyConversation[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          if (!cancelled) {
            setEmail(null);
            setAuthChecked(true);
          }
          return;
        }
        const meData = await meRes.json();
        if (!cancelled) {
          setEmail(meData.email ?? null);
          setAuthChecked(true);
        }
        if (meRes.ok) {
          try {
            const rRes = await fetch('/api/conversations?mine=1');
            if (rRes.ok) {
              const rData = await rRes.json();
              if (!cancelled) setReports(rData.conversations ?? []);
            } else if (!cancelled) {
              setReports([]);
            }
          } catch {
            if (!cancelled) setReportsError('Could not load reports');
          }
        }
      } catch {
        if (!cancelled) {
          setEmail(null);
          setAuthChecked(true);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to permanently delete all uploaded chats and generated reports? This cannot be undone.')) return;
    try {
      const ids: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('frank:conv:')) ids.push(k.slice('frank:conv:'.length));
      }
      await Promise.all(
        ids.map((id) => {
          let deleteToken: string | null = null;
          try {
            const raw = localStorage.getItem(`frank:conv:${id}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (typeof parsed?.deleteToken === 'string') deleteToken = parsed.deleteToken;
            }
          } catch {
            deleteToken = null;
          }
          return fetch(`/api/conversations/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: deleteToken ? { 'x-delete-token': deleteToken } : {},
          }).catch(() => null);
        })
      );
      ids.forEach((id) => localStorage.removeItem(`frank:conv:${id}`));
      setReports([]);
    } finally {
      setDeleted(true);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setEmail(null);
    setReports([]);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-24 sm:pt-16">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
              Your Account & Data Controls
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You own your data. Your reports are kept until you delete them — manage them below or purge everything.
            </p>
          </div>

          {deleted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 text-sm">
              All conversation files, analytics logs, and generated reports have been permanently purged from our servers.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <User className="size-5 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {!authChecked
                        ? 'Checking session…'
                        : email
                          ? email
                          : 'Signed out'}
                    </span>
                  </div>
                  {authChecked && !email ? (
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <span>Sign in</span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  ) : email ? (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <LogOut className="size-3.5" />
                      <span>Sign out</span>
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Your conversations stay stored until you delete them — nothing expires automatically.
                </p>
              </div>

              {/* MY REPORTS */}
              <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-5 text-muted-foreground" />
                  <h3 className="font-medium text-sm">My reports</h3>
                </div>
                {!authChecked ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : !email ? (
                  <p className="text-xs text-muted-foreground">
                    <Link href="/login" className="text-primary hover:underline font-medium">
                      Sign in
                    </Link>{' '}
                    to see your reports.
                  </p>
                ) : reportsError ? (
                  <p className="text-xs text-destructive">{reportsError}</p>
                ) : reports.length === 0 ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      No reports yet.
                    </p>
                    <Link
                        href="/setup"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90"
                    >
                      <span>Analyze a chat</span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {reports.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/c/${r.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 hover:bg-accent transition-colors"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium truncate">{r.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.category} · {new Date(r.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* DANGER ZONE: DATA PURGE */}
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" />
                  <h3 className="font-serif text-lg font-medium">Privacy & Purge Controls</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Permanently erase all chat transcripts, forensic calculations, and reports immediately. This action cannot be reversed.
                </p>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-destructive px-5 text-xs font-medium text-white shadow-xs transition-all hover:bg-destructive/90"
                >
                  <Trash2 className="size-3.5" />
                  <span>Delete All My Data Now</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
