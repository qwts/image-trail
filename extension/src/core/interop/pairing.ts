import * as v from 'valibot';
import { interopTimestampSchema, interopUuidSchema } from './contract.js';

export const INTEROP_PAIRING_MAGIC = 'OVERLOOK-IMAGE-TRAIL-PAIRING';
export const INTEROP_PAIRING_FORMAT_VERSION = 1;
export const INTEROP_PAIRING_PBKDF2_ITERATIONS = 600_000;

const canonicalBase64Schema = v.pipe(
  v.string(),
  v.minLength(1),
  v.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u),
);
export const interopKeyIdSchema = v.pipe(
  v.string(),
  v.regex(/^interop:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
) as v.GenericSchema<unknown, `interop:${string}`>;

export const interopPairingPayloadSchema = v.strictObject({
  schemaVersion: v.literal(1),
  pairingId: interopUuidSchema,
  keyId: interopKeyIdSchema,
  interopKey: canonicalBase64Schema,
  products: v.tuple([v.literal('image-trail'), v.literal('overlook')]),
  createdAt: interopTimestampSchema,
});

export const interopPairingBundleSchema = v.strictObject({
  magic: v.literal(INTEROP_PAIRING_MAGIC),
  formatVersion: v.literal(INTEROP_PAIRING_FORMAT_VERSION),
  pairingId: interopUuidSchema,
  keyId: interopKeyIdSchema,
  createdAt: interopTimestampSchema,
  kdf: v.strictObject({
    name: v.literal('PBKDF2'),
    hash: v.literal('SHA-256'),
    iterations: v.literal(INTEROP_PAIRING_PBKDF2_ITERATIONS),
    salt: canonicalBase64Schema,
  }),
  cipher: v.strictObject({
    name: v.literal('AES-256-GCM'),
    iv: canonicalBase64Schema,
    ciphertext: canonicalBase64Schema,
  }),
});

export type InteropPairingPayload = v.InferOutput<typeof interopPairingPayloadSchema>;
export type InteropPairingBundle = v.InferOutput<typeof interopPairingBundleSchema>;
