export enum ManifestStatus {
  UNKNOWN = 'UNKNOWN',
  HEAD_PENDING = 'HEAD_PENDING',
  PRESENT = 'PRESENT',
  FAILED_HEAD = 'FAILED_HEAD',
  END = 'END',
}

export enum ImageStatus {
  UNKNOWN = 'UNKNOWN',
  GET_PENDING = 'GET_PENDING',
  OK = 'OK',
  FAILED_GET = 'FAILED_GET',
}

export enum NavigationBucket {
  EDGE = 'EDGE',
  WALL = 'WALL',
  SKIPPABLE = 'SKIPPABLE',
  LANDABLE = 'LANDABLE',
}

export interface BufferedImageIndexState {
  readonly manifest: ManifestStatus;
  readonly image: ImageStatus;
  readonly url: string | null;
  readonly blobUrl: string | null;
  readonly imgElement: HTMLImageElement | null;
  readonly sha256: string | null;
}

export interface BufferedImageSeek {
  readonly dir: 1 | -1;
  readonly remaining: number;
}

export interface BufferedImageSettings {
  readonly bufferN: number;
  readonly probeK: number;
}

export interface BufferedImageNavigationState {
  readonly indices: Map<number, BufferedImageIndexState>;
  readonly cursor: number;
  readonly seek: BufferedImageSeek | null;
  readonly blockedOn: number | null;
  readonly settings: BufferedImageSettings;
}

export type BufferedImageNavigationAction =
  | { readonly type: 'INIT_CURSOR'; readonly index: number }
  | { readonly type: 'SET_MANIFEST'; readonly index: number; readonly status: ManifestStatus; readonly url?: string }
  | {
      readonly type: 'SET_IMAGE';
      readonly index: number;
      readonly status: ImageStatus;
      readonly blobUrl?: string;
      readonly imgElement?: HTMLImageElement;
      readonly sha256?: string | null;
    }
  | { readonly type: 'SEEK'; readonly dir: 1 | -1 }
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'UPDATE_SETTINGS'; readonly settings: Partial<BufferedImageSettings> }
  | { readonly type: 'EVICT'; readonly index: number };

export function classifyBufferedImageIndex(s: BufferedImageIndexState | undefined): NavigationBucket {
  if (!s) return NavigationBucket.WALL;
  if (s.manifest === ManifestStatus.END) return NavigationBucket.EDGE;
  if (s.manifest === ManifestStatus.FAILED_HEAD) return NavigationBucket.SKIPPABLE;
  if (s.manifest === ManifestStatus.UNKNOWN || s.manifest === ManifestStatus.HEAD_PENDING) return NavigationBucket.WALL;
  if (s.image === ImageStatus.FAILED_GET) return NavigationBucket.SKIPPABLE;
  if (s.image === ImageStatus.OK) return NavigationBucket.LANDABLE;
  return NavigationBucket.WALL;
}

export function createBufferedImageNavigationState(bufferN = 3): BufferedImageNavigationState {
  return {
    indices: new Map(),
    cursor: 0,
    seek: null,
    blockedOn: null,
    settings: { bufferN, probeK: probeKForBuffer(bufferN) },
  };
}

export function probeKForBuffer(bufferN: number): number {
  return Math.max(2 * bufferN, 8);
}

export function bufferedPreloadWindowIndices(cursor: number, bufferN: number): readonly number[] {
  const indices: number[] = [];
  const boundedBufferN = Math.max(0, Math.floor(bufferN));
  for (let index = cursor - boundedBufferN; index <= cursor + boundedBufferN; index += 1) {
    if (index !== cursor) indices.push(index);
  }
  return indices;
}

export function emptyBufferedImageIndex(): BufferedImageIndexState {
  return {
    manifest: ManifestStatus.UNKNOWN,
    image: ImageStatus.UNKNOWN,
    url: null,
    blobUrl: null,
    imgElement: null,
    sha256: null,
  };
}

export function reduceBufferedImageNavigation(
  state: BufferedImageNavigationState,
  action: BufferedImageNavigationAction,
): BufferedImageNavigationState {
  switch (action.type) {
    case 'INIT_CURSOR':
      return { ...state, cursor: action.index, blockedOn: null, seek: null };
    case 'SET_MANIFEST':
      return setIndex(state, action.index, (current) => ({
        ...current,
        manifest: action.status,
        url:
          action.status === ManifestStatus.PRESENT
            ? (action.url ?? current.url)
            : action.status === ManifestStatus.END
              ? null
              : current.url,
        image: action.status === ManifestStatus.PRESENT ? current.image : ImageStatus.UNKNOWN,
        blobUrl: action.status === ManifestStatus.PRESENT ? current.blobUrl : null,
        imgElement: action.status === ManifestStatus.PRESENT ? current.imgElement : null,
        sha256: action.status === ManifestStatus.PRESENT ? current.sha256 : null,
      }));
    case 'SET_IMAGE':
      return setIndex(state, action.index, (current) => ({
        ...current,
        image: action.status,
        blobUrl: action.status === ImageStatus.OK ? (action.blobUrl ?? null) : null,
        imgElement: action.status === ImageStatus.OK ? (action.imgElement ?? null) : null,
        sha256: action.status === ImageStatus.OK ? (action.sha256 ?? null) : null,
      }));
    case 'SEEK': {
      const seek =
        state.seek?.dir === action.dir
          ? { dir: action.dir, remaining: Math.min(state.seek.remaining + 1, state.settings.probeK) }
          : { dir: action.dir, remaining: 1 };
      return advanceBufferedImageNavigation({ ...state, seek });
    }
    case 'ADVANCE':
      return advanceBufferedImageNavigation(state);
    case 'UPDATE_SETTINGS': {
      const bufferN = action.settings.bufferN ?? state.settings.bufferN;
      return { ...state, settings: { ...state.settings, ...action.settings, bufferN, probeK: probeKForBuffer(bufferN) } };
    }
    case 'EVICT': {
      const indices = new Map(state.indices);
      indices.delete(action.index);
      return { ...state, indices };
    }
  }
}

function setIndex(
  state: BufferedImageNavigationState,
  index: number,
  update: (current: BufferedImageIndexState) => BufferedImageIndexState,
): BufferedImageNavigationState {
  const indices = new Map(state.indices);
  indices.set(index, update(indices.get(index) ?? emptyBufferedImageIndex()));
  return { ...state, indices };
}

function advanceBufferedImageNavigation(state: BufferedImageNavigationState): BufferedImageNavigationState {
  if (!state.seek) return state;
  let cursor = state.cursor;
  let position = state.cursor;
  let seek: BufferedImageSeek | null = state.seek;
  let blockedOn: number | null = null;
  let skipCount = 0;
  while (seek && seek.remaining > 0) {
    const next = position + seek.dir;
    const bucket = classifyBufferedImageIndex(state.indices.get(next));
    if (bucket === NavigationBucket.EDGE) {
      seek = null;
      blockedOn = null;
      break;
    }
    if (bucket === NavigationBucket.LANDABLE) {
      position = next;
      cursor = position;
      seek = { ...seek, remaining: seek.remaining - 1 };
      skipCount = 0;
      continue;
    }
    if (bucket === NavigationBucket.SKIPPABLE) {
      skipCount += 1;
      if (skipCount >= state.settings.probeK) {
        seek = null;
        blockedOn = null;
        break;
      }
      position = next;
      continue;
    }
    blockedOn = next;
    break;
  }
  if (seek?.remaining === 0) {
    seek = null;
    blockedOn = null;
  }
  return { ...state, cursor, seek, blockedOn };
}
