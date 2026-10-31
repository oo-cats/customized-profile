<?php
declare(strict_types=1);
namespace Local\CustomProfile\Integrations;

use Flarum\Extension\ExtensionManager;
use Flarum\Foundation\ValidationException;
use Flarum\User\User;
use Illuminate\Contracts\Container\Container;
use Local\CustomProfile\Input;
use Psr\Log\LoggerInterface;

/** Optional read-only provider, resolved after all extension providers have registered. */
final class Achievements
{
    public const SERVICE = 'Local\\GoodCommunity\\Profile\\AchievementShowcase';
    public const UNAVAILABLE = ['available' => false, 'earnedCount' => null, 'items' => []];

    public function __construct(private Container $container, private ExtensionManager $extensions, private ?LoggerInterface $logger = null) {}

    public function available(): bool
    {
        if (!$this->extensions->isEnabled('local-good-community')) return false;
        try { return class_exists(self::SERVICE) && method_exists(self::SERVICE, 'forViewer') && method_exists(self::SERVICE, 'optionsForViewer'); }
        catch (\Throwable) { return false; }
    }

    public function read(User $viewer, int $ownerId, array $ids): array
    {
        if (!$this->available()) return self::UNAVAILABLE;
        try { $response = $this->container->make(self::SERVICE)->forViewer($viewer, $ownerId, $ids); }
        catch (\Throwable $error) {
            $status = get_object_vars($error)['status'] ?? null;
            if (!in_array($status, [202, 403, 404, 503], true) && !($error instanceof \Flarum\User\Exception\PermissionDeniedException)
                && !($error instanceof \Illuminate\Database\Eloquent\ModelNotFoundException)) {
                $this->logger?->warning('Achievement showcase provider unavailable', ['error_type' => get_class($error)]);
            }
            return self::UNAVAILABLE;
        }
        if (!is_array($response) || ($response['schemaVersion'] ?? null) !== 1 || ($response['userId'] ?? null) !== $ownerId
            || !is_int($response['earnedCount'] ?? null) || $response['earnedCount'] < 0 || $response['earnedCount'] > 9007199254740991
            || !is_array($response['items'] ?? null) || !array_is_list($response['items']) || count($response['items']) > 12) return self::UNAVAILABLE;
        $selected = array_fill_keys($ids, true); $items = [];
        foreach ($response['items'] as $item) {
            if (!is_array($item)) continue;
            try {
                $id = Input::uuid($item['id'] ?? null);
                if (!isset($selected[$id]) || isset($items[$id])) continue;
                $name = Input::text($item['name'] ?? null, 'name', 150, true);
                $description = Input::text($item['description'] ?? null, 'description', 300);
                $status = Input::choice($item['status'] ?? null, 'status', ['active', 'archived']);
            } catch (ValidationException) { continue; }
            $date = $item['earnedAt'] ?? null;
            if ($date !== null) {
                if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/D', $date)) continue;
                try { new \DateTimeImmutable($date); if (\DateTimeImmutable::getLastErrors() !== false) continue; }
                catch (\Exception) { continue; }
            }
            $items[$id] = ['id' => $id, 'name' => $name, 'description' => $description, 'status' => $status, 'earnedAt' => $date];
        }
        $ordered = [];
        foreach ($ids as $id) if (isset($items[$id])) $ordered[] = $items[$id];
        if (count($ordered) > $response['earnedCount']) return self::UNAVAILABLE;
        return ['available' => true, 'earnedCount' => $response['earnedCount'], 'items' => $ordered];
    }
}
