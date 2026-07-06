import type { DetachableSectionId, PanelAction, PanelState } from '../core/types.js';
import { captureFailureMessage } from '../core/image/capture-result.js';
import { renderDetachedSections } from './detached-sections.js';
import { attachedSectionElements, type DetachableSectionDefinition } from './section-registry.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createControlsView } from './components/controls-view.js';
import type { DetachedWindowPosition } from './components/detachable-section.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHistoryView } from './components/history-view.js';
import { createRecallDrawerView, type RecallDrawerGeometry } from './components/recall-drawer-view.js';
import { createSettingsSection } from './settings-section.js';
import { createStatusView } from './components/status-view.js';
import { createTargetPickerView } from './components/target-picker-view.js';
import { activeUrlFieldsForState } from './active-url-fields.js';

import { createParsedFieldsSection, type NumericFieldDisplayMode } from './parsed-fields-section.js';

// PanelState is immutable per render, so the URL parse/tokenization is shared between the main
// panel pass and the detached Settings renderer instead of running twice per render. Keyed by
// the page href too: the derivation falls back to window.location.href (no selected URL, or a
// data: URL), and an SPA navigation can re-render with the same state object.
const activeUrlFieldsCache = new WeakMap<PanelState, { href: string; value: ReturnType<typeof activeUrlFieldsForState> }>();
function cachedActiveUrlFields(state: PanelState): ReturnType<typeof activeUrlFieldsForState> {
  const href = window.location.href;
  const cached = activeUrlFieldsCache.get(state);
  if (cached && cached.href === href) return cached.value;
  const value = activeUrlFieldsForState(state, href);
  activeUrlFieldsCache.set(state, { href, value });
  return value;
}

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly recallRoot?: HTMLElement | null;
  readonly detachedRoot?: HTMLElement | null;
  readonly toastRoot?: HTMLElement | null;
  readonly dispatch: (action: PanelAction) => void;
  readonly layoutState: PanelLayoutState;
  readonly scrollAnchorId?: string | null;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
  /** Fired when detached-window geometry or minimized state mutates, so per-site workspace persistence (issue #398) can save. */
  readonly onWorkspaceLayoutChanged?: () => void;
}

export interface PanelRenderOptions {
  readonly renderRecall?: boolean;
}

export interface PanelLayoutState {
  fieldsPanelOpen: boolean;
  fieldsPanelBlockSize: number | null;
  historyListBlockSize: number | null;
  fieldDisplayModes: Map<string, NumericFieldDisplayMode>;
  detachedWindowPositions: Map<DetachableSectionId, DetachedWindowPosition>;
  detachedWindowMinimized: Set<DetachableSectionId>;
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
] as const;
const DRAWER_GAP = 8;
const DRAWER_EDGE_PADDING = 12;
const DRAWER_INLINE_SIZE = 340;

function makeButton(label: string, action: PanelAction, dispatch: (action: PanelAction) => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', () => dispatch(action));
  return button;
}

function createSecondaryControlsGroup(
  state: Pick<PanelState, 'secondaryControlsOpen'>,
  target: PanelRenderTarget,
  controls: readonly HTMLElement[],
): HTMLElement {
  const group = document.createElement('details');
  group.className = 'image-trail-panel__section image-trail-panel__secondary-controls';
  group.open = state.secondaryControlsOpen;

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__secondary-controls-summary';
  const heading = document.createElement('h3');
  heading.textContent = 'Manual controls';
  summary.append(heading);
  group.addEventListener('toggle', () => {
    if (group.open === state.secondaryControlsOpen) return;
    target.dispatch({ name: 'panel/secondary-controls-open', open: group.open });
  });

  const body = document.createElement('div');
  body.className = 'image-trail-panel__secondary-controls-body';
  body.append(...controls);

  group.append(summary, body);
  return group;
}

