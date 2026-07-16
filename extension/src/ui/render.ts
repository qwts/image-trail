import type { PanelState } from '../core/types.js';
import { renderDetachedSections } from './detached-sections.js';
import { attachedSectionElements, type DetachableSectionDefinition } from './section-registry.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHelpView } from './components/help-view.js';
import { createHistoryView } from './components/history-view.js';
import { createRecallDestinationBody } from './components/recall-destination-view.js';
import { createSettingsSection } from './settings-section.js';
import { createTargetPickerView } from './react/target-picker-view.js';
import { activeUrlFieldsForState } from './active-url-fields.js';
import { createFieldEditorViewModel } from './field-editor-view-model.js';
import { createManualControlsSection } from './components/manual-controls-section.js';
import { createMinimizedPanel, panelHasError, panelIsWaiting, renderPanelToast } from './components/panel-shell-view.js';
import { createPanelHeader } from './react/panel-header.js';
import { renderPageContextSwitcher } from './react/page-context-switcher.js';
import { createPanelDestinationSurface } from './react/destination-surface.js';
import { unmountReactSubtree, unmountReactSubtrees } from './react/react-subtree.js';
import type { PanelRenderTarget } from './panel-render-types.js';
import { createParsedFieldsSection } from './parsed-fields-section.js';
import { createCompactStatusElements } from './components/status-view.js';
import { createWorkspaceLockView } from './components/lock-view.js';
import { secureSessionRequiresUnlock } from '../core/secure-session-state.js';
import { SECURE_WORKSPACE_UNLOCKING_MESSAGE } from './panel/secure-session-ui-controller.js';
import { isPanelDestinationId } from './destination-registry.js';
import {
  capturePanelRenderSnapshot,
  restoreDestinationScroll,
  restorePanelRenderSnapshot,
  restorePanelScrollTop,
} from './panel-render-preservation.js';

export type { PanelLayoutState, PanelRenderTarget } from './panel-render-types.js';

// PanelState is immutable per render, so the URL parse/tokenization is shared between the main
// panel pass and the detached Settings renderer instead of running twice per render. Keyed by
// the page href too: the derivation falls back to window.location.href (no selected URL, or a
// data: URL), and an SPA navigation can re-render with the same state object.
const activeUrlFieldsCache = new WeakMap<PanelState, { href: string; value: ReturnType<typeof activeUrlFieldsForState> }>();
const fieldEditorViewModelCache = new WeakMap<PanelState, { href: string; value: ReturnType<typeof createFieldEditorViewModel> }>();
function cachedActiveUrlFields(state: PanelState): ReturnType<typeof activeUrlFieldsForState> {
  const href = window.location.href;
  const cached = activeUrlFieldsCache.get(state);
  if (cached && cached.href === href) return cached.value;
  const value = activeUrlFieldsForState(state, href);
  activeUrlFieldsCache.set(state, { href, value });
  return value;
}

function cachedFieldEditorViewModel(state: PanelState): ReturnType<typeof createFieldEditorViewModel> {
  const href = window.location.href;
  const cached = fieldEditorViewModelCache.get(state);
  if (cached && cached.href === href) return cached.value;
  const value = createFieldEditorViewModel(state, cachedActiveUrlFields(state));
  fieldEditorViewModelCache.set(state, { href, value });
  return value;
}

