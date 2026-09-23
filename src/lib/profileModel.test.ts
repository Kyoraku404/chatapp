import { describe, expect, it } from 'vitest';
import { publicProfileFromDoc, validateProfileEdit } from './profileModel';

const valid = { username: 'alice.rush', displayName: 'Alice', bio: 'Design and music', status: 'Available', profileAccent: 'violet', links: [{ label: 'Website', url: 'https://example.com' }], allowDMs: true, showMutualSpaces: false };

describe('profile validation and public projection', () => {
  it('accepts a valid edit and normalizes the username', () => {
    const result = validateProfileEdit({ ...valid, username: '  ALICE.RUSH  ' });
    expect(result.ok && result.value.username).toBe('alice.rush');
  });
  it('rejects invalid names, links and media claims', () => {
    expect(validateProfileEdit({ ...valid, username: '../admin' }).ok).toBe(false);
    expect(validateProfileEdit({ ...valid, links: [{ label: 'bad', url: 'javascript:alert(1)' }] }).ok).toBe(false);
    expect(validateProfileEdit({ ...valid, bannerUploadId: 'not-a-uuid' }).ok).toBe(false);
    expect(validateProfileEdit({ ...valid, bio: 'x'.repeat(161) }).ok).toBe(false);
  });
  it('returns only safe public fields', () => {
    const profile = publicProfileFromDoc('uid-1', { ...valid, email: 'private@example.com', session: 'secret', avatarPath: 'internal/path', bannerUrl: 'javascript:bad', avatarUrl: '/api/attachments/media?id=aaaabbbb-cccc-dddd-eeee-ffff00001111' });
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('session');
    expect(profile).not.toHaveProperty('avatarPath');
    expect(profile.bannerUrl).toBeNull();
    expect(profile.avatarUrl).toContain('/api/attachments/media');
  });
});
