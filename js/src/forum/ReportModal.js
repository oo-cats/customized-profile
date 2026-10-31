import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import { request, t, errorText } from './api';

export default class ReportModal extends Modal {
  oninit(vnode) { super.oninit(vnode); this.reason = ''; this.busy = false; this.error = null; this.sent = false; }
  className() { return 'CustomProfileReportModal'; }
  title() { return t('forum.report'); }
  content() {
    return <div className="Modal-body">
      {this.error && <div className="Alert Alert--error" role="alert">{this.error}</div>}
      {this.sent ? <p role="status">{t('forum.report_sent')}</p> : [
        <label className="Form-group">{t('forum.reason')}<textarea className="FormControl" value={this.reason} maxlength="500" required oninput={event => { this.reason = event.target.value; }} /></label>,
        <Button type="submit" className="Button Button--primary" loading={this.busy} disabled={this.busy || !this.reason.trim()}>{t('forum.send_report')}</Button>,
      ]}
    </div>;
  }
  async onsubmit(event) {
    event.preventDefault();
    if (this.busy || this.sent || !this.reason.trim()) return;
    this.busy = true; this.error = null;
    try { await request('POST', '/users/' + this.attrs.userId + '/report', { reason: this.reason.trim() }); this.sent = true; }
    catch (error) { this.error = errorText(error); }
    finally { this.busy = false; m.redraw(); }
  }
}
