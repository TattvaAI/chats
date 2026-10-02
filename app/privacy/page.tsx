import { SiteHeader, SiteFooter } from '@/components/brandon/header';

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-6 pt-16 pb-24">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 text-foreground/90">
          <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="text-xs font-mono text-muted-foreground">Updated August 2026</p>

          <div className="flex flex-col gap-6 text-sm leading-relaxed border-t border-border pt-6">
            <h2 className="font-serif text-2xl font-medium text-foreground">1. Your conversations stay private</h2>
            <p>
              We process only the data strictly necessary to generate your report. We do not sell your data, and we never use your uploaded conversations, notes, or reports to train artificial intelligence models.
            </p>

            <h2 className="font-serif text-2xl font-medium text-foreground">2. Stored Until You Delete</h2>
            <p>
              Your reports are stored until you delete them. Delete one conversation from its page, or everything at once from your account page — deletion is immediate and permanent.
            </p>

            <h2 className="font-serif text-2xl font-medium text-foreground">3. Third-party Providers</h2>
            <p>
              We work with trusted enterprise infrastructure providers under strict confidentiality agreements: Cloudflare/Vercel for hosting, Resend for email, and Anthropic/Google Gemini for report generation under zero-retention enterprise terms.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
