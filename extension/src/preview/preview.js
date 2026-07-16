/* global chrome, document, location */

const token = decodeURIComponent(location.hash.slice(1));
let previewDataUrl = null;
let previewLoading = false;
let workspaceLocked = true;

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function renderLock(message, phase = 'locked') {
  workspaceLocked = true;
  const main = document.createElement('main');
  main.className = 'image-trail-preview-lock';
  main.dataset.secureWorkspaceLock = 'true';
  main.setAttribute('aria-busy', String(phase !== 'locked'));

  const surface = document.createElement('section');
  surface.setAttribute('role', 'dialog');
  surface.setAttribute('aria-modal', 'true');
  surface.setAttribute('aria-labelledby', 'image-trail-preview-lock-title');
  const emblem = document.createElement('span');
  emblem.textContent = 'LOCKED';
  emblem.setAttribute('aria-hidden', 'true');
  const heading = document.createElement('h1');
  heading.id = 'image-trail-preview-lock-title';
  heading.textContent = phase === 'checking' ? 'Securing preview…' : 'Image Trail is locked';
  const description = document.createElement('p');
  description.textContent =
    phase === 'checking' ? 'Checking the encrypted session before revealing this preview.' : 'Enter your password to restore this preview.';
  surface.append(emblem, heading, description);

  if (message) {
    const error = document.createElement('p');
    error.className = 'image-trail-preview-lock__error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    surface.append(error);
  }

  if (phase !== 'checking') {
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Password';
    const password = document.createElement('input');
    password.type = 'password';
    password.required = true;
    password.autocomplete = 'current-password';
    password.disabled = phase === 'unlocking';
    label.append(password);
    const unlock = document.createElement('button');
    unlock.type = 'submit';
    unlock.disabled = phase === 'unlocking';
    unlock.textContent = phase === 'unlocking' ? 'Unlocking…' : 'Unlock preview';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity() || phase === 'unlocking') return;
      const value = password.value;
      password.value = '';
      renderLock(null, 'unlocking');
      void unlockPreview(value);
    });
    form.append(label, unlock);
    surface.append(form);
    void Promise.resolve().then(() => password.focus());
  }

  main.append(surface);
  document.body.replaceChildren(main);
}

function renderPreview() {
  workspaceLocked = false;
  if (!previewDataUrl) {
    const status = document.createElement('p');
    status.id = 'status';
    status.textContent = previewLoading ? 'Loading encrypted preview…' : 'Preview is unavailable.';
    document.body.replaceChildren(status);
    return;
  }
  const image = document.createElement('img');
  image.alt = 'Decrypted Image Trail original';
  image.src = previewDataUrl;
  document.body.replaceChildren(image);
}

async function loadPreview() {
  if (previewDataUrl || previewLoading) {
    if (!workspaceLocked) renderPreview();
    return;
  }
  if (!token) {
    if (!workspaceLocked) showError('Preview token is missing.');
    return;
  }
  previewLoading = true;
  if (!workspaceLocked) renderPreview();
  try {
    const response = await sendMessage({ type: 'imageTrail.consumePreview', token });
    if (!response?.ok) {
      if (!workspaceLocked) showError(response?.message ?? 'Preview could not be loaded.');
      return;
    }
    previewDataUrl = response.dataUrl;
    if (!workspaceLocked) renderPreview();
  } catch {
    if (!workspaceLocked) showError('Preview could not be loaded.');
  } finally {
    previewLoading = false;
  }
}

function showError(message) {
  const status = document.createElement('p');
  status.id = 'status';
  status.textContent = message;
  document.body.replaceChildren(status);
}

async function unlockPreview(password) {
  try {
    const response = await sendMessage({
      type: 'imageTrail.unlockBlobKey',
      version: 1,
      payload: { password },
    });
    if (!response?.payload?.ok) {
      renderLock(response?.payload?.message ?? 'Image Trail could not unlock this preview.');
      return;
    }
    workspaceLocked = false;
    await loadPreview();
    renderPreview();
  } catch {
    renderLock('Image Trail could not unlock this preview.');
  }
}

function applySecureSessionStatus(status) {
  if (status?.hasKey && !status.unlocked) {
    renderLock(status.message ?? null);
    return;
  }
  workspaceLocked = false;
  void loadPreview();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'imageTrail.secureSessionChanged' || message.version !== 1) return false;
  applySecureSessionStatus(message.payload);
  return false;
});

renderLock(null, 'checking');
void sendMessage({ type: 'imageTrail.blobKeyStatus', version: 1, payload: {} })
  .then((response) => {
    if (response?.type !== 'imageTrail.blobKeyStatusResult') {
      renderLock('Secure session status is unavailable. Unlock to retry.');
      return;
    }
    applySecureSessionStatus(response.payload);
  })
  .catch(() => renderLock('Secure session status is unavailable. Unlock to retry.'));
