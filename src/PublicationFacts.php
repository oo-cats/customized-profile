<?php
declare(strict_types=1);
namespace Local\CustomProfile;

use Illuminate\Database\ConnectionInterface;

/** Trusted server-side metadata contract; exposes no profile content or privacy settings. */
final class PublicationFacts
{
    public function __construct(private ConnectionInterface $db) {}

    /** First successful publication by the owner. UTC timestamp; null means none recorded. */
    public function firstByOwner(int $userId, bool $lock = false): ?array
    {
        if ($lock) {
            if ($this->db->transactionLevel() === 0) throw new \LogicException('Authoritative facts require a transaction');
            // Publication and reset writers lock this owner row, stabilizing the fact until commit.
            if (!$this->db->table('users')->where('id', $userId)->sharedLock()->first(['id'])) return null;
        }
        $query = $this->db->table('cp_audit')->where('user_id', $userId)
            ->where('actor_id', $userId)->where('action', 'publish')->orderBy('id');
        if ($lock) $query->sharedLock();
        $row = $query->first(['id', 'created_at']);
        return $row ? ['id' => (int) $row->id, 'occurred_at' => $row->created_at] : null;
    }
}
