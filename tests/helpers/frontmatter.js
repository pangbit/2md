function buildFrontmatter(meta) {
  const lines = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value) {
      lines.push(key + ': "' + String(value).replace(/"/g, '\\"') + '"');
    }
  }
  if (lines.length === 0) return '';
  return '---\n' + lines.join('\n') + '\n---\n';
}

module.exports = { buildFrontmatter };
