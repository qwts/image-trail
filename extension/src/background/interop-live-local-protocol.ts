import * as v from 'valibot';

import { interopOperationSchema, interopUuidSchema, sha256Schema, type InteropOperation } from '../core/interop/contract.js';
import {
  INTEROP_CHUNK_BYTES,
  InteropTransportError,
  assertBoundedControlFrame,
  assertSafeInteropPath,
  sha256,
} from '../core/interop/transport.js';

export const LIVE_LOCAL_PROTOCOL_VERSION = 1;
export const LIVE_LOCAL_CAPABILITY_TTL_MS = 15_000;
export const LIVE_LOCAL_MAX_IN_FLIGHT_BYTES = 8 * 1024 * 1024;
export const LIVE_LOCAL_WEB_SOCKET_PROTOCOL = 'overlook.interop.v1';
export const LIVE_LOCAL_OBJECT_HEADER_BYTES = 2048;
export const LIVE_LOCAL_OBJECT_CHUNK_BYTES = INTEROP_CHUNK_BYTES - LIVE_LOCAL_OBJECT_HEADER_BYTES;
export const LIVE_LOCAL_MAX_OBJECT_BYTES = 64 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const extensionIdSchema = v.pipe(v.string(), v.regex(/^[a-p]{32}$/u));
const secretSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/u));
const positiveIntegerSchema = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER));
const nonNegativeIntegerSchema = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER));

export const liveLocalBootstrapRequestSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    extensionId: extensionIdSchema,
    pairingId: interopUuidSchema,
    operation: interopOperationSchema,
    protocolMin: positiveIntegerSchema,
    protocolMax: positiveIntegerSchema,
  }),
  v.check((request) => request.protocolMin <= request.protocolMax, 'Invalid live local protocol range.'),
);

export const liveLocalCapabilitySchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    sessionId: interopUuidSchema,
    secret: secretSchema,
    endpoint: v.pipe(v.string(), v.url()),
    extensionId: extensionIdSchema,
    pairingId: interopUuidSchema,
    operation: interopOperationSchema,
    protocolVersion: positiveIntegerSchema,
    issuedAtMs: nonNegativeIntegerSchema,
    expiresAtMs: positiveIntegerSchema,
    maxCiphertextFrameBytes: positiveIntegerSchema,
    maxInFlightBytes: positiveIntegerSchema,
  }),
  v.check((capability) => {
    const endpoint = new URL(capability.endpoint);
    return (
      capability.endpoint === `ws://127.0.0.1:${endpoint.port}/session/${capability.sessionId}` &&
      endpoint.protocol === 'ws:' &&
      endpoint.hostname === '127.0.0.1' &&
      endpoint.port !== '' &&
      endpoint.username === '' &&
      endpoint.password === '' &&
      endpoint.search === '' &&
      endpoint.hash === '' &&
      endpoint.pathname === `/session/${capability.sessionId}`
    );
  }, 'Live local capability endpoint must be the exact loopback session URL.'),
  v.check(
    (capability) =>
      capability.expiresAtMs > capability.issuedAtMs && capability.expiresAtMs - capability.issuedAtMs <= LIVE_LOCAL_CAPABILITY_TTL_MS,
    'Live local capability lifetime exceeds its bound.',
  ),
  v.check(
    (capability) =>
      capability.maxCiphertextFrameBytes > LIVE_LOCAL_OBJECT_HEADER_BYTES + 4 &&
      capability.maxCiphertextFrameBytes <= INTEROP_CHUNK_BYTES &&
      capability.maxInFlightBytes >= capability.maxCiphertextFrameBytes &&
      capability.maxInFlightBytes <= LIVE_LOCAL_MAX_IN_FLIGHT_BYTES,
    'Live local capability byte bounds are invalid.',
  ),
);

const unavailableBootstrapStateSchema = v.strictObject({
  schemaVersion: v.literal(1),
  state: v.picklist(['not-running', 'locked', 'incompatible', 'unavailable']),
});

export const liveLocalBootstrapResultSchema = v.variant('state', [
  unavailableBootstrapStateSchema,
  v.strictObject({
    schemaVersion: v.literal(1),
    state: v.literal('running'),
    capability: liveLocalCapabilitySchema,
  }),
]);

export const liveLocalNativeResponseSchema = v.variant('ok', [
  v.strictObject({ schemaVersion: v.literal(1), ok: v.literal(true), result: v.unknown() }),
  v.strictObject({
    schemaVersion: v.literal(1),
    ok: v.literal(false),
    code: v.picklist(['corrupt', 'unsupported', 'unavailable', 'provider-unavailable']),
    retryable: v.boolean(),
  }),
]);

