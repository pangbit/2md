// popup.js

const btn = document.getElementById('save-btn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = '⏳ 正在转换页面…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject Turndown.js and content.js into the active tab
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['lib/turndown.js', 'content.js'],
  });

  // Ask content script to convert the page
  const response = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'convert' }, resolve);
  });

  const { title, markdown, imageUrls, urlToLocal } = response;

  status.textContent = imageUrls.length === 0
    ? '⏳ 正在下载…'
    : '⏳ 正在下载图片… 0/' + imageUrls.length;

  // Ask background service worker to download everything
  chrome.runtime.sendMessage(
    { action: 'download', title, markdown, imageUrls, urlToLocal },
    function onProgress(progress) {
      if (!progress) return;
      if (progress.done) {
        status.textContent = '✓ 已保存';
        btn.disabled = false;
      } else {
        status.textContent = '⏳ 正在下载图片… ' + progress.completed + '/' + progress.total;
      }
    }
  );
});
