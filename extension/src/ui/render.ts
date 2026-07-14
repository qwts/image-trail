import type { PanelState } from '../core/types.js';
import { renderDetachedSections } from './detached-sections.js';
import { attachedSectionElements, type DetachableSectionDefinition } from './section-registry.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHelpView } from './components/help-view.js';
import { createHistoryView } from './components/history-view.js';
import { createRecallDrawerView, type RecallDrawerGeometry } from './components/recall-drawer-view.js';
import { createSettingsSection } from './settings-section.js';
import { createTargetPickerView } from './react/target-picker-view.js';
import { activeUrlFieldsForState } from './active-url-fields.js';
import { createFieldEditorViewModel } from './field-editor-view-model.js';
import { createManualControlsSection } from './components/manual-controls-section.js';
import { createMinimizedPanel, panelHasError, panelIsWaiting, renderPanelToast } from './components/panel-shell-view.js';
import { createPanelHeader } from './react/panel-header.js';
import { renderPageContextSwitcher } from './react/page-context-switcher.js';
import { unmountReactSubtrees } from './react/react-subtree.js';
import type { PanelLayoutState, PanelRenderOptions, PanelRenderTarget } from './panel-render-types.js';
import { createParsedFieldsSection } from './parsed-fields-section.js';
import { createCompactStatusElements } from './components/status-view.js';

export type { PanelLayoutState, PanelRenderOptions, PanelRenderTarget } from './panel-render-types.js';

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

interface FocusedTextControlSnapshot {
  readonly selector: string;
  readonly value: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
}

interface ScrollSnapshot {
  readonly selector: string | null;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly anchor?:
    | {
        readonly id: string;
        readonly top: number;
      }
    | undefined;
}

const SCROLL_SNAPSHOT_SELECTORS = [
  '.image-trail-panel__field-list',
  '.image-trail-panel__bookmarks-section .image-trail-panel__record-list',
  // The attached Settings section is a fixed-height scroll region (#367); without a snapshot every
  // settings form apply would rerender it back to scrollTop 0.
  '.image-trail-panel__settings-section',
  // The Help section shares the fixed-height scroll-region pattern (#352).
  '.image-trail-panel__help-section',
  // The recents list is a bounded scroll region too; without a snapshot, selecting a row rerenders
  // the list back to the top and the user loses their place (#425).
  '.image-trail-panel__history-section .image-trail-panel__record-list',
] as const;

// The record-lists that can be collapsed away (Recents, Queue). Their scroll offset is parked in
// `PanelLayoutState` so it survives the collapse round-trip, where the list element is absent from
// the DOM and the plain scroll snapshot cannot bridge it (#443).
const COLLAPSIBLE_LIST_SELECTORS = [
  '.image-trail-panel__history-section .image-trail-panel__record-list',
  '.image-trail-panel__bookmarks-section .image-trail-panel__record-list',
] as const;

const DRAWER_GAP = 8;
const DRAWER_EDGE_PADDING = 12;
const DRAWER_INLINE_SIZE = 340;

function focusedTextControlSnapshot(root: HTMLElement): FocusedTextControlSnapshot | null {
  const rootNode = root.getRootNode();
  const activeElement = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)) return null;

  let selector: string | null = null;
  if (activeElement.classList.contains('image-trail-panel__password-input')) {
    selector = '.image-trail-panel__password-input';
  } else if (activeElement.classList.contains('image-trail-panel__full-url-input')) {
    selector = '.image-trail-panel__full-url-input';
  } else if (activeElement.classList.contains('image-trail-panel__field-input') && activeElement.dataset['fieldId']) {
    selector = `.image-trail-panel__field-input[data-field-id="${CSS.escape(activeElement.dataset['fieldId'])}"]`;
  }

  return selector
    ? {
        selector,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      }
    : null;
}

function restoreFocusedTextControl(target: PanelRenderTarget, snapshot: FocusedTextControlSnapshot | null): void {
  if (!snapshot) return;
  if (snapshot.selector === '.image-trail-panel__full-url-input' && snapshot.value.startsWith('data:')) return;
  // The control may have been inside a detached-section window (same shadow root, separate root).
  const next =
    target.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(snapshot.selector) ??
    target.detachedRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(snapshot.selector);
  if (!next) return;
  next.value = snapshot.value;
  queueMicrotask(() => {
    next.focus({ preventScroll: true });
    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
      next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  });
}

