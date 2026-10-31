function previewData(response, kind, config, forumUrl) {
  const data = { ...config, available: false, items: [] };
  if (response?.schemaVersion !== 1 || response.kind !== kind || !Array.isArray(response.items)) return data;
  data.available = true;
  for (const item of response.items.slice(0, Math.max(1, Math.min(6, config.limit || 6)))) {
    if (!Number.isSafeInteger(item.subjectId) || item.subjectId < 1 || item.subjectId > 2147483647 || typeof item.title !== 'string' || item.title.length > 300
      || !['anime', 'manga', 'game', 'novel'].includes(item.type) || !['planned', 'current', 'completed', 'on_hold', 'dropped'].includes(item.status)) continue;
    const safe = { subjectId: item.subjectId, title: item.title, type: item.type, status: item.status, url: forumUrl.replace(/\/$/, '') + '/acgn/subjects/' + item.subjectId };
    if (kind === 'ratings') { if (!Number.isInteger(item.score) || item.score < 1 || item.score > 10) continue; safe.score = item.score; }
    if (config.withProgress && Number.isInteger(item.progress) && item.progress >= 0 && item.progress <= 2147483647) safe.progress = item.progress;
    data.items.push(safe);
  }
  return data;
}
module.exports = { previewData };
