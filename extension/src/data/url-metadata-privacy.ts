import {
  DEFAULT_SEARCHABLE_METADATA_POLICY,
  hashSearchableUrl,
  type SearchableMetadataMode,
  type SearchableMetadataPolicy,
} from '../core/metadata-policy.js';
import type { DurableMetadataKeyContext } from './durable-metadata-key.js';

export interface UrlMetadataPrivacyOptions {
  readonly getSearchableMetadataPolicy?: () => SearchableMetadataPolicy | Promise<SearchableMetadataPolicy>;
  readonly getEncryptionKey?: () => DurableMetadataKeyContext | Promise<DurableMetadataKeyContext>;
}

export async function urlMetadataMode(
  options: UrlMetadataPrivacyOptions,
  policy?: SearchableMetadataPolicy,
): Promise<SearchableMetadataMode> {
  return (policy ?? (await options.getSearchableMetadataPolicy?.()) ?? DEFAULT_SEARCHABLE_METADATA_POLICY).urlDerived;
}

export async function requireUrlMetadataEncryptionKey(options: UrlMetadataPrivacyOptions): Promise<DurableMetadataKeyContext> {
  const key = await options.getEncryptionKey?.();
  if (!key) throw new Error('URL-derived metadata encryption key is unavailable.');
  return key;
}

export async function encryptedUrlMetadataKey(prefix: string, ...values: readonly string[]): Promise<string> {
  return `${prefix}v2:${(await Promise.all(values.map((value) => hashSearchableUrl(value)))).join(':')}`;
}

export async function encryptedUrlMetadataPrefix(prefix: string, ...values: readonly string[]): Promise<string> {
  return `${await encryptedUrlMetadataKey(prefix, ...values)}:`;
}
