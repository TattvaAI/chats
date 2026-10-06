'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChatStore } from '@/lib/store/useChatStore';
import { useConversation } from '@/lib/hooks/useConversation';
import { ReportStatus } from './report-status';

/** Legacy addresses never render a previously opened report from browser memory. */
export function LegacyReportRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const draftId = useChatStore(state => state.conversationId);
  const id = params.get('conversationId') || params.get('id') || draftId;
  const result = useConversation(id, params.get('report') || params.get('reportNumber') || undefined);
  const reportNumber = result.data?.reportNumber;
  const share = result.shareToken;
  useEffect(() => {
    if (result.status === 'found' && reportNumber) router.replace(`/c/${encodeURIComponent(id)}/reports/${reportNumber}${share ? `#share=${encodeURIComponent(share)}` : ''}`);
  }, [id, reportNumber, result.status, router, share]);
  return <ReportStatus key={id} id={id} status={result.status === 'found' ? 'loading' : result.status} message={result.status === 'found' ? 'Opening your saved report…' : result.message} retry={result.retry} shared={Boolean(share)} />;
}
