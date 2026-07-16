import type { SessionInactivityTimeoutMinutes } from './secure-session-policy.js';

export type SecureSessionPanelAction =
  | { readonly name: 'settings/update-blob-key-inactivity-timeout'; readonly value: SessionInactivityTimeoutMinutes }
  | { readonly name: 'blob-key/setup' | 'blob-key/unlock'; readonly password: string }
  | { readonly name: 'blob-key/lock' | 'blob-key/clear' }
  | { readonly name: 'blob-key/export'; readonly password: string }
  | { readonly name: 'blob-key/import'; readonly fileContent: string; readonly password: string }
  | {
      readonly name: 'blob-key/status';
      readonly unlocked: boolean;
      readonly keyReference?: string | null;
      readonly hasKey?: boolean;
      readonly message?: string | undefined;
    };
