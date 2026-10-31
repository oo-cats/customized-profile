<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\User\User;

final class Visibility
{
    public static function allows(string $scope, User $viewer, int $owner): bool
    {
        if (!$viewer->isGuest() && (int) $viewer->id === $owner) return true;
        return match ($scope) {
            'public' => true,
            'members' => !$viewer->isGuest() && (bool) $viewer->is_email_confirmed,
            default => false,
        };
    }
}
