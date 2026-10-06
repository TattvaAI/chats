import { Suspense } from 'react';
import { LegacyReportRedirect } from '@/components/frank/legacy-report-redirect';

export default function PreviewPage() {
  return <Suspense><LegacyReportRedirect /></Suspense>;
}
