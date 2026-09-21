import Link from 'next/link';
import { MessageCircle, UsersRound, Layers, CircleUser } from 'lucide-react';
import { formatUnreadCount } from '@/lib/unread';

export function MobileNav({ active, unread, onSelect }: { active: 'chats' | 'groups' | 'spaces' | 'you'; unread: number; onSelect: (id: 'chats' | 'groups' | 'spaces') => void }) {
  const badge = formatUnreadCount(unread);
  return <nav aria-label="Primary" className="mobile-nav">
    {([{ id: 'chats', label: 'Chats', Icon: MessageCircle }, { id: 'groups', label: 'Groups', Icon: UsersRound }, { id: 'spaces', label: 'Spaces', Icon: Layers }] as const).map(({ id, label, Icon }) =>
      <button key={id} onClick={() => onSelect(id)} aria-current={active === id ? 'page' : undefined} className="mobile-nav-item">
        <span className="relative"><Icon size={22} strokeWidth={1.8} aria-hidden="true" />{id === 'chats' && badge && <span key={badge} className="unread-badge nav-badge" aria-label={`${unread} unread messages`}>{badge}</span>}</span>
        <span>{label}</span>
      </button>)}
    <Link href="/profile" aria-current={active === 'you' ? 'page' : undefined} className="mobile-nav-item"><CircleUser size={22} strokeWidth={1.8} aria-hidden="true" /><span>You</span></Link>
  </nav>;
}
