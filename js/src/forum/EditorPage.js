import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import LinkButton from 'flarum/common/components/LinkButton';
import extractText from 'flarum/common/utils/extractText';
import ProfileEditor from './ProfileEditor';
import { request, errorText, t } from './api';

export default class EditorPage extends Page {
  oninit(vnode) {
    super.oninit(vnode); this.bodyClass = 'App--custom-profile-editor'; this.loading = true; this.removed = false;
    const name = m.route.param('username');
    app.store.find('users', name, { bySlug: true }).then(async user => {
      const data = await request('GET', '/users/' + user.id() + '/editor');
      if (this.removed) return;
      this.user = user; this.editorState = data; this.canManage = data.canManage; app.setTitle(extractText(t('v2.customize')));
    }).catch(error => { if (!this.removed) this.error = errorText(error); }).finally(() => {
      if (!this.removed) { this.loading = false; m.redraw(); }
    });
  }
  onremove(vnode) { this.removed = true; super.onremove(vnode); }
  view() {
    return <div className="CustomProfile-editorPage">
      <div className="CustomProfile-editorHeading"><div><span>{t('v2.profile_studio')}</span><h1>{t('v2.customize')}</h1></div>
        {this.user && <LinkButton className="Button" href={app.route('user', { username: this.user.slug() })} icon="fas fa-arrow-left">{t('v2.back_profile')}</LinkButton>}
      </div>
      {this.loading ? <LoadingIndicator /> : this.error ? <div className="Alert Alert--error" role="alert">{this.error}</div> :
        <ProfileEditor user={this.user} canManage={this.canManage} initialState={this.editorState} />}
    </div>;
  }
}
