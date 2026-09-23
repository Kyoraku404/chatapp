import { validateBio, validateDisplayName } from './validation';
import { validateUsernameInput } from './usernames';

export const PROFILE_ACCENTS = {
  ember: '#ec674e',
  ocean: '#448bd9',
  violet: '#9471d9',
  mint: '#2da98d',
} as const;
export type ProfileAccent = keyof typeof PROFILE_ACCENTS;
export type ProfileLink = { label: string; url: string };

export interface ProfileEdit {
  username: string;
  displayName: string;
  bio: string;
  status: string;
  profileAccent: ProfileAccent;
  links: ProfileLink[];
  allowDMs: boolean;
  showMutualSpaces: boolean;
  avatarUploadId?: string;
  bannerUploadId?: string;
  removeAvatar?: boolean;
  removeBanner?: boolean;
}

export interface PublicProfileView {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
  status: string;
  profileAccent: ProfileAccent;
  links: ProfileLink[];
  createdAt: string | null;
  updatedAt: string | null;
}

const uploadId = /^[a-f0-9-]{36}$/;
const safeMediaUrl = /^\/api\/attachments\/media\?id=[a-f0-9-]{36}$/;
const accents = Object.keys(PROFILE_ACCENTS);

function timestampIso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate() as Date;
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  return null;
}

function safeLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).filter((x): x is ProfileLink => x && typeof x.label === 'string' && typeof x.url === 'string' && x.label.length <= 32 && x.url.length <= 300 && isHttpsLink(x.url));
}

function isHttpsLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function publicProfileFromDoc(uid: string, data: Record<string, unknown>): PublicProfileView {
  const avatar = data.avatarUrl;
  const banner = data.bannerUrl;
  return {
    uid,
    username: typeof data.username === 'string' ? data.username : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : 'RUSH user',
    avatarUrl: typeof avatar === 'string' && (safeMediaUrl.test(avatar) || avatar.startsWith('https://')) ? avatar : null,
    bannerUrl: typeof banner === 'string' && safeMediaUrl.test(banner) ? banner : null,
    bio: typeof data.bio === 'string' ? data.bio : '',
    status: typeof data.status === 'string' ? data.status : '',
    profileAccent: typeof data.profileAccent === 'string' && accents.includes(data.profileAccent) ? data.profileAccent as ProfileAccent : 'ember',
    links: safeLinks(data.links),
    createdAt: timestampIso(data.createdAt),
    updatedAt: timestampIso(data.updatedAt),
  };
}

export function validateProfileEdit(input: unknown): { ok: true; value: ProfileEdit } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Invalid profile.' };
  const raw = input as Record<string, unknown>;
  if (typeof raw.username !== 'string') return { ok: false, error: 'Username is required.' };
  const username = validateUsernameInput(raw.username);
  if (!username.ok) return username;
  if (typeof raw.displayName !== 'string') return { ok: false, error: 'Display name is required.' };
  const nameError = validateDisplayName(raw.displayName);
  if (nameError) return { ok: false, error: nameError };
  if (typeof raw.bio !== 'string') return { ok: false, error: 'Bio must be text.' };
  const bioError = validateBio(raw.bio);
  if (bioError) return { ok: false, error: bioError };
  if (typeof raw.status !== 'string' || raw.status.trim().length > 80) return { ok: false, error: 'Status must be under 80 characters.' };
  if (typeof raw.profileAccent !== 'string' || !accents.includes(raw.profileAccent)) return { ok: false, error: 'Choose a RUSH profile accent.' };
  if (!Array.isArray(raw.links) || raw.links.length > 3) return { ok: false, error: 'Add up to three links.' };
  const links: ProfileLink[] = [];
  for (const item of raw.links) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Invalid link.' };
    const link = item as Record<string, unknown>;
    if (typeof link.label !== 'string' || !link.label.trim() || link.label.trim().length > 32 || typeof link.url !== 'string' || link.url.length > 300 || !isHttpsLink(link.url.trim())) return { ok: false, error: 'Links need a label and an https:// URL.' };
    links.push({ label: link.label.trim(), url: link.url.trim() });
  }
  if (typeof raw.allowDMs !== 'boolean' || typeof raw.showMutualSpaces !== 'boolean') return { ok: false, error: 'Invalid privacy settings.' };
  for (const kind of ['avatar', 'banner'] as const) {
    const id = raw[`${kind}UploadId`];
    if (id !== undefined && (typeof id !== 'string' || !uploadId.test(id))) return { ok: false, error: `Invalid ${kind} upload.` };
    if (raw[`remove${kind[0].toUpperCase()}${kind.slice(1)}`] !== undefined && typeof raw[`remove${kind[0].toUpperCase()}${kind.slice(1)}`] !== 'boolean') return { ok: false, error: `Invalid ${kind} change.` };
  }
  if (raw.avatarUploadId && raw.removeAvatar || raw.bannerUploadId && raw.removeBanner) return { ok: false, error: 'Choose either an upload or removal.' };
  return { ok: true, value: {
    username: username.value,
    displayName: raw.displayName.trim(),
    bio: raw.bio.trim(),
    status: raw.status.trim(),
    profileAccent: raw.profileAccent as ProfileAccent,
    links,
    allowDMs: raw.allowDMs,
    showMutualSpaces: raw.showMutualSpaces,
    ...(raw.avatarUploadId ? { avatarUploadId: raw.avatarUploadId as string } : {}),
    ...(raw.bannerUploadId ? { bannerUploadId: raw.bannerUploadId as string } : {}),
    ...(raw.removeAvatar ? { removeAvatar: true } : {}),
    ...(raw.removeBanner ? { removeBanner: true } : {}),
  } };
}
