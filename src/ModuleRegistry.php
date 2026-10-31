<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\Http\UrlGenerator;
use Flarum\Post\PostRepository;
use Local\CustomProfile\Modules\{ModuleType, AboutModule, FieldsModule, GalleryModule, PostsModule};

final class ModuleRegistry
{
    /** @var array<string,ModuleType> */
    private array $types = [];

    public function __construct(PostRepository $posts, UrlGenerator $url)
    {
        foreach ([new AboutModule(), new FieldsModule(), new GalleryModule(), new PostsModule($posts, $url)] as $type) $this->register($type);
    }

    public function register(ModuleType $type): void
    {
        $name = $type->type();
        if (!preg_match('/^[a-z][a-z0-9_-]{0,31}$/D', $name) || isset($this->types[$name])) throw new \InvalidArgumentException('Invalid or duplicate profile module type.');
        $this->types[$name] = $type;
    }

    public function get(string $name): ModuleType
    {
        if (!isset($this->types[$name])) Input::fail('type', '不支持的展柜类型。');
        return $this->types[$name];
    }

    public function has(string $name): bool { return isset($this->types[$name]); }
    public function names(): array { return array_keys($this->types); }
}
