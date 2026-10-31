import app from 'flarum/forum/app';
import { t } from './api';
import FormattedText from './FormattedText';
import humanTime from 'flarum/common/utils/humanTime';
import { safeLink, safeMediaUrl, safePostUrl, safeAcgnUrl } from '../common/safety.cjs';
import { normalizeLayout, normalizeAppearance } from '../common/appearance.cjs';

const renderers = new Map();
export function registerModuleRenderer(type, renderer) {
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(type) || typeof renderer !== 'function' || renderers.has(type)) throw new Error('Invalid or duplicate profile module renderer');
  renderers.set(type, renderer);
}
const media = value => safeMediaUrl(value, app.forum.attribute('apiUrl'));
registerModuleRenderer('about', data => [
  <FormattedText text={data.text} format={data.format || 'plain'} />,
  (data.tags || []).length > 0 && <div className="CustomProfile-tags">{data.tags.map(tag => <span>{tag}</span>)}</div>,
  (data.links || []).length > 0 && <ul className="CustomProfile-links">{data.links.map(link => {
    const url = safeLink(link.url);
    return url ? <li><a href={url} rel="ugc nofollow noopener noreferrer" target="_blank">{link.label}<small className="CustomProfile-domain"> ↗ {new URL(url).hostname}</small></a></li> : null;
  })}</ul>,
]);
registerModuleRenderer('fields', (data, context) => <dl className="CustomProfile-fields">{(data.values || []).map(field => {
  const definition = (context.fields || []).find(item => item.key === field.key);
  const url = (field.type || definition?.type) === 'url' ? safeLink(field.value) : null;
  return <div><dt>{field.label || definition?.label || field.key}</dt><dd>{url ? <a href={url} rel="ugc nofollow noopener noreferrer" target="_blank">{new URL(url).hostname}</a> : field.value}</dd></div>;
})}</dl>);
registerModuleRenderer('gallery', (data, context) => {
  const layout = context.layout;
  return <div className={'CustomProfile-gallery CustomProfile-gallery-' + layout.gallery + ' CustomProfile-ratio-' + layout.ratio + ' CustomProfile-image-' + layout.imageFit + ' CustomProfile-columns-' + layout.columns}>{(data.images || []).map(image => {
    const url = media(image.url);
    return url ? <figure><img src={url} alt={image.caption || ''} loading="lazy" decoding="async" />{image.caption && <figcaption>{image.caption}</figcaption>}</figure> : null;
  })}</div>;
});
registerModuleRenderer('posts', data => <ul className="CustomProfile-posts">{(data.items || []).map(post => {
  const url = safePostUrl(post.url, app.forum.attribute('baseUrl'));
  return url ? <li><a href={url}><i className="fas fa-comment-alt" aria-hidden="true" /> {post.title}</a></li> : null;
})}</ul>);

for (const type of ['recent-posts', 'liked-posts']) registerModuleRenderer(type, data => {
  if (!(data.items || []).length) return <p className="CustomProfile-postFeedEmpty">{t(data.available === false ? 'post_feed.unavailable' : 'post_feed.empty')}</p>;
  return <ol className="CustomProfile-postFeedList">{data.items.slice(0, 6).map(post => {
    const url = safePostUrl(post.url, app.forum.attribute('baseUrl')); if (!url) return null;
    const date = new Date(post.createdAt);
    return <li key={post.id}>
      <a href={url} className="CustomProfile-postFeedTitle">{post.title}</a>
      {Number.isInteger(post.likesCount) && <strong className="CustomProfile-postFeedLikes"><i className="far fa-thumbs-up" aria-hidden="true" /> {post.likesCount}</strong>}
      <span className="CustomProfile-postFeedMeta">{post.number === 1 ? t('post_feed.topic') : t('post_feed.reply', { number: post.number })}{!Number.isNaN(date.getTime()) && [' · ', <time dateTime={post.createdAt}>{humanTime(date)}</time>]}</span>
    </li>;
  })}</ol>;
});

for (const kind of ['watching', 'ratings']) registerModuleRenderer('acgn-' + kind, data => {
  const items = (data.items || []).slice(0, 6);
  if (!items.length) return <p className="CustomProfile-acgnEmpty">{t(data.available === false ? 'acgn.unavailable' : 'acgn.empty')}</p>;
  return <ol className="CustomProfile-acgnList">{items.map(item => {
    const url = safeAcgnUrl(item.url, app.forum.attribute('baseUrl')); if (!url) return null;
    return <li key={item.subjectId}><div className="CustomProfile-acgnItem">
      <span className="CustomProfile-acgnType">{t('acgn.types.' + item.type)}</span>
      <a href={url} className="CustomProfile-acgnTitle">{item.title}</a>
      {kind === 'ratings' && Number.isInteger(item.score) && <strong className="CustomProfile-acgnScore">{item.score}<small> / 10</small></strong>}
      <span className="CustomProfile-acgnMeta">{t('acgn.status.' + item.status)}{Number.isInteger(item.progress) && [' · ', t('acgn.progress_value', { value: item.progress })]}</span>
    </div></li>;
  })}</ol>;
});

function view(vnode) {
  const { profile, region = 'main' } = vnode.attrs;
  const appearance = normalizeAppearance(profile.appearance || {});
  const modules = (profile.modules || []).filter(module => {
    const layout = normalizeLayout(module.layout || {});
    return appearance.sidebar === 'none' ? region === 'main' : layout.region === region;
  });
  return <div className={'CustomProfile-showcases CustomProfile-showcases-' + region}>{modules.map(module => {
    const renderer = renderers.get(module.type); if (!renderer) return null;
    const layout = normalizeLayout(module.layout || {});
    const header = layout.header === 'inherit' ? appearance.titleStyle : layout.header;
    return <section key={module.id} data-module-id={module.id} className={'CustomProfile-module CustomProfile-module-' + layout.width + ' CustomProfile-align-' + layout.align + ' CustomProfile-title-' + header}>
      {header !== 'hidden' && <h2 className="CustomProfile-moduleTitle">{module.title || t('modules.' + module.type)}</h2>}
      <div className="CustomProfile-moduleBody">{renderer(module.data || {}, { ...vnode.attrs, module, layout })}</div>
    </section>;
  })}</div>;
}

export default { view };
