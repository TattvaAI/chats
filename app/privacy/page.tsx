import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/frank/header';

export default function Privacy() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto max-w-3xl flex-1 space-y-6 px-6 py-16 text-sm leading-relaxed">
        <h1 className="font-serif text-4xl">Your privacy</h1>
        <p>Updated 4 October 2026</p>

        <h2 className="font-serif text-2xl">What happens to an upload</h2>
        <p>Your file is parsed in your browser. When you select Create report, the messages, chosen names and your note are sent to our server and Google Vertex AI to write your report. Follow-up questions send your question and the saved report to Google for an answer. We do not train our own models on your chats or sell them.</p>

        <h2 className="font-serif text-2xl">What we keep</h2>
        <p>Neon Postgres stores the messages temporarily while your report is queued or running. The raw message payload is removed when the job completes or permanently fails. The background worker recovers interrupted jobs and clears expired payloads from unfinished jobs older than 24 hours when it runs. An interruption to the worker or database can delay that cleanup.</p>
        <p>Your report, quoted messages, calculated statistics, and follow-up questions and answers remain on the server until you delete the conversation. Reports created while signed in belong to your account, so you can return on another device. For guest reports, this browser stores the report ID and a private access token, not a persistent copy of the report or uploaded chat. Avoid shared devices for private conversations.</p>

        <h2 className="font-serif text-2xl">Who can open a report</h2>
        <p>A report requires your verified account or the guest browser’s private access token. If you choose Share, a separate read-only link is created for seven days. Anyone with that link can read the conversation’s reports and statistics during that period. Your follow-up questions are not included in the shared view. You can revoke the link earlier. Revocation cannot erase copies someone has already made.</p>

        <h2 className="font-serif text-2xl">Sign-in and service providers</h2>
        <p>Google sign-in gives us your verified email address and a Google account identifier so we can keep your reports with your account. A session cookie keeps you signed in.</p>
        <p>The app’s hosting provider handles requests, Neon stores account and report data, and Google Vertex AI processes generation requests. If email delivery is enabled, Resend delivers sign-in codes and requested report links. These providers’ applicable service terms and abuse-monitoring policies apply. We do not promise zero retention by every provider. Private pages do not load advertising pixels.</p>

        <h2 className="font-serif text-2xl">Deletion</h2>
        <p>Delete a conversation from its page to remove all its reports, statistics, follow-up questions and access links. You can also delete your account and reports from Account. After the server confirms deletion, the app removes the related access details from this browser. Copies you or a shared-link recipient downloaded or printed remain outside the app.</p>
        <p>Deletion removes active database records; it does not immediately erase provider backups. Backup copies are subject to the providers’ configured retention schedules. Support and feedback messages submitted with your account’s verified email are removed when you delete that account. Messages without a matching email cannot be linked to your account automatically.</p>

        <h2 className="font-serif text-2xl">Support</h2>
        <p>Use the <Link href="/support" className="underline">support form</Link> for privacy questions. The form asks for an email address for a reply. Avoid including private chat excerpts.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
