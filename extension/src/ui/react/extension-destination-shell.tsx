import type { ReactNode } from 'react';

import { extensionDestination, type DestinationSourceState, type ExtensionDestinationId } from '../../core/destinations.js';

export interface DestinationRouteLink {
  readonly id: ExtensionDestinationId;
  readonly href: string;
}

interface ExtensionDestinationShellProps {
  readonly destination: ExtensionDestinationId;
  readonly routes: readonly DestinationRouteLink[];
  readonly sourceState: DestinationSourceState | 'checking';
  readonly onReturnToSource: () => void;
  readonly onLock?: (() => void) | undefined;
  readonly children: ReactNode;
}

function sourceCopy(state: ExtensionDestinationShellProps['sourceState']): string {
  if (state === 'checking') return 'Checking source tab';
  if (state === 'connected') return 'Source tab available';
  if (state === 'missing') return 'Source tab unavailable';
  return 'Durable-only view';
}

function returnLabel(state: ExtensionDestinationShellProps['sourceState']): string {
  if (state === 'connected') return '↩ Source tab';
  if (state === 'missing') return 'Source closed';
  if (state === 'checking') return 'Checking…';
  return 'No source tab';
}

export function ExtensionDestinationShell({
  destination,
  routes,
  sourceState,
  onReturnToSource,
  onLock,
  children,
}: ExtensionDestinationShellProps) {
  const current = extensionDestination(destination);
  return (
    <div className="image-trail-destination-page" data-destination={destination} tabIndex={-1}>
      <header className="image-trail-destination-page__header">
        <div className="image-trail-destination-page__identity">
          <span className="image-trail-destination-page__glyph" aria-hidden="true">
            {current.glyph}
          </span>
          <div>
            <div className="image-trail-destination-page__title-row">
              <h1>{current.label}</h1>
              <span>Image Trail</span>
            </div>
            <p data-source-state={sourceState}>{sourceCopy(sourceState)}</p>
          </div>
        </div>
        <nav className="image-trail-destination-page__nav" aria-label="Image Trail destinations">
          {routes.map((route) => {
            const definition = extensionDestination(route.id);
            return (
              <a key={route.id} href={route.href} aria-current={route.id === destination ? 'page' : undefined}>
                <span aria-hidden="true">{definition.glyph}</span>
                {definition.label}
              </a>
            );
          })}
        </nav>
        <div className="image-trail-destination-page__session-actions">
          {onLock ? (
            <button type="button" className="image-trail-destination-page__lock" onClick={onLock}>
              Lock
            </button>
          ) : null}
          <button
            type="button"
            className="image-trail-destination-page__return"
            disabled={sourceState !== 'connected'}
            onClick={onReturnToSource}
          >
            {returnLabel(sourceState)}
          </button>
        </div>
      </header>
      <main className="image-trail-destination-page__main">
        <div className="image-trail-destination-page__content" data-destination={destination}>
          <p className="image-trail-destination-page__blurb">{current.pageDescription}</p>
          <section className="image-trail-destination-page__surface" aria-label={`${current.label} workspace`}>
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
