const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f-]{27}$/iu;
const HEX_SEGMENT = /^[0-9a-f]{16,}$/iu;
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/u;

export function canonicalWorkspaceUrlStructure(rawUrl: string): string {
  const url = new URL(rawUrl);
  const path = url.pathname
    .split('/')
    .map((segment) => normalizePathSegment(segment))
    .join('/');
  const query = [...new Set(url.searchParams.keys())]
    .sort()
    .map((key) => `${key}=${queryShapes(url.searchParams.getAll(key))}`)
    .join('&');
  return `${url.origin}${path}${query ? `?${query}` : ''}`;
}

export async function deriveWorkspaceLayoutKey(rawUrl: string, installSecret: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(installSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const input = new TextEncoder().encode(canonicalWorkspaceUrlStructure(rawUrl));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
  return `workspace-layout:v2:${base64Url(signature)}`;
}

export function createWorkspaceLayoutInstallSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function encodeWorkspaceLayoutInstallSecret(secret: Uint8Array): string {
  return base64Url(secret);
}

export function decodeWorkspaceLayoutInstallSecret(encoded: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) return null;
  try {
    const padded = encoded.replace(/-/gu, '+').replace(/_/gu, '/') + '=';
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function normalizePathSegment(segment: string): string {
  const decoded = safeDecode(segment);
  if (UUID_SEGMENT.test(decoded)) return '{uuid}';
  if (HEX_SEGMENT.test(decoded)) return '{hex}';
  if (OPAQUE_SEGMENT.test(decoded)) return '{opaque}';
  return decoded.replace(/\d+/gu, '{n}');
}

function queryShapes(values: readonly string[]): string {
  return [...new Set(values.map((value) => queryValueShape(value)))].sort().join(',');
}

function queryValueShape(value: string): string {
  if (value === '') return 'empty';
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return 'number';
  if (/^(?:true|false)$/iu.test(value)) return 'boolean';
  if (UUID_SEGMENT.test(value)) return 'uuid';
  if (/^https?:\/\//iu.test(value)) return 'url';
  return 'text';
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function base64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}
