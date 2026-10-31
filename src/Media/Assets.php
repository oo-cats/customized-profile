<?php

declare(strict_types=1);

namespace Local\CustomProfile\Media;

use Flarum\Foundation\ValidationException;
use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Local\CustomProfile\RequestBudget;
use Psr\Http\Message\UploadedFileInterface;

/** All mutations serialize on the asset owner's user row, as profile publication does. */
final class Assets
{
    public const MAX_COUNT = 60;
    public const MAX_BYTES = 30 * 1024 * 1024;
    private const PAGE_SIZE = 24;

    public function __construct(private ConnectionInterface $db, private ImageStorage $storage, private RequestBudget $budget)
    {
    }

    public function upload(User $actor, UploadedFileInterface $file): array
    {
        $this->assertUploader($actor);
        $frozen = $this->db->table('cp_profiles')->where('user_id', $actor->id)->value('frozen');
        $actor->assertPermission(!$frozen || $actor->can('custom-profile.manage'));
        $this->budget->consume($actor, 'upload');
        $this->assertQuota((int) $actor->id, 0);
        $id = bin2hex(random_bytes(16));
        $image = $this->storage->receive($file, $id);
        try {
            $this->db->transaction(function () use ($actor, $id, $image): void {
                $this->lockOwner((int) $actor->id);
                $this->assertQuota((int) $actor->id, $image['bytes']);
                $this->db->table('cp_assets')->insert([
                    'id' => $id,
                    'user_id' => (int) $actor->id,
                    'bytes' => $image['bytes'],
                    'width' => $image['width'],
                    'height' => $image['height'],
                    'status' => 'active',
                    'created_at' => gmdate('Y-m-d H:i:s'),
                ]);
            });
        } catch (\Throwable $error) {
            $this->storage->remove($id);
            throw $error;
        }

        return $this->serialize($this->get($id));
    }

    public function listing(User $actor, ?string $cursor = null): array
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        if ($cursor !== null && !preg_match('/^[a-f0-9]{32}$/D', $cursor)) {
            throw new ValidationException(['cursor' => '分页游标无效。']);
        }
        $query = $this->db->table('cp_assets')->where('user_id', (int) $actor->id)->orderByDesc('id');
        if ($cursor !== null) {
            $query->where('id', '<', $cursor);
        }
        $rows = $query->limit(self::PAGE_SIZE + 1)->get();
        $hasMore = $rows->count() > self::PAGE_SIZE;
        $rows = $rows->take(self::PAGE_SIZE);

        return [
            'assets' => $rows->map(fn (object $row): array => $this->serialize($row))->values()->all(),
            'nextCursor' => $hasMore ? $rows->last()->id : null,
        ];
    }

    public function get(string $id): object
    {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) {
            throw new ModelNotFoundException();
        }
        $asset = $this->db->table('cp_assets')->where('id', $id)->first();
        if ($asset === null) {
            throw new ModelNotFoundException();
        }

        return $asset;
    }

    public function delete(User $actor, string $id): void
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        $candidate = $this->get($id);
        $actor->assertPermission((int) $candidate->user_id === (int) $actor->id || $actor->can('custom-profile.manage'));
        $this->db->transaction(function () use ($candidate, $id): void {
            $this->lockOwner((int) $candidate->user_id);
            $asset = $this->db->table('cp_assets')->where('id', $id)->lockForUpdate()->first();
            if ($asset === null) {
                throw new ModelNotFoundException();
            }
            $profile = $this->db->table('cp_profiles')->where('user_id', $asset->user_id)->lockForUpdate()->first();
            if ($profile !== null) {
                foreach (['draft', 'published', 'previous'] as $slot) {
                    $value = $profile->{$slot} ?? null;
                    if ($value !== null && $this->references($value, $id)) {
                        throw new ValidationException(['asset' => '图片仍被草稿、已发布主页或上一版本引用，请先移除引用。']);
                    }
                }
            }
            $this->db->table('cp_assets')->where('id', $id)->update(['status' => 'purging']);
        });

        // A durable tombstone prevents reads and retries safely after a failed disk operation.
        $this->storage->remove($id);
        $this->db->transaction(function () use ($candidate, $id): void {
            $this->lockOwner((int) $candidate->user_id);
            $this->db->table('cp_assets')->where('id', $id)->where('status', 'purging')->delete();
        });
    }

    private function assertUploader(User $actor): void
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        $actor->assertPermission((bool) $actor->is_email_confirmed);
    }

    private function lockOwner(int $id): void
    {
        if ($this->db->table('users')->where('id', $id)->lockForUpdate()->first(['id']) === null) {
            throw new ModelNotFoundException();
        }
    }

    private function assertQuota(int $userId, int $additional): void
    {
        $query = $this->db->table('cp_assets')->where('user_id', $userId);
        if ((clone $query)->count() >= self::MAX_COUNT || (int) $query->sum('bytes') + $additional > self::MAX_BYTES) {
            throw new ValidationException(['file' => '个人主页素材最多 60 张，总空间最多 30 MiB，已下架及待清理素材同样计入。']);
        }
    }

    /** A conservative exact-value scan covers additional module types without interpreting their keys. */
    private function references(mixed $value, string $id): bool
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true, 32, JSON_THROW_ON_ERROR);
        } else {
            $decoded = $value;
        }
        $scan = function (mixed $node) use (&$scan, $id): bool {
            if ($node === $id) {
                return true;
            }
            if (is_array($node)) {
                foreach ($node as $child) {
                    if ($scan($child)) {
                        return true;
                    }
                }
            }
            return false;
        };

        return $scan($decoded);
    }

    private function serialize(object $asset): array
    {
        return [
            'id' => $asset->id,
            'bytes' => (int) $asset->bytes,
            'width' => (int) $asset->width,
            'height' => (int) $asset->height,
            'status' => $asset->status,
        ];
    }
}