export const liveLocalMoveReviewSchema = v.strictObject({ operation: v.literal('move') });
const liveLocalSyncScopeSchema = v.pipe(
  v.strictObject({
    kind: v.picklist(['all', 'selected', 'album']),
    localIds: v.array(v.pipe(v.string(), v.minLength(1))),
  }),
  v.check((scope) => new Set(scope.localIds).size === scope.localIds.length, 'Live local Sync scope ids must be unique.'),
  v.check(
    (scope) =>
      (scope.kind === 'all' && scope.localIds.length === 0) ||
      (scope.kind === 'selected' && scope.localIds.length > 0) ||
      (scope.kind === 'album' && scope.localIds.length === 1),
    'Live local Sync scope ids do not match the selected scope.',
  ),
);
export const liveLocalOperationReviewSchema = v.variant('operation', [
  liveLocalMoveReviewSchema,
  v.strictObject({
    operation: v.literal('sync'),
    sourceProduct: v.literal('image-trail'),
    targetProduct: v.literal('overlook'),
    direction: v.picklist(['image-trail-to-overlook', 'two-way']),
    scope: liveLocalSyncScopeSchema,
  }),
]);

export const liveLocalOpenSchema = v.strictObject({
  schemaVersion: v.literal(1),
  type: v.literal('open'),
  operationId: interopUuidSchema,
  remoteSessionId: interopUuidSchema,
  scopeHash: sha256Schema,
  review: liveLocalOperationReviewSchema,
});

export const liveLocalRedemptionSchema = v.strictObject({
  schemaVersion: v.literal(1),
  type: v.literal('redeem'),
  sessionId: interopUuidSchema,
  secret: secretSchema,
  extensionId: extensionIdSchema,
  pairingId: interopUuidSchema,
  operation: interopOperationSchema,
  protocolVersion: positiveIntegerSchema,
});

export const liveLocalServerControlSchema = v.variant('type', [
  v.strictObject({ schemaVersion: v.literal(1), type: v.literal('heartbeat-ack') }),
  v.strictObject({
    schemaVersion: v.literal(1),
    type: v.literal('object-ack'),
    path: v.pipe(v.string(), v.minLength(1)),
    sha256: sha256Schema,
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    type: v.literal('state'),
    status: v.picklist(['connected', 'paused']),
    operationId: interopUuidSchema,
    retryable: v.optional(v.boolean()),
  }),
  v.strictObject({
    schemaVersion: v.literal(1),
    type: v.literal('operation-result'),
    operationId: interopUuidSchema,
    status: v.picklist(['completed', 'reviewing']),
  }),
]);

export const liveLocalObjectHeaderSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    type: v.literal('encrypted-object-chunk'),
    path: v.pipe(v.string(), v.minLength(1)),
    objectBytes: v.pipe(nonNegativeIntegerSchema, v.maxValue(LIVE_LOCAL_MAX_OBJECT_BYTES)),
    objectSha256: sha256Schema,
    chunkIndex: nonNegativeIntegerSchema,
    chunkCount: positiveIntegerSchema,
    chunkBytes: v.pipe(nonNegativeIntegerSchema, v.maxValue(LIVE_LOCAL_OBJECT_CHUNK_BYTES)),
    chunkSha256: sha256Schema,
  }),
  v.check((header) => header.chunkIndex < header.chunkCount, 'Live local chunk index is outside its object.'),
  v.check(
    (header) =>
      header.objectBytes === 0
        ? header.chunkCount === 1 && header.chunkBytes === 0
        : header.chunkCount <= header.objectBytes && header.chunkBytes > 0 && header.chunkBytes <= header.objectBytes,
    'Live local chunk shape does not match its bounded object.',
  ),
);

export type LiveLocalBootstrapRequest = v.InferOutput<typeof liveLocalBootstrapRequestSchema>;
export type LiveLocalCapability = v.InferOutput<typeof liveLocalCapabilitySchema>;
export type LiveLocalBootstrapResult = v.InferOutput<typeof liveLocalBootstrapResultSchema>;
export type LiveLocalOperationReview = v.InferOutput<typeof liveLocalOperationReviewSchema>;
export type LiveLocalOpen = v.InferOutput<typeof liveLocalOpenSchema>;
export type LiveLocalServerControl = v.InferOutput<typeof liveLocalServerControlSchema>;
export type LiveLocalObjectHeader = v.InferOutput<typeof liveLocalObjectHeaderSchema>;

