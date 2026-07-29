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
  description.textContent = 'Capture a direct MPEG-TS URL after an intentional host-permission prompt.';
  const input = document.createElement('input');
  input.type = 'url';
  input.placeholder = 'https://media.example/clip.ts';
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
  if (!isTransportStreamFile(file)) return null;
  const marker = result.indexOf(';base64,');
  return marker < 0 ? null : { name: file.name, dataUrl: `data:video/mp2t${result.slice(marker)}` };
}

function isSupportedMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || isTransportStreamFile(file);
}

function isTransportStreamFile(file: File): boolean {
  return file.type === 'video/mp2t' || /\.(ts|mts|m2ts)$/iu.test(file.name);
}

function mediaFileNameFromUrl(sourceUrl: string): string {
  try {
    const name = new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1);
    return name ? decodeURIComponent(name) : 'media.ts';
  } catch {
    return 'media.ts';
  }
}
