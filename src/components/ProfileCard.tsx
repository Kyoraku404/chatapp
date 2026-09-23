import { Avatar } from "@/components/Presence";
import { PROFILE_ACCENTS, type PublicProfileView } from "@/lib/profileModel";
import type { CSSProperties, ReactNode } from "react";

export function ProfileCard({ profile, mutualSpaces = [], mutualGroups = [], actions }: { profile: PublicProfileView; mutualSpaces?: { id: string; name: string }[]; mutualGroups?: { id: string; name: string }[]; actions?: ReactNode }) {
  return <section className="profile-card overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card" aria-label={`${profile.displayName}'s profile`} style={{ "--profile-accent": PROFILE_ACCENTS[profile.profileAccent] } as CSSProperties}>
    <div className="profile-cover" style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined} />
    <div className="relative px-5 pb-6 sm:px-7">
      <div className="profile-card-avatar"><Avatar name={profile.displayName} size={88} src={profile.avatarUrl} /></div>
      <h1 className="font-display mt-3 break-words text-2xl font-bold">{profile.displayName}</h1>
      <p className="text-sm font-medium text-ink-500">@{profile.username}</p>
      {profile.status && <p className="profile-status mt-4">{profile.status}</p>}
      {profile.bio && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">{profile.bio}</p>}
      {profile.links.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{profile.links.map(link => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" className="profile-text-link rounded-lg border border-ink-200 px-2.5 py-1.5">{link.label} ↗</a>)}</div>}
      {profile.createdAt && <p className="mt-5 text-xs text-ink-400">Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>}
      {(mutualSpaces.length > 0 || mutualGroups.length > 0) && <div className="mt-5 border-t border-ink-100 pt-4"><h2 className="text-xs font-bold uppercase tracking-widest text-ink-500">In common</h2><div className="mt-2 flex flex-wrap gap-2">{mutualSpaces.map(s => <span key={`s-${s.id}`} className="profile-chip">{s.name}</span>)}{mutualGroups.map(g => <span key={`g-${g.id}`} className="profile-chip">{g.name}</span>)}</div></div>}
      {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
    </div>
  </section>;
}
