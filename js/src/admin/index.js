import app from 'flarum/admin/app';
import ProfileAdminPage from './ProfileAdminPage';

app.initializers.add('local/custom-profile', () => {
  app.extensionData.for('local-custom-profile')
    .registerPage(ProfileAdminPage)
    .registerPermission({ icon: 'fas fa-id-card', label: app.translator.trans('local-custom-profile.lib.admin.manage_permission'), permission: 'custom-profile.manage' }, 'moderate');
});
