import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { secureSessionRequiresUnlock, type SecureSessionStatus } from '../../core/secure-session-state.js';
import type { SecureSessionClient } from '../../content/secure-session-client.js';

export type SecureWorkspacePhase = 'checking' | 'locked' | 'unlocking' | 'unlocked' | 'locking';

export interface SecureWorkspaceState {
  readonly phase: SecureWorkspacePhase;
  readonly hasKey: boolean;
  readonly message: string | null;
}

const INITIAL_STATE: SecureWorkspaceState = { phase: 'checking', hasKey: true, message: null };

function stateFromStatus(status: SecureSessionStatus): SecureWorkspaceState {
  if (secureSessionRequiresUnlock(status)) {
    return { phase: 'locked', hasKey: true, message: status.message ?? null };
  }
  return { phase: 'unlocked', hasKey: status.hasKey, message: null };
}

export function useSecureWorkspace(client: SecureSessionClient) {
  const [state, setState] = useState<SecureWorkspaceState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    const unsubscribe = client.subscribe((status) => {
      if (active) setState(stateFromStatus(status));
    });
    void client
      .status()
      .then((status) => {
        if (active) setState(stateFromStatus(status));
      })
      .catch(() => {
        if (active) {
          setState({ phase: 'locked', hasKey: true, message: 'Secure session status is unavailable. Unlock to retry.' });
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  const unlock = useCallback(
    async (password: string) => {
      setState((current) => ({ ...current, phase: 'unlocking', message: null }));
      try {
        const result = await client.unlock(password);
        if (!result.ok) {
          setState({ phase: 'locked', hasKey: true, message: result.message });
          return;
        }
        setState({ phase: 'unlocked', hasKey: true, message: null });
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.image-trail-destination-page')?.focus());
      } catch {
        setState({ phase: 'locked', hasKey: true, message: 'Image Trail could not unlock the secure session.' });
      }
    },
    [client],
  );

  const lock = useCallback(async () => {
    setState((current) => ({ ...current, phase: 'locking', message: null }));
    try {
      const result = await client.lock();
      if (!result.ok) {
        setState({ phase: 'unlocked', hasKey: true, message: result.message });
        return;
      }
      setState({ phase: 'locked', hasKey: true, message: null });
    } catch {
      setState({ phase: 'unlocked', hasKey: true, message: 'Image Trail could not lock the secure session.' });
    }
  }, [client]);

  return { state, unlock, lock };
}

export function SecureWorkspaceLock({
  phase,
  message,
  onUnlock,
}: {
  readonly phase: Extract<SecureWorkspacePhase, 'checking' | 'locked' | 'unlocking' | 'locking'>;
  readonly message: string | null;
  readonly onUnlock: (password: string) => void;
}) {
  const password = useRef<HTMLInputElement>(null);
  const checking = phase === 'checking' || phase === 'locking';
  const busy = phase === 'unlocking';
  useEffect(() => {
    if (!checking) password.current?.focus();
  }, [checking, message]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = password.current?.value ?? '';
    if (!value || busy) return;
    if (password.current) password.current.value = '';
    onUnlock(value);
  };
  return (
    <main className="image-trail-workspace-lock" data-secure-workspace-lock="true" aria-busy={checking || busy}>
      <section role="dialog" aria-modal="true" aria-labelledby="image-trail-destination-lock-title">
        <span className="image-trail-workspace-lock__emblem" aria-hidden="true">
          LOCKED
        </span>
        <h1 id="image-trail-destination-lock-title">
          {phase === 'locking' ? 'Locking Image Trail…' : checking ? 'Securing Image Trail…' : 'Image Trail is locked'}
        </h1>
        <p>
          {phase === 'locking'
            ? 'Removing protected content from this workspace.'
            : checking
              ? 'Checking the encrypted session before loading the workspace.'
              : 'Enter your password to restore this workspace.'}
        </p>
        {message ? (
          <p className="image-trail-workspace-lock__error" role="alert">
            {message}
          </p>
        ) : null}
        {!checking ? (
          <form className="image-trail-workspace-lock__form" onSubmit={submit}>
            <label>
              Password
              <input ref={password} type="password" autoComplete="current-password" required disabled={busy} />
            </label>
            <button type="submit" className="is-primary" disabled={busy}>
              {busy ? 'Unlocking…' : 'Unlock workspace'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
