const THEMES = ['default', 'steam', 'midnight', 'ocean', 'forest', 'amber', 'amethyst', 'rose', 'paper'];
const FRAMES = ['none', 'line', 'double', 'neon', 'ornate', 'pixel', 'gradient'];
const PALETTES = {
  default: ['#171d25', '#213347', '#202b3b', '#30445b', '#66c0f4'],
  steam: ['#171d25', '#213347', '#202b3b', '#30445b', '#66c0f4'],
  midnight: ['#101015', '#24212e', '#1c1b25', '#35303f', '#c5b3ef'],
  ocean: ['#10202e', '#173c52', '#183344', '#24536a', '#6bd0e8'],
  forest: ['#14231f', '#244136', '#20392f', '#345343', '#a2c5a1'],
  amber: ['#292019', '#4c3625', '#392a20', '#67482e', '#e7b779'],
  amethyst: ['#22192f', '#49325d', '#352642', '#63477c', '#d2a9f3'],
  rose: ['#2b1c27', '#533046', '#3d2736', '#704459', '#edb0ca'],
  paper: ['#e8e6e0', '#f9f6ef', '#fffdf7', '#e1d7c6', '#71543c'],
};
const COLOR_KEYS = ['canvas', 'header', 'panel', 'titleBar', 'accent'];
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
const integer = (value, min, max, fallback) => Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
const appearanceDefaults = () => ({ width: 'standard', sidebar: 'right', spacing: 20, radius: 4, panelOpacity: 92, titleStyle: 'bar', showStats: true, colors: Object.fromEntries(COLOR_KEYS.map(key => [key, null])) });
const layoutDefaults = () => ({ region: 'main', width: 'full', header: 'inherit', align: 'left', gallery: 'grid', columns: 3, ratio: 'landscape', imageFit: 'cover' });
const identityDefaults = () => ({ tagline: '', visibility: 'public', alignment: 'left', avatarShape: 'square' });
function normalizeAppearance(value = {}) {
  const d = appearanceDefaults();
  return { width: choice(value.width, ['compact', 'standard', 'wide'], d.width), sidebar: choice(value.sidebar, ['right', 'left', 'none'], d.sidebar),
    spacing: integer(value.spacing, 8, 32, d.spacing), radius: integer(value.radius, 0, 24, d.radius), panelOpacity: integer(value.panelOpacity, 80, 100, d.panelOpacity),
    titleStyle: choice(value.titleStyle, ['bar', 'line', 'plain'], d.titleStyle), showStats: typeof value.showStats === 'boolean' ? value.showStats : true,
    colors: Object.fromEntries(COLOR_KEYS.map(key => [key, hex(value.colors?.[key])])) };
}
function normalizeLayout(value = {}) {
  return { region: choice(value.region, ['main', 'sidebar'], 'main'), width: choice(value.width, ['full', 'half'], 'full'),
    header: choice(value.header, ['inherit', 'bar', 'line', 'plain', 'hidden'], 'inherit'), align: choice(value.align, ['left', 'center'], 'left'),
    gallery: choice(value.gallery, ['grid', 'featured', 'artwork', 'strip'], 'grid'), columns: integer(value.columns, 1, 4, 3),
    ratio: choice(value.ratio, ['auto', 'square', 'landscape', 'portrait'], 'landscape'), imageFit: choice(value.imageFit, ['cover', 'contain'], 'cover') };
}
function upgradeProfile(profile = {}) {
  const appearance = normalizeAppearance(profile.appearance || {});
  return { schemaVersion: 2, visibility: choice(profile.visibility, ['public', 'members', 'self'], 'public'), theme: choice(profile.theme, THEMES, 'steam'), frame: choice(profile.frame, FRAMES, 'none'), appearance,
    identity: { ...identityDefaults(), ...(profile.identity || {}), alignment: choice(profile.identity?.alignment, ['left', 'center'], 'left'), avatarShape: choice(profile.identity?.avatarShape, ['square', 'rounded', 'circle'], 'square') },
    background: { assetId: null, position: 50, positionY: 0, visibility: 'public', fit: 'cover', attachment: 'scroll', overlay: 35, ...(profile.background || {}) },
    modules: (Array.isArray(profile.modules) ? profile.modules : []).map(module => ({ ...module, layout: normalizeLayout(module.layout || {}),
      data: module.type === 'about' ? { format: 'plain', ...module.data } : module.data })) };
}
const rgb = color => [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
const luminance = channels => channels.map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/** Check both black and white image extremes; raise opacity only if neither text color remains legible. */
function readableSurface(color, requested) {
  const base = rgb(color); let alpha = Math.max(.8, Math.min(1, requested)); let foreground; let score;
  for (let step = 0; step <= 20; step++) {
    const backgrounds = [0, 255].map(back => base.map(value => value * alpha + back * (1 - alpha)));
    const candidates = [[255, 255, 255], [0, 0, 0]].map(text => ({ text, score: Math.min(...backgrounds.map(back => contrast(text, back))) }));
    candidates.sort((a, b) => b.score - a.score); foreground = candidates[0].text; score = candidates[0].score;
    if (score >= 4.5 || alpha >= 1) break;
    alpha = Math.min(1, alpha + .01);
  }
  return { background: `rgba(${base.join(',')},${alpha.toFixed(2)})`, text: foreground[0] === 0 ? '#000000' : '#ffffff', opacity: alpha, contrast: score };
}
function paletteFor(profile) {
  const theme = choice(profile.theme, THEMES, 'steam'); const appearance = normalizeAppearance(profile.appearance || {});
  return Object.fromEntries(COLOR_KEYS.map((key, i) => [key, appearance.colors[key] || PALETTES[theme][i]]));
}
function visualStyle(profile) {
  const a = normalizeAppearance(profile.appearance || {}); const colors = paletteFor(profile);
  const panel = readableSurface(colors.panel, a.panelOpacity / 100), header = readableSurface(colors.header, a.panelOpacity / 100), title = readableSurface(colors.titleBar, 1);
  return { '--cp-canvas': colors.canvas, '--cp-canvas-text': readableSurface(colors.canvas, 1).text, '--cp-header': header.background, '--cp-header-text': header.text,
    '--cp-panel': panel.background, '--cp-text': panel.text, '--cp-title': title.background, '--cp-title-text': title.text,
    '--cp-accent': colors.accent, '--cp-spacing': a.spacing + 'px', '--cp-radius': a.radius + 'px',
    '--cp-width': ({ compact: 960, standard: 1120, wide: 1280 })[a.width] + 'px' };
}
module.exports = { THEMES, FRAMES, COLOR_KEYS, PALETTES, appearanceDefaults, layoutDefaults, identityDefaults, normalizeAppearance, normalizeLayout, upgradeProfile, paletteFor, visualStyle, readableSurface };
