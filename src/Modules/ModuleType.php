<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\User\User;

/** Trusted PHP extensions register types; member configuration cannot register executable code. */
interface ModuleType
{
    public function type(): string;
    public function normalize(array $data, array $fields): array;
    public function present(array $data, User $viewer, int $ownerId, array $fields): array;
    /** @return list<string> Every asset used by this module must be enumerated. */
    public function assetIds(array $data): array;
}
