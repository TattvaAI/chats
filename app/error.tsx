'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-serif text-3xl">Something went wrong.</h1>
      <p className="text-sm text-muted-foreground">Please try again. Your saved reports remain in your account.</p>
      <button type="button" onClick={reset} className="rounded-xl bg-primary px-6 py-3 text-primary-foreground">
        Try again
      </button>
    </main>
  );
}