export function createLiveLocalBootstrapRequest(
  extensionId: string,
  pairingId: string,
  operation: InteropOperation,
): LiveLocalBootstrapRequest {
  return v.parse(liveLocalBootstrapRequestSchema, {
    schemaVersion: 1,
    extensionId,
    pairingId,
    operation,
    protocolMin: LIVE_LOCAL_PROTOCOL_VERSION,
    protocolMax: LIVE_LOCAL_PROTOCOL_VERSION,
  });
}

export function liveLocalRedemption(capabilityInput: LiveLocalCapability): v.InferOutput<typeof liveLocalRedemptionSchema> {
  const capability = v.parse(liveLocalCapabilitySchema, capabilityInput);
  return v.parse(liveLocalRedemptionSchema, {
    schemaVersion: 1,
    type: 'redeem',
    sessionId: capability.sessionId,
    secret: capability.secret,
    extensionId: capability.extensionId,
    pairingId: capability.pairingId,
    operation: capability.operation,
    protocolVersion: capability.protocolVersion,
  });
}

export async function createLiveLocalOpen(
  operationId: string,
  remoteSessionId: string,
  reviewInput: LiveLocalOperationReview,
): Promise<LiveLocalOpen> {
  const review = v.parse(liveLocalOperationReviewSchema, reviewInput);
  return v.parse(liveLocalOpenSchema, {
    schemaVersion: 1,
    type: 'open',
    operationId,
    remoteSessionId,
    scopeHash: await sha256(encoder.encode(JSON.stringify(review))),
    review,
  });
}

export function parseLiveLocalControl(value: unknown): LiveLocalServerControl {
  assertBoundedControlFrame(value);
  return v.parse(liveLocalServerControlSchema, value);
}

export async function encodeLiveLocalObjectChunk(
  headerInput: Omit<LiveLocalObjectHeader, 'schemaVersion' | 'type' | 'chunkBytes' | 'chunkSha256'>,
  payloadInput: Uint8Array,
): Promise<Uint8Array> {
  const payload = payloadInput.slice();
  const header = v.parse(liveLocalObjectHeaderSchema, {
    schemaVersion: 1,
    type: 'encrypted-object-chunk',
    ...headerInput,
    path: assertSafeInteropPath(headerInput.path),
    chunkBytes: payload.byteLength,
    chunkSha256: await sha256(payload),
  });
  const headerBytes = encoder.encode(JSON.stringify(header));
  if (headerBytes.byteLength > LIVE_LOCAL_OBJECT_HEADER_BYTES || 4 + headerBytes.byteLength + payload.byteLength > INTEROP_CHUNK_BYTES) {
    payload.fill(0);
    throw new InteropTransportError('Live local object header exceeds its frame bound.', 'corrupt', false);
  }
  const frame = new Uint8Array(4 + headerBytes.byteLength + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, headerBytes.byteLength);
  frame.set(headerBytes, 4);
  frame.set(payload, 4 + headerBytes.byteLength);
  payload.fill(0);
  return frame;
}

export async function decodeLiveLocalObjectChunk(
  frameInput: Uint8Array,
): Promise<{ readonly header: LiveLocalObjectHeader; readonly payload: Uint8Array }> {
  const frame = frameInput.slice();
  if (frame.byteLength < 5 || frame.byteLength > INTEROP_CHUNK_BYTES) {
    frame.fill(0);
    throw new InteropTransportError('Live local object frame exceeds its bound.', 'corrupt', false);
  }
  const headerBytes = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0);
  if (headerBytes < 1 || headerBytes > LIVE_LOCAL_OBJECT_HEADER_BYTES || headerBytes > frame.byteLength - 4) {
    frame.fill(0);
    throw new InteropTransportError('Live local object frame header is invalid.', 'corrupt', false);
  }
  try {
    const header = v.parse(liveLocalObjectHeaderSchema, JSON.parse(decoder.decode(frame.subarray(4, 4 + headerBytes))) as unknown);
    const payload = frame.slice(4 + headerBytes);
    frame.fill(0);
    if (payload.byteLength !== header.chunkBytes || (await sha256(payload)) !== header.chunkSha256) {
      payload.fill(0);
      throw new InteropTransportError('Live local object chunk failed verification.', 'corrupt', false);
    }
    return { header: { ...header, path: assertSafeInteropPath(header.path) }, payload };
  } catch (error) {
    frame.fill(0);
    if (error instanceof InteropTransportError) throw error;
    throw new InteropTransportError('Live local object frame header is corrupt.', 'corrupt', false);
  }
}
