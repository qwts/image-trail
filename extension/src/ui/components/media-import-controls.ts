import type { ImportedImageFile } from '../../core/types.js';

export function createDirectMediaUrlControl(
  disabled: boolean,
  onImport: (file: ImportedImageFile) => void,
): { readonly field: HTMLLabelElement; readonly button: HTMLButtonElement } {
  const field = document.createElement('label');
  field.className = 'image-trail-panel__field';
  const text = document.createElement('span');
  text.id = 'image-trail-direct-media-url-label';
  text.textContent = 'Direct media URL';
  const description = document.createElement('span');
  description.id = 'image-trail-direct-media-url-description';
  description.className = 'image-trail-panel__meta';
  description.textContent = 'Capture a direct image or supported video/audio URL after an intentional host-permission prompt.';
  const input = document.createElement('input');
  input.type = 'url';
  input.placeholder = 'https://media.example/clip.mp4';
  input.disabled = disabled;
  input.setAttribute('aria-labelledby', text.id);
  input.setAttribute('aria-describedby', description.id);
  field.append(text, description, input);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Capture URL';
  button.disabled = disabled;
  button.addEventListener('click', () => {
    const sourceUrl = input.value.trim();
    if (!/^https?:\/\//iu.test(sourceUrl)) {
      input.setCustomValidity('Enter a direct http(s) media URL.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    onImport({ name: mediaFileNameFromUrl(sourceUrl), dataUrl: sourceUrl });
  });
  return { field, button };
}

export function readMediaFiles(input: HTMLInputElement, onRead: (files: readonly ImportedImageFile[]) => void): void {
  const files = Array.from(input.files ?? []).filter(isSupportedMediaFile);
  if (files.length === 0) return;
  let remaining = files.length;
  const results = Array<ImportedImageFile | null>(files.length).fill(null);
  const completeOne = (): void => {
    remaining -= 1;
    if (remaining === 0) onRead(results.filter((result): result is ImportedImageFile => result !== null));
  };
  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = () => {
      results[index] = importedFileFromReader(file, reader.result);
      completeOne();
    };
    reader.onerror = completeOne;
    reader.readAsDataURL(file);
  });
}

function importedFileFromReader(file: File, result: string | ArrayBuffer | null): ImportedImageFile | null {
  if (typeof result !== 'string') return null;
  if (result.startsWith('data:image/')) return { name: file.name, dataUrl: result };
  const mimeType = mediaMimeTypeForFile(file);
  if (!mimeType) return null;
  const marker = result.indexOf(';base64,');
  return marker < 0 ? null : { name: file.name, dataUrl: `data:${mimeType}${result.slice(marker)}` };
}

function isSupportedMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || mediaMimeTypeForFile(file) !== null;
}

function mediaMimeTypeForFile(file: File): string | null {
  const normalized = file.type.toLowerCase();
  if (
    /^(?:video\/mp2t|video\/mp4|audio\/mp4|video\/quicktime|video\/webm|audio\/webm|video\/x-matroska|audio\/x-matroska|video\/x-msvideo|video\/mpeg|audio\/mpeg)$/u.test(
      normalized,
    )
  ) {
    return normalized;
  }
  const extension = /\.([a-z0-9]{1,10})$/iu.exec(file.name)?.[1]?.toLowerCase();
  if (extension === 'ts' || extension === 'mts' || extension === 'm2ts') return 'video/mp2t';
  if (extension === 'mp4' || extension === 'm4v' || extension === 'mpeg4') return 'video/mp4';
  if (extension === 'm4a') return 'audio/mp4';
  if (extension === 'mov' || extension === 'qt') return 'video/quicktime';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'weba') return 'audio/webm';
  if (extension === 'mkv') return 'video/x-matroska';
  if (extension === 'mka') return 'audio/x-matroska';
  if (extension === 'avi') return 'video/x-msvideo';
  if (extension === 'mpg' || extension === 'mpeg') return 'video/mpeg';
  if (extension === 'mp2') return 'audio/mpeg';
  return null;
}

function mediaFileNameFromUrl(sourceUrl: string): string {
  try {
    const name = new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1);
    return name ? decodeURIComponent(name) : 'media.ts';
  } catch {
    return 'media.bin';
  }
}
