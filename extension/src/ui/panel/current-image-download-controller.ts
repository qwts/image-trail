import { reducePanelAction } from '../../core/actions.js';
import type { PanelState } from '../../core/types.js';
import { downloadUrlsInSeries, filenameForExportedImage, imageDownloadResultMessage } from './export-download.js';

export interface CurrentImageDownloadControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
}

export class CurrentImageDownloadController {
  constructor(private readonly deps: CurrentImageDownloadControllerDeps) {}

  async download(saveAs: boolean): Promise<boolean> {
    const state = this.deps.getState();
    const url = state.target.selectedUrl;
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
