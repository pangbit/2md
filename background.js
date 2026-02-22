// background.js — Manifest V3 service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'download') return;

  const { title, imageUrls, urlToLocal } = message;

  const total = imageUrls.length;

  // Dispatch all downloads and respond immediately. MV3 service workers can be
  // terminated before async callbacks fire, so we must not defer sendResponse.
  // chrome.downloads.download() continues even after the service worker sleeps.
  for (const url of imageUrls) {
    const localName = urlToLocal[url];
    if (!localName) continue; // URL missing from map (conversion failed); skip.
    chrome.downloads.download(
      { url: url, filename: title + '/' + localName, saveAs: false },
      () => { void chrome.runtime.lastError; }
    );
  }

  sendResponse({ done: true, total });
  return true;
});
