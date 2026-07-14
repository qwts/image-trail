import { PAGE_CONTEXTS, pageContextLabel, type PageContextState } from '../../core/page-context.js';
import type { PanelAction } from '../../core/types.js';
import { renderReactSubtree } from './react-subtree.js';

interface PageContextSwitcherProps {
  readonly pageContext: PageContextState;
  readonly dispatch: (action: PanelAction) => void;
}

function PageContextSwitcher({ pageContext, dispatch }: PageContextSwitcherProps) {
  const overridden = pageContext.override !== null;
  const overrideAvailable = pageContext.override !== null && pageContext.available.includes(pageContext.override);
  const status = !overridden
    ? `Automatic · ${pageContextLabel(pageContext.effective)}`
    : overrideAvailable
      ? `Override · ${pageContextLabel(pageContext.effective)}${
          pageContext.detected !== pageContext.effective ? ` · detected ${pageContextLabel(pageContext.detected)}` : ''
        }`
      : `Saved override unavailable · Automatic ${pageContextLabel(pageContext.effective)}`;
  return (
    <section className="image-trail-page-context" aria-label="Page context">
      <div className="image-trail-page-context__options" role="group" aria-label="Page context override">
        {PAGE_CONTEXTS.map((context) => {
          const available = pageContext.available.includes(context);
          return (
            <button
              key={context}
              type="button"
              className="image-trail-page-context__option"
              aria-pressed={pageContext.effective === context}
              disabled={!available}
              title={available ? `Use ${pageContextLabel(context)} context` : `${pageContextLabel(context)} is unavailable on this page`}
              onClick={() => dispatch({ name: 'page-context/set', context })}
            >
              {pageContextLabel(context)}
            </button>
          );
        })}
      </div>
      <div className="image-trail-page-context__status" aria-live="polite">
        <span>{status}</span>
        {overridden ? (
          <button
            type="button"
            className="image-trail-page-context__reset"
            onClick={() => dispatch({ name: 'page-context/set', context: null })}
          >
            Use automatic
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function renderPageContextSwitcher(root: HTMLElement, pageContext: PageContextState, dispatch: (action: PanelAction) => void): void {
  renderReactSubtree(root, <PageContextSwitcher pageContext={pageContext} dispatch={dispatch} />);
}
