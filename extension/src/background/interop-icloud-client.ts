import { InteropTransportError, assertBoundedControlFrame, assertSafeInteropPath } from '../core/interop/transport.js';

export const OVERLOOK_ICLOUD_NATIVE_HOST = 'com.qwts.overlook.interop';

/**
 * Chrome Web Store beta listing identity for Image Trail. The signed Overlook
 * host allowlists exactly this origin, so unpacked or renamed builds must fail
 * the identity gate locally instead of reaching the host.
 */
export const RELEASED_IMAGE_TRAIL_EXTENSION_ID = 'kopcjofaojfpgdoianeddagpenhijphi';

export type ICloudControlOperation = 'status' | 'put-file' | 'materialize-file' | 'list' | 'delete' | 'quota' | 'verify';

export interface ICloudControlRequest {
  readonly schemaVersion: 1;
  readonly operation: ICloudControlOperation;
  readonly extensionId: string;
  readonly path?: string;
  /** Host-issued opaque reference to an encrypted staging file; never bytes. */
  readonly sourceFile?: string;
  readonly destinationFile?: string;
  readonly cursor?: string | null;
}

export interface ICloudControlResponse {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly code?: 'unsupported' | 'unavailable' | 'auth' | 'quota' | 'offline' | 'conflict' | 'corrupt';
  readonly retryable?: boolean;
  readonly result?: unknown;
}

export interface NativeRuntime {
  readonly id?: string;
  getPlatformInfo(): Promise<chrome.runtime.PlatformInfo>;
  sendNativeMessage(application: string, message: object): Promise<unknown>;
}

function responseError(response: ICloudControlResponse): InteropTransportError {
  if (response.code === 'quota') return new InteropTransportError('iCloud interoperability quota is exhausted.', 'quota', false);
  if (response.code === 'auth') return new InteropTransportError('iCloud interoperability authorization expired.', 'auth-expired', false);
  if (response.code === 'offline') return new InteropTransportError('iCloud interoperability is offline.', 'offline', true);
  if (response.code === 'corrupt' || response.code === 'conflict')
    return new InteropTransportError('iCloud interoperability rejected unsafe state.', 'corrupt', false);
  if (response.code === 'unsupported') return new InteropTransportError('iCloud interoperability is unsupported.', 'unsupported', false);
  return new InteropTransportError('iCloud interoperability host is unavailable.', 'provider-unavailable', response.retryable === true);
}

/** Strict client for the signed Overlook iCloud native host. */
export class OverlookICloudNativeClient {
  constructor(
    private readonly releasedExtensionId: string,
    private readonly runtime: NativeRuntime = chrome.runtime,
  ) {}

  async request(input: Omit<ICloudControlRequest, 'schemaVersion' | 'extensionId'>): Promise<unknown> {
    if (this.runtime.id !== this.releasedExtensionId)
      throw new InteropTransportError('Native host rejected the extension identity.', 'unsupported', false);
    const platform = await this.runtime.getPlatformInfo();
    if (platform.os !== 'mac') throw new InteropTransportError('iCloud interoperability requires macOS.', 'unsupported', false);
    if (input.path !== undefined) assertSafeInteropPath(input.path);
    const request: ICloudControlRequest = { schemaVersion: 1, extensionId: this.releasedExtensionId, ...input };
    assertBoundedControlFrame(request);
    let value: unknown;
    try {
      value = await this.runtime.sendNativeMessage(OVERLOOK_ICLOUD_NATIVE_HOST, request);
    } catch {
      throw new InteropTransportError('Signed Overlook iCloud host is missing or unavailable.', 'provider-unavailable', false);
    }
    assertBoundedControlFrame(value);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new InteropTransportError('iCloud host returned an invalid response.', 'corrupt', false);
    const response = value as Partial<ICloudControlResponse>;
    if (response.schemaVersion !== 1 || typeof response.ok !== 'boolean')
      throw new InteropTransportError('iCloud host returned an invalid response.', 'corrupt', false);
    if (!response.ok) throw responseError(response as ICloudControlResponse);
    return response.result;
  }
}
