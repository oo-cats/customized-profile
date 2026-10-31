import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import extractText from 'flarum/common/utils/extractText';
import { t, errorText } from './api';

export const acgnRequest = (method, path, body) => app.request({ method, url: app.forum.attribute('apiUrl') + '/acgn' + path, ...(body === undefined ? {} : { body }) });
const scope = (label, value, change) => <label className="Form-group">{t(label)}<select className="FormControl" aria-label={extractText(t(label))} value={value} onchange={event => change(event.target.value)}>{['self', 'members', 'public'].map(item => <option value={item}>{t('visibility.' + item)}</option>)}</select></label>;

/** Only manages the signed-in owner's ACGN authorization; never part of profile draft data. */
export default class AcgnSharingModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode); this.busy = false; this.error = null; this.notice = null; this.settings = null; this.record = null; this.subjectId = '';
    this.items = [...new Map((this.attrs.items || []).map(item => [item.subjectId, item])).values()];
    this.run(async () => { this.settings = await acgnRequest('GET', '/showcases/settings'); });
  }
  className() { return 'CustomProfileAcgnSharingModal'; }
  title() { return t('acgn.manage_sharing'); }
  async run(action) {
    if (this.busy) return;
    this.busy = true; this.error = null; this.notice = null;
    try { await action(); } catch (error) { this.error = errorText(error); }
    finally { this.busy = false; m.redraw(); }
  }
  async readRecord() {
    const id = Number(this.subjectId);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) { this.error = t('acgn.invalid_subject'); return; }
    const subject = await acgnRequest('GET', '/subjects/' + id);
    const record = subject.my_record;
    if (!record) { this.record = null; this.error = t('acgn.no_record'); return; }
    this.record = { id, title: subject.title, type: subject.type, archived: !!subject.archived, status: record.status, score: record.score,
      revision: record.revision, visibility: record.share_visibility, share_score: record.share_score, share_progress: record.share_progress };
  }
  changed() { this.notice = t('acgn.saved'); this.attrs.onChanged?.(); }
  content() {
    return <div className="Modal-body">
      <p className="helpText">{t('acgn.sharing_help')}</p>
      {this.error && <div className="Alert Alert--error" role="alert">{this.error}</div>}
      {this.notice && <p className="Alert Alert--success" role="status">{this.notice}</p>}
      {!this.settings ? this.busy && <LoadingIndicator /> : <fieldset disabled={this.busy}>
        {scope('acgn.watching_scope', this.settings.watching_visibility, value => { this.settings.watching_visibility = value; })}
        {scope('acgn.ratings_scope', this.settings.ratings_visibility, value => { this.settings.ratings_visibility = value; })}
        <Button type="button" className="Button" onclick={() => this.run(async () => { this.settings = await acgnRequest('PUT', '/showcases/settings', this.settings); this.changed(); })}>{t('acgn.save_scopes')}</Button>
      </fieldset>}
      <hr />
      <h3>{t('acgn.record_sharing')}</h3>
      <p className="helpText">{t('acgn.record_help')}</p>
      {this.items.length > 0 && <label className="Form-group">{t('acgn.recent_subject')}<select className="FormControl" aria-label={extractText(t('acgn.recent_subject'))} disabled={this.busy} value={this.subjectId} onchange={event => { this.subjectId = event.target.value; this.record = null; }}><option value="">{t('acgn.choose_subject')}</option>{this.items.map(item => <option value={item.subjectId}>{item.title}</option>)}</select></label>}
      <label className="Form-group">{t('acgn.subject_id')}<input className="FormControl" type="number" min="1" max="2147483647" disabled={this.busy} value={this.subjectId} oninput={event => { this.subjectId = event.target.value; this.record = null; }} /></label>
      <Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.readRecord())}>{t('acgn.read_record')}</Button>
      {this.record && <fieldset disabled={this.busy} className="CustomProfile-acgnRecordControls">
        <h4>{this.record.title}</h4>
        {scope('acgn.record_scope', this.record.visibility, value => { this.record.visibility = value; })}
        <label className="CustomProfile-check"><input type="checkbox" checked={this.record.share_score} onchange={event => { this.record.share_score = event.target.checked; }} /> {t('acgn.share_score')}</label>
        <label className="CustomProfile-check"><input type="checkbox" checked={this.record.share_progress} onchange={event => { this.record.share_progress = event.target.checked; }} /> {t('acgn.share_progress')}</label>
        <Button type="button" className="Button Button--primary" onclick={() => this.run(async () => {
          const record = this.record;
          const result = await acgnRequest('PATCH', '/subjects/' + record.id + '/record/sharing', { revision: record.revision, visibility: record.visibility, share_score: record.share_score, share_progress: record.share_progress });
          Object.assign(record, result); this.changed();
        })}>{t('acgn.save_record')}</Button>
        <p className="helpText">{t('acgn.activity_help')}</p>
        {['watching', 'ratings'].map(kind => <Button type="button" className="Button" disabled={this.record.archived || (kind === 'watching' ? this.record.type !== 'anime' || !['current', 'completed'].includes(this.record.status) : !this.record.score)} onclick={() => this.run(async () => {
          const result = await acgnRequest('POST', '/subjects/' + this.record.id + '/record/activity', { revision: this.record.revision, kind });
          this.record.revision = result.revision; this.changed();
        })}>{t('acgn.record_' + kind)}</Button>)}
      </fieldset>}
    </div>;
  }
}
