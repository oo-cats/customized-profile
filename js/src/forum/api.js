import app from 'flarum/forum/app';
export const t = (key, values) => app.translator.trans('local-custom-profile.lib.' + key, values);
export const endpoint = (path = '') => app.forum.attribute('apiUrl') + '/custom-profile' + path;
export const request = (method, path, body) => app.request({ method, url: endpoint(path), ...(body === undefined ? {} : { body }) });
export function errorText(error) {
  const detail = error?.response?.errors?.[0]?.detail;
  return typeof detail === 'string' && detail.length < 800 ? detail : t('forum.request_error');
}