function createPanelHeader(state: PanelState, target: PanelRenderTarget): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-panel__header';

  const heading = document.createElement('h2');
  heading.className = 'image-trail-panel__title';
  heading.textContent = 'Image Trail';
  if (target.onPanelDragStart) {
    heading.addEventListener('pointerdown', target.onPanelDragStart);
  }

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__header-actions';

  const settings = makeButton('⚙', { name: 'settings/toggle' }, target.dispatch);
  settings.className = 'image-trail-panel__icon-button';
  settings.setAttribute('aria-label', state.settingsOpen ? 'Hide settings' : 'Show settings');
  settings.title = state.settingsOpen ? 'Hide settings' : 'Show settings';
  settings.setAttribute('aria-pressed', state.settingsOpen ? 'true' : 'false');

  const minimize = makeButton('-', { name: 'panel/minimize' }, target.dispatch);
  minimize.className = 'image-trail-panel__icon-button';
  minimize.setAttribute('aria-label', 'Minimize panel');
  minimize.title = 'Minimize panel';

  const close = makeButton('X', { name: 'close-panel' }, target.dispatch);
  close.className = 'image-trail-panel__icon-button';
  close.setAttribute('aria-label', 'Close panel');
  close.title = 'Close panel';

  const status = document.createElement('p');
  status.className = `image-trail-panel__header-status ${statusToneClass(state)}`;
  status.textContent = statusSummaryText(state);
  status.title = state.message.trim() || status.textContent;
  if (isPanelWaiting(state)) status.classList.add('is-waiting');

  actions.append(settings, minimize, close);
  header.append(heading, status, actions);
  return header;
}

function createMinimizedPanel(state: PanelState, target: PanelRenderTarget): HTMLElement {
  const container = document.createElement('div');
  container.className = 'image-trail-panel__minimized';

  const button = makeButton('Image Trail', { name: 'panel/expand' }, target.dispatch);
  button.className = 'image-trail-panel__minimized-button';
  button.setAttribute(
    'aria-label',
    state.target.grabModeActive ? 'Expand Image Trail panel. Grab Mode is active.' : 'Expand Image Trail panel',
  );
  button.title = state.target.grabModeActive ? 'Expand Image Trail panel. Grab Mode is active.' : 'Expand Image Trail panel';
  button.dataset['grabMode'] = state.target.grabModeActive ? 'active' : 'inactive';
  container.append(button);
  return container;
}

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

function scrollSnapshots(root: HTMLElement, scrollAnchorId?: string | null): readonly ScrollSnapshot[] {
  const snapshots: ScrollSnapshot[] = [
    { selector: null, scrollTop: root.scrollTop, scrollLeft: root.scrollLeft, anchor: scrollAnchor(root, scrollAnchorId) },
  ];
  for (const selector of SCROLL_SNAPSHOT_SELECTORS) {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) continue;
    snapshots.push({ selector, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft, anchor: visibleScrollAnchor(element) });
  }
  return snapshots;
}

function restoreScrollSnapshots(root: HTMLElement, snapshots: readonly ScrollSnapshot[]): void {
  const restore = (): void => {
    for (const snapshot of snapshots) {
      const element = snapshot.selector ? root.querySelector<HTMLElement>(snapshot.selector) : root;
      if (!element) continue;
      element.scrollTop = snapshot.scrollTop;
      element.scrollLeft = snapshot.scrollLeft;
      restoreScrollAnchor(element, snapshot.anchor);
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
  target.root.classList.toggle('is-minimized', state.minimized);
  target.root.classList.toggle('is-waiting', isPanelWaiting(state));
  target.root.classList.toggle('has-status-error', hasPanelError(state));
  renderStatusToast(target.toastRoot, state);
  if (state.minimized) {
    target.root.replaceChildren(createMinimizedPanel(state, target));
    if (target.recallRoot && options.renderRecall !== false) target.recallRoot.replaceChildren();
    target.detachedRoot?.replaceChildren();
    return;
  }

  const focusedTextControl = focusedTextControlSnapshot(target.root);
  const scrollPositions = scrollSnapshots(target.root, target.scrollAnchorId);
  const statusView = target.root.querySelector<HTMLElement>('.image-trail-panel__status-section');

  target.root.replaceChildren();

  target.root.append(
    createPanelHeader(state, target),
    createStatusView(state, target.dispatch, statusView),
    ...attachedSectionElements(SECTIONS, target, state),
  );
  restoreScrollSnapshots(target.root, scrollPositions);
  // Detached windows render before the focus restore so a control inside one can be re-found.
  renderDetachedSections(target, state, SECTIONS);
  restoreFocusedTextControl(target, focusedTextControl);
  if (options.renderRecall !== false) renderRecallDrawer(target, state);
}

/**
 * The section registry (issue #408): the single declaration of every detachable panel section, in
 * panel order. The attached composition, detach controls, surface drag-out, placeholders, and
 * floating windows all derive from these entries — adding a section here is all it takes.
 */
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
    id: 'url-editor',
    title: 'URL editor',
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
    id: 'target',
    title: 'Host target',
    create: (target, state) => createTargetPickerView(state.target, target.dispatch, { privacyMode: state.privacyModeEnabled }),
  },
  {
    id: 'fields',
    title: 'Parsed fields',
    windowInlineSize: 380,
    create: (target, state) => {
      const { activeUrl, editableFields } = cachedActiveUrlFields(state);
      return createParsedFieldsSection(editableFields, state, activeUrl, target);
    },
  },
  { id: 'controls', title: 'Manual controls', create: createManualControlsSection },
  { id: 'history', title: 'Recent history', create: createHistorySection },
  { id: 'bookmarks', title: 'Queue', create: createBookmarksSection },
];

