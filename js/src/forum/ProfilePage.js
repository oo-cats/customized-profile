import app from 'flarum/forum/app';
import UserPage from 'flarum/forum/components/UserPage';

export default class ProfilePage extends UserPage {
  oninit(vnode) { super.oninit(vnode); this.loadUser(m.route.param('username')); }
  content() { return null; }
}
