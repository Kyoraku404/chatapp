import { memo } from 'react';
import { Clock3, Check, CheckCheck, CircleAlert } from 'lucide-react';
import type { MessageStatus as Status } from '@/lib/message-lifecycle';

export const MessageStatus = memo(function MessageStatus({ status }: { status: Status }) {
  const Icon = status === 'sending' ? Clock3 : status === 'failed' ? CircleAlert : status === 'sent' ? Check : CheckCheck;
  return <span className={`message-status status-${status}`} aria-label={status} title={status[0].toUpperCase() + status.slice(1)}><Icon key={status} size={14} strokeWidth={1.8} aria-hidden="true" /></span>;
});
