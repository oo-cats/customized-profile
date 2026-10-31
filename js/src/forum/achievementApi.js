import app from 'flarum/forum/app';
export const achievementRequest = (userId, path) => app.request({ method: 'GET', url: app.forum.attribute('apiUrl') + '/community/users/' + encodeURIComponent(userId) + '/' + path });
