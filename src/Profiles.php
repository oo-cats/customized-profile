<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\Http\UrlGenerator;
use Flarum\User\Guest;
use Flarum\User\User;
use Flarum\User\UserRepository;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Contracts\Events\Dispatcher;
use Local\CustomProfile\Event\ProfilePublished;

/** Profile lifecycle and the shared permission boundary for JSON and media responses. */
final class Profiles
{
    public function __construct(
        private ConnectionInterface $db,
        private Schema $schema,
        private Configuration $configuration,
        private ModuleRegistry $modules,
        private UserRepository $users,
        private UrlGenerator $url,
        private RequestBudget $budget,
        private Dispatcher $events
    ) {
    }

    public function editor(User $actor, int $userId): array
    {
        $this->assertEditor($actor, $userId);
        return $this->editorState($userId, $this->row($userId)) + ['canManage' => $this->canManage($actor)];
    }

    public function view(User $actor, int $userId, string $mode = 'full'): array
    {
        Input::choice($mode, 'view', ['full', 'shell']);
        $actor->assertCan('viewForum');
        $this->users->findOrFail($userId, $actor);
        $row = $this->row($userId, ['published', 'frozen', 'hidden_modules']);
        $manage = $this->canManage($actor);
        return [
            'userId' => $userId,
            'profile' => $row && !$row->frozen && $row->published !== null
                ? $this->present($this->decode($row->published), $actor, $userId, $this->decode($row->hidden_modules), $mode === 'full') : null,
            'canEdit' => $manage || (!$actor->isGuest() && (int) $actor->id === $userId && $actor->is_email_confirmed && !($row->frozen ?? false)),
            'canManage' => $manage,
            'canReport' => !$actor->isGuest() && (bool) $actor->is_email_confirmed && (int) $actor->id !== $userId,
        ];
    }

    public function saveDraft(User $actor, int $userId, array $body): array
    {
        Input::keys($body, ['version', 'profile']);
        $profile = Input::object($body['profile'] ?? null, 'profile');
        return $this->change($actor, $userId, $body['version'] ?? null, 'draft', '', false,
            fn (object $row): array => ['draft' => $this->encode($this->validate($profile, $actor, $userId))]);
    }

    public function publish(User $actor, int $userId, array $body): array
    {
        Input::keys($body, ['version']);
        return $this->change($actor, $userId, $body['version'] ?? null, 'publish', '', false,
            fn (object $row): array => ['previous' => $row->published,
                'published' => $this->encode($this->validate($this->decode($row->draft), $actor, $userId))]);
    }

    public function rollback(User $actor, int $userId, array $body): array
    {
        Input::keys($body, ['version']);
        return $this->change($actor, $userId, $body['version'] ?? null, 'rollback', '', false,
            function (object $row) use ($actor, $userId): array {
                if ($row->previous === null) Input::fail('previous', '没有可恢复的上一版本。');
                $restored = $this->encode($this->validate($this->decode($row->previous), $actor, $userId));
                return ['previous' => $row->published, 'published' => $restored, 'draft' => $restored];
            });
    }

    public function preview(User $actor, int $userId, string $audience): array
    {
        $this->assertEditor($actor, $userId);
        Input::choice($audience, 'audience', ['guest', 'members', 'self']);
        $viewer = match ($audience) {
            'guest' => new Guest(),
            // A profile moderator must not impersonate its owner in optional data providers.
            'self' => $actor,
            'members' => $this->memberPreview(),
        };
        $row = $this->row($userId, ['draft', 'frozen', 'hidden_modules']);
        $profile = $row ? $this->decode($row->draft) : Schema::defaults();
        return ['userId' => $userId,
            'profile' => $viewer->can('viewForum') && !($row->frozen ?? false)
                ? $this->present($profile, $viewer, $userId, $row ? $this->decode($row->hidden_modules) : []) : null,
            'canEdit' => !($row->frozen ?? false) || $this->canManage($actor), 'canManage' => $this->canManage($actor)];
    }

