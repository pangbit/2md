// background.js — Manifest V3 service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'download') return;

  const { title, markdown, imageUrls, urlToLocal } = message;

  // Download the .md file via data URL (Blob not available in service worker)
  const encoded = encodeURIComponent(markdown);
  const mdDataUrl = 'data:text/markdown;charset=utf-8,' + encoded;

  chrome.downloads.download({ url: mdDataUrl, filename: title + '.md', saveAs: false });

  const total = imageUrls.length;

  if (total === 0) {
    sendResponse({ done: true, completed: 0, total: 0 });
    return true;
  }

  let completed = 0;

  for (const url of imageUrls) {
    const localName = urlToLocal[url];
    chrome.downloads.download(
      { url: url, filename: title + '/' + localName, saveAs: false },
      () => {
        // Consume lastError to avoid unchecked error warnings;
        // always increment so we still resolve even if a download fails.
        void chrome.runtime.lastError;
        completed++;
        if (completed === total) {
          sendResponse({ done: true, completed, total });
        }
      }
    );
  }

  return true;
});
