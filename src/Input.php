<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\Foundation\ValidationException;

final class Input
{
    public static function fail(string $key, string $message): never
    {
        throw new ValidationException([$key => $message]);
    }

    public static function keys(array $data, array $allowed, string $key = 'profile'): void
    {
        if (array_diff(array_keys($data), $allowed)) self::fail($key, '包含不支持的配置项。');
    }

    public static function text(mixed $value, string $key, int $max, bool $required = false): string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8') || mb_strlen($value) > $max
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) {
            self::fail($key, '文字格式错误或超过长度限制。');
        }
        $value = trim($value);
        if ($required && $value === '') self::fail($key, '此项不能为空。');
        return $value;
    }

    public static function integer(mixed $value, string $key, int $min, int $max = PHP_INT_MAX): int
    {
        if (!is_int($value) || $value < $min || $value > $max) self::fail($key, '整数超出允许范围。');
        return $value;
    }

    public static function list(mixed $value, string $key, int $max): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > $max) self::fail($key, '列表格式错误或项目过多。');
        return $value;
    }

    public static function object(mixed $value, string $key): array
    {
        if (!is_array($value) || ($value !== [] && array_is_list($value))) self::fail($key, '必须为配置对象。');
        return $value;
    }

    public static function choice(mixed $value, string $key, array $choices): string
    {
        if (!is_string($value) || !in_array($value, $choices, true)) self::fail($key, '不支持的选项。');
        return $value;
    }

    public static function visibility(mixed $value): string
    {
        return self::choice($value, 'visibility', ['public', 'members', 'self']);
    }

    public static function asset(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^[a-f0-9]{32}$/D', $value)) self::fail('assetId', '素材 ID 无效。');
        return $value;
    }

    public static function uuid(mixed $value, string $key = 'achievementIds'): string
    {
        if (!is_string($value) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di', $value)) self::fail($key, '成就标识无效。');
        return strtolower($value);
    }

    public static function url(mixed $value): string
    {
        $value = self::text($value, 'url', 2048, true);
        $parts = parse_url($value);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass']) || preg_match('/[\s\\\\<>"\x00-\x1F]/u', $value)
            || !filter_var($value, FILTER_VALIDATE_URL)) {
            self::fail('url', '链接必须为不含认证信息的完整 HTTPS 地址。');
        }
        return $value;
    }
}
