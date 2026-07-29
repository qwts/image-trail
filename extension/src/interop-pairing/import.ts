import { dispatchInteropRuntime } from '../content/interop-runtime-client.js';
import type { InteropRuntimeContext } from '../core/interop/runtime-state.js';

const context: InteropRuntimeContext = { entry: 'settings', total: 0, recordIds: [], locked: false };

function render(): void {
  const root = document.getElementById('root');
  if (!root) return;
  const form = document.createElement('form');
  const title = document.createElement('h1');
  title.textContent = 'Import Overlook pairing key';
  const description = document.createElement('p');
  description.textContent = 'This extension-owned page keeps the pairing file and password isolated from visited websites.';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.required = true;
  file.setAttribute('aria-label', 'Overlook pairing key');
  const password = document.createElement('input');
  password.type = 'password';
  password.autocomplete = 'off';
  password.required = true;
  password.placeholder = 'Pairing key password';
  password.setAttribute('aria-label', 'Pairing key password');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Import pairing key';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = file.files?.[0];
    if (!selected || password.value === '') return;
    submit.disabled = true;
    status.textContent = 'Importing pairing key…';
    void selected
      .text()
      .then((fileContent) => dispatchInteropRuntime(context, { name: 'import-pairing', fileContent, password: password.value }))
      .then((result) => {
        status.textContent = result?.ok ? 'Pairing key imported.' : (result?.snapshot.error?.message ?? 'Pairing key import failed.');
      })
      .catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : 'Pairing key import failed.';
      })
      .finally(() => {
        submit.disabled = false;
      });
  });
  form.append(title, description, file, password, submit, status);
  root.replaceChildren(form);
}

render();
