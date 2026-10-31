const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function achievementIds(value) {
  if (!Array.isArray(value) || value.length > 12 || value.some(id => typeof id !== 'string' || !UUID.test(id))) return null;
  return [...new Set(value.map(id => id.toLowerCase()))];
}
const validText = (value, max) => typeof value === 'string' && Array.from(value).length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
function cleanAchievement(item) {
  if (!item || typeof item.id !== 'string' || !UUID.test(item.id) || !validText(item.name, 150) || !item.name.trim()
    || !validText(item.description, 300) || !['active', 'archived'].includes(item.status)) return null;
  const date = item.earnedAt ?? null;
  if (date !== null) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(date)) return null;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== date.slice(0, 19)) return null;
  }
  return { id: item.id.toLowerCase(), name: item.name, description: item.description, status: item.status, earnedAt: date };
}
const unavailableAchievements = ids => ({ available: false, earnedCount: null, items: [], hasSelection: !!ids?.length });
function projectAchievements(data, ids) {
  if (!data || !data.available) return unavailableAchievements(ids);
  const items = new Map(data.items.map(item => [item.id, item]));
  return { available: true, earnedCount: data.earnedCount, hasSelection: ids.length > 0, items: ids.map(id => items.get(id)).filter(Boolean) };
}
function parseAchievementShowcase(response, userId, selected) {
  const ids = achievementIds(selected);
  if (!ids || response?.schemaVersion !== 1 || response.userId !== Number(userId) || !Number.isSafeInteger(response.earnedCount)
    || response.earnedCount < 0 || !Array.isArray(response.items) || response.items.length > 12) return unavailableAchievements(selected);
  const permitted = new Set(ids), seen = new Set(), items = [];
  for (const raw of response.items) {
    const item = cleanAchievement(raw);
    if (item && permitted.has(item.id) && !seen.has(item.id)) { items.push(item); seen.add(item.id); }
  }
  if (items.length > response.earnedCount) return unavailableAchievements(ids);
  return projectAchievements({ available: true, earnedCount: response.earnedCount, items }, ids);
}
function parseAchievementOptions(response, userId) {
  if (response?.schemaVersion !== 1 || response.userId !== Number(userId) || !Array.isArray(response.items) || response.items.length > 50
    || !(response.nextCursor === null || typeof response.nextCursor === 'string' && response.nextCursor.length > 0 && response.nextCursor.length <= 256)) return null;
  const seen = new Set(), items = [];
  for (const raw of response.items) { const item = cleanAchievement(raw); if (item && !seen.has(item.id)) { items.push(item); seen.add(item.id); } }
  return { items, nextCursor: response.nextCursor };
}
const achievementQuery = ids => ids.map(id => 'ids%5B%5D=' + encodeURIComponent(id)).join('&');
module.exports = { achievementIds, cleanAchievement, unavailableAchievements, projectAchievements, parseAchievementShowcase, parseAchievementOptions, achievementQuery };
