'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';

type ReportLinkProps = Omit<ComponentProps<'a'>, 'href'> & { href: string };

export function ReportLink({ href, children, ...props }: ReportLinkProps) {
  // Next 16.3's cache can append the initial URL fragment again when returning
  // to a shared page. Native navigation preserves the capability exactly and
  // keeps it out of server URLs. Ordinary account links retain client routing.
  if (new URLSearchParams(href.split('#', 2)[1] || '').has('share')) {
    return <a href={href} {...props}>{children}</a>;
  }
  return <Link href={href} {...props}>{children}</Link>;
}
