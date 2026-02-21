// popup.js

const btn = document.getElementById('save-btn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = '⏳ 正在转换页面…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject Turndown.js and content.js into the active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'content.js'],
    });

    // Ask content script to convert the page
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'convert' }, resolve);
    });

    if (!response) throw new Error('页面无法转换（不支持的页面类型）');

    const { title, markdown, imageUrls, urlToLocal } = response;

    if (imageUrls.length > 0) {
      status.textContent = '⏳ 正在下载图片…';
    } else {
      status.textContent = '⏳ 正在下载…';
    }

    // Ask background service worker to download everything.
    // sendResponse is called once when all downloads complete.
    chrome.runtime.sendMessage(
      { action: 'download', title, markdown, imageUrls, urlToLocal },
      (result) => {
        if (chrome.runtime.lastError) {
          status.textContent = '下载失败: ' + chrome.runtime.lastError.message;
          btn.disabled = false;
          return;
        }
        status.textContent = '✓ 已保存';
        btn.disabled = false;
      }
    );
  } catch (e) {
    status.textContent = '失败: ' + e.message;
    btn.disabled = false;
  }
});
