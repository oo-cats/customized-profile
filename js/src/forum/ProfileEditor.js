import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import extractText from 'flarum/common/utils/extractText';
import ProfileView from './ProfileView';
import AcgnSharingModal, { acgnRequest } from './AcgnSharingModal';
import AchievementSelectModal from './AchievementSelectModal';
import { achievementRequest } from './achievementApi';
import { previewData } from '../common/acgn.cjs';
import { isPostShowcase, postPreviewRequest } from '../common/post-preview.cjs';
import { achievementIds, achievementQuery, parseAchievementShowcase, unavailableAchievements, projectAchievements } from '../common/achievements.cjs';
import { request, endpoint, t, errorText } from './api';
import { clone, defaultProfile, newModule, moveModule, safeMediaUrl } from '../common/safety.cjs';
import { appearanceDefaults, layoutDefaults, upgradeProfile, paletteFor, COLOR_KEYS } from '../common/appearance.cjs';

let moduleSequence = 0;
const choices = (values, current, onChange, namespace = 'visibility') => <select className="FormControl" value={current} onchange={event => onChange(event.target.value)}>{values.map(value => <option value={value}>{t(namespace + '.' + value)}</option>)}</select>;

export default class ProfileEditor extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.userId = this.attrs.user.id(); this.state = null; this.config = null; this.profile = null;
    this.busy = false; this.error = null; this.notice = null; this.assets = []; this.nextCursor = null;
    this.tab = 'general'; this.audience = 'self'; this.preview = null; this.dirty = false; this.postInputs = {}; this.tagInputs = {}; this.bioEditors = {};
    this.mobilePreview = false; this.draggedModule = null; this.reorderMode = false;
    this.newType = 'about'; this.moderationAction = 'freeze'; this.moderationReason = ''; this.moderationTarget = '';
    this.acgnPreview = {};
    this.postPreviews = new Map(); this.pendingPostPreviews = new Set(); this.removed = false;
    this.achievementPreviews = new Map(); this.pendingAchievementPreviews = new Set();
    this.load();
  }
  onsubmit(event) { event.preventDefault(); }
  onremove(vnode) { this.removed = true; clearTimeout(this.postPreviewTimer); super.onremove(vnode); }
  path(action) { return '/users/' + this.userId + action; }
  disabled() { return this.busy || !!(this.state?.frozen && !this.attrs.canManage); }
  invalidatePreview() { this.preview = null; this.audience = 'self'; }
  touch() { this.dirty = true; this.invalidatePreview(); this.notice = null; }
  async run(operation) {
    if (this.busy) return;
    this.busy = true; this.error = null; this.notice = null;
    try { await operation(); }
    catch (error) { this.error = errorText(error); }
    finally { this.busy = false; m.redraw(); }
  }
  async load() {
    await this.run(async () => {
      [this.state, this.config] = await Promise.all([this.attrs.initialState || request('GET', this.path('/editor')), request('GET', '/config')]);
      this.profile = upgradeProfile(clone(this.state.draft || defaultProfile()));
      this.postInputs = {}; this.tagInputs = {};
      this.profile.modules.forEach(module => { if (!module.title) module.title = extractText(t('modules.' + module.type)); });
      await Promise.all([
        String(app.session.user?.id()) === String(this.userId) ? this.loadAssets() : Promise.resolve(),
        this.loadAcgnPreview(), this.loadPostPreviews(), this.loadAchievementPreviews(),
      ]);
    });
  }
  async saveDraft() {
    this.state = await request('PUT', this.path('/draft'), { version: this.state.version, profile: this.profile });
    this.profile = upgradeProfile(clone(this.state.draft)); this.dirty = false; this.postInputs = {}; this.tagInputs = {};
  }
  async save() { await this.run(async () => { await this.saveDraft(); this.notice = t('forum.draft_saved'); }); }
  async showPreview() {
    await this.run(async () => {
      if (this.dirty) await this.saveDraft();
      this.preview = await request('GET', this.path('/preview?audience=' + this.audience));
      this.mobilePreview = true;
    });
  }
  async publish() {
    await this.run(async () => {
      if (this.dirty) await this.saveDraft();
      this.state = await request('POST', this.path('/publish'), { version: this.state.version });
      this.profile = upgradeProfile(clone(this.state.draft)); this.invalidatePreview(); this.notice = t('forum.published');
      if (this.attrs.onPublished) this.attrs.onPublished();
    });
  }
  async rollback() {
    await this.run(async () => {
      this.state = await request('POST', this.path('/rollback'), { version: this.state.version });
      this.profile = upgradeProfile(clone(this.state.draft)); this.dirty = false; this.invalidatePreview(); this.postInputs = {}; this.tagInputs = {};
      await Promise.all([this.loadPostPreviews(), this.loadAchievementPreviews()]);
      this.notice = t('forum.rolled_back'); if (this.attrs.onPublished) this.attrs.onPublished();
    });
  }
  async loadAssets(cursor) {
    const page = await request('GET', '/assets' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    this.assets = page.assets || []; this.nextCursor = page.nextCursor;
  }
  async loadAcgnPreview() {
    if (!this.config.integrations?.acgn) return;
    const kinds = ['watching', 'ratings'].filter(kind => this.profile.modules.some(module => module.type === 'acgn-' + kind));
    await Promise.all(kinds.map(async kind => {
      try { this.acgnPreview[kind] = await acgnRequest('GET', '/users/' + this.userId + '/showcases/recent-' + kind + '?limit=6&with_progress=1'); }
      catch (_) { this.acgnPreview[kind] = null; }
    }));
    m.redraw();
  }
  manageAcgnSharing() {
    const items = Object.values(this.acgnPreview).flatMap(response => response?.items || []);
    app.modal.show(AcgnSharingModal, { items, onChanged: () => { this.invalidatePreview(); this.loadAcgnPreview(); } });
  }
  async loadPostPreviews() {
    await Promise.all(this.profile.modules.filter(module => isPostShowcase(module.type)).map(module => this.loadPostPreview(module)));
  }
  async loadPostPreview(module, refresh = false) {
    if (refresh) this.invalidatePreview();
    const descriptor = postPreviewRequest(module);
    if (!descriptor) return;
    const { key, query } = descriptor;
    if (this.pendingPostPreviews.has(key) || (!refresh && this.postPreviews.has(key))) return;
    this.pendingPostPreviews.add(key);
    let data;
    try { data = await request('GET', this.path('/post-preview?' + query)); }
    catch (_) { data = { available: false, items: [] }; }
    finally { this.pendingPostPreviews.delete(key); }
    if (this.removed) return;
    const active = new Set(this.profile.modules.map(item => postPreviewRequest(item)?.key).filter(Boolean));
    for (const cached of this.postPreviews.keys()) if (!active.has(cached)) this.postPreviews.delete(cached);
    if (active.has(key)) this.postPreviews.set(key, data);
    m.redraw();
  }
  schedulePostPreview(module) {
    clearTimeout(this.postPreviewTimer);
    this.postPreviewTimer = setTimeout(() => { if (!this.removed) this.loadPostPreview(module); }, 250);
  }
  async loadAchievementPreviews() {
    await Promise.all(this.profile.modules.filter(module => module.type === 'achievements').map(module => this.loadAchievementPreview(module)));
  }
  trimAchievementPreviews() {
    const active = new Set(this.profile.modules.filter(module => module.type === 'achievements').map(module => achievementIds(module.data.achievementIds)?.join(',')));
    for (const key of this.achievementPreviews.keys()) if (!active.has(key)) this.achievementPreviews.delete(key);
  }
  async loadAchievementPreview(module, refresh = false) {
    if (refresh) this.invalidatePreview();
    const ids = achievementIds(module.data.achievementIds); if (!ids) return;
    const key = ids.join(',');
    if (this.pendingAchievementPreviews.has(key) || (!refresh && this.achievementPreviews.has(key))) return;
    this.pendingAchievementPreviews.add(key);
    let data = unavailableAchievements(ids);
    try {
      if (refresh && !this.config.integrations?.achievements) {
        const config = await request('GET', '/config');
        this.config.integrations = { ...this.config.integrations, achievements: !!config.integrations?.achievements };
      }
      if (this.config.integrations?.achievements && !this.state.frozen) {
        const query = achievementQuery(ids);
        data = parseAchievementShowcase(await achievementRequest(this.userId, 'achievement-showcase' + (query ? '?' + query : '')), this.userId, ids);
      }
    } catch (_) { /* A missing or failed source is unavailable, never a false zero. */ }
    finally { this.pendingAchievementPreviews.delete(key); }
    if (this.removed) return;
    this.achievementPreviews.set(key, data); this.trimAchievementPreviews(); m.redraw();
  }
  setAchievementIds(module, value) {
    if (this.removed || !this.profile.modules.includes(module)) return;
    const ids = achievementIds(value); if (!ids) return;
    const previous = module.data.achievementIds, cached = this.achievementPreviews.get(previous.join(','));
    module.data.achievementIds = ids; this.touch();
    if (cached?.available && ids.every(id => previous.includes(id))) {
      this.achievementPreviews.set(ids.join(','), projectAchievements(cached, ids)); this.trimAchievementPreviews();
    } else this.loadAchievementPreview(module);
  }
  chooseAchievements(module) {
    const ids = module.data.achievementIds, data = this.achievementPreviews.get(ids.join(','));
    app.modal.show(AchievementSelectModal, { userId: this.userId, selectedIds: ids, items: data?.items || [], onSelect: selected => this.setAchievementIds(module, selected) });
  }
  async upload(file) {
    if (!file) return;
    await this.run(async () => {
      const body = new FormData(); body.append('file', file);
      const result = await app.request({ method: 'POST', url: endpoint('/assets'), body, serialize: value => value });
      await this.loadAssets(); this.notice = t('forum.uploaded');
      this.lastUploadedId = result.asset?.id;
    });
  }
  async removeAsset(asset) { await this.run(async () => { await request('DELETE', '/assets/' + asset.id); await this.loadAssets(); }); }
  assetSelect(value, onChange, empty = true) {
    const selected = this.assets.find(asset => asset.id === value);
    const selectedUrl = selected && safeMediaUrl(selected.url, app.forum.attribute('apiUrl'));
    return <div className="CustomProfile-imageChoice">{selectedUrl && <img src={selectedUrl} alt="" loading="lazy" />}<select className="FormControl" value={value || ''} onchange={event => { onChange(event.target.value || null); this.touch(); }}>
      {empty && <option value="">{t('forum.no_image')}</option>}
      {value && !this.assets.some(asset => asset.id === value) && <option value={value}>{value}</option>}
      {this.assets.filter(asset => asset.status === 'active').map((asset, index) => <option value={asset.id}>{t('forum.image')} {index + 1} · {asset.width}×{asset.height}</option>)}
    </select></div>;
  }
  addModule() {
    if (this.profile.modules.length >= (this.config.limits?.modules || 12)) return;
    const id = 'm' + Date.now().toString(36) + (++moduleSequence).toString(36);
    const module = newModule(this.newType, id); module.title = extractText(t('modules.' + this.newType)); this.profile.modules.push(module); this.touch();
    if (['acgn-watching', 'acgn-ratings'].includes(module.type)) this.loadAcgnPreview();
    if (isPostShowcase(module.type)) this.loadPostPreview(module);
    if (module.type === 'achievements') this.loadAchievementPreview(module);
  }
  field(label, input, help) {
    const name = extractText(label);
    const labelControl = node => {
      if (!node || typeof node !== 'object') return false;
      if (['input', 'select', 'textarea'].includes(node.tag)) { node.attrs = { ...node.attrs, 'aria-label': name }; return true; }
      return (node.children || []).some(labelControl);
    };
    labelControl(input);
    return <label className="Form-group CustomProfile-field"><span>{label}</span>{input}{help && <small className="helpText">{help}</small>}</label>;
  }
  view() {
    if (!this.profile) return <div className="CustomProfile-editorLoading">{this.error ? <div role="alert" className="Alert Alert--error">{this.error}</div> : <LoadingIndicator />}</div>;
    return <div className={'CustomProfileEditor CustomProfile-editorWorkspace' + (this.mobilePreview ? ' CustomProfile-previewSelected' : '')}>
      <nav className="CustomProfile-editorNav" aria-label={t('v2.customize')}>
        {['general', 'appearance', 'background', 'showcases', 'assets', 'privacy'].map(tab => <Button type="button" className={'Button CustomProfile-sectionButton' + (this.tab === tab ? ' is-active' : '')} onclick={() => { this.tab = tab; this.mobilePreview = false; }}>{t('v2.section_' + tab)}</Button>)}
      </nav>
      <div className="CustomProfile-editorSettings">
      {this.error && <div className="Alert Alert--error" role="alert">{this.error}</div>}
      {this.notice && <div className="Alert Alert--success" role="status">{this.notice}</div>}
      {this.state.frozen && <div className="Alert Alert--warning">{t('forum.frozen')}</div>}
      <h2>{t('v2.section_' + this.tab)}</h2>
      <fieldset disabled={this.disabled()} className="CustomProfile-editorFields">
        {this.tab === 'general' && this.generalEditor()}
        {this.tab === 'appearance' && this.appearanceEditor()}
        {this.tab === 'background' && this.backgroundEditor()}
        {this.tab === 'showcases' && <div>
        <Button type="button" className="Button CustomProfile-sortToggle" onclick={() => { this.reorderMode = !this.reorderMode; }}>{t(this.reorderMode ? 'v2.finish_sorting' : 'v2.sort_showcases')}</Button>
        {this.profile.modules.map((module, index) => this.moduleEditor(module, index))}
        <div className="CustomProfile-inlineActions">
          <label>{t('forum.add_module')}{choices(this.config.moduleTypes.filter(type => ['about', 'fields', 'gallery', 'posts', 'recent-posts', 'achievements'].includes(type) || (this.config.integrations?.likes && type === 'liked-posts') || (this.config.integrations?.acgn && ['acgn-watching', 'acgn-ratings'].includes(type))), this.newType, value => { this.newType = value; }, 'modules')}</label>
          <Button type="button" className="Button" disabled={this.profile.modules.length >= (this.config.limits?.modules || 12)} onclick={() => this.addModule()}>{t('forum.add')}</Button>
        </div>
        </div>}
        {this.tab === 'assets' && this.assetEditor()}
        {this.tab === 'privacy' && this.privacyEditor()}
      </fieldset>
      <div className="CustomProfile-saveActions">
        <span className="helpText">{this.dirty ? t('forum.unsaved') : t('forum.saved')}</span>
        <Button type="button" className="Button" loading={this.busy} disabled={this.disabled()} onclick={() => this.save()}>{t('forum.save_draft')}</Button>
        <Button type="button" className="Button Button--primary" disabled={this.disabled()} onclick={() => this.publish()}>{t('forum.publish')}</Button>
        <Button type="button" className="Button" disabled={this.disabled() || !this.state.previous} onclick={() => this.rollback()}>{t('forum.rollback')}</Button>
      </div>
      {this.attrs.canManage && this.moderationEditor()}
      </div>
      <div className="CustomProfile-livePreview">
        <div className="CustomProfile-previewToolbar"><span>{this.preview ? t('forum.preview_as') + ' · ' + extractText(t('audience.' + this.audience)) : t('v2.live_self_preview')}</span>
          <label>{choices(['self', 'guest', 'members'], this.audience, value => { this.audience = value; this.showPreview(); }, 'audience')}</label>
          <Button type="button" className="Button" disabled={this.busy} onclick={() => this.showPreview()}>{t('v2.refresh_preview')}</Button>
          <Button type="button" className="Button CustomProfile-mobileEdit" onclick={() => { this.mobilePreview = false; }}>{t('v2.return_edit')}</Button>
        </div>
        <ProfileView profile={this.preview ? this.preview.profile : this.selfPreview()} user={this.attrs.user} fields={this.config.fields} previewMode />
      </div>
      <Button type="button" className="Button CustomProfile-mobilePreview" onclick={() => { this.mobilePreview = !this.mobilePreview; }}>{this.mobilePreview ? t('v2.return_edit') : t('v2.view_preview')}</Button>
    </div>;
  }

  selfPreview() {
    const profile = clone(this.profile), assets = new Map(this.assets.map(asset => [asset.id, asset]));
    if (profile.background.assetId) profile.background.url = assets.get(profile.background.assetId)?.url;
    profile.modules = profile.modules.map(module => {
      if (module.type === 'gallery') module.data.images = module.data.images.map(image => ({ ...image, url: assets.get(image.assetId)?.url }));
      if (['acgn-watching', 'acgn-ratings'].includes(module.type)) module.data = previewData(this.acgnPreview[module.type.slice(5)], module.type.slice(5), module.data, app.forum.attribute('baseUrl'));
      if (isPostShowcase(module.type)) {
        const descriptor = postPreviewRequest(module), feed = descriptor && this.postPreviews.get(descriptor.key);
        module.data = { ...module.data, available: feed?.available ?? true, items: (feed?.items || []).slice(0, descriptor?.limit || 6) };
      }
      if (module.type === 'achievements') {
        const ids = achievementIds(module.data.achievementIds) || [], data = this.achievementPreviews.get(ids.join(','));
        module.data = data || { ...unavailableAchievements(ids), loading: !!this.config.integrations?.achievements && !this.state.frozen };
      }
      return module;
    });
    return profile;
  }

  range(label, value, min, max, onChange, unit = '') {
    return this.field(label + ' · ' + value + unit, <input className="FormControl" type="range" min={min} max={max} value={value} oninput={event => { onChange(Number(event.target.value)); this.touch(); }} />);
  }

  generalEditor() {
    return <div>
      {this.field(t('v2.tagline'), <textarea className="FormControl" rows="3" maxlength="160" value={this.profile.identity.tagline} oninput={event => { this.profile.identity.tagline = event.target.value; this.touch(); }} />)}
      {this.field(t('v2.identity_alignment'), choices(['left', 'center'], this.profile.identity.alignment, value => { this.profile.identity.alignment = value; this.touch(); }, 'v2.options'))}
      {this.field(t('v2.avatar_shape'), choices(['square', 'rounded', 'circle'], this.profile.identity.avatarShape, value => { this.profile.identity.avatarShape = value; this.touch(); }, 'v2.options'))}
      {this.field(t('forum.frame'), choices(this.config.frames, this.profile.frame, value => { this.profile.frame = value; this.touch(); }, 'frames'))}
      <label className="CustomProfile-check"><input type="checkbox" checked={this.profile.appearance.showStats} onchange={event => { this.profile.appearance.showStats = event.target.checked; this.touch(); }} /> {t('v2.show_stats')}</label>
    </div>;
  }

  appearanceEditor() {
    const appearance = this.profile.appearance, palette = paletteFor(this.profile);
    return <div>
      {this.field(t('forum.theme'), choices(this.config.themes, this.profile.theme, value => { this.profile.theme = value; appearance.colors = appearanceDefaults().colors; this.touch(); }, 'themes'))}
      <div className="CustomProfile-colorGrid">{COLOR_KEYS.map(key => this.field(t('v2.color_' + key), <input type="color" className="FormControl" value={palette[key]} oninput={event => { appearance.colors[key] = event.target.value; this.touch(); }} />))}</div>
      <Button className="Button" type="button" onclick={() => { appearance.colors = appearanceDefaults().colors; this.touch(); }}>{t('v2.reset_colors')}</Button>
      <p className="helpText">{t('v2.contrast_help')}</p>
      {this.field(t('v2.page_width'), choices(['compact', 'standard', 'wide'], appearance.width, value => { appearance.width = value; this.touch(); }, 'v2.options'))}
      {this.field(t('v2.sidebar'), choices(['right', 'left', 'none'], appearance.sidebar, value => { appearance.sidebar = value; this.touch(); }, 'v2.options'))}
      {this.field(t('v2.title_style'), choices(['bar', 'line', 'plain'], appearance.titleStyle, value => { appearance.titleStyle = value; this.touch(); }, 'v2.options'))}
      {this.range(t('v2.panel_opacity'), appearance.panelOpacity, 80, 100, value => { appearance.panelOpacity = value; }, '%')}
      {this.range(t('v2.spacing'), appearance.spacing, 8, 32, value => { appearance.spacing = value; }, 'px')}
      {this.range(t('v2.radius'), appearance.radius, 0, 24, value => { appearance.radius = value; }, 'px')}
    </div>;
  }

  backgroundEditor() {
    const background = this.profile.background;
    return <div>
      {this.field(t('forum.background'), this.assetSelect(background.assetId, value => { background.assetId = value; }))}
      {this.field(t('v2.background_fit'), choices(['cover', 'contain', 'tile'], background.fit, value => { background.fit = value; this.touch(); }, 'v2.options'))}
      {this.field(t('v2.background_attachment'), choices(['scroll', 'fixed'], background.attachment, value => { background.attachment = value; this.touch(); }, 'v2.options'))}
      {this.range(t('forum.background_position'), background.position, 0, 100, value => { background.position = value; }, '%')}
      {this.range(t('v2.background_y'), background.positionY, 0, 100, value => { background.positionY = value; }, '%')}
      {this.range(t('v2.background_overlay'), background.overlay, 0, 80, value => { background.overlay = value; }, '%')}
      <Button type="button" className="Button" onclick={() => { this.tab = 'assets'; }}>{t('forum.upload')}</Button>
    </div>;
  }

  privacyEditor() {
    return <div>
      {this.field(t('v2.profile_visibility'), choices(['public', 'members', 'self'], this.profile.visibility, value => { this.profile.visibility = value; this.touch(); }))}
      {this.field(t('v2.tagline_visibility'), choices(['public', 'members', 'self'], this.profile.identity.visibility, value => { this.profile.identity.visibility = value; this.touch(); }))}
      {this.field(t('forum.background_visibility'), choices(['public', 'members', 'self'], this.profile.background.visibility, value => { this.profile.background.visibility = value; this.touch(); }))}
      {this.profile.modules.map(module => this.field(module.title, choices(['public', 'members', 'self'], module.visibility, value => { module.visibility = value; this.touch(); })))}
      <p className="helpText">{t('v2.privacy_help')}</p>
    </div>;
  }
  moduleEditor(module, index) {
    const layout = module.layout || (module.layout = layoutDefaults());
    return <section className="CustomProfile-moduleEditor" data-editor-module-id={module.id} key={module.id} ondragover={event => event.preventDefault()} ondrop={event => {
      if (this.disabled()) return;
      event.preventDefault(); const source = this.profile.modules.findIndex(item => item.id === this.draggedModule); this.draggedModule = null;
      if (source < 0 || source === index) return;
      const moved = this.profile.modules.splice(source, 1)[0]; this.profile.modules.splice(index, 0, moved); this.touch();
    }}>
      <div className="CustomProfile-inlineActions"><strong>{t('modules.' + module.type)}</strong><span className="helpText">{module.id}</span>
        <button type="button" className="Button CustomProfile-dragHandle" draggable={!this.disabled()} aria-label={t('v2.drag_showcase')} ondragstart={event => { this.draggedModule = module.id; event.dataTransfer.setData('text/plain', module.id); }} ondragend={() => { this.draggedModule = null; }}><i className="fas fa-grip-lines" aria-hidden="true" /></button>
        <Button type="button" className="Button Button--icon" icon="fas fa-arrow-up" aria-label={t('forum.move_up')} disabled={!index} onclick={() => { this.profile.modules = moveModule(this.profile.modules, index, -1); this.touch(); }} />
        <Button type="button" className="Button Button--icon" icon="fas fa-arrow-down" aria-label={t('forum.move_down')} disabled={index === this.profile.modules.length - 1} onclick={() => { this.profile.modules = moveModule(this.profile.modules, index, 1); this.touch(); }} />
        <Button type="button" className="Button" onclick={() => { this.profile.modules.splice(index, 1); this.touch(); }}>{t('forum.remove')}</Button>
      </div>
      {this.reorderMode ? <p>{module.title}</p> : <div>
      <div className="CustomProfile-formGrid">
        {this.field(t('forum.module_title'), <input className="FormControl" maxlength="60" value={module.title} oninput={event => { module.title = event.target.value; this.touch(); }} />)}
        {this.field(t('forum.visibility'), choices(['public', 'members', 'self'], module.visibility, value => { module.visibility = value; this.touch(); }))}
        {this.field(t('v2.region'), choices(['main', 'sidebar'], layout.region, value => { layout.region = value; this.touch(); }, 'v2.options'))}
        {this.field(t('v2.module_width'), choices(['full', 'half'], layout.width, value => { layout.width = value; this.touch(); }, 'v2.options'))}
        {this.field(t('v2.module_header'), choices(['inherit', 'bar', 'line', 'plain', 'hidden'], layout.header, value => { layout.header = value; this.touch(); }, 'v2.options'))}
        {this.field(t('v2.alignment'), choices(['left', 'center'], layout.align, value => { layout.align = value; this.touch(); }, 'v2.options'))}
      </div>
      {module.type === 'about' && this.aboutEditor(module)}
      {module.type === 'fields' && this.fieldsEditor(module)}
      {module.type === 'gallery' && this.galleryEditor(module)}
      {module.type === 'achievements' && this.achievementsEditor(module)}
      {module.type === 'posts' && this.field(t('forum.post_ids'), <input className="FormControl" value={this.postInputs[module.id] ?? module.data.postIds.join(', ')} oninput={event => { this.postInputs[module.id] = event.target.value; module.data.postIds = event.target.value.split(/[,，\s]+/).filter(Boolean).map(Number); this.touch(); this.schedulePostPreview(module); }} />, t('forum.post_ids_help'))}
      {['recent-posts', 'liked-posts'].includes(module.type) && <div>
        {this.field(t('post_feed.limit'), <select className="FormControl" value={module.data.limit} onchange={event => { module.data.limit = Number(event.target.value); this.touch(); }}>{[1, 2, 3, 4, 5, 6].map(value => <option value={value}>{value}</option>)}</select>)}
        {this.field(t('post_feed.scope'), choices(['all', 'discussions', 'replies'], module.data.scope, value => { module.data.scope = value; this.touch(); this.loadPostPreview(module); }, 'post_feed.scopes'))}
        <p className="helpText">{t('post_feed.' + (module.type === 'recent-posts' ? 'recent_help' : 'liked_help'))}</p>
      </div>}
      {['acgn-watching', 'acgn-ratings'].includes(module.type) && <div>
        {this.field(t('acgn.limit'), <select className="FormControl" value={module.data.limit} onchange={event => { module.data.limit = Number(event.target.value); this.touch(); }}>{[1, 2, 3, 4, 5, 6].map(value => <option value={value}>{value}</option>)}</select>)}
        <label className="CustomProfile-check"><input type="checkbox" checked={module.data.withProgress} onchange={event => { module.data.withProgress = event.target.checked; this.touch(); }} /> {t('acgn.with_progress')}</label>
        <p className="helpText">{t('acgn.editor_help')}</p>
        {!this.config.integrations?.acgn && <p className="Alert Alert--warning">{t('acgn.unavailable')}</p>}
        {this.config.integrations?.acgn && String(app.session.user?.id()) === String(this.userId) && <Button type="button" className="Button" onclick={() => this.manageAcgnSharing()}>{t('acgn.manage_sharing')}</Button>}
      </div>}
      {isPostShowcase(module.type) && <Button type="button" className="Button" onclick={() => this.loadPostPreview(module, true)}>{t('post_feed.refresh')}</Button>}
      </div>}
    </section>;
  }
  achievementsEditor(module) {
    const ids = module.data.achievementIds, source = this.achievementPreviews.get(ids.join(','));
    const names = new Map((source?.items || []).map(item => [item.id, item.name]));
    const move = (index, direction) => { const reordered = ids.slice(); [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]]; this.setAchievementIds(module, reordered); };
    return <div className="CustomProfile-achievementEditor">
      <p className="helpText">{t('achievements.editor_help')}</p>
      <div className="CustomProfile-inlineActions">
        <Button type="button" className="Button" disabled={!this.config.integrations?.achievements || this.state.frozen} onclick={() => this.chooseAchievements(module)}>{t('achievements.choose')}</Button>
        <Button type="button" className="Button" onclick={() => this.loadAchievementPreview(module, true)}>{t('achievements.refresh')}</Button>
        <span>{t('achievements.selected_count', { count: ids.length })}</span>
      </div>
      {!this.config.integrations?.achievements && <p className="Alert Alert--warning">{t('achievements.unavailable')}</p>}
      <ol className="CustomProfile-achievementSelected">{ids.map((id, index) => <li key={id}>
        <span>{names.get(id) || t('achievements.unavailable_selection')}</span>
        <Button type="button" className="Button Button--icon" icon="fas fa-arrow-up" aria-label={t('achievements.move_up')} disabled={index === 0} onclick={() => move(index, -1)} />
        <Button type="button" className="Button Button--icon" icon="fas fa-arrow-down" aria-label={t('achievements.move_down')} disabled={index === ids.length - 1} onclick={() => move(index, 1)} />
        <Button type="button" className="Button Button--icon" icon="fas fa-times" aria-label={t('forum.remove')} onclick={() => this.setAchievementIds(module, ids.filter(item => item !== id))} />
      </li>)}</ol>
    </div>;
  }
  aboutEditor(module) {
    return <div>
      {this.field(t('v2.text_format'), choices(['plain', 'bbcode'], module.data.format || 'plain', value => { module.data.format = value; this.touch(); }, 'v2.options'))}
      {module.data.format === 'bbcode' && <div className="CustomProfile-formatToolbar">{['b', 'i', 'u', 'h1', 'quote', 'list', 'code', 'spoiler'].map(tag => <Button type="button" className="Button" onclick={() => this.insertFormat(module, tag)}>{tag}</Button>)}</div>}
      {this.field(t('forum.bio'), <textarea className="FormControl" maxlength={this.config.limits?.bio || 4000} rows="7" value={module.data.text} oncreate={vnode => { this.bioEditors[module.id] = vnode.dom; }} oninput={event => { module.data.text = event.target.value; this.touch(); }} />)}
      {module.data.format === 'bbcode' && <p className="helpText">{t('v2.format_help')}</p>}
      {this.field(t('forum.tags'), <input className="FormControl" value={this.tagInputs[module.id] ?? module.data.tags.join(', ')} oninput={event => { this.tagInputs[module.id] = event.target.value; module.data.tags = event.target.value.split(/[,，]/).map(item => item.trim()).filter(Boolean); this.touch(); }} />)}
      {(module.data.links || []).map((link, index) => <div className="CustomProfile-inlineActions">
        <label>{t('forum.link_label')}<input className="FormControl" maxlength="60" value={link.label} oninput={event => { link.label = event.target.value; this.touch(); }} /></label>
        <label>{t('forum.link_url')}<input className="FormControl" type="url" placeholder="https://" value={link.url} oninput={event => { link.url = event.target.value; this.touch(); }} /></label>
        <Button type="button" className="Button" onclick={() => { module.data.links.splice(index, 1); this.touch(); }}>{t('forum.remove')}</Button>
      </div>)}
      <Button type="button" className="Button" disabled={module.data.links.length >= 5} onclick={() => { module.data.links.push({ label: '', url: '' }); this.touch(); }}>{t('forum.add_link')}</Button>
    </div>;
  }
  fieldsEditor(module) {
    return <div>{this.config.fields.length ? this.config.fields.map(definition => {
      let item = module.data.values.find(value => value.key === definition.key);
      const update = (value) => {
        if (!item) { item = { key: definition.key, value: '', visibility: 'self' }; module.data.values.push(item); }
        item.value = value; this.touch();
      };
      const input = definition.type === 'select' ? <select className="FormControl" value={item?.value || ''} onchange={event => update(event.target.value)}><option value="">{t('forum.not_filled')}</option>{definition.options.map(option => <option value={option}>{option}</option>)}</select>
        : <input className="FormControl" type={definition.type === 'url' ? 'url' : 'text'} maxlength={definition.maxLength} value={item?.value || ''} oninput={event => update(event.target.value)} />;
      const visibilities = ['public', 'members', 'self'].slice(['public', 'members', 'self'].indexOf(definition.maxVisibility || 'public'));
      return <div className="CustomProfile-fieldRow">
        {this.field(definition.label, input)}
        {this.field(t('forum.visibility'), choices(visibilities, item?.visibility || 'self', value => { if (!item) update(''); item.visibility = value; this.touch(); }))}
        {item && <Button type="button" className="Button" onclick={() => { module.data.values = module.data.values.filter(value => value.key !== definition.key); this.touch(); }}>{t('forum.clear')}</Button>}
      </div>;
    }) : <p className="helpText">{t('forum.no_fields')}</p>}
      {module.data.values.filter(value => !this.config.fields.some(definition => definition.key === value.key)).map(value => <div className="CustomProfile-moduleEditor">
        <p>{t('forum.removed_field', { key: value.key })}</p><p className="CustomProfile-bio">{value.value}</p>
        <Button type="button" className="Button" onclick={() => { module.data.values = module.data.values.filter(item => item !== value); this.touch(); }}>{t('forum.clear')}</Button>
      </div>)}
    </div>;
  }
  galleryEditor(module) {
    const layout = module.layout;
    return <div>
      <div className="CustomProfile-formGrid">
        {this.field(t('v2.gallery_layout'), choices(['grid', 'featured', 'artwork', 'strip'], layout.gallery, value => { layout.gallery = value; if (value === 'artwork') { layout.ratio = 'auto'; layout.imageFit = 'contain'; } this.touch(); }, 'v2.options'))}
        {this.field(t('v2.image_ratio'), choices(['auto', 'square', 'landscape', 'portrait'], layout.ratio, value => { layout.ratio = value; this.touch(); }, 'v2.options'))}
        {this.field(t('v2.image_fit'), choices(['cover', 'contain'], layout.imageFit, value => { layout.imageFit = value; this.touch(); }, 'v2.options'))}
        {this.range(t('v2.columns'), layout.columns, 1, 4, value => { layout.columns = value; })}
      </div>
      {module.data.images.map((image, index) => <div className="CustomProfile-inlineActions">
        <label>{t('forum.image')}{this.assetSelect(image.assetId, value => { image.assetId = value; }, false)}</label>
        <label>{t('forum.caption')}<input className="FormControl" maxlength="120" value={image.caption} oninput={event => { image.caption = event.target.value; this.touch(); }} /></label>
        <Button type="button" className="Button" onclick={() => { module.data.images.splice(index, 1); this.touch(); }}>{t('forum.remove')}</Button>
        <Button type="button" className="Button" disabled={!index} onclick={() => { module.data.images = moveModule(module.data.images, index, -1); this.touch(); }}>{t('forum.move_up')}</Button>
      </div>)}
      <Button type="button" className="Button" disabled={module.data.images.length >= (this.config.limits?.images || 8) || !this.assets.some(asset => asset.status === 'active')} onclick={() => { module.data.images.push({ assetId: this.assets.find(asset => asset.status === 'active').id, caption: '' }); this.touch(); }}>{t('forum.add_image')}</Button>
    </div>;
  }
  assetEditor() {
    if (String(app.session.user?.id()) !== String(this.userId)) return <p className="helpText">{t('forum.owner_assets')}</p>;
    return <div>
      <label className="Form-group">{t('forum.upload')}<input type="file" className="FormControl" accept="image/jpeg,image/png,image/webp" disabled={this.disabled()} onchange={event => { const file = event.target.files[0]; event.target.value = ''; this.upload(file); }} /></label>
      <p className="helpText">{t('forum.upload_help')}</p>
      <div className="CustomProfile-assetGrid">{this.assets.map(asset => {
        const url = safeMediaUrl(asset.url, app.forum.attribute('apiUrl'));
        return <div className="CustomProfile-asset" key={asset.id}>
          {url && asset.status === 'active' ? <img src={url} alt={asset.id.slice(0, 8)} loading="lazy" /> : <span>{t('forum.asset_blocked')}</span>}
          <div>{asset.id.slice(0, 8)} · {asset.width}×{asset.height}</div>
          <div className="helpText">{Math.ceil(asset.bytes / 1024)} KiB</div>
          {asset.status === 'active' && <Button type="button" className="Button" onclick={() => { this.profile.background.assetId = asset.id; this.tab = 'background'; this.touch(); }}>{t('v2.use_background')}</Button>}
          <Button type="button" className="Button" disabled={this.disabled()} onclick={() => this.removeAsset(asset)}>{t('forum.delete_asset')}</Button>
        </div>;
      })}</div>
      <div className="CustomProfile-inlineActions"><Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.loadAssets())}>{t('forum.first_page')}</Button>
        {this.nextCursor && <Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.loadAssets(this.nextCursor))}>{t('forum.next_page')}</Button>}
      </div>
    </div>;
  }
  moderationEditor() {
    return <fieldset className="CustomProfile-moderation" disabled={this.busy}>
      <legend>{t('forum.manage')}</legend>
      <div className="CustomProfile-formGrid">
        {this.field(t('admin.action'), choices(['freeze', 'unfreeze', 'reset', 'hide-module', 'show-module', 'block-asset', 'unblock-asset'], this.moderationAction, value => { this.moderationAction = value; }, 'actions'))}
        {this.field(t('admin.target'), <input className="FormControl" value={this.moderationTarget} oninput={event => { this.moderationTarget = event.target.value; }} />)}
      </div>
      {this.field(t('forum.reason'), <textarea className="FormControl" maxlength="500" value={this.moderationReason} oninput={event => { this.moderationReason = event.target.value; }} />)}
      <Button type="button" className="Button" disabled={!this.moderationReason.trim()} onclick={() => this.run(async () => {
        const body = { version: this.state.version, action: this.moderationAction, reason: this.moderationReason.trim() };
        if (this.moderationAction.includes('module')) body.moduleId = this.moderationTarget.trim();
        if (this.moderationAction.includes('asset')) body.assetId = this.moderationTarget.trim();
        this.state = await request('POST', this.path('/moderate'), body); this.profile = clone(this.state.draft || defaultProfile()); this.dirty = false; this.preview = null;
        this.notice = t('admin.action_saved'); if (this.attrs.onPublished) this.attrs.onPublished();
      })}>{t('admin.apply_action')}</Button>
    </fieldset>;
  }

  insertFormat(module, tag) {
    const editor = this.bioEditors[module.id];
    if (!editor) return;
    const start = editor.selectionStart, end = editor.selectionEnd, selected = module.data.text.slice(start, end);
    const text = '[' + tag + ']' + (tag === 'list' ? '\n[*]' : '') + selected + (tag === 'list' ? '\n' : '') + '[/' + tag + ']';
    const result = module.data.text.slice(0, start) + text + module.data.text.slice(end);
    if (result.length > (this.config.limits?.bio || 4000)) return;
    module.data.text = result; this.touch();
    requestAnimationFrame(() => { if (editor.isConnected) { editor.focus(); editor.setSelectionRange(start + tag.length + 2, start + text.length - tag.length - 3); } });
  }
}
