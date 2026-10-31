import { parseBBCode, textOf } from '../common/bbcode.cjs';
import { safeLink } from '../common/safety.cjs';
import { t } from './api';

function renderNodes(nodes) {
  return nodes.map(node => {
    if (node.tag === 'text') return node.text;
    if (node.tag === 'code' || node.tag === 'noparse') return node.tag === 'code' ? <pre><code>{textOf(node.children)}</code></pre> : textOf(node.children);
    const children = renderNodes(node.children || []);
    if (node.tag === 'url') {
      const href = safeLink(node.href || textOf(node.children));
      return href ? <a href={href} rel="ugc nofollow noopener noreferrer" target="_blank">{children}<small className="CustomProfile-domain"> ↗ {new URL(href).hostname}</small></a> : children;
    }
    if (node.tag === 'spoiler') return <details className="CustomProfile-spoiler"><summary>{t('v2.spoiler')}</summary>{children}</details>;
    if (node.tag === 'quote') return <blockquote>{node.author && <cite>{node.author}</cite>}{children}</blockquote>;
    const tags = { b: 'strong', i: 'em', u: 'u', strike: 's', h1: 'h3', h2: 'h4', h3: 'h5', list: 'ul', olist: 'ol', li: 'li', hr: 'hr' };
    return tags[node.tag] ? m(tags[node.tag], children) : children;
  });
}

function view(vnode) {
  const { text, format } = vnode.attrs;
  return <div className="CustomProfile-formatted">{format === 'bbcode' ? renderNodes(parseBBCode(text)) : String(text || '')}</div>;
}

export default { view };
