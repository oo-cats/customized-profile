<?php
declare(strict_types=1);
namespace Local\CustomProfile\Modules;

use Flarum\User\User;
use Local\CustomProfile\Input;
use Local\CustomProfile\Integrations\Achievements;

final class AchievementsModule implements ModuleType
{
    public function __construct(private ?Achievements $source = null) {}
    public function type(): string { return 'achievements'; }
    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['achievementIds']);
        $ids = Input::list(array_key_exists('achievementIds', $data) ? $data['achievementIds'] : [], 'achievementIds', 12);
        return ['achievementIds' => array_values(array_unique(array_map(static fn ($id) => Input::uuid($id), $ids)))];
    }
    public function present(array $data, User $viewer, int $ownerId, array $fields): array
    {
        $ids = $this->normalize($data, [])['achievementIds'];
        // Unavailable selections remain in the private configuration, never in the public DTO.
        return ($this->source?->read($viewer, $ownerId, $ids) ?? Achievements::UNAVAILABLE) + ['hasSelection' => $ids !== []];
    }
    public function assetIds(array $data): array { return []; }
}
