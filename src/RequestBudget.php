<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\Post\Exception\FloodingException;
use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Eloquent\ModelNotFoundException;

/** Two bounded per-account counters; failed work consumes budget before decoding or profile writes. */
final class RequestBudget
{
    public const WINDOW_SECONDS = 60;
    public const LIMITS = ['upload' => 10, 'write' => 30];

    public function __construct(private ConnectionInterface $db)
    {
    }

    public function consume(User $actor, string $kind): void
    {
        $actor->assertRegistered();
        if (!isset(self::LIMITS[$kind])) {
            throw new \InvalidArgumentException('Unknown profile request budget.');
        }

        // Call before any owner transaction: an administrator may operate on different owners.
        $this->db->transaction(function () use ($actor, $kind): void {
            if (!$this->db->table('users')->where('id', $actor->id)->lockForUpdate()->first(['id'])) {
                throw new ModelNotFoundException();
            }
            $query = $this->db->table('cp_budgets')->where('user_id', $actor->id)->where('kind', $kind);
            $bucket = (clone $query)->lockForUpdate()->first();
            $now = time();
            if ($bucket && $now < (int) $bucket->window_start + self::WINDOW_SECONDS) {
                if ((int) $bucket->attempts >= self::LIMITS[$kind]) {
                    throw new FloodingException();
                }
                $query->update(['attempts' => (int) $bucket->attempts + 1]);
                return;
            }

            if ($bucket) {
                $query->update(['window_start' => $now, 'attempts' => 1]);
            } else {
                $this->db->table('cp_budgets')->insert([
                    'user_id' => (int) $actor->id,
                    'kind' => $kind,
                    'window_start' => $now,
                    'attempts' => 1,
                ]);
            }
        });
    }
}
