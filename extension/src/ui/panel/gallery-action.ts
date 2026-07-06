import { openGalleryTab } from '../../content/gallery-client.js';
import type { PanelState } from '../../core/types.js';

export async function openGalleryErrorMessage(): Promise<string | null> {
  const result = await openGalleryTab();
  return result.ok ? null : result.message;
}

export function galleryOpenErrorState(state: PanelState, message: string): PanelState {
  return { ...state, message, lastUpdatedAt: Date.now() };
}