export function renderPanel(target: PanelRenderTarget, state: PanelState): void {
  const workspaceLocked = secureSessionRequiresUnlock({ unlocked: state.blobKeyUnlocked, hasKey: state.blobKeyAvailable });
  const previousValue = target.root.dataset['destination'];
  const previousDestination = isPanelDestinationId(previousValue) ? previousValue : undefined;
  if (!previousDestination && state.activeDestination) target.layoutState.primaryPanelScrollTop = target.root.scrollTop;
  if (target.contextRoot && !workspaceLocked) renderPageContextSwitcher(target.contextRoot, state.pageContext, target.dispatch);
  target.root.dataset['surface'] = workspaceLocked ? 'locked' : state.helpOpen ? 'help' : (state.activeDestination ?? 'dashboard');
  if (state.activeDestination) target.root.dataset['destination'] = state.activeDestination;
  else delete target.root.dataset['destination'];
  target.root.classList.toggle('is-minimized', state.minimized && !workspaceLocked);
  target.root.classList.toggle('is-workspace-locked', workspaceLocked);
  target.root.classList.toggle('is-waiting', panelIsWaiting(state));
  target.root.classList.toggle('has-status-error', panelHasError(state));
  if (workspaceLocked && target.toastRoot) {
    target.toastRoot.replaceChildren();
    delete target.toastRoot.dataset['imageTrailToastKey'];
  } else {
    renderPanelToast(target.toastRoot, state);
  }
  const snapshot = capturePanelRenderSnapshot(target);
  unmountReactSubtrees(target.root);
  if (workspaceLocked) {
    target.root.replaceChildren(
      createWorkspaceLockView(
        {
          unlocking: state.message === SECURE_WORKSPACE_UNLOCKING_MESSAGE,
          ...(state.status === 'error' ? { errorMessage: state.message } : {}),
        },
        target.dispatch,
      ),
    );
    if (target.contextRoot) {
      unmountReactSubtree(target.contextRoot);
      target.contextRoot.replaceChildren();
    }
    if (target.detachedRoot) {
      unmountReactSubtree(target.detachedRoot);
      target.detachedRoot.replaceChildren();
    }
    target.onWorkspaceEdgesChanged?.(new Set(), false);
    return;
  }
  if (state.minimized) {
    target.root.replaceChildren(createMinimizedPanel(state, target.dispatch));
    if (target.detachedRoot) {
      unmountReactSubtree(target.detachedRoot);
      target.detachedRoot.replaceChildren();
    }
    target.onWorkspaceEdgesChanged?.(new Set(), false);
    if (state.activeDestination) restorePanelScrollTop(target.root, 0);
    return;
  }

  target.root.replaceChildren();
  const header = createPanelHeader(state, {
    dispatch: target.dispatch,
    ...(target.onPanelDragStart ? { onPanelDragStart: target.onPanelDragStart } : {}),
  });
  const destination = state.activeDestination
    ? createPanelDestinationSurface(state, target.dispatch, createDestinationDomBody(target, state))
    : null;
  target.root.append(
    header,
    ...(destination ? [destination] : []),
    ...createCompactStatusElements(state, target.dispatch),
    ...attachedSectionElements(PRIMARY_SECTIONS, target, state),
  );
  target.root.style.setProperty('--it-destination-top', `${header.offsetHeight}px`);
  renderDetachedSections(target, state, SECTIONS);
  restorePanelRenderSnapshot(target, snapshot);
  if (state.activeDestination) {
    restorePanelScrollTop(target.root, 0);
  } else if (previousDestination) {
    restorePanelScrollTop(target.root, target.layoutState.primaryPanelScrollTop ?? 0);
    target.layoutState.primaryPanelScrollTop = null;
  }
  restoreDestinationScroll(target.root, state.activeDestination, target.layoutState);
}

const SETTINGS_SECTION: DetachableSectionDefinition = {
  id: 'settings',
  title: 'Settings',
  windowInlineSize: 420,
  visible: (state) => state.activeDestination === 'settings',
  create: (target, state) => {
    const { fields, activeTemplate } = cachedActiveUrlFields(state);
    return createSettingsSection(state, { fields, activeTemplateId: activeTemplate?.id ?? state.activeUrlTemplateId }, target.dispatch);
  },
};

// Single declaration for attached composition, detach controls, placeholders, and windows (#408).
const PRIMARY_SECTIONS: readonly DetachableSectionDefinition[] = [
  {
    id: 'help',
    title: 'Help',
    windowInlineSize: 420,
    visible: (state) => state.helpOpen,
    create: () => createHelpView(),
  },
  {
    id: 'target',
    title: 'Host target',
    attachedVisible: dashboardSectionVisible,
    create: (target, state) =>
      createTargetPickerView(state.target, target.dispatch, {
        pageContext: state.pageContext,
        privacyMode: state.privacyModeEnabled,
      }),
  },
  {
    id: 'url-editor',
    title: 'URL editor',
    attachedVisible: dashboardSectionVisible,
    create: (target, state) =>
      createUrlEditorView(
        { url: cachedActiveUrlFields(state).activeUrl, privacyMode: state.privacyModeEnabled },
        {
          onApply: (url) => {
            target.dispatch({ name: 'selected-url/apply', url });
          },
          onRejectUnsupportedInput: () => {
            target.dispatch({ name: 'selected-url/reject-unsupported-input' });
          },
        },
      ),
  },
  {
    id: 'fields',
    title: 'Field Editor',
    windowInlineSize: 380,
    attachedVisible: dashboardSectionVisible,
    create: (target, state) => createParsedFieldsSection(cachedFieldEditorViewModel(state), target),
  },
  {
    id: 'controls',
    title: 'Manual controls',
    attachedVisible: dashboardSectionVisible,
    create: (target, state) => createManualControlsSection(target, state, cachedFieldEditorViewModel(state)),
  },
  { id: 'history', title: 'Recent history', attachedVisible: dashboardSectionVisible, create: createHistorySection },
  { id: 'bookmarks', title: 'Queue', attachedVisible: dashboardSectionVisible, create: createBookmarksSection },
];
const SECTIONS: readonly DetachableSectionDefinition[] = [SETTINGS_SECTION, ...PRIMARY_SECTIONS];