function scrollSnapshots(root: HTMLElement, layoutState: PanelLayoutState, scrollAnchorId?: string | null): readonly ScrollSnapshot[] {
  const snapshots: ScrollSnapshot[] = [
    {
      selector: null,
      scrollTop: root.scrollTop,
      scrollLeft: root.scrollLeft,
      anchor: scrollAnchor(root, scrollAnchorId) ?? visibleScrollAnchor(root),
    },
  ];
  for (const selector of SCROLL_SNAPSHOT_SELECTORS) {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) continue;
    snapshots.push({ selector, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft, anchor: visibleScrollAnchor(element) });
  }
  // Park each collapsible list's live offset so a subsequent collapse-then-expand can restore it
  // even though the list is absent from the DOM in between (#443).
  for (const selector of COLLAPSIBLE_LIST_SELECTORS) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) layoutState.collapsibleListScrollTops.set(selector, element.scrollTop);
  }
  return snapshots;
}

function restoreScrollSnapshots(root: HTMLElement, snapshots: readonly ScrollSnapshot[], layoutState: PanelLayoutState): void {
  const snapshotSelectors = new Set(snapshots.map((snapshot) => snapshot.selector));
  const restore = (): void => {
    for (const snapshot of snapshots) {
      const element = snapshot.selector ? root.querySelector<HTMLElement>(snapshot.selector) : root;
      if (!element) continue;
      element.scrollTop = snapshot.scrollTop;
      element.scrollLeft = snapshot.scrollLeft;
      restoreScrollAnchor(element, snapshot.anchor);
    }
    // A just-reappeared collapsible list has no live snapshot (it was absent when this render's
    // snapshot was taken). Seed its offset from the parked value so re-expand keeps the reader's
    // place instead of jumping to the top (#443).
    for (const selector of COLLAPSIBLE_LIST_SELECTORS) {
      if (snapshotSelectors.has(selector)) continue;
      const remembered = layoutState.collapsibleListScrollTops.get(selector);
      if (remembered === undefined) continue;
      const element = root.querySelector<HTMLElement>(selector);
      if (element) element.scrollTop = remembered;
    }
  };

  restore();
  queueMicrotask(restore);
}

function visibleScrollAnchor(container: HTMLElement): ScrollSnapshot['anchor'] {
  const containerRect = container.getBoundingClientRect();
  const anchors = Array.from(container.querySelectorAll<HTMLElement>('[data-image-trail-scroll-anchor]'));
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue;
    const id = anchor.dataset['imageTrailScrollAnchor'];
    if (!id) continue;
    return { id, top: rect.top };
  }
  return undefined;
}

function scrollAnchor(container: HTMLElement, id?: string | null): ScrollSnapshot['anchor'] {
  if (!id) return undefined;
  const anchor = container.querySelector<HTMLElement>(`[data-image-trail-scroll-anchor="${CSS.escape(id)}"]`);
  if (!anchor) return undefined;
  return { id, top: anchor.getBoundingClientRect().top };
}

function restoreScrollAnchor(container: HTMLElement, anchor: ScrollSnapshot['anchor']): void {
  if (!anchor) return;
  const next = container.querySelector<HTMLElement>(`[data-image-trail-scroll-anchor="${CSS.escape(anchor.id)}"]`);
  if (!next) return;
  container.scrollTop += next.getBoundingClientRect().top - anchor.top;
}

export function renderPanel(target: PanelRenderTarget, state: PanelState, options: PanelRenderOptions = {}): void {
  if (target.contextRoot) renderPageContextSwitcher(target.contextRoot, state.pageContext, target.dispatch);
  target.root.dataset['surface'] = state.helpOpen ? 'help' : state.settingsOpen ? 'settings' : 'dashboard';
  target.root.classList.toggle('is-minimized', state.minimized);
  target.root.classList.toggle('is-waiting', panelIsWaiting(state));
  target.root.classList.toggle('has-status-error', panelHasError(state));
  renderPanelToast(target.toastRoot, state);
  unmountReactSubtrees(target.root);
  if (state.minimized) {
    target.root.replaceChildren(createMinimizedPanel(state, target.dispatch));
    if (target.recallRoot && options.renderRecall !== false) target.recallRoot.replaceChildren();
    target.detachedRoot?.replaceChildren();
    return;
  }

  const focusedTextControl = focusedTextControlSnapshot(target.root);
  const scrollPositions = scrollSnapshots(target.root, target.layoutState, target.scrollAnchorId);
  target.root.replaceChildren();
  target.root.append(
    createPanelHeader(state, {
      dispatch: target.dispatch,
      ...(target.onPanelDragStart ? { onPanelDragStart: target.onPanelDragStart } : {}),
    }),
    ...createCompactStatusElements(state, target.dispatch),
    ...attachedSectionElements(SECTIONS, target, state),
  );
  restoreScrollSnapshots(target.root, scrollPositions, target.layoutState);
  // Detached windows render before the focus restore so a control inside one can be re-found.
  renderDetachedSections(target, state, SECTIONS);
  restoreFocusedTextControl(target, focusedTextControl);
  if (options.renderRecall !== false) renderRecallDrawer(target, state);
}

