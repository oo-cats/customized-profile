<?php

declare(strict_types=1);

namespace Local\CustomProfile\Integrations;

use Flarum\Extension\ExtensionManager;
use Flarum\Http\UrlGenerator;
use Flarum\User\User;
use Flarum\User\Exception\PermissionDeniedException;
use Illuminate\Contracts\Container\Container;
use Illuminate\Database\Eloquent\ModelNotFoundException;

/** Optional public PHP contract; never reads ACGN tables or uses an elevated viewer. */
final class Acgn
{
    public const SERVICE = 'Local\\AcgnDatabase\\Profile\\RecordShowcase';

    public function __construct(private Container $container, private ExtensionManager $extensions, private UrlGenerator $url) {}

    public function available(): bool
    {
        return $this->extensions->isEnabled('local-acgn-database')
            && class_exists(self::SERVICE) && method_exists(self::SERVICE, 'forViewer');
    }

    public function read(User $viewer, int $ownerId, string $kind, int $limit, bool $withProgress): array
    {
        $empty = ['available' => false, 'items' => []];
        if (!$this->available()) return $empty;
        try {
            $response = $this->container->make(self::SERVICE)->forViewer($viewer, $ownerId, $kind, $limit, $withProgress);
        } catch (PermissionDeniedException | ModelNotFoundException) {
            return $empty;
        }
        if (($response['schemaVersion'] ?? null) !== 1 || ($response['kind'] ?? null) !== $kind || !is_array($response['items'] ?? null)) return $empty;
        $items = [];
        foreach (array_slice($response['items'], 0, $limit) as $item) {
            if (!is_array($item) || !is_int($item['subjectId'] ?? null) || $item['subjectId'] < 1 || $item['subjectId'] > 2147483647
                || !is_string($item['title'] ?? null) || mb_strlen($item['title']) > 300
                || !in_array($item['type'] ?? null, ['anime', 'manga', 'game', 'novel'], true)
                || !in_array($item['status'] ?? null, ['planned', 'current', 'completed', 'on_hold', 'dropped'], true)) continue;
            $safe = ['subjectId' => $item['subjectId'], 'title' => $item['title'], 'type' => $item['type'], 'status' => $item['status'],
                'url' => $this->url->to('forum')->path('acgn/subjects/'.$item['subjectId'])];
            if ($kind === 'ratings') {
                if (!is_int($item['score'] ?? null) || $item['score'] < 1 || $item['score'] > 10) continue;
                $safe['score'] = $item['score'];
            }
            if ($withProgress && is_int($item['progress'] ?? null) && $item['progress'] >= 0 && $item['progress'] <= 2147483647) $safe['progress'] = $item['progress'];
            $items[] = $safe;
        }
        return ['available' => true, 'items' => $items];
    }
}
