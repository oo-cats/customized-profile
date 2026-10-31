<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;

final class Configuration
{
    public function __construct(private ConnectionInterface $db, private ModuleRegistry $modules) {}

    public static function defaults(): array
    {
        return [
            ['key' => 'occupation', 'label' => '职业', 'type' => 'text', 'maxLength' => 128, 'options' => [], 'maxVisibility' => 'public'],
            ['key' => 'website', 'label' => '个人网站', 'type' => 'url', 'maxLength' => 2048, 'options' => [], 'maxVisibility' => 'public'],
        ];
    }

    public function get(): array
    {
        $row = $this->db->table('cp_configuration')->where('id', 1)->first();
        return ['schemaVersion' => 2, 'version' => (int) $row->version,
            'fields' => json_decode($row->fields, true, 32, JSON_THROW_ON_ERROR), 'themes' => Schema::THEMES,
            'frames' => Schema::FRAMES, 'moduleTypes' => $this->modules->names(),
            'limits' => ['modules' => Schema::MAX_MODULES, 'images' => Schema::MAX_IMAGES, 'totalImages' => 36, 'bio' => 4000],
            'appearanceDefaults' => Appearance::defaults(), 'layoutDefaults' => Appearance::module()];
    }

    public function update(User $actor, array $body): array
    {
        $actor->assertAdmin();
        Input::keys($body, ['version', 'fields']);
        $version = Input::integer($body['version'] ?? null, 'version', 1);
        $fields = [];
        foreach (Input::list($body['fields'] ?? null, 'fields', 12) as $field) {
            $field = Input::object($field, 'fields');
            Input::keys($field, ['key', 'label', 'type', 'maxLength', 'options', 'maxVisibility']);
            $key = Input::text($field['key'] ?? '', 'key', 32, true);
            if (!preg_match('/^[a-z][a-z0-9_]{0,31}$/D', $key) || isset($fields[$key])) Input::fail('key', '字段标识无效或重复。');
            $type = Input::choice($field['type'] ?? '', 'type', ['text', 'url', 'select']);
            $options = array_values(array_unique(array_map(fn ($option) => Input::text($option, 'options', 128, true), Input::list($field['options'] ?? [], 'options', 20))));
            if ($type === 'select' && !$options) Input::fail('options', '选择字段需要至少一个选项。');
            $max = Input::integer($field['maxLength'] ?? ($type === 'url' ? 2048 : 128), 'maxLength', 1, $type === 'url' ? 2048 : 500);
            foreach ($options as $option) if (mb_strlen($option) > $max) Input::fail('options', '选项超过字段长度限制。');
            $fields[$key] = ['key' => $key, 'label' => Input::text($field['label'] ?? '', 'label', 60, true),
                'type' => $type, 'maxLength' => $max, 'options' => $type === 'select' ? $options : [],
                'maxVisibility' => Input::visibility($field['maxVisibility'] ?? 'self')];
        }
        $this->db->transaction(function () use ($actor, $version, $fields) {
            $row = $this->db->table('cp_configuration')->where('id', 1)->lockForUpdate()->first();
            if ((int) $row->version !== $version) Input::fail('version', '配置已更新，请刷新后重试。');
            $this->db->table('cp_configuration')->where('id', 1)->update(['version' => $version + 1, 'fields' => json_encode(array_values($fields), JSON_THROW_ON_ERROR)]);
            $this->db->table('cp_audit')->insert(['user_id' => null, 'actor_id' => $actor->id, 'action' => 'configuration', 'reason' => '', 'created_at' => gmdate('Y-m-d H:i:s')]);
        });
        return $this->get();
    }
}
