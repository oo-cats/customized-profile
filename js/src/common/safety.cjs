const { THEMES, FRAMES, upgradeProfile, layoutDefaults } = require('./appearance.cjs');
const VISIBILITIES = ['public', 'members', 'self'];

function safeLink(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}

function safeMediaUrl(value, apiUrl) {
  if (typeof value !== 'string' || typeof apiUrl !== 'string') return null;
  try {
    const base = new URL(apiUrl);
    const url = new URL(value, base.origin);
    const prefix = base.pathname.replace(/\/$/, '') + '/custom-profile/assets/';
    const tail = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
    return url.origin === base.origin && /^[a-f0-9]{32}\/file$/.test(tail) && !url.search && !url.hash && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}

function safePostUrl(value, forumUrl) {
  if (typeof value !== 'string') return null;
  try {
    const base = new URL(forumUrl);
    const url = new URL(value, base.href.replace(/\/$/, '') + '/');
    const prefix = base.pathname.replace(/\/$/, '') + '/d/';
    return url.origin === base.origin && url.pathname.startsWith(prefix) && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}

function boundedPosition(value) { return Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 50; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function moveModule(modules, index, direction) {
  const destination = index + direction;
  if (!Array.isArray(modules) || index < 0 || index >= modules.length || destination < 0 || destination >= modules.length) return modules;
  const result = modules.slice();
  [result[index], result[destination]] = [result[destination], result[index]];
  return result;
}
function newModule(type, id) {
  const defaults = { about: { text: '', format: 'bbcode', tags: [], links: [] }, fields: { values: [] }, gallery: { images: [] }, posts: { postIds: [] }, 'acgn-watching': { limit: 6, withProgress: false }, 'acgn-ratings': { limit: 6, withProgress: false }, 'recent-posts': { limit: 6, scope: 'all' }, 'liked-posts': { limit: 6, scope: 'all' } };
  if (!Object.prototype.hasOwnProperty.call(defaults, type)) throw new Error('Unsupported module type');
  return { id, type, title: '', visibility: 'public', layout: layoutDefaults(), data: clone(defaults[type]) };
}
function defaultProfile() {
  return upgradeProfile({ theme: 'steam', modules: [newModule('about', 'about')] });
}

function safeAcgnUrl(value, forumUrl) {
  if (typeof value !== 'string') return null;
  try {
    const base = new URL(forumUrl), url = new URL(value, base.href.replace(/\/$/, '') + '/');
    const prefix = base.pathname.replace(/\/$/, '') + '/acgn/subjects/';
    return url.origin === base.origin && url.pathname.startsWith(prefix) && /^[1-9][0-9]*$/.test(url.pathname.slice(prefix.length)) && !url.search && !url.hash && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}
module.exports = { THEMES, FRAMES, VISIBILITIES, safeLink, safeMediaUrl, safePostUrl, safeAcgnUrl, boundedPosition, clone, moveModule, newModule, defaultProfile };