function createManualControlsSection(target: PanelRenderTarget, state: PanelState): HTMLElement {
  const { visibleFields } = cachedActiveUrlFields(state);
  const dispatchActiveField = (delta: -1 | 1): void => {
    if (visibleFields.length === 0) return;
    const currentIndex = visibleFields.findIndex((field) => field.id === state.activeFieldId);
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = delta > 0 ? 0 : visibleFields.length - 1;
    } else {
      nextIndex = Math.max(0, Math.min(visibleFields.length - 1, currentIndex + delta));
    }
    const nextField = visibleFields[nextIndex];
    if (nextField) {
      target.dispatch({ name: 'active-field/set', id: nextField.id });
    }
  };

  const isNoTarget = !state.target.selectedUrl;

  const captureSection = document.createElement('div');
  captureSection.className = 'image-trail-panel__capture-actions';
  const selectedUrl = state.target.selectedUrl;
  if (selectedUrl) {
    const captureBtn = makeButton(
      'Capture original',
      { name: 'capture/request', url: selectedUrl, sourceType: 'target' },
      target.dispatch,
      state.captureInProgress,
    );
    captureBtn.className = 'image-trail-panel__capture-btn';
    captureSection.append(captureBtn);
  }

  const navSection = document.createElement('div');
  navSection.className = 'image-trail-panel__nav-actions';
  navSection.append(
    makeButton('◀ Prev', { name: 'navigate-previous' }, target.dispatch, isNoTarget),
    makeButton('Next ▶', { name: 'navigate-next' }, target.dispatch, isNoTarget),
  );

  const autoSection = document.createElement('div');
  autoSection.className = 'image-trail-panel__automation-actions';
  const auto = state.automation;
  if (auto.slideshowPhase === 'running') {
    autoSection.append(
      makeButton('Pause slideshow', { name: 'slideshow-pause' }, target.dispatch),
      makeButton('Stop slideshow', { name: 'slideshow-stop' }, target.dispatch),
    );
  } else if (auto.slideshowPhase === 'paused') {
    autoSection.append(
      makeButton('Resume slideshow', { name: 'slideshow-resume' }, target.dispatch),
      makeButton('Stop slideshow', { name: 'slideshow-stop' }, target.dispatch),
    );
  } else {
    autoSection.append(makeButton('Start slideshow', { name: 'slideshow-start' }, target.dispatch, isNoTarget));
  }

  if (auto.retryPhase === 'running') {
    autoSection.append(makeButton('Stop retry', { name: 'retry-stop' }, target.dispatch));
  } else {
    autoSection.append(makeButton('Retry 404', { name: 'retry-start' }, target.dispatch, isNoTarget));
  }

  if (auto.slideshowPhase !== 'idle' || auto.retryPhase !== 'idle') {
    autoSection.append(makeButton('Stop all', { name: 'stop-all' }, target.dispatch));
  }

  return createSecondaryControlsGroup(state, target, [
    createControlsView({
      onPrevious: () => dispatchActiveField(-1),
      onNext: () => dispatchActiveField(1),
    }),
    captureSection,
    navSection,
    autoSection,
  ]);
}

