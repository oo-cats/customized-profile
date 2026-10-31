<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\User\User;
use Local\CustomProfile\{Input, Visibility};

final class FieldsModule implements ModuleType
{
    public function type(): string { return 'fields'; }

    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['values']);
        $definitions = array_column($fields, null, 'key');
        $result = [];
        foreach (Input::list($data['values'] ?? [], 'values', 12) as $value) {
            $value = Input::object($value, 'values');
            Input::keys($value, ['key', 'value', 'visibility']);
            $key = Input::text($value['key'] ?? '', 'key', 32, true);
            if (!isset($definitions[$key]) || isset($result[$key])) Input::fail('values', '资料字段未知或重复。');
            $field = $definitions[$key];
            $text = Input::text($value['value'] ?? '', 'value', $field['maxLength']);
            if ($text !== '' && $field['type'] === 'url') $text = Input::url($text);
            if ($text !== '' && $field['type'] === 'select' && !in_array($text, $field['options'], true)) Input::fail('value', '字段选项无效。');
            $result[$key] = ['key' => $key, 'value' => $text, 'visibility' => Input::visibility($value['visibility'] ?? 'self')];
        }
        return ['values' => array_values($result)];
    }

    public function present(array $data, User $viewer, int $ownerId, array $fields): array
    {
        $definitions = array_column($fields, null, 'key');
        $result = [];
        foreach ($data['values'] as $value) {
            $field = $definitions[$value['key']] ?? null;
            if (!$field || !Visibility::allows($field['maxVisibility'], $viewer, $ownerId)
                || !Visibility::allows($value['visibility'], $viewer, $ownerId)) continue;
            // Revalidate values against the current definition after an administrator changes its type.
            try { $clean = $this->normalize(['values' => [$value]], [$field])['values'][0]; }
            catch (\Flarum\Foundation\ValidationException) { continue; }
            $result[] = $clean + ['label' => $field['label'], 'type' => $field['type']];
        }
        return ['values' => $result];
    }

    public function assetIds(array $data): array { return []; }
}
