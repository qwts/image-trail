const status = document.getElementById('status');
const token = decodeURIComponent(location.hash.slice(1));

function showError(message) {
  if (status) status.textContent = message;
}

if (!token) {
  showError('Preview token is missing.');
} else {
  chrome.runtime.sendMessage({ type: 'imageTrail.consumePreview', token }, (response) => {
    if (!response?.ok) {
      showError(response?.message ?? 'Preview could not be loaded.');
      return;
    }

    const image = document.createElement('img');
    image.alt = 'Decrypted Image Trail original';
    image.src = response.dataUrl;
    document.body.replaceChildren(image);
  });
}
