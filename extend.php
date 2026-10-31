<?php

use Flarum\Extend;
use Local\CustomProfile\Api\{ProfileController, AssetController};
use Local\CustomProfile\ProfileServiceProvider;

$routes = new Extend\Routes('api');
foreach ([
    ['get', '/config', 'configuration.get'], ['patch', '/config', 'configuration.update'],
    ['get', '/users/{id}', 'users.show'], ['get', '/users/{id}/editor', 'users.editor'],
    ['put', '/users/{id}/draft', 'users.draft'], ['post', '/users/{id}/publish', 'users.publish'],
    ['post', '/users/{id}/rollback', 'users.rollback'], ['get', '/users/{id}/preview', 'users.preview'],
    ['post', '/users/{id}/moderate', 'users.moderate'], ['get', '/users/{id}/audit', 'users.audit'],
    ['post', '/users/{id}/report', 'users.report'], ['get', '/reports', 'reports.index'],
    ['post', '/reports/{id}/resolve', 'reports.resolve'],
] as [$method, $path, $name]) $routes->$method('/custom-profile'.$path, 'local-custom-profile.'.$name, ProfileController::class);
foreach ([['get', '', 'index'], ['post', '', 'upload'], ['delete', '/{id}', 'delete'], ['get', '/{id}/file', 'file']] as [$method, $path, $name]) {
    $routes->$method('/custom-profile/assets'.$path, 'local-custom-profile.assets.'.$name, AssetController::class);
}

return [
    $routes,
    (new Extend\ServiceProvider())->register(ProfileServiceProvider::class),
    (new Extend\Frontend('forum'))->js(__DIR__.'/js/dist/forum.js')->css(__DIR__.'/resources/forum.less'),
    (new Extend\Frontend('admin'))->js(__DIR__.'/js/dist/admin.js')->css(__DIR__.'/resources/admin.less'),
    new Extend\Locales(__DIR__.'/resources/locale'),
];
