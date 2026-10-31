<?php

declare(strict_types=1);

namespace Local\CustomProfile;

/** Typed visual parameters. No user input becomes a CSS property name or selector. */
final class Appearance
{
    public const THEMES = ['default', 'steam', 'midnight', 'ocean', 'forest', 'amber', 'amethyst', 'rose', 'paper'];
    public const FRAMES = ['none', 'line', 'double', 'neon', 'ornate', 'pixel', 'gradient'];
    public const COLORS = ['canvas', 'header', 'panel', 'titleBar', 'accent'];

    public static function defaults(): array
    {
        return ['width' => 'standard', 'sidebar' => 'right', 'spacing' => 20, 'radius' => 4,
            'panelOpacity' => 92, 'titleStyle' => 'bar', 'showStats' => true,
            'colors' => array_fill_keys(self::COLORS, null)];
    }

    public static function identity(): array
    {
        return ['tagline' => '', 'visibility' => 'public', 'alignment' => 'left', 'avatarShape' => 'square'];
    }

    public static function module(): array
    {
        return ['region' => 'main', 'width' => 'full', 'header' => 'inherit', 'align' => 'left',
            'gallery' => 'grid', 'columns' => 3, 'ratio' => 'landscape', 'imageFit' => 'cover'];
    }

    public static function normalize(array $data): array
    {
        $defaults = self::defaults();
        Input::keys($data, array_keys($defaults), 'appearance');
        $data = array_replace($defaults, $data);
        $colors = Input::object($data['colors'], 'colors');
        Input::keys($colors, self::COLORS, 'colors');
        $palette = [];
        foreach (self::COLORS as $key) {
            $value = $colors[$key] ?? null;
            if ($value !== null && (!is_string($value) || !preg_match('/^#[a-fA-F0-9]{6}$/D', $value))) Input::fail('colors', '颜色必须为六位十六进制色值。');
            $palette[$key] = $value === null ? null : strtolower($value);
        }
        if (!is_bool($data['showStats'])) Input::fail('showStats', '统计显示设置必须为布尔值。');
        return [
            'width' => Input::choice($data['width'], 'width', ['compact', 'standard', 'wide']),
            'sidebar' => Input::choice($data['sidebar'], 'sidebar', ['right', 'left', 'none']),
            'spacing' => Input::integer($data['spacing'], 'spacing', 8, 32),
            'radius' => Input::integer($data['radius'], 'radius', 0, 24),
            'panelOpacity' => Input::integer($data['panelOpacity'], 'panelOpacity', 80, 100),
            'titleStyle' => Input::choice($data['titleStyle'], 'titleStyle', ['bar', 'line', 'plain']),
            'showStats' => $data['showStats'], 'colors' => $palette,
        ];
    }

    public static function normalizeIdentity(array $data): array
    {
        Input::keys($data, array_keys(self::identity()), 'identity');
        $data = array_replace(self::identity(), $data);
        return ['tagline' => Input::text($data['tagline'], 'tagline', 160),
            'visibility' => Input::visibility($data['visibility']),
            'alignment' => Input::choice($data['alignment'], 'alignment', ['left', 'center']),
            'avatarShape' => Input::choice($data['avatarShape'], 'avatarShape', ['square', 'rounded', 'circle'])];
    }

    public static function normalizeModule(array $data): array
    {
        Input::keys($data, array_keys(self::module()), 'layout');
        $data = array_replace(self::module(), $data);
        return ['region' => Input::choice($data['region'], 'region', ['main', 'sidebar']),
            'width' => Input::choice($data['width'], 'width', ['full', 'half']),
            'header' => Input::choice($data['header'], 'header', ['inherit', 'bar', 'line', 'plain', 'hidden']),
            'align' => Input::choice($data['align'], 'align', ['left', 'center']),
            'gallery' => Input::choice($data['gallery'], 'gallery', ['grid', 'featured', 'artwork', 'strip']),
            'columns' => Input::integer($data['columns'], 'columns', 1, 4),
            'ratio' => Input::choice($data['ratio'], 'ratio', ['auto', 'square', 'landscape', 'portrait']),
            'imageFit' => Input::choice($data['imageFit'], 'imageFit', ['cover', 'contain'])];
    }
}
