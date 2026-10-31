const POST_TYPES = ['posts', 'recent-posts', 'liked-posts'];
const isPostShowcase = type => POST_TYPES.includes(type);

/** Only describes a bounded request; the private endpoint still checks all permissions. */
function postPreviewRequest(module) {
  if (!isPostShowcase(module.type)) return null;
  if (module.type === 'posts') {
    const ids = module.data.postIds;
    if (!Array.isArray(ids) || ids.length > 6 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 2147483647)) return null;
    const key = [...new Set(ids)].join(',');
    return { key: 'featured:' + key, query: 'kind=featured&postIds=' + encodeURIComponent(key), limit: 6 };
  }
  if (!['all', 'discussions', 'replies'].includes(module.data.scope)) return null;
  const kind = module.type === 'recent-posts' ? 'recent' : 'liked';
  return { key: kind + ':' + module.data.scope, query: 'kind=' + kind + '&limit=6&scope=' + module.data.scope, limit: module.data.limit };
}

module.exports = { isPostShowcase, postPreviewRequest };
