export async function sendRuntimeMessage(message: unknown): Promise<unknown | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (isExtensionContextUnavailableError(error)) return null;
    throw error;
  }
}

function isExtensionContextUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Extension context invalidated');
}
