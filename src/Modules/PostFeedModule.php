<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\Extension\ExtensionManager;
use Flarum\Http\UrlGenerator;
use Flarum\Post\PostRepository;
use Flarum\User\User;
use Local\CustomProfile\Input;

/** Bounded live feeds of the profile owner's public, readable comment posts. */
final class PostFeedModule implements ModuleType
{
    public function __construct(private string $kind, private PostRepository $posts, private UrlGenerator $url, private ?ExtensionManager $extensions = null)
    {
        if (!in_array($kind, ['recent', 'liked'], true)) throw new \InvalidArgumentException('Unknown post feed kind.');
    }
    public function type(): string { return $this->kind.'-posts'; }
    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['limit', 'scope']);
        return ['limit' => Input::integer(array_key_exists('limit', $data) ? $data['limit'] : 6, 'limit', 1, 6),
            'scope' => Input::choice(array_key_exists('scope', $data) ? $data['scope'] : 'all', 'scope', ['all', 'discussions', 'replies'])];
    }
    public function present(array $data, User $viewer, int $ownerId, array $fields): array
    {
        $config = $this->normalize($data, []);
        if ($this->kind === 'liked' && !($this->extensions?->isEnabled('flarum-likes') ?? false)) return $config + ['available' => false, 'items' => []];
        $approval = $this->extensions?->isEnabled('flarum-approval') ?? false;
        $query = $this->posts->queryVisibleTo($viewer)->where('posts.user_id', $ownerId)->where('posts.type', 'comment')
            ->where('posts.is_private', false)->whereNull('posts.hidden_at')->whereNotNull('posts.created_at')->where('posts.number', '>=', 1)
            ->whereHas('discussion', function ($query) use ($viewer, $approval): void {
                $query->whereVisibleTo($viewer)->where('discussions.is_private', false)->whereNull('discussions.hidden_at');
                if ($approval) $query->where('discussions.is_approved', true);
            })
            ->select(['posts.id', 'posts.type', 'posts.discussion_id', 'posts.number', 'posts.created_at'])
            ->with(['discussion' => function ($query) use ($viewer, $approval): void {
                $query->whereVisibleTo($viewer)->where('discussions.is_private', false)->whereNull('discussions.hidden_at')->select(['discussions.id', 'discussions.title']);
                if ($approval) $query->where('discussions.is_approved', true);
            }]);
        if ($approval) $query->where('posts.is_approved', true);
        if ($config['scope'] === 'discussions') $query->where('posts.number', 1);
        if ($config['scope'] === 'replies') $query->where('posts.number', '>', 1);
        if ($this->kind === 'liked') $query->withCount('likes')->having('likes_count', '>', 0)->orderByDesc('likes_count');
        $rows = $query->orderByDesc('posts.created_at')->orderByDesc('posts.id')->limit($config['limit'])->get();
        $items = [];
        foreach ($rows as $post) {
            if (!$post->discussion) continue;
            $item = ['id' => (int) $post->id, 'title' => $post->discussion->title, 'number' => (int) $post->number,
                'createdAt' => $post->created_at->toIso8601String(),
                'url' => $this->url->to('forum')->path('d/'.(int) $post->discussion_id.'/'.(int) $post->number)];
            if ($this->kind === 'liked') $item['likesCount'] = (int) $post->likes_count;
            $items[] = $item;
        }
        return $config + ['available' => true, 'items' => $items];
    }
    public function assetIds(array $data): array { return []; }
}
