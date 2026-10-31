import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import UserPage from 'flarum/forum/components/UserPage';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import ProfilePage from './ProfilePage';
import ProfileView from './ProfileView';
import EditorPage from './EditorPage';
import ReportModal from './ReportModal';
import { t, request, errorText } from './api';

function loadProfile(page) {
  const sequence = page.cpSequence = (page.cpSequence || 0) + 1;
  page.cpLoading = true;
  const home = page instanceof ProfilePage;
  Promise.all([request('GET', '/users/' + page.user.id() + (home ? '' : '?view=shell')), home ? request('GET', '/config') : Promise.resolve(null)]).then(([data, config]) => {
    if (sequence !== page.cpSequence) return;
    page.cpData = data; page.cpConfig = config; page.cpError = null;
  }).catch(error => { if (sequence === page.cpSequence) page.cpError = errorText(error); }).finally(() => {
    if (sequence === page.cpSequence) { page.cpLoading = false; m.redraw(); }
  });
}

app.initializers.add('local/custom-profile', () => {
  app.routes.user = { ...app.routes.user, component: ProfilePage };
  app.routes['user.posts'] = { ...app.routes['user.posts'], path: '/u/:username/posts' };
  app.routes['user.custom-profile'] = { path: '/u/:username/profile', component: ProfilePage };
  app.routes['user.custom-profile.edit'] = { path: '/u/:username/customize', component: EditorPage };
  extend(UserPage.prototype, 'oninit', function () { this.bodyClass += ' App--custom-profile'; });
  extend(UserPage.prototype, 'show', function () { loadProfile(this); });
  extend(UserPage.prototype, 'onremove', function () { this.cpSequence = (this.cpSequence || 0) + 1; });
  extend(UserPage.prototype, 'navItems', function (items) {
    if (this.user) items.add('custom-profile', <LinkButton href={app.route('user', { username: this.user.slug() })} icon="fas fa-id-card">{t('forum.title')}</LinkButton>, 110);
  });
  override(UserPage.prototype, 'view', function () {
    if (!this.user) return <LoadingIndicator display="block" />;
    const data = this.cpData;
    const editUrl = app.route('user.custom-profile.edit', { username: this.user.slug() });
    const actions = [
      (data?.canEdit || data?.canManage) && <LinkButton className="Button CustomProfile-editButton" href={editUrl} icon="fas fa-paint-brush">{t('forum.edit')}</LinkButton>,
      data?.canReport === true && <Button className="Button" icon="fas fa-flag" onclick={() => app.modal.show(ReportModal, { userId: this.user.id() })}>{t('forum.report')}</Button>,
    ];
    return <ProfileView user={this.user} profile={data?.profile} fields={this.cpConfig?.fields || []} loading={this.cpLoading} error={this.cpError}
      navItems={this.navItems().toArray()} actions={actions} isHome={this instanceof ProfilePage} activity={this instanceof ProfilePage ? null : this.content()} />;
  });
}, -50);

export { registerModuleRenderer } from './ProfileView';
