import { Suspense } from 'react';
import { LegacyReportRedirect } from '@/components/frank/legacy-report-redirect';

export default function FullReportPage() {
  return <Suspense><LegacyReportRedirect /></Suspense>;
}
