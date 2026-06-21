import type { PanelAction, PanelState } from '../core/types.js';
import { createBookmarksView } from './components/bookmarks-view.js';
import { createControlsView } from './components/controls-view.js';
import { createEncryptionView } from './components/encryption-view.js';
import { createFieldsView, type EditableField } from './components/fields-view.js';
import { createUrlEditorView } from './components/url-editor-view.js';
import { createHistoryView } from './components/history-view.js';
import { createImageTransferView, createImportExportView } from './components/import-export-view.js';
import { createStatusView } from './components/status-view.js';
import { createTargetPickerView } from './components/target-picker-view.js';
import { parseUrl } from '../core/url/parse-url.js';
import { applyFieldSplitSpecs } from '../core/url/field-splits.js';
import { collectUrlFields, tokenValue } from '../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly dispatch: (action: PanelAction) => void;
  readonly layoutState: PanelLayoutState;
  readonly scrollAnchorId?: string | null;
}

export interface PanelLayoutState {
  fieldsPanelOpen: boolean;
  fieldsPanelBlockSize: number | null;
  historyListBlockSize: number | null;
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

function makeButton(label: string, action: PanelAction, dispatch: (action: PanelAction) => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', () => dispatch(action));
  return button;
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

export function renderPanel(target: PanelRenderTarget, state: PanelState): void {
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
  const editableFields: EditableField[] = targetModel
    ? fields.map((field) => ({
        field,
        value: fieldValueFor(targetModel, field),
      }))
    : [];

  const dispatchActiveField = (delta: -1 | 1): void => {
    if (fields.length === 0) return;
    const currentIndex = fields.findIndex((field) => field.id === state.activeFieldId);
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = delta > 0 ? 0 : fields.length - 1;
    } else {
      nextIndex = Math.max(0, Math.min(fields.length - 1, currentIndex + delta));
    }
    const nextField = fields[nextIndex];
    if (nextField) {
      target.dispatch({ name: 'active-field/set', id: nextField.id });
    }
  };

  const isNoTarget = !state.target.selectedUrl;

  const heading = document.createElement('h2');
  heading.textContent = 'Image Trail';

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

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions';
  actions.append(makeButton('Close', { name: 'close-panel' }, target.dispatch));

  target.root.append(
    heading,
    createStatusView(state, target.dispatch, statusView),
    createUrlEditorView(
      { url: activeUrl },
      {
        onApply: (url) => {
          target.dispatch({ name: 'selected-url/apply', url });
        },
      },
    ),
    createTargetPickerView(state.target, target.dispatch),
    createEncryptionView(
      {
        unlocked: state.blobKeyUnlocked,
        keyReference: state.blobKeyReference,
        hasKey: state.blobKeyAvailable,
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
        selectedBookmarkCount: state.selectedBookmarkIds.length,
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
      listBlockSize: target.layoutState.historyListBlockSize,
      onListResize: (blockSize) => {
        target.layoutState.historyListBlockSize = blockSize;
      },
    }),
    createBookmarksView(
      state.target.selectedUrl,
      state.bookmarks,
      state.selectedBookmarkIds,
      state.captureInProgress,
      state.blobKeyUnlocked,
      state.bookmarkVisibilityScope,
      {
        offset: state.bookmarkOffset,
        limit: state.bookmarkLimit,
        total: state.bookmarkTotal,
        hasOlder: state.hasOlderBookmarks,
        hasNewer: state.hasNewerBookmarks,
      },
      target.dispatch,
    ),
    actions,
  );
  restoreScrollSnapshots(target.root, scrollPositions);
  restoreFocusedTextControl(target.root, focusedTextControl);
}