function createHistorySection(target: PanelRenderTarget, state: PanelState): HTMLElement {
  return createHistoryView(state.history, state.selectedHistoryIds, state.captureInProgress, state.blobKeyUnlocked, target.dispatch, {
    blobKeyAvailable: state.blobKeyAvailable,
    listBlockSize: target.layoutState.historyListBlockSize,
    onListResize: (blockSize) => {
      target.layoutState.historyListBlockSize = blockSize;
    },
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
    { privacyMode: state.privacyModeEnabled },
    target.dispatch,
  );
}

function renderStatusToast(toastRoot: HTMLElement | null | undefined, state: PanelState): void {
  if (!toastRoot) return;
  const message = toastMessageText(state);
  toastRoot.replaceChildren();
  toastRoot.className = `image-trail-panel-root image-trail-panel__toast-root ${statusToneClass(state)}`;
  toastRoot.classList.toggle('is-waiting', isPanelWaiting(state));
  toastRoot.classList.toggle('has-status-error', hasPanelError(state));
  if (!state.visible || state.status === 'closed' || !message) return;

  const toast = document.createElement('aside');
  toast.className = 'image-trail-panel__toast';
  toast.setAttribute('role', hasPanelError(state) ? 'alert' : 'status');
  toast.setAttribute('aria-live', hasPanelError(state) ? 'assertive' : 'polite');

  const label = document.createElement('span');
  label.className = 'image-trail-panel__toast-label';
  label.textContent = hasPanelError(state) ? 'Error' : isPanelWaiting(state) ? 'Working' : statusSummaryText(state);

  const copy = document.createElement('span');
  copy.className = 'image-trail-panel__toast-message';
  copy.textContent = message;
  copy.title = message;

  toast.append(label, copy);
  toastRoot.append(toast);
}

function statusSummaryText(state: PanelState): string {
  if (hasPanelError(state)) return 'Needs attention';
  if (state.captureInProgress) return 'Capturing';
  if (state.importExportBusy) return 'Import/export';
  if (state.pcloudBackup.connectionState === 'busy') return 'pCloud';
  if (state.recall.busy) return 'Recall loading';
  if (state.automation.retryPhase === 'running') return 'Retrying';
  if (state.automation.slideshowPhase === 'running') return 'Slideshow';
  if (state.automation.governorStatus !== 'ready') return 'Rate limited';
  if (state.status === 'picking') return 'Picking';
  return 'Ready';
}

function toastMessageText(state: PanelState): string {
  const waitingMessage = waitingToastMessageText(state);
  if (waitingMessage) return waitingMessage;
  if (!hasPanelError(state)) return '';
  if (state.privacyModeEnabled) return 'Image Trail needs attention. Open the panel for details.';
  if (state.captureResult?.status === 'failed' || state.captureResult?.status === 'remote-only') {
    return state.captureResult.message || captureFailureMessage(state.captureResult.reason, state.captureResult.origin);
  }
  if (state.importExportMessage) return state.importExportMessage;
  if (state.recall.message) return state.recall.message;
  if (state.message.trim()) return state.message.trim();
  return '';
}

function waitingToastMessageText(state: PanelState): string {
  if (state.captureInProgress) return 'Capturing selected image original.';
  if (state.importExportBusy) return 'Import or export is running.';
  if (state.pcloudBackup.connectionState === 'busy') return state.pcloudBackup.message ?? 'pCloud is working.';
  if (state.recall.busy) return 'Loading Recall records.';
  if (state.automation.retryPhase === 'running') return 'Retrying failed image loads.';
  if (state.automation.slideshowPhase === 'running') return 'Slideshow is advancing images.';
  if (state.automation.governorStatus !== 'ready') return 'Waiting for the request limit window.';
  return '';
}

function statusToneClass(state: PanelState): string {
  if (hasPanelError(state)) return 'is-error';
  if (isPanelWaiting(state)) return 'is-waiting';
  return 'is-ready';
}

function isPanelWaiting(state: PanelState): boolean {
  return (
    state.captureInProgress ||
    state.importExportBusy ||
    state.pcloudBackup.connectionState === 'busy' ||
    state.recall.busy ||
    state.automation.slideshowPhase === 'running' ||
    state.automation.retryPhase === 'running' ||
    state.automation.governorStatus !== 'ready'
  );
}

function hasPanelError(state: PanelState): boolean {
  return (
    state.status === 'error' ||
    state.importExportMessageIsError === true ||
    state.recall.messageIsError === true ||
    (state.captureResult !== null && state.captureResult.status !== 'captured')
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
