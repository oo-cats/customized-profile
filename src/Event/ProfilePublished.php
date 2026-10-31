<?php
declare(strict_types=1);
namespace Local\CustomProfile\Event;

/** Dispatched inside the publication transaction after its audit row is written. */
final class ProfilePublished
{
    public function __construct(
        public readonly int $userId,
        public readonly int $actorId,
        public readonly int $auditId
    ) {}
}
