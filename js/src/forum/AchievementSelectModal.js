import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import { t } from './api';
import { achievementRequest } from './achievementApi';
import { achievementIds, parseAchievementOptions } from '../common/achievements.cjs';

/** Holds only one options page and at most twelve selected labels. No grants or settings writes. */
export default class AchievementSelectModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode); this.ids = achievementIds(this.attrs.selectedIds) || [];
    this.labels = new Map((this.attrs.items || []).filter(item => this.ids.includes(item.id)).map(item => [item.id, item]));
    this.rows = []; this.search = ''; this.nextCursor = null; this.sequence = 0; this.removed = false; this.load();
  }
  onremove(vnode) { this.removed = true; this.sequence++; super.onremove(vnode); }
  className() { return 'CustomProfileAchievementSelectModal'; }
  title() { return t('achievements.choose'); }
  onsubmit(event) { event.preventDefault(); this.load(); }
  async load(cursor = null) {
    const sequence = ++this.sequence, search = this.search.trim(); this.busy = true; this.error = false;
    try {
      const query = 'limit=20&search=' + encodeURIComponent(search) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      const response = parseAchievementOptions(await achievementRequest(this.attrs.userId, 'achievement-options?' + query), this.attrs.userId);
      if (sequence !== this.sequence || this.removed) return;
      if (!response) throw new Error('Invalid achievement response.');
      this.rows = response.items; this.nextCursor = response.nextCursor;
      for (const item of this.rows) if (this.ids.includes(item.id)) this.labels.set(item.id, item);
    } catch (_) {
      if (sequence === this.sequence && !this.removed) { this.error = true; this.rows = []; this.nextCursor = null; }
    } finally { if (sequence === this.sequence && !this.removed) { this.busy = false; m.redraw(); } }
  }
  toggle(item) {
    const index = this.ids.indexOf(item.id);
    if (index >= 0) { this.ids.splice(index, 1); this.labels.delete(item.id); }
    else if (this.ids.length < 12) { this.ids.push(item.id); this.labels.set(item.id, item); }
  }
  content() {
    return <div className="Modal-body">
      <p className="helpText">{t('achievements.choose_help')}</p>
      <div className="CustomProfile-inlineActions">
        <label className="Form-group">{t('achievements.search')}<input className="FormControl" type="search" maxlength="100" value={this.search} oninput={event => { this.search = event.target.value; }} /></label>
        <Button type="submit" className="Button" loading={this.busy}>{t('achievements.search_button')}</Button>
      </div>
      <p className="CustomProfile-achievementSelectionCount">{t('achievements.selected_count', { count: this.ids.length })}</p>
      {this.error && <p className="Alert Alert--warning">{t('achievements.unavailable')}</p>}
      {this.busy ? <LoadingIndicator /> : this.rows.length ? <ul className="CustomProfile-achievementOptions">{this.rows.map(item => <li key={item.id}>
        <label><input type="checkbox" checked={this.ids.includes(item.id)} disabled={!this.ids.includes(item.id) && this.ids.length >= 12} onchange={() => this.toggle(item)} />
          <span><strong>{item.name}</strong>{item.status === 'archived' && <small>{t('achievements.archived')}</small>}<span className="helpText">{item.description}</span></span></label>
      </li>)}</ul> : !this.error && <p>{t('achievements.no_options')}</p>}
      <div className="CustomProfile-inlineActions">
        <Button type="button" className="Button" disabled={this.busy} onclick={() => this.load()}>{t('forum.first_page')}</Button>
        {this.nextCursor && <Button type="button" className="Button" disabled={this.busy} onclick={() => this.load(this.nextCursor)}>{t('forum.next_page')}</Button>}
      </div>
      {this.ids.length > 0 && <ol className="CustomProfile-achievementSelected">{this.ids.map((id, index) => <li key={id}>
        <span>{this.labels.get(id)?.name || t('achievements.unavailable_selection')}</span>
        <Button type="button" className="Button Button--icon" icon="fas fa-times" aria-label={t('forum.remove')} onclick={() => { this.ids.splice(index, 1); this.labels.delete(id); }} />
      </li>)}</ol>}
      <Button type="button" className="Button Button--primary" onclick={() => { this.attrs.onSelect(this.ids.slice()); this.hide(); }}>{t('achievements.apply')}</Button>
    </div>;
  }
}
