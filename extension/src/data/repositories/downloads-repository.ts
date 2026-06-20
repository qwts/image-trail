import { createAesGcmIv, encryptAesGcm, decryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import {
  buildExportFileHeader,
  serializeExportFile,
  parseExportFile,
  toBase64,
  fromBase64,
} from '../import-export/encrypted-file-format.js';
import { openJsonEnvelope, sealJsonEnvelope } from '../crypto/envelope.js';
import type { EncryptedEnvelope } from '../crypto/types.js';
import { findDownloadDuplicate } from '../../core/image/downloads.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import type { DurableDownloadPayloadV1 } from '../types.js';

export interface EncryptedDownloadRecord {
  readonly uuid: string;
  readonly envelope: EncryptedEnvelope<{ readonly recordType: 'download' }>;
}

export interface DownloadDuplicateResult {
  readonly record: EncryptedDownloadRecord;
  readonly payload: DurableDownloadPayloadV1;
  readonly matchedBy: 'fingerprint' | 'url';
}

export class DownloadsRepository {
  constructor(private readonly db: IDBDatabase) {}

  async putEncrypted(record: EncryptedDownloadRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Downloads, 'readwrite');
    transaction.objectStore(DataStore.Downloads).put(record);
    await transactionDone(transaction);
  }

  async getEncrypted(uuid: string): Promise<EncryptedDownloadRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Downloads, 'readonly');
    const result = await requestToPromise<EncryptedDownloadRecord | undefined>(transaction.objectStore(DataStore.Downloads).get(uuid));
    await transactionDone(transaction);
    return result;
  }

  async listEncryptedNewestFirst(): Promise<readonly EncryptedDownloadRecord[]> {
    const transaction = this.db.transaction(DataStore.Downloads, 'readonly');
    const index = transaction.objectStore(DataStore.Downloads).index(SchemaIndex.DownloadsByDownloadedAt);
    const request = index.openCursor(null, 'prev');
    const result: EncryptedDownloadRecord[] = [];

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        result.push(cursor.value as EncryptedDownloadRecord);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    return result;
  }

  async sealAndPut(
    uuid: string,
    payload: DurableDownloadPayloadV1,
    key: CryptoKey,
    keyReference: EncryptedDownloadRecord['envelope']['key'],
    now = payload.downloadedAt,
  ): Promise<EncryptedDownloadRecord> {
    const envelope = await sealJsonEnvelope({
      payload,
      payloadVersion: 1,
      key,
      keyReference,
      authenticatedMetadata: { recordType: 'download' as const },
      now,
    });
    const record = { uuid, envelope };
    await this.putEncrypted(record);
    return record;
  }

  async openRecord(record: EncryptedDownloadRecord, key: CryptoKey): Promise<DurableDownloadPayloadV1> {
    return openJsonEnvelope<DurableDownloadPayloadV1>(record.envelope, key);
  }

  async findDuplicate(
    candidate: { readonly sourceUrl: string; readonly fingerprint?: string },
    key: CryptoKey,
  ): Promise<DownloadDuplicateResult | null> {
    const opened: Array<{ readonly record: EncryptedDownloadRecord; readonly payload: DurableDownloadPayloadV1 }> = [];
    for (const record of await this.listEncryptedNewestFirst()) {
      try {
        opened.push({ record, payload: await this.openRecord(record, key) });
      } catch {
        // Records encrypted with unavailable keys cannot participate in this dedupe check.
      }
    }

    const duplicate = findDownloadDuplicate(
      opened.map(({ payload }) => payload),
      candidate,
    );
    if (!duplicate) return null;
    const match = opened.find(({ payload }) => payload === duplicate.record);
    return match ? { ...match, matchedBy: duplicate.matchedBy } : null;
  }
}

export interface EncryptedDownloadInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly sourceUrl: string;
  readonly password: string;
  readonly now?: string;
}

export interface EncryptedDownloadResult {
  readonly fileContent: string;
  readonly fileName: string;
}

export async function createEncryptedDownload(input: EncryptedDownloadInput): Promise<EncryptedDownloadResult> {
  const { data, mimeType, sourceUrl, password, now = new Date().toISOString() } = input;

  const salt = createPasswordSalt();
  const iterations = 600_000;
  const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });

  const payloadJson = JSON.stringify({ mimeType, sourceUrl, data: toBase64(data) });
  const plaintext = new TextEncoder().encode(payloadJson);
  const iv = createAesGcmIv();
  const ciphertext = await encryptAesGcm(encryptionKey, plaintext, iv);

  const header = buildExportFileHeader({
    payloadType: 'mixed',
    algorithm: 'AES-GCM',
    wrappingMode: 'password',
    keyKind: 'export',
    keyReference: `export:${crypto.randomUUID()}`,
    salt,
    iv,
    iterations,
    recordCount: 1,
    now,
  });

  const fileContent = serializeExportFile({ header, payload: toBase64(ciphertext) });

  let fileName: string;
  try {
    const url = new URL(sourceUrl);
    const baseName = url.pathname.split('/').filter(Boolean).at(-1) ?? 'download';
    fileName = `${baseName}.encrypted.json`;
  } catch {
    fileName = `image-trail-download-${now.slice(0, 10)}.encrypted.json`;
  }

  return { fileContent, fileName };
}

export interface DecryptedDownloadResult {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly sourceUrl: string;
}

export async function openEncryptedDownload(fileContent: string, password: string): Promise<DecryptedDownloadResult> {
  const envelope = parseExportFile(fileContent);
  const salt = fromBase64(envelope.header.salt);
  const iv = fromBase64(envelope.header.iv);
  const ciphertext = fromBase64(envelope.payload);

  const encryptionKey = await deriveEncryptionKey(password, {
    salt,
    iterations: envelope.header.iterations,
  });

  const plaintext = await decryptAesGcm(encryptionKey, ciphertext, iv);
  const decoded = new TextDecoder().decode(plaintext);
  const parsed = JSON.parse(decoded) as { mimeType: string; sourceUrl: string; data: string };

  return {
    data: fromBase64(parsed.data),
    mimeType: parsed.mimeType,
    sourceUrl: parsed.sourceUrl,
  };
}
