const AES_GCM: AesKeyGenParams = { name: 'AES-GCM', length: 256 };
const IV_BYTE_LENGTH = 12;

export function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto subtle API is unavailable.');
  return globalThis.crypto;
}

export async function generateAesGcmKey(extractable = false): Promise<CryptoKey> {
  return getCrypto().subtle.generateKey(AES_GCM, extractable, ['encrypt', 'decrypt']);
}

export function createAesGcmIv(crypto: Crypto = getCrypto()): Uint8Array {
  const iv = new Uint8Array(IV_BYTE_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

export async function encryptAesGcm(
  key: CryptoKey,
  plaintext: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  if (iv.byteLength !== IV_BYTE_LENGTH) throw new Error('AES-GCM IV must be 12 bytes.');
  const result = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData as BufferSource | undefined },
    key,
    plaintext as BufferSource,
  );
  return new Uint8Array(result);
}

export async function decryptAesGcm(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  if (iv.byteLength !== IV_BYTE_LENGTH) throw new Error('AES-GCM IV must be 12 bytes.');
  const result = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData as BufferSource | undefined },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(result);
}
