import type { PanelAction, PanelState } from '../core/types.js';
import { captureFailureMessage } from '../core/image/capture-result.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createControlsView } from './components/controls-view.js';
import { createEncryptionView } from './components/encryption-view.js';
import { createFieldsView, type EditableField } from './components/fields-view.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHistoryView } from './components/history-view.js';
import { createImageTransferView, createImportExportView, type ImportExportViewState } from './components/import-export-view.js';
import { createRecallDrawerView, type RecallDrawerGeometry } from './components/recall-drawer-view.js';
import { createSettingsView } from './components/settings-view.js';
import { createStatusView } from './components/status-view.js';
import { createTargetPickerView } from './components/target-picker-view.js';
import { parseUrl } from '../core/url/parse-url.js';
import { applyFieldSplitSpecs } from '../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../core/url/field-widths.js';
import { collectUrlFields, tokenValue } from '../core/url/tokenize-fields.js';
import { findBestMatchingTemplate } from '../core/url/templates.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly recallRoot?: HTMLElement | null;
  readonly toastRoot?: HTMLElement | null;
  readonly dispatch: (action: PanelAction) => void;
  readonly layoutState: PanelLayoutState;
  readonly scrollAnchorId?: string | null;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
}

export interface PanelRenderOptions {
  readonly renderRecall?: boolean;
}

export interface PanelLayoutState {
  fieldsPanelOpen: boolean;
  fieldsPanelBlockSize: number | null;
  historyListBlockSize: number | null;
}

export function recallDeleteCountForQueue(state: Pick<PanelState, 'bookmarkTotal' | 'bookmarkLimit'>): number {
  return Math.max(0, state.bookmarkTotal - state.bookmarkLimit);
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
  readonly anchor?: {
    readonly id: string;
    readonly top: number;
  };
}

