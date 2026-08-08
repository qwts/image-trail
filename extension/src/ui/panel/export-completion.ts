import { reducePanelAction } from '../../core/actions.js';
import type { PanelState } from '../../core/types.js';
import { downloadTextFile } from './export-download.js';

interface ExportCompletionDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
}

interface StatusExportResult {
  readonly fileContent?: string | undefined;
  readonly fileName?: string | undefined;
  readonly status: { readonly message: string; readonly ok: boolean };
}

interface DirectExportResult {
  readonly fileContent?: string | undefined;
  readonly fileName?: string | undefined;
  readonly message: string;
  readonly ok: boolean;
}

export function finishTextExport(
  deps: ExportCompletionDeps,
  fileContent: string | undefined,
  fileName: string | undefined,
  message: string,
  ok: boolean,
  onComplete?: () => void,
): void {
  if (!ok || !fileContent || !fileName) {
    deps.setState(reducePanelAction(deps.getState(), { name: 'import-export/error', message }));
    deps.render();
    return;
  }
  downloadTextFile(fileContent, fileName);
  deps.setState(reducePanelAction(deps.getState(), { name: 'import-export/complete', message }));
  onComplete?.();
  deps.render();
}

export function finishStatusExport(deps: ExportCompletionDeps, result: StatusExportResult, onComplete?: () => void): void {
  finishTextExport(deps, result.fileContent, result.fileName, result.status.message, result.status.ok, onComplete);
}

export function finishDirectExport(deps: ExportCompletionDeps, result: DirectExportResult): void {
  finishTextExport(deps, result.fileContent, result.fileName, result.message, result.ok);
}
