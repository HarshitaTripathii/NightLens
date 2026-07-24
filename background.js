const DEFAULT_SETTINGS = { enabled: true };

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set(settings);
});