const SCROLL_SNAPSHOT_SELECTORS = [
  '.image-trail-panel__field-list',
  '.image-trail-panel__bookmarks-section .image-trail-panel__record-list',
] as const;
const MIN_FIELDS_PANEL_BLOCK_SIZE = 160;
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
  button.dataset.grabMode = state.target.grabModeActive ? 'active' : 'inactive';
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
  } else if (activeElement.classList.contains('image-trail-panel__field-input') && activeElement.dataset.fieldId) {
    selector = `.image-trail-panel__field-input[data-field-id="${CSS.escape(activeElement.dataset.fieldId)}"]`;
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

function restoreFocusedTextControl(root: HTMLElement, snapshot: FocusedTextControlSnapshot | null): void {
  if (!snapshot) return;
  if (snapshot.selector === '.image-trail-panel__full-url-input' && snapshot.value.startsWith('data:')) return;
  const next = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(snapshot.selector);
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
    const id = anchor.dataset.imageTrailScrollAnchor;
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
    return;
  }

  const focusedTextControl = focusedTextControlSnapshot(target.root);
  const scrollPositions = scrollSnapshots(target.root, target.scrollAnchorId);
  const statusView = target.root.querySelector<HTMLElement>('.image-trail-panel__status-section');

  target.root.replaceChildren();

  const fieldValueFor = (model: ParsedUrlModel, field: UrlField): string => {
    if (field.location === 'path' && field.partIndex !== undefined) {
      const part = model.pathParts[field.partIndex];
      if (!part || part.type !== 'segment') return '';
      const token = part.tokens[field.tokenIndex];
      return token ? tokenValue(token) : '';
    }

    if (field.location === 'query' && field.queryIndex !== undefined) {
      const queryField = model.queryFields[field.queryIndex];
      const token = queryField?.valueTokens[field.tokenIndex];
      return token ? tokenValue(token) : '';
    }

    return '';
  };

  const selectedUrl = state.target.selectedUrl;
  const editableUrl = state.draftUrl ?? selectedUrl;
  const selectedIsDataUrl = editableUrl?.startsWith('data:') === true;
  const activeUrl = selectedIsDataUrl ? window.location.href : (editableUrl ?? window.location.href);

  const parseActiveUrl = (): ParsedUrlModel | null => {
    try {
      return applyFieldDigitWidthSpecs(applyFieldSplitSpecs(parseUrl(activeUrl), state.fieldSplitSpecs), state.fieldDigitWidthSpecs);
    } catch {
      return null;
    }
  };

  const targetModel = parseActiveUrl();
  const fields = targetModel ? collectUrlFields(targetModel) : [];
  const activeTemplate = targetModel ? findBestMatchingTemplate(state.urlTemplates, targetModel) : null;
  const visibleFields =
    activeTemplate?.hideExcludedFields === true
      ? fields.filter((field) => activeTemplate.fields.some((templateField) => templateField.id === field.id))
      : fields;
  const editableFields: EditableField[] = targetModel
    ? visibleFields.map((field) => ({
        field,
        value: fieldValueFor(targetModel, field),
      }))
    : [];

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
  if (!isNoTarget) {
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

  const importExportState: ImportExportViewState = {
    busy: state.importExportBusy,
    currentImageUrl: state.target.selectedUrl,
    selectedHistoryCount: state.selectedHistoryIds.length,
    selectedBookmarkCount: state.selectedBookmarkIds.length + state.recall.selectedIds.length,
    selectedImageDownloadCount: selectedRecordCount(state),
    visibleImageSelectionCount: visibleImageSelectionCount(state),
    imageDownloadAvailable:
      state.selectedHistoryIds.length + state.selectedBookmarkIds.length + state.recall.selectedIds.length > 0 ||
      !!state.target.selectedUrl ||
      state.history.length > 0,
    encryptedImageTransferAvailable:
      state.blobKeyUnlocked &&
      (state.selectedHistoryIds.length + state.selectedBookmarkIds.length + state.recall.selectedIds.length > 0 ||
        !!state.target.selectedUrl ||
        state.history.length > 0),
    blobKeyUnlocked: state.blobKeyUnlocked,
    lastMessage: state.importExportMessage,
    lastMessageIsError: state.importExportMessageIsError,
  };

  target.root.append(
    createPanelHeader(state, target),
    createStatusView(state, target.dispatch, statusView),
    ...(state.settingsOpen
      ? [
          createSettingsView(
            state.bookmarkLimit,
            {
              limit: state.recentHistoryLimit,
              overflowBehavior: state.recentHistoryOverflowBehavior,
            },
            state.privacyModeEnabled,
            state.urlTemplates,
            state.grabSourcePatterns,
            activeTemplate?.id ?? state.activeUrlTemplateId,
            fields,
            {
              pinSaveStoragePreference: state.pinSaveStoragePreference,
              blobKeyUnlocked: state.blobKeyUnlocked,
              blobKeyAvailable: state.blobKeyAvailable,
            },
            {
              visibleQueueCount: state.bookmarks.length,
              recallCount: recallDeleteCountForQueue(state),
              busy: state.importExportBusy || state.recall.busy,
            },
            {
              limit: state.urlReviewStatusLimit,
              clearAfterExport: state.clearUrlReviewStatusAfterExport,
            },
            {
              minimumIntervalMs: state.requestThrottleMs,
              maxRequests: state.requestThrottleMaxRequests,
              windowMs: state.requestThrottleWindowMs,
            },
            {
              enabled: state.neighborPreloadEnabled,
              radius: state.neighborPreloadRadius,
              cacheLimit: state.neighborPreloadCacheLimit,
            },
            [
              createEncryptionView(
                {
                  unlocked: state.blobKeyUnlocked,
                  keyReference: state.blobKeyReference,
                  hasKey: state.blobKeyAvailable,
                  busy: state.importExportBusy,
                  abandonedOriginalCount: state.storageUsage?.orphanedBlobCount ?? 0,
                },
                target.dispatch,
              ),
              createImageTransferView(importExportState, target.dispatch),
              createImportExportView(importExportState, target.dispatch),
            ],
            target.dispatch,
          ),
        ]
      : []),
    createUrlEditorView(
      { url: activeUrl, privacyMode: state.privacyModeEnabled },
      {
        onApply: (url) => {
          target.dispatch({ name: 'selected-url/apply', url });
        },
      },
    ),
    createTargetPickerView(state.target, target.dispatch, { privacyMode: state.privacyModeEnabled }),
    createFieldsView(
      editableFields,
      state.activeFieldId,
      state.failedFieldId,
      state.successfulFieldIds,
      state.unchangedFieldIds,
      state.unlockedFieldIds,
      state.fieldDigitWidthSpecs,
      {
        onActivate: (fieldId) => {
          target.dispatch({ name: 'active-field/set', id: fieldId });
        },
        onValueChange: (fieldId, value) => {
          target.dispatch({ name: 'field-value-change', id: fieldId, value });
        },
        onStep: (fieldId, delta) => {
          target.dispatch({ name: 'field-value-bump', id: fieldId, delta });
        },
        onDigitWidthChange: (fieldId, value) => {
          target.dispatch({ name: 'field-digit-width/change', id: fieldId, value });
        },
        onToggleUnlock: (fieldId) => {
          target.dispatch({ name: 'field-unlock/toggle', id: fieldId });
        },
        onApplySplit: (fieldId, pattern) => {
          target.dispatch({ name: 'field-split/apply', id: fieldId, pattern });
        },
        onClearSplit: (baseFieldId) => {
          target.dispatch({ name: 'field-split/clear', baseFieldId });
        },
        onOpenChange: (open, blockSize) => {
          target.layoutState.fieldsPanelOpen = open;
          target.layoutState.fieldsPanelBlockSize = blockSize;
        },
        onResize: (blockSize) => {
          target.layoutState.fieldsPanelBlockSize = Math.max(MIN_FIELDS_PANEL_BLOCK_SIZE, blockSize);
        },
      },
      {
        open: target.layoutState.fieldsPanelOpen,
        blockSize: target.layoutState.fieldsPanelBlockSize,
        privacyMode: state.privacyModeEnabled,
      },
    ),
    createControlsView({
      onPrevious: () => dispatchActiveField(-1),
      onNext: () => dispatchActiveField(1),
    }),
    captureSection,
    navSection,
    autoSection,
    createHistoryView(state.history, state.selectedHistoryIds, state.captureInProgress, state.blobKeyUnlocked, target.dispatch, {
      blobKeyAvailable: state.blobKeyAvailable,
      listBlockSize: target.layoutState.historyListBlockSize,
      onListResize: (blockSize) => {
        target.layoutState.historyListBlockSize = blockSize;
      },
      privacyMode: state.privacyModeEnabled,
    }),
    createBookmarksView(
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
    ),
  );
  restoreScrollSnapshots(target.root, scrollPositions);
  restoreFocusedTextControl(target.root, focusedTextControl);
  if (options.renderRecall !== false) renderRecallDrawer(target, state);
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

function selectedRecordCount(state: PanelState): number {
  return state.selectedHistoryIds.length + state.selectedBookmarkIds.length + state.recall.selectedIds.length;
}

function visibleImageSelectionCount(state: PanelState): number {
  return state.history.length + state.bookmarks.length + (state.recall.open ? state.recall.candidates.length : 0);
}

function recallDrawerGeometry(panelRoot: HTMLElement, side: 'left' | 'right'): RecallDrawerGeometry {
  const rect = panelRoot.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(DRAWER_INLINE_SIZE, Math.max(240, viewportWidth - DRAWER_EDGE_PADDING * 2));
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
