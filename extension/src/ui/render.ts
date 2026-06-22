import type { PanelAction, PanelState } from '../core/types.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createControlsView } from './components/controls-view.js';
import { createEncryptionView } from './components/encryption-view.js';
import { createFieldsView, type EditableField } from './components/fields-view.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHistoryView } from './components/history-view.js';
import { createImageTransferView, createImportExportView } from './components/import-export-view.js';
import { createRecallDrawerView, type RecallDrawerGeometry } from './components/recall-drawer-view.js';
import { createSettingsView } from './components/settings-view.js';
import { createStatusView } from './components/status-view.js';
import { createTargetPickerView } from './components/target-picker-view.js';
import { parseUrl } from '../core/url/parse-url.js';
import { applyFieldSplitSpecs } from '../core/url/field-splits.js';
import { collectUrlFields, tokenValue } from '../core/url/tokenize-fields.js';
import { findBestMatchingTemplate } from '../core/url/templates.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly recallRoot?: HTMLElement | null;
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

  const close = makeButton('X', { name: 'close-panel' }, target.dispatch);
  close.className = 'image-trail-panel__icon-button';
  close.setAttribute('aria-label', 'Close panel');
  close.title = 'Close panel';

  actions.append(settings, close);
  header.append(heading, actions);
  return header;
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
      return applyFieldSplitSpecs(parseUrl(activeUrl), state.fieldSplitSpecs);
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

  target.root.append(
    createPanelHeader(state, target),
    createStatusView(state, target.dispatch, statusView),
    ...(state.settingsOpen
      ? [
          createSettingsView(
            state.bookmarkLimit,
            state.privacyModeEnabled,
            state.urlTemplates,
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
    createImageTransferView(
      {
        busy: state.importExportBusy,
        currentImageUrl: state.target.selectedUrl,
        selectedHistoryCount: state.selectedHistoryIds.length,
        selectedBookmarkCount: state.selectedBookmarkIds.length,
        selectedImageDownloadCount: state.selectedHistoryIds.length || state.selectedBookmarkIds.length || state.recall.selectedIds.length,
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
      },
      target.dispatch,
    ),
    createImportExportView(
      {
        busy: state.importExportBusy,
        currentImageUrl: state.target.selectedUrl,
        selectedHistoryCount: state.selectedHistoryIds.length,
        selectedBookmarkCount: state.selectedBookmarkIds.length + state.recall.selectedIds.length,
        selectedImageDownloadCount: state.selectedHistoryIds.length || state.selectedBookmarkIds.length || state.recall.selectedIds.length,
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
      },
      target.dispatch,
    ),
    createFieldsView(
      editableFields,
      state.activeFieldId,
      state.failedFieldId,
      state.successfulFieldIds,
      state.unchangedFieldIds,
      state.unlockedFieldIds,
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

export function renderRecallDrawer(target: PanelRenderTarget, state: PanelState): void {
  const recallRoot = target.recallRoot;
  if (!recallRoot) return;
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
