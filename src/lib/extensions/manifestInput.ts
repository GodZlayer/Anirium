import { ApiInputError } from '../apiInput';
import { createHash } from 'node:crypto';
import type { AniriumAddonManifest, RemoteManifestConfig } from './types';

// This validates stored metadata. Only the Service can authorize outbound fetches.
export function canonicalizeRemoteManifestUrl(input: unknown): string {
  const fail = (): never => { throw new ApiInputError(400, 'invalid_manifest_url'); };
  if (typeof input !== 'string' || !input || input.length > 2048 || /[\u0000-\u001f\u007f\s\\]/.test(input)) return fail();
  let url: URL;
  try { url = new URL(input); } catch { return fail(); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) return fail();
  return url.href;
}

// Deterministic account registration: id is derived from the canonical URL.
export function parseRemoteManifestConfig(input: unknown): RemoteManifestConfig {
  const manifestUrl = canonicalizeRemoteManifestUrl(input);
  const digest = createHash('sha256').update(manifestUrl).digest('hex').slice(0, 32);
  return { id: `remote-${digest}`, kind: 'remote-manifest', manifestUrl };
}

export function parseCommunityManifest(input: unknown): AniriumAddonManifest {
  const fail = (): never => { throw new ApiInputError(400, 'invalid_addon_manifest'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const source = input as Record<string, unknown>;
  const text = (key: string, max: number, fallback?: string): string => {
    const value = source[key] === undefined ? fallback : source[key];
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return fail();
    return value.trim();
  };
  const tokens = (key: string): string[] => {
    const value = source[key] === undefined ? [] : source[key];
    if (!Array.isArray(value) || value.length > 32) return fail();
    if (value.some(item => typeof item !== 'string' || !/^[a-z][a-z0-9._-]{0,99}$/.test(item))) return fail();
    return [...new Set(value as string[])];
  };
  const remoteUrl = (key: string): string | undefined => {
    if (source[key] === undefined) return undefined;
    const value = text(key, 2048);
    if (!value || /[\s\\]/.test(value)) return fail();
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) return fail();
    } catch { return fail(); }
    return value;
  };
  const id = text('id', 100);
  const name = text('name', 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id) || id.toLowerCase() === 'player-pro' || !name) fail();
  const version = text('version', 64, '1.0.0');
  const author = text('author', 100, 'Comunidade');
  if (!version || !author) fail();
  const manifest: AniriumAddonManifest = {
    id, name, version, author, description: text('description', 4000, ''),
    type: 'community', origin: 'community', enabled: true,
    // Extension capability names are extensible protocol tokens, not grants.
    capabilities: tokens('capabilities') as AniriumAddonManifest['capabilities'],
    permissions: tokens('permissions') as AniriumAddonManifest['permissions'],
  };
  for (const key of ['serviceUrl', 'manifestUrl'] as const) {
    const value = remoteUrl(key);
    if (value !== undefined) manifest[key] = value;
  }
  if (source.entrypoint !== undefined) manifest.entrypoint = text('entrypoint', 2048);
  if (source.license !== undefined) manifest.license = text('license', 100);
  return manifest;
}
