<?php

declare(strict_types=1);

namespace Local\CustomProfile\Modules;

use Flarum\User\User;
use Local\CustomProfile\Input;
use Local\CustomProfile\Integrations\Acgn;

final class AcgnModule implements ModuleType
{
    public function __construct(private string $kind, private ?Acgn $acgn)
    {
        if (!in_array($kind, ['watching', 'ratings'], true)) throw new \InvalidArgumentException('Unknown ACGN showcase kind.');
    }
    public function type(): string { return 'acgn-'.$this->kind; }
    public function normalize(array $data, array $fields): array
    {
        Input::keys($data, ['limit', 'withProgress']);
        $progress = array_key_exists('withProgress', $data) ? $data['withProgress'] : false;
        if (!is_bool($progress)) Input::fail('withProgress', '进度开关必须为布尔值。');
        return ['limit' => Input::integer(array_key_exists('limit', $data) ? $data['limit'] : 6, 'limit', 1, 6), 'withProgress' => $progress];
    }
    public function present(array $data, User $viewer, int $ownerId, array $fields): array
    {
        $config = $this->normalize($data, []);
        return $config + ($this->acgn?->read($viewer, $ownerId, $this->kind, $config['limit'], $config['withProgress']) ?? ['available' => false, 'items' => []]);
    }
    public function assetIds(array $data): array { return []; }
}
