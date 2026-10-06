import type { Metadata } from 'next';
import { Geist, Geist_Mono, EB_Garamond } from 'next/font/google';
import './globals.css';
import { AnalyticsScripts } from '@/components/frank/analytics';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const ebGaramond = EB_Garamond({
  variable: '--font-eb-garamond',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'What Frank Thinks — The truth about your chats',
  description:
    "Upload a WhatsApp or iMessage chat and get an AI report on what's really going on: who cares more, what changed, and what Frank honestly thinks of everyone in it.",
  applicationName: 'What Frank Thinks',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'What Frank Thinks — The truth about your chats',
    description:
      "Upload a WhatsApp or iMessage chat and get an AI report on what's really going on: who cares more, what changed, and what Frank honestly thinks of everyone in it.",
    siteName: 'What Frank Thinks',
    type: 'website',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'What Frank Thinks',
      alternateName: 'WhatFrankThinks',
      description:
        "Upload a WhatsApp or iMessage chat and get an AI report on what's really going on: who cares more, what changed, and what Frank honestly thinks of everyone in it.",
    },
    {
      '@type': 'WebSite',
      name: 'What Frank Thinks',
      inLanguage: 'en',
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${ebGaramond.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground" suppressHydrationWarning>
        {children}
        <AnalyticsScripts />
        <script
          id="schema-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
