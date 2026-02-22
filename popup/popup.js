// popup.js

const btn = document.getElementById('save-btn');
const status = document.getElementById('status');

function setStatus(text, type) {
  status.textContent = text;
  status.className = type || '';
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Converting page...', '');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    // Best-effort: inject SVG capture script into all frames (with timeout)
    try {
      await Promise.race([
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['iframe-capture.js'],
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('iframe injection timeout')), 5000)),
      ]);
    } catch (e) {
      console.log('[2md] iframe injection skipped:', e.message);
    }

    // Inject main scripts into the top frame only
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/Readability.js', 'lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'content.js'],
    });

    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'convert' }, (resp) => {
        void chrome.runtime.lastError; // consume to suppress "Unchecked lastError" warning
        resolve(resp);
      });
    });

    if (!response) throw new Error('Unsupported page type');
    if (response.error) throw new Error(response.error);

    const { title, markdown, imageUrls, urlToLocal } = response;

    setStatus(imageUrls.length > 0 ? 'Downloading images...' : 'Saving...', '');

    chrome.runtime.sendMessage(
      { action: 'download', title, markdown, imageUrls, urlToLocal },
      () => {
        if (chrome.runtime.lastError) {
          setStatus('Failed: ' + chrome.runtime.lastError.message, 'error');
          btn.disabled = false;
          return;
        }
        setStatus('Saved', 'success');
        btn.disabled = false;
      }
    );
  } catch (e) {
    setStatus('Failed: ' + e.message, 'error');
    btn.disabled = false;
  }
});