    public function canReadAsset(User $actor, string $id): bool
    {
        if (!$actor->can('viewForum') || !preg_match('/^[a-f0-9]{32}$/D', $id)) return false;
        $asset = $this->db->table('cp_assets')->where('id', $id)->where('status', 'active')->first();
        if (!$asset) return false;
        if ((!$actor->isGuest() && (int) $actor->id === (int) $asset->user_id) || $this->canManage($actor)) return true;
        $ownerId = (int) $asset->user_id;
        try { $this->users->findOrFail($ownerId, $actor); }
        catch (ModelNotFoundException) { return false; }
        $row = $this->row($ownerId, ['published', 'frozen', 'hidden_modules']);
        if (!$row || $row->frozen || $row->published === null) return false;
        $profile = $this->decode($row->published);
        if (!Visibility::allows($profile['visibility'] ?? 'public', $actor, $ownerId)) return false;
        if (($profile['background']['assetId'] ?? null) === $id
            && Visibility::allows($profile['background']['visibility'], $actor, $ownerId)) return true;
        $hidden = $this->decode($row->hidden_modules);
        $fields = null;
        foreach ($profile['modules'] as $module) {
            if (in_array($module['id'], $hidden, true) || !$this->modules->has($module['type'])
                || !Visibility::allows($module['visibility'], $actor, $ownerId)) continue;
            $type = $this->modules->get($module['type']);
            if (!in_array($id, $type->assetIds($module['data']), true)) continue;
            $fields ??= $this->configuration->get()['fields'];
            // A module must also remove private subfields before its assets can authorize a file read.
            $presented = $type->present($module['data'], $actor, $ownerId, $fields);
            if (in_array($id, $type->assetIds($presented), true)) return true;
        }
        return false;
    }

    /** Private editor preview for unsaved feed configuration, always as the actual actor. */
    public function postPreview(User $actor, int $userId, array $params): array
    {
        $this->assertEditor($actor, $userId);
        $kind = Input::choice($params['kind'] ?? null, 'kind', ['recent', 'liked', 'featured']);
        if ($kind === 'featured') {
            Input::keys($params, ['id', 'kind', 'postIds'], 'query');
            $ids = Input::text($params['postIds'] ?? '', 'postIds', 65);
            if ($ids !== '' && !preg_match('/^[1-9][0-9]{0,9}(,[1-9][0-9]{0,9}){0,5}$/D', $ids)) Input::fail('postIds', '帖子 ID 列表无效。');
            $type = $this->modules->get('posts');
            $config = $type->normalize(['postIds' => $ids === '' ? [] : array_map('intval', explode(',', $ids))], []);
        } else {
            Input::keys($params, ['id', 'kind', 'limit', 'scope'], 'query');
            $limit = $params['limit'] ?? 6;
            if (is_string($limit) && preg_match('/^[1-6]$/D', $limit)) $limit = (int) $limit;
            $type = $this->modules->get($kind.'-posts');
            $config = $type->normalize(['limit' => $limit, 'scope' => $params['scope'] ?? 'all'], []);
        }
        if ($this->row($userId, ['frozen'])?->frozen) return ['available' => false, 'items' => []];
        return $type->present($config, $actor, $userId, []) + ['available' => true];
    }

