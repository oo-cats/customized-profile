<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\User\User;
use Local\CustomProfile\Input;

final class AboutModule implements ModuleType
{
    public function type(): string { return 'about'; }

    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['text', 'tags', 'links', 'format']);
        $tags = array_map(fn ($tag) => Input::text($tag, 'tags', 24, true), Input::list($data['tags'] ?? [], 'tags', 8));
        $links = [];
        foreach (Input::list($data['links'] ?? [], 'links', 5) as $link) {
            $link = Input::object($link, 'links');
            Input::keys($link, ['label', 'url']);
            $links[] = ['label' => Input::text($link['label'] ?? '', 'label', 60, true), 'url' => Input::url($link['url'] ?? null)];
        }
        return ['text' => Input::text($data['text'] ?? '', 'text', 4000), 'format' => Input::choice($data['format'] ?? 'plain', 'format', ['plain', 'bbcode']),
            'tags' => array_values(array_unique($tags)), 'links' => $links];
    }

    public function present(array $data, User $viewer, int $ownerId, array $fields): array { return $data; }
    public function assetIds(array $data): array { return []; }
}
