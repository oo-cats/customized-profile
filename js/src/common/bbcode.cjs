const { safeLink } = require('./safety.cjs');
const TAGS = new Set(['b', 'i', 'u', 'strike', 'spoiler', 'h1', 'h2', 'h3', 'quote', 'code', 'noparse', 'url', 'list', 'olist']);

/** A bounded data parser. Rendering creates text/VDOM nodes, never HTML. */
function parseBBCode(value) {
  const source = String(value || '').slice(0, 4000), root = { tag: 'root', children: [] }, stack = [root];
  const pattern = /\[(\/)?([a-z][a-z0-9]*|\*)(?:=([^\]\r\n]*))?\]/gi;
  let cursor = 0, count = 0, match;
  const appendText = text => { if (text) stack[stack.length - 1].children.push({ tag: 'text', text }); };
  while ((match = pattern.exec(source)) && count++ < 1000) {
    appendText(source.slice(cursor, match.index)); cursor = pattern.lastIndex;
    const tag = match[2].toLowerCase(), closing = !!match[1], current = stack[stack.length - 1];
    if ((current.tag === 'code' || current.tag === 'noparse') && !(closing && tag === current.tag)) { appendText(match[0]); continue; }
    if (tag === 'hr' && !closing) { current.children.push({ tag: 'hr', children: [] }); continue; }
    if (tag === 'hr' && closing) continue;
    if (tag === '*' && !closing) {
      const listIndex = stack.map(node => node.tag).lastIndexOf('list');
      const orderedIndex = stack.map(node => node.tag).lastIndexOf('olist');
      const parent = Math.max(listIndex, orderedIndex);
      if (parent < 0) { appendText(match[0]); continue; }
      stack.length = parent + 1; const node = { tag: 'li', children: [] }; stack[parent].children.push(node); stack.push(node); continue;
    }
    if (!TAGS.has(tag)) { appendText(match[0]); continue; }
    if (closing) {
      const index = stack.map(node => node.tag).lastIndexOf(tag);
      if (index <= 0) appendText(match[0]); else stack.length = index;
      continue;
    }
    if (stack.length >= 9) { appendText(match[0]); continue; }
    const argument = match[3] || '';
    if (tag === 'url' && argument && !safeLink(argument)) { appendText(match[0]); continue; }
    const node = { tag, children: [] };
    if (tag === 'url') node.href = argument ? safeLink(argument) : null;
    if (tag === 'quote') node.author = argument.slice(0, 80);
    current.children.push(node); stack.push(node);
  }
  appendText(source.slice(cursor));
  return root.children;
}
function textOf(nodes) { return nodes.map(node => node.tag === 'text' ? node.text : textOf(node.children || [])).join(''); }
module.exports = { parseBBCode, textOf };
