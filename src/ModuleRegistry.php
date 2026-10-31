<?php

declare(strict_types=1);

namespace Local\CustomProfile;

use Flarum\Http\UrlGenerator;
use Flarum\Post\PostRepository;
use Flarum\Extension\ExtensionManager;
use Local\CustomProfile\Modules\{ModuleType, AboutModule, FieldsModule, GalleryModule, PostsModule, AcgnModule, PostFeedModule, AchievementsModule};
use Local\CustomProfile\Integrations\{Acgn, Achievements};

final class ModuleRegistry
{
    /** @var array<string,ModuleType> */
    private array $types = [];

    public function __construct(PostRepository $posts, UrlGenerator $url, private ?Acgn $acgn = null, private ?ExtensionManager $extensions = null, private ?Achievements $achievements = null)
    {
        foreach ([new AboutModule(), new FieldsModule(), new GalleryModule(), new PostsModule($posts, $url)] as $type) $this->register($type);
        foreach (['watching', 'ratings'] as $kind) $this->register(new AcgnModule($kind, $acgn));
        foreach (['recent', 'liked'] as $kind) $this->register(new PostFeedModule($kind, $posts, $url, $extensions));
        $this->register(new AchievementsModule($achievements));
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
    public function acgnAvailable(): bool { return $this->acgn?->available() ?? false; }
    public function likesAvailable(): bool { return $this->extensions?->isEnabled('flarum-likes') ?? false; }
    public function achievementsAvailable(): bool { return $this->achievements?->available() ?? false; }
}