// Single declaration for attached composition, detach controls, placeholders, and windows (#408).
const SECTIONS: readonly DetachableSectionDefinition[] = [
  {
    id: 'settings',
    title: 'Settings',
    windowInlineSize: 420,
    visible: (state) => state.settingsOpen,
    create: (target, state) => {
      const { fields, activeTemplate } = cachedActiveUrlFields(state);
      return createSettingsSection(state, { fields, activeTemplateId: activeTemplate?.id ?? state.activeUrlTemplateId }, target.dispatch);
    },
  },
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

function dashboardSectionVisible(state: PanelState): boolean {
  return !state.settingsOpen && !state.helpOpen;
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
    { recallOpen: state.recall.open },
    {
      privacyMode: state.privacyModeEnabled,
      displayOrder: state.queueDisplayOrder,
      sectionOpen: state.detachedSections.includes('bookmarks') || state.bookmarksSectionOpen,
      collapsible: !state.detachedSections.includes('bookmarks'),
    },
    target.dispatch,
  );
}

export function renderRecallDrawer(target: PanelRenderTarget, state: PanelState): void {
  const recallRoot = target.recallRoot;
  if (!recallRoot) return;
  if (state.minimized) {
    recallRoot.replaceChildren();
    return;
  }
  const animate = !recallRoot.querySelector('.image-trail-panel__recall-drawer');
  const previousList = recallRoot.querySelector<HTMLElement>('.image-trail-panel__recall-list');
  const previousScrollTop = previousList?.scrollTop ?? 0;
  recallRoot.replaceChildren();
  if (!state.recall.open) return;
  recallRoot.append(
    createRecallDrawerView(state.recall, recallDrawerGeometry(target.root, state.recall.side), target.dispatch, {
      animate,
      privacyMode: state.privacyModeEnabled,
    }),
  );
  const nextList = recallRoot.querySelector<HTMLElement>('.image-trail-panel__recall-list');
  if (nextList && previousList) {
    nextList.scrollTop = previousScrollTop;
    queueMicrotask(() => {
      nextList.scrollTop = previousScrollTop;
    });
  }
}
function recallDrawerGeometry(panelRoot: HTMLElement, side: 'left' | 'right'): RecallDrawerGeometry {
  const rect = panelRoot.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  // Mirror the stylesheet's `width: min(340px, calc(100vw - 24px))` — never wider than the
  // viewport, since the inline width would otherwise override the CSS max-width.
  const width = Math.min(DRAWER_INLINE_SIZE, Math.max(0, viewportWidth - DRAWER_EDGE_PADDING * 2));
  const blockStart = Math.max(DRAWER_EDGE_PADDING, Math.min(rect.top, viewportHeight - DRAWER_EDGE_PADDING));
  const blockSize = Math.max(180, viewportHeight - blockStart - DRAWER_EDGE_PADDING);
  const minLeft = DRAWER_EDGE_PADDING;
  const maxLeft = viewportWidth - width - DRAWER_EDGE_PADDING;
  const outsideLeft = rect.left - width - DRAWER_GAP;
  const outsideRight = rect.right + DRAWER_GAP;
  const left =
    side === 'left'
      ? outsideLeft >= minLeft
        ? outsideLeft
        : Math.max(minLeft, Math.min(rect.left, maxLeft))
      : outsideRight <= maxLeft
        ? outsideRight
        : Math.max(minLeft, Math.min(rect.right - width, maxLeft));
  return { side, inlineStart: left, inlineSize: width, blockStart, blockSize };
}
