<?php

declare(strict_types=1);

namespace Local\CustomProfile;

final class Schema
{
    public const THEMES = Appearance::THEMES;
    public const FRAMES = Appearance::FRAMES;
    public const MAX_MODULES = 12;
    public const MAX_IMAGES = 8;

    public function __construct(private ModuleRegistry $modules) {}

    public static function defaults(): array
    {
        return ['schemaVersion' => 2, 'visibility' => 'public', 'theme' => 'steam', 'frame' => 'none',
            'appearance' => Appearance::defaults(), 'identity' => Appearance::identity(),
            'background' => ['assetId' => null, 'position' => 50, 'positionY' => 0, 'visibility' => 'public',
                'fit' => 'cover', 'attachment' => 'scroll', 'overlay' => 35], 'modules' => []];
    }

    /** Read-only upgrade of previously validated storage. Deleted field definitions stay filterable. */
    public static function upgrade(array $profile): array
    {
        $defaults = self::defaults();
        $result = array_replace($defaults, $profile);
        $result['schemaVersion'] = 2;
        $result['appearance'] = array_replace(Appearance::defaults(), $profile['appearance'] ?? []);
        $result['appearance']['colors'] = array_replace(Appearance::defaults()['colors'], $result['appearance']['colors'] ?? []);
        $result['identity'] = array_replace(Appearance::identity(), $profile['identity'] ?? []);
        $result['background'] = array_replace($defaults['background'], $profile['background'] ?? []);
        $result['modules'] = array_map(static function (array $module): array {
            $module['layout'] = array_replace(Appearance::module(), $module['layout'] ?? []);
            if ($module['type'] === 'about') $module['data']['format'] ??= 'plain';
            return $module;
        }, $profile['modules'] ?? []);
        return $result;
    }

    public function normalize(array $profile, array $fields): array
    {
        if (strlen(json_encode($profile, JSON_THROW_ON_ERROR)) > 65536) Input::fail('profile', '配置最多 64 KiB。');
        $version = $profile['schemaVersion'] ?? null;
        if (!in_array($version, [1, 2], true)) Input::fail('schemaVersion', '不支持的配置版本。');
        $legacy = $version === 1;
        Input::keys($profile, $legacy ? ['schemaVersion', 'theme', 'frame', 'background', 'modules']
            : ['schemaVersion', 'visibility', 'theme', 'frame', 'background', 'modules', 'appearance', 'identity']);
        $background = Input::object(array_key_exists('background', $profile) ? $profile['background'] : [], 'background');
        Input::keys($background, $legacy ? ['assetId', 'position', 'visibility'] : array_keys(self::defaults()['background']));
        $result = ['schemaVersion' => 2, 'visibility' => Input::visibility($profile['visibility'] ?? 'public'),
            'theme' => Input::choice($profile['theme'] ?? 'default', 'theme', self::THEMES),
            'frame' => Input::choice($profile['frame'] ?? 'none', 'frame', self::FRAMES),
            'appearance' => Appearance::normalize(Input::object(array_key_exists('appearance', $profile) ? $profile['appearance'] : [], 'appearance')),
            'identity' => Appearance::normalizeIdentity(Input::object(array_key_exists('identity', $profile) ? $profile['identity'] : [], 'identity')),
            'background' => ['assetId' => isset($background['assetId']) ? Input::asset($background['assetId']) : null,
                'position' => Input::integer($background['position'] ?? 50, 'position', 0, 100),
                'positionY' => Input::integer($background['positionY'] ?? 0, 'positionY', 0, 100),
                'visibility' => Input::visibility($background['visibility'] ?? 'public'),
                'fit' => Input::choice($background['fit'] ?? 'cover', 'fit', ['cover', 'contain', 'tile']),
                'attachment' => Input::choice($background['attachment'] ?? 'scroll', 'attachment', ['scroll', 'fixed']),
                'overlay' => Input::integer($background['overlay'] ?? 35, 'overlay', 0, 80)], 'modules' => []];
        $ids = [];
        $imageOccurrences = 0;
        foreach (Input::list(array_key_exists('modules', $profile) ? $profile['modules'] : [], 'modules', self::MAX_MODULES) as $module) {
            $module = Input::object($module, 'modules');
            Input::keys($module, $legacy ? ['id', 'type', 'title', 'visibility', 'data'] : ['id', 'type', 'title', 'visibility', 'data', 'layout']);
            $id = Input::text($module['id'] ?? '', 'id', 32, true);
            if (!preg_match('/^[a-z][a-z0-9_-]{0,31}$/D', $id) || isset($ids[$id])) Input::fail('id', '展柜 ID 无效或重复。');
            $ids[$id] = true;
            $type = Input::text($module['type'] ?? '', 'type', 32, true);
            $result['modules'][] = ['id' => $id, 'type' => $type,
                'title' => Input::text($module['title'] ?? '', 'title', 60, true),
                'visibility' => Input::visibility($module['visibility'] ?? 'self'),
                'layout' => Appearance::normalizeModule(Input::object(array_key_exists('layout', $module) ? $module['layout'] : [], 'layout')),
                'data' => $this->modules->get($type)->normalize(Input::object(array_key_exists('data', $module) ? $module['data'] : [], 'data'), $fields)];
            if ($type === 'gallery') $imageOccurrences += count($result['modules'][array_key_last($result['modules'])]['data']['images']);
        }
        if ($imageOccurrences > 36) Input::fail('images', '整页最多展示 36 张图片。');
        return $result;
    }

    public function assetIds(array $profile): array
    {
        $ids = empty($profile['background']['assetId']) ? [] : [$profile['background']['assetId']];
        foreach ($profile['modules'] ?? [] as $module) {
            if ($this->modules->has($module['type'])) $ids = array_merge($ids, $this->modules->get($module['type'])->assetIds($module['data']));
        }
        return array_values(array_unique($ids));
    }
}
