import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import { clone } from '../common/safety.cjs';

const t = (key, values) => app.translator.trans('local-custom-profile.lib.' + key, values);
const api = (method, path, body) => app.request({ method, url: app.forum.attribute('apiUrl') + '/custom-profile' + path, ...(body === undefined ? {} : { body }) });
const select = (values, current, update, group) => <select className="FormControl" value={current} onchange={event => update(event.target.value)}>{values.map(value => <option value={value}>{t(group + '.' + value)}</option>)}</select>;

export default class ProfileAdminPage extends ExtensionPage {
  oninit(vnode) {
    super.oninit(vnode); this.config = null; this.fields = []; this.reports = []; this.nextCursor = null;
    this.busy = false; this.error = null; this.notice = null; this.userId = ''; this.editor = null; this.events = [];
    this.action = 'freeze'; this.target = ''; this.reason = '';
    this.run(async () => { this.config = await api('GET', '/config'); this.fields = clone(this.config.fields); await this.loadReports(); });
  }
  async run(operation) {
    if (this.busy) return;
    this.busy = true; this.error = null; this.notice = null;
    try { await operation(); }
    catch (error) { const detail = error?.response?.errors?.[0]?.detail; this.error = typeof detail === 'string' && detail.length < 800 ? detail : t('forum.request_error'); }
    finally { this.busy = false; m.redraw(); }
  }
  async loadReports(cursor) {
    const result = await api('GET', '/reports' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    this.reports = result.reports || []; this.nextCursor = result.nextCursor;
  }
  async loadUser(id = this.userId) {
    if (!/^[1-9][0-9]*$/.test(String(id))) { this.error = t('admin.user_id_required'); return; }
    this.userId = String(id);
    [this.editor, { events: this.events }] = await Promise.all([api('GET', '/users/' + id + '/editor'), api('GET', '/users/' + id + '/audit')]);
  }
  field(label, input) { return <label className="Form-group CustomProfile-field"><span>{label}</span>{input}</label>; }
  content() {
    if (!this.config) return <div className="container CustomProfile-admin">{this.error ? <div role="alert" className="Alert Alert--error">{this.error}</div> : <LoadingIndicator />}</div>;
    return <div className="container CustomProfile-admin">
      {this.error && <div className="Alert Alert--error" role="alert">{this.error}</div>}
      {this.notice && <div className="Alert Alert--success" role="status">{this.notice}</div>}
      <section><h2>{t('admin.field_definitions')}</h2><p className="helpText">{t('admin.fields_help')}</p>
        <fieldset disabled={this.busy}>
          {this.fields.map((field, index) => <section className="CustomProfile-moduleEditor" key={index}>
            <div className="CustomProfile-formGrid">
              {this.field(t('admin.field_key'), <input className="FormControl" maxlength="32" value={field.key} oninput={event => { field.key = event.target.value; }} />)}
              {this.field(t('admin.field_label'), <input className="FormControl" maxlength="60" value={field.label} oninput={event => { field.label = event.target.value; }} />)}
              {this.field(t('admin.field_type'), select(['text', 'url', 'select'], field.type, value => { field.type = value; }, 'field_types'))}
              {this.field(t('admin.max_length'), <input className="FormControl" type="number" min="1" max={field.type === 'url' ? 2048 : 500} value={field.maxLength} oninput={event => { field.maxLength = Number(event.target.value); }} />)}
              {this.field(t('admin.max_visibility'), select(['public', 'members', 'self'], field.maxVisibility, value => { field.maxVisibility = value; }, 'visibility'))}
              {field.type === 'select' && this.field(t('admin.options'), <textarea className="FormControl" value={field.options.join('\n')} onchange={event => { field.options = event.target.value.split('\n').map(value => value.trim()).filter(Boolean); }} />)}
            </div>
            <Button type="button" className="Button" onclick={() => this.fields.splice(index, 1)}>{t('forum.remove')}</Button>
          </section>)}
          <div className="CustomProfile-inlineActions">
            <Button type="button" className="Button" disabled={this.fields.length >= 12} onclick={() => this.fields.push({ key: '', label: '', type: 'text', maxLength: 200, options: [], maxVisibility: 'public' })}>{t('admin.add_field')}</Button>
            <Button type="button" className="Button Button--primary" onclick={() => this.run(async () => { this.config = await api('PATCH', '/config', { version: this.config.version, fields: this.fields }); this.fields = clone(this.config.fields); this.notice = t('admin.fields_saved'); })}>{t('admin.save_fields')}</Button>
          </div>
        </fieldset>
      </section>
      <section><h2>{t('admin.reports')}</h2>
        {this.reports.length ? <div className="CustomProfile-reportList">{this.reports.map(report => <article className="CustomProfile-moduleEditor" key={report.id}>
          <div className="CustomProfile-inlineActions"><strong>#{report.id}</strong><span>{t('admin.profile_user', { id: report.userId })}</span><span className="helpText">{t('admin.reporter', { id: report.reporterId })} · {report.createdAt}</span></div>
          <p className="CustomProfile-bio">{report.reason}</p>
          <div className="CustomProfile-inlineActions">
            <Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.loadUser(report.userId))}>{t('admin.inspect')}</Button>
            <Button type="button" className="Button" disabled={this.busy || report.resolved} onclick={() => this.run(async () => { await api('POST', '/reports/' + report.id + '/resolve'); await this.loadReports(); })}>{report.resolved ? t('admin.resolved') : t('admin.resolve')}</Button>
          </div>
        </article>)}</div> : <p className="helpText">{t('admin.no_reports')}</p>}
        <div className="CustomProfile-inlineActions"><Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.loadReports())}>{t('forum.first_page')}</Button>{this.nextCursor && <Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.loadReports(this.nextCursor))}>{t('forum.next_page')}</Button>}</div>
      </section>
      <section><h2>{t('admin.moderation')}</h2>
        <div className="CustomProfile-inlineActions"><label>{t('admin.user_id')}<input className="FormControl" inputmode="numeric" value={this.userId} oninput={event => { this.userId = event.target.value; this.editor = null; }} /></label><Button type="button" className="Button" disabled={this.busy} onclick={() => this.run(() => this.loadUser())}>{t('admin.inspect')}</Button></div>
        {this.editor && <fieldset disabled={this.busy}>
          <p>{t(this.editor.frozen ? 'forum.frozen' : 'admin.not_frozen')} · {t('admin.version', { version: this.editor.version })}</p>
          <a href={app.forum.attribute('baseUrl') + '/u/' + this.editor.userId + '/profile'} target="_blank" rel="noopener noreferrer">{t('admin.open_profile')}</a>
          <div className="CustomProfile-formGrid">
            {this.field(t('admin.action'), select(['freeze', 'unfreeze', 'reset', 'hide-module', 'show-module', 'block-asset', 'unblock-asset'], this.action, value => { this.action = value; }, 'actions'))}
            {this.field(t('admin.target'), <input className="FormControl" value={this.target} oninput={event => { this.target = event.target.value; }} />)}
          </div>
          <p className="helpText">{t('admin.target_help')}</p>
          <ul>{(this.editor.draft?.modules || []).map(module => <li><code>{module.id}</code> · {module.title || t('modules.' + module.type)}</li>)}</ul>
          {this.field(t('forum.reason'), <textarea className="FormControl" maxlength="500" value={this.reason} oninput={event => { this.reason = event.target.value; }} />)}
          <Button type="button" className="Button Button--primary" disabled={!this.reason.trim()} onclick={() => this.run(async () => {
            const body = { version: this.editor.version, action: this.action, reason: this.reason.trim() };
            if (this.action.includes('module')) body.moduleId = this.target.trim();
            if (this.action.includes('asset')) body.assetId = this.target.trim();
            this.editor = await api('POST', '/users/' + this.userId + '/moderate', body); await this.loadUser(); this.notice = t('admin.action_saved');
          })}>{t('admin.apply_action')}</Button>
          <h3>{t('admin.audit')}</h3>
          <ul className="CustomProfile-audit">{this.events.map(event => <li><span>{event.createdAt || event.created_at}</span> · {t('admin.actor', { id: event.actorId ?? event.actor_id ?? '—' })} · <strong>{event.action}</strong> · {event.reason || ''}</li>)}</ul>
        </fieldset>}
      </section>
    </div>;
  }
}
