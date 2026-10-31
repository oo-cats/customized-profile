<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\Http\UrlGenerator;
use Flarum\Post\PostRepository;
use Flarum\User\User;
use Local\CustomProfile\Input;

final class PostsModule implements ModuleType
{
    public function __construct(private PostRepository $posts, private UrlGenerator $url) {}
    public function type(): string { return 'posts'; }

    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['postIds']);
        return ['postIds' => array_values(array_unique(array_map(fn ($id) => Input::integer($id, 'postIds', 1, 2147483647), Input::list($data['postIds'] ?? [], 'postIds', 6))))];
    }

    public function present(array $data, User $viewer, int $ownerId, array $fields): array
    {
        if (!$data['postIds']) return ['items' => []];
        // Flarum's visibility query also checks discussion, tags, approval and private-post extensions.
        $posts = $this->posts->queryVisibleTo($viewer)->whereIn('posts.id', $data['postIds'])
            ->where('posts.type', 'comment')->select(['posts.id', 'posts.type', 'posts.discussion_id', 'posts.number'])
            ->with('discussion:id,title')->get()->keyBy('id');
        $items = [];
        foreach ($data['postIds'] as $id) {
            $post = $posts->get($id);
            if (!$post || !$post->discussion) continue;
            $items[] = ['id' => (int) $id, 'title' => $post->discussion->title,
                'url' => $this->url->to('forum')->path('d/'.(int) $post->discussion_id.'/'.(int) $post->number)];
        }
        // Never return IDs, titles or counts for posts the current viewer cannot read.
        return ['items' => $items];
    }

    public function assetIds(array $data): array { return []; }
}
