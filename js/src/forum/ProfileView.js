import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import UserCard from 'flarum/forum/components/UserCard';
import humanTime from 'flarum/common/utils/humanTime';
import listItems from 'flarum/common/helpers/listItems';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Showcases from './Showcases';
import { t } from './api';
import { safeMediaUrl, boundedPosition } from '../common/safety.cjs';
import { upgradeProfile, visualStyle } from '../common/appearance.cjs';

export { registerModuleRenderer } from './Showcases';

export default class ProfileView extends Component {
  oncreate(vnode) {
    super.oncreate(vnode);
    this.observer = new ResizeObserver(entries => {
      const narrow = entries[0].contentRect.width <= 720;
      if (this.narrow !== narrow) { this.narrow = narrow; m.redraw(); }
    });
    this.observer.observe(vnode.dom);
  }
  onremove(vnode) { this.observer?.disconnect(); super.onremove(vnode); }
  view() {
    const profile = upgradeProfile(this.attrs.profile || {}), user = this.attrs.user;
    const background = safeMediaUrl(profile.background.url, app.forum.attribute('apiUrl'));
    const hasSidebar = profile.appearance.sidebar !== 'none';
    const isHome = this.attrs.isHome !== false;
    return <div className={'CustomProfile-stage CustomProfile-page CustomProfile-sidebar-' + profile.appearance.sidebar + (this.narrow ? ' CustomProfile-narrow' : '') + (this.attrs.previewMode ? ' CustomProfile-preview' : '')} style={visualStyle(profile)}>
      <div className={'CustomProfile-wallpaper CustomProfile-wallpaper-' + profile.background.fit + ' CustomProfile-wallpaper-' + profile.background.attachment} aria-hidden="true" style={background ? {
        backgroundImage: 'url("' + background + '")', backgroundPosition: boundedPosition(profile.background.position) + '% ' + boundedPosition(profile.background.positionY) + '%',
      } : {}} />
      <div className="CustomProfile-shade" aria-hidden="true" style={{ opacity: boundedPosition(profile.background.overlay) / 100 }} />
      <div className="CustomProfile-canvas">
        <header className={'CustomProfile-masthead CustomProfile-identity-' + profile.identity.alignment + ' CustomProfile-avatar-' + profile.identity.avatarShape + ' CustomProfile-frame-' + profile.frame}>
          {user && <UserCard user={user} className="CustomProfile-identityCard" editable={!this.attrs.previewMode && (user === app.session.user || user.canEdit())} controlsButtonClassName="Button" />}
          {profile.identity.tagline && <p className="CustomProfile-tagline">{profile.identity.tagline}</p>}
          {!this.attrs.previewMode && <div className="CustomProfile-actions">{this.attrs.actions}</div>}
        </header>
        {!this.attrs.previewMode && this.attrs.navItems && <nav className="CustomProfile-navigation" aria-label={t('v2.profile_navigation')}><ul>{listItems(this.attrs.navItems)}</ul></nav>}
        {this.attrs.error && <div className="CustomProfile-systemError Alert Alert--error" role="alert">{this.attrs.error}</div>}
        <div className={'CustomProfile-body' + (!hasSidebar ? ' CustomProfile-body-single' : '')}>
          <div className="CustomProfile-main">
            {this.attrs.loading ? <LoadingIndicator display="block" /> : isHome ?
              this.attrs.profile ? <Showcases profile={profile} fields={this.attrs.fields} region="main" /> : <div className="CustomProfile-module CustomProfile-empty">{t('v2.empty_profile')}</div>
              : <div className="CustomProfile-activity">{this.attrs.activity}</div>}
          </div>
          {hasSidebar && <aside className="CustomProfile-aside">
            {profile.appearance.showStats && user && <section className="CustomProfile-summary CustomProfile-module">
              <h2 className="CustomProfile-moduleTitle">{t('v2.community_profile')}</h2>
              <dl><div><dt>{t('v2.discussions')}</dt><dd>{user.discussionCount()}</dd></div><div><dt>{t('v2.replies')}</dt><dd>{user.commentCount()}</dd></div></dl>
              {user.joinTime() && <p>{t('v2.joined')} {humanTime(user.joinTime())}</p>}
              <span className="CustomProfile-accountName">@{user.username()}</span>
            </section>}
            {isHome && !this.attrs.loading && this.attrs.profile && <Showcases profile={profile} fields={this.attrs.fields} region="sidebar" />}
          </aside>}
        </div>
      </div>
    </div>;
  }
}
