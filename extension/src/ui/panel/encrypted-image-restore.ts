import { requestEncryptedImageImport } from '../../content/download-controller.js';
import { reducePanelAction } from '../../core/actions.js';
import type { ImportedEncryptedImageFile, PanelState } from '../../core/types.js';
import type { RecordLibraryImportInput } from './record-library-controller.js';

export interface EncryptedImageRestoreDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  addImportedImage(file: RecordLibraryImportInput): Promise<boolean>;
  refreshBlobKeyStatus(): Promise<void>;
}

export async function importEncryptedImageFiles(
  files: readonly ImportedEncryptedImageFile[],
  deps: EncryptedImageRestoreDeps,
): Promise<void> {
  if (files.length === 0) return renderError(deps, 'Choose one or more encrypted image files to import.');
  if (!deps.getState().blobKeyUnlocked) return renderError(deps, 'Unlock encrypted originals before importing encrypted images.');

  deps.setState(reducePanelAction(deps.getState(), { name: 'import-export/start' }));
  deps.render();
  let imported = 0;
  let failed = 0;
  let firstFailureMessage: string | null = null;
  for (const file of files) {
    const result = await requestEncryptedImageImport(file.fileContent);
    if (!result.ok) {
      if (result.reason === 'encryption-locked') await deps.refreshBlobKeyStatus();
      firstFailureMessage ??= result.message;
      failed += 1;
      continue;
    }
    if (await deps.addImportedImage({ durableRecord: result.record })) imported += 1;
    else {
      firstFailureMessage ??= `The durable import for ${result.fileName || file.name} could not be linked to Recent history.`;
      failed += 1;
    }
  }

  const message =
    imported === 0
      ? (firstFailureMessage ?? 'No encrypted image files could be imported.')
      : failed > 0
        ? `Imported ${imported} encrypted image${imported === 1 ? '' : 's'}. ${failed} failed.`
        : `Imported ${imported} encrypted image${imported === 1 ? '' : 's'} into bookmarks and recent history.`;
  deps.setState(reducePanelAction(deps.getState(), { name: imported === 0 ? 'import-export/error' : 'import-export/complete', message }));
  deps.render();
}

function renderError(deps: EncryptedImageRestoreDeps, message: string): void {
  deps.setState(reducePanelAction(deps.getState(), { name: 'import-export/error', message }));
  deps.render();
}