function dashboardSectionVisible(state: PanelState): boolean {
  return !state.helpOpen;
}

function createDestinationDomBody(target: PanelRenderTarget, state: PanelState): HTMLElement | undefined {
  if (state.activeDestination === 'recall') {
    return createRecallDestinationBody(state.recall, target.dispatch, { privacyMode: state.privacyModeEnabled });
  }
  if (state.activeDestination === 'settings') return attachedSectionElements([SETTINGS_SECTION], target, state)[0];
  return undefined;
}
function createHistorySection(target: PanelRenderTarget, state: PanelState): HTMLElement {
  return createHistoryView(state.history, state.selectedHistoryIds, state.captureInProgress, state.blobKeyUnlocked, target.dispatch, {
    blobKeyAvailable: state.blobKeyAvailable,
    // A detached window is its own container — collapse only applies to the attached panel, and
    // the detached header must not carry a live toggle for the hidden attached state (#441).
    sectionOpen: state.detachedSections.includes('history') || state.historySectionOpen,
    collapsible: !state.detachedSections.includes('history'),
    listBlockSize: target.layoutState.historyListBlockSize,
    onListResize: (blockSize) => {
      target.layoutState.historyListBlockSize = blockSize;
    },
    sparseRowDisplayMode: state.recentSparseRowDisplayMode,
    displayOrder: state.recentDisplayOrder,
    scope: state.recentHistoryScope,
    pageUrl: window.location.href,
    privacyMode: state.privacyModeEnabled,
  });
}

function createBookmarksSection(target: PanelRenderTarget, state: PanelState): HTMLElement {
  return createBookmarksView(
    state.target.selectedUrl,
    state.bookmarks,
    state.selectedBookmarkIds,
    state.captureInProgress,
    state.blobKeyUnlocked,
    state.blobKeyAvailable,
    state.bookmarkVisibilityScope,
    {
      offset: state.bookmarkOffset,
      limit: state.bookmarkLimit,
      total: state.bookmarkTotal,
      hasOlder: state.hasOlderBookmarks,
      hasNewer: state.hasNewerBookmarks,
    },
    { recallOpen: state.activeDestination === 'recall' },
    {
      privacyMode: state.privacyModeEnabled,
      displayOrder: state.queueDisplayOrder,
      sectionOpen: state.detachedSections.includes('bookmarks') || state.bookmarksSectionOpen,
      collapsible: !state.detachedSections.includes('bookmarks'),
    },
    target.dispatch,
  );
}

export function renderRecallDestination(target: PanelRenderTarget, state: PanelState): void {
  if (state.minimized || state.activeDestination !== 'recall') return;
  const host = target.root.querySelector<HTMLElement>('.image-trail-panel__destination-dom-host[data-destination="recall"]');
  if (!host) return;
  const previousList = host.querySelector<HTMLElement>('.image-trail-panel__recall-list');
  const previousScrollTop = previousList?.scrollTop ?? 0;
  host.replaceChildren(createRecallDestinationBody(state.recall, target.dispatch, { privacyMode: state.privacyModeEnabled }));
  const nextList = host.querySelector<HTMLElement>('.image-trail-panel__recall-list');
  if (nextList && previousList) {
    nextList.scrollTop = previousScrollTop;
    queueMicrotask(() => {
      nextList.scrollTop = previousScrollTop;
    });
  }
}