    public function moderate(User $actor, int $userId, array $body): array
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        $actor->assertCan('custom-profile.manage');
        Input::keys($body, ['version', 'action', 'reason', 'moduleId', 'assetId']);
        $action = Input::choice($body['action'] ?? null, 'action', ['freeze', 'unfreeze', 'reset', 'hide-module', 'show-module', 'block-asset', 'unblock-asset']);
        $reason = Input::text($body['reason'] ?? null, 'reason', 500, true);
        return $this->change($actor, $userId, $body['version'] ?? null, $action, $reason, true,
            function (object $row) use ($body, $action, $userId): array {
                if ($action === 'freeze' || $action === 'unfreeze') return ['frozen' => $action === 'freeze'];
                if ($action === 'reset') return ['draft' => $this->encode(Schema::defaults()), 'published' => null, 'previous' => null, 'hidden_modules' => '[]'];
                if ($action === 'hide-module' || $action === 'show-module') {
                    $id = Input::text($body['moduleId'] ?? null, 'moduleId', 32, true);
                    $available = $this->moduleIds($row);
                    if (!in_array($id, $available, true)) Input::fail('moduleId', '展柜不存在。');
                    $hidden = $this->decode($row->hidden_modules);
                    $hidden = $action === 'hide-module' ? array_unique(array_merge($hidden, [$id])) : array_diff($hidden, [$id]);
                    return ['hidden_modules' => $this->encode(array_values(array_intersect($hidden, $available)))];
                }
                $id = Input::asset($body['assetId'] ?? null);
                $asset = $this->db->table('cp_assets')->where('id', $id)->where('user_id', $userId)->lockForUpdate()->first();
                if (!$asset || $asset->status === 'purging') Input::fail('assetId', '素材不存在或正在清理。');
                $this->db->table('cp_assets')->where('id', $id)->update(['status' => $action === 'block-asset' ? 'blocked' : 'active']);
                return [];
            });
    }

    public function report(User $actor, int $userId, array $body): void
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        $actor->assertPermission((bool) $actor->is_email_confirmed);
        $actor->assertPermission((int) $actor->id !== $userId);
        $this->users->findOrFail($userId, $actor);
        Input::keys($body, ['reason']);
        $reason = Input::text($body['reason'] ?? null, 'reason', 500, true);
        $this->db->transaction(function () use ($actor, $userId, $reason): void {
            $this->lockUser((int) $actor->id);
            $recent = $this->db->table('cp_reports')->where('reporter_id', $actor->id)
                ->where('created_at', '>=', gmdate('Y-m-d H:i:s', time() - 3600))->count();
            if ($recent >= 3) Input::fail('report', '每小时最多提交 3 次举报，请稍后再试。');
            $this->db->table('cp_reports')->insert(['user_id' => $userId, 'reporter_id' => $actor->id,
                'reason' => $reason, 'resolved' => false, 'created_at' => gmdate('Y-m-d H:i:s')]);
        });
    }

    public function reports(User $actor, ?int $cursor = null): array
    {
        $this->assertManager($actor);
        if ($cursor !== null) Input::integer($cursor, 'cursor', 1, 2147483647);
        $query = $this->db->table('cp_reports')->orderByDesc('id');
        if ($cursor !== null) $query->where('id', '<', $cursor);
        $rows = $query->limit(25)->get();
        $hasMore = $rows->count() > 24;
        $rows = $rows->take(24);
        return ['reports' => $rows->map(fn (object $row): array => [
            'id' => (int) $row->id, 'userId' => (int) $row->user_id, 'reporterId' => (int) $row->reporter_id,
            'reason' => $row->reason, 'resolved' => (bool) $row->resolved, 'createdAt' => $row->created_at,
        ])->values()->all(), 'nextCursor' => $hasMore ? (int) $rows->last()->id : null];
    }

    public function resolveReport(User $actor, int $id): void
    {
        $this->assertManager($actor);
        Input::integer($id, 'id', 1, 2147483647);
        $this->db->transaction(function () use ($actor, $id): void {
            $report = $this->db->table('cp_reports')->where('id', $id)->lockForUpdate()->first();
            if (!$report) throw new ModelNotFoundException();
            if ($report->resolved) return;
            $this->db->table('cp_reports')->where('id', $id)->update(['resolved' => true]);
            $this->writeAudit((int) $report->user_id, $actor, 'report-resolved', '');
        });
    }

    public function audit(User $actor, int $userId): array
    {
        $this->assertManager($actor);
        $this->users->findOrFail($userId, $actor);
        return ['events' => $this->db->table('cp_audit')->where('user_id', $userId)->orderByDesc('id')->limit(50)
            ->get()->map(fn (object $row): array => ['id' => (int) $row->id,
                'actorId' => $row->actor_id === null ? null : (int) $row->actor_id,
                'action' => $row->action, 'reason' => $row->reason, 'createdAt' => $row->created_at])->all()];
    }

    /** User-row locking is shared with upload/deletion, preventing validation/publication races. */
    private function change(User $actor, int $userId, mixed $version, string $action, string $reason, bool $allowFrozen, callable $change): array
    {
        $this->assertEditor($actor, $userId);
        $version = Input::integer($version, 'version', 1, 2147483646);
        $this->budget->consume($actor, 'write');
        $this->db->transaction(function () use ($actor, $userId, $version, $action, $reason, $allowFrozen, $change): void {
            $this->lockUser($userId);
            $row = $this->row($userId);
            if ($row === null) {
                $this->db->table('cp_profiles')->insert(['user_id' => $userId, 'version' => 1,
                    'draft' => $this->encode(Schema::defaults()), 'published' => null, 'previous' => null,
                    'frozen' => false, 'hidden_modules' => '[]', 'updated_at' => gmdate('Y-m-d H:i:s')]);
                $row = $this->row($userId);
            }
            if ((int) $row->version !== $version) Input::fail('version', '主页已更新，请刷新后重试。');
            $actor->assertPermission(!$row->frozen || $allowFrozen || $this->canManage($actor));
            $changes = $change($row);
            $next = (object) array_replace((array) $row, $changes);
            $hidden = array_values(array_intersect($this->decode($next->hidden_modules), $this->moduleIds($next)));
            $changes += ['version' => $version + 1, 'hidden_modules' => $this->encode($hidden), 'updated_at' => gmdate('Y-m-d H:i:s')];
            $this->db->table('cp_profiles')->where('user_id', $userId)->update($changes);
            $auditId = $this->writeAudit($userId, $actor, $action, $reason);
            if ($action === 'publish') {
                // Enqueue downstream work on this transaction; listeners must not send external messages.
                $this->events->dispatch(new ProfilePublished($userId, (int) $actor->id, $auditId));
            }
        });
        return $this->editor($actor, $userId);
    }

    private function validate(array $profile, User $actor, int $userId): array
    {
        $fields = $this->configuration->get()['fields'];
        $profile = $this->schema->normalize($profile, $fields);
        $ids = $this->schema->assetIds($profile);
        if ($ids && $this->db->table('cp_assets')->where('user_id', $userId)->where('status', 'active')->whereIn('id', $ids)->count() !== count($ids)) {
            Input::fail('assetId', '素材不存在、已下架或不属于此账号。');
        }
        foreach ($profile['modules'] as $module) {
            if ($module['type'] !== 'posts') continue;
            $presented = $this->modules->get('posts')->present($module['data'], $actor, $userId, $fields);
            if (count($presented['items']) !== count($module['data']['postIds'])) Input::fail('postIds', '包含不存在或无权查看的帖子。');
        }
        return $profile;
    }

    private function present(array $profile, User $viewer, int $userId, array $hidden, bool $withModules = true): ?array
    {
        $profile = Schema::upgrade($profile);
        if (!Visibility::allows($profile['visibility'], $viewer, $userId)) return null;
        $fields = $withModules ? $this->configuration->get()['fields'] : [];
        $ids = $withModules ? $this->schema->assetIds($profile) : array_filter([$profile['background']['assetId']]);
        $active = $ids ? array_fill_keys($this->db->table('cp_assets')->where('user_id', $userId)
            ->where('status', 'active')->whereIn('id', $ids)->pluck('id')->all(), true) : [];
        $identity = $profile['identity'];
        if (!Visibility::allows($identity['visibility'], $viewer, $userId)) $identity['tagline'] = '';
        $result = ['schemaVersion' => 2, 'visibility' => $profile['visibility'], 'theme' => $profile['theme'], 'frame' => $profile['frame'],
            'appearance' => $profile['appearance'], 'identity' => $identity,
            'background' => Schema::defaults()['background'], 'modules' => []];
        $background = $profile['background'];
        if (Visibility::allows($background['visibility'], $viewer, $userId)
            && ($background['assetId'] === null || isset($active[$background['assetId']]))) {
            $result['background'] = $background;
            if ($background['assetId'] !== null) $result['background']['url'] = $this->assetUrl($background['assetId']);
        }
        if (!$withModules) return $result;
        $visible = array_filter($profile['modules'], fn (array $module): bool => !in_array($module['id'], $hidden, true)
            && $this->modules->has($module['type']) && Visibility::allows($module['visibility'], $viewer, $userId));
        $limits = [];
        foreach ($visible as $module) {
            $key = $this->liveSourceKey($module);
            if ($key !== null) $limits[$key] = max($limits[$key] ?? 0, $module['data']['limit'] ?? 6);
        }
        // Local to this presentation and its actual viewer/owner; never persists in a singleton.
        $sources = [];
        foreach ($visible as $module) {
            $type = $this->modules->get($module['type']);
            $key = $this->liveSourceKey($module);
            if ($key === null) {
                $data = $type->present($module['data'], $viewer, $userId, $fields);
            } else {
                $data = $sources[$key] ??= $type->present(array_replace($module['data'], ['limit' => $limits[$key]]), $viewer, $userId, $fields);
                $data['limit'] = $module['data']['limit'] ?? 6;
                $data['items'] = array_slice($data['items'], 0, $data['limit']);
            }
            if ($module['type'] === 'gallery') {
                $images = [];
                foreach ($data['images'] ?? [] as $image) {
                    if (isset($active[$image['assetId']])) $images[] = $image + ['url' => $this->assetUrl($image['assetId'])];
                }
                $data = ['images' => $images];
            }
            $emptyKey = match ($module['type']) { 'fields' => 'values', 'gallery' => 'images', 'posts' => 'items', default => null };
            if ($emptyKey !== null && empty($data[$emptyKey])) continue;
            $module['data'] = $data;
            $result['modules'][] = $module;
        }
        return $result;
    }

    private function liveSourceKey(array $module): ?string
    {
        if (!in_array($module['type'], ['recent-posts', 'liked-posts', 'acgn-watching', 'acgn-ratings'], true)) return null;
        $config = $module['data'];
        unset($config['limit']);
        return $module['type'].':'.$this->encode($config);
    }

    private function assertEditor(User $actor, int $userId): User
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        $actor->assertPermission($this->canManage($actor) || ((int) $actor->id === $userId && $actor->is_email_confirmed));
        return $this->users->findOrFail($userId, $actor);
    }

    private function assertManager(User $actor): void
    {
        $actor->assertRegistered();
        $actor->assertCan('viewForum');
        $actor->assertCan('custom-profile.manage');
    }

    private function canManage(User $actor): bool
    {
        return !$actor->isGuest() && $actor->can('custom-profile.manage');
    }

    private function lockUser(int $userId): void
    {
        if (!$this->db->table('users')->where('id', $userId)->lockForUpdate()->first(['id'])) throw new ModelNotFoundException();
    }

    private function row(int $userId, array $columns = ['*']): ?object
    {
        return $this->db->table('cp_profiles')->where('user_id', $userId)->first($columns);
    }

    private function editorState(int $userId, ?object $row): array
    {
        return ['userId' => $userId, 'version' => $row ? (int) $row->version : 1, 'frozen' => (bool) ($row->frozen ?? false),
            'draft' => $row ? Schema::upgrade($this->decode($row->draft)) : Schema::defaults(),
            'published' => $row && $row->published !== null ? Schema::upgrade($this->decode($row->published)) : null,
            'previous' => $row && $row->previous !== null ? Schema::upgrade($this->decode($row->previous)) : null,
            'hiddenModules' => $row ? $this->decode($row->hidden_modules) : []];
    }

    private function moduleIds(object $row): array
    {
        $ids = [];
        foreach (['draft', 'published', 'previous'] as $slot) {
            if ($row->{$slot} !== null) $ids = array_merge($ids, array_column($this->decode($row->{$slot})['modules'], 'id'));
        }
        return array_values(array_unique($ids));
    }

    private function memberPreview(): User
    {
        $viewer = new User();
        $viewer->id = 0;
        $viewer->exists = true;
        $viewer->is_email_confirmed = true;
        $viewer->setRelation('groups', new Collection());
        return $viewer;
    }

    private function assetUrl(string $id): string
    {
        return $this->url->to('api')->path('custom-profile/assets/'.$id.'/file');
    }

    private function writeAudit(int $userId, User $actor, string $action, string $reason): int
    {
        return (int) $this->db->table('cp_audit')->insertGetId(['user_id' => $userId, 'actor_id' => $actor->id,
            'action' => $action, 'reason' => $reason, 'created_at' => gmdate('Y-m-d H:i:s')]);
    }

    private function encode(array $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }

    private function decode(string $value): array
    {
        return json_decode($value, true, 32, JSON_THROW_ON_ERROR);
    }
}
