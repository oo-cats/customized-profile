<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\User\User;
use Local\CustomProfile\Input;

final class GalleryModule implements ModuleType
{
    public function type(): string { return 'gallery'; }

    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['images']);
        $images = [];
        foreach (Input::list($data['images'] ?? [], 'images', \Local\CustomProfile\Schema::MAX_IMAGES) as $image) {
            $image = Input::object($image, 'images');
            Input::keys($image, ['assetId', 'caption']);
            $images[] = ['assetId' => Input::asset($image['assetId'] ?? null), 'caption' => Input::text($image['caption'] ?? '', 'caption', 120)];
        }
        return ['images' => $images];
    }

    public function present(array $data, User $viewer, int $ownerId, array $fields): array { return $data; }
    public function assetIds(array $data): array { return array_column($data['images'] ?? [], 'assetId'); }
}
