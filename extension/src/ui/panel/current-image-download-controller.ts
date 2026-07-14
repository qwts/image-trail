import { reducePanelAction } from '../../core/actions.js';
import type { PanelState } from '../../core/types.js';
import { downloadUrlsInSeries, filenameForExportedImage, imageDownloadResultMessage } from './export-download.js';

export interface CurrentImageDownloadControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  findSelectedImage(handleId: string): HTMLImageElement | null;
}

function resolveCurrentImageUrl(state: PanelState, findSelectedImage: (handleId: string) => HTMLImageElement | null): string | null {
  const selectedUrl = state.target.selectedUrl;
  if (!selectedUrl || selectedUrl !== 'data:') return selectedUrl;
  const handleId = state.target.selectedHandleId;
  const image = handleId ? findSelectedImage(handleId) : null;
  return image?.currentSrc || image?.src || null;
}

export class CurrentImageDownloadController {
  constructor(private readonly deps: CurrentImageDownloadControllerDeps) {}

  async download(saveAs: boolean): Promise<boolean> {
    const state = this.deps.getState();
    const url = resolveCurrentImageUrl(state, this.deps.findSelectedImage);
    if (state.importExportBusy || !url) return false;
    this.deps.setState(reducePanelAction(state, { name: 'import-export/start' }));
    this.deps.render();
    const result = await downloadUrlsInSeries([{ url, fileName: filenameForExportedImage(url) }], saveAs);
    const message = imageDownloadResultMessage(result);
    const action =
      result.started > 0 ? { name: 'import-export/complete' as const, message } : { name: 'import-export/error' as const, message };
    this.deps.setState(reducePanelAction(this.deps.getState(), action));
    this.deps.render();
    return result.started > 0;
  }
}
