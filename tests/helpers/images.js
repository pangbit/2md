function collectImages(markdown) {
  const regex = /!\[.*?\]\(<?((?!data:)[^)>]+)>?\)/g;
  const urls = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function buildUrlMap(urls) {
  const seen = {};
  const urlToLocal = {};
  for (const url of urls) {
    const base = url.split('/').pop().split('?')[0] || 'image';
    let name = base;
    if (seen[base] !== undefined) {
      seen[base]++;
      const dotIdx = base.lastIndexOf('.');
      name = dotIdx >= 0
        ? base.slice(0, dotIdx) + '_' + seen[base] + base.slice(dotIdx)
        : base + '_' + seen[base];
    } else {
      seen[base] = 0;
    }
    urlToLocal[url] = name;
  }
  return urlToLocal;
}

function rewriteImagePaths(markdown, folderName, urlToLocal) {
  return markdown.replace(/!\[(.*?)\]\(<?((?!data:)[^)>]+)>?\)/g, (match, alt, url) => {
    if (urlToLocal[url]) {
      return '![' + alt + '](<./' + folderName + '/' + urlToLocal[url] + '>)';
    }
    return match;
  });
}

function remapKeys(urlToLocal, svgToPng) {
  const result = {};
  for (const [url, localName] of Object.entries(urlToLocal)) {
    const newKey = svgToPng[url] || url;
    result[newKey] = localName;
  }
  return result;
}

module.exports = { collectImages, buildUrlMap, rewriteImagePaths, remapKeys };
