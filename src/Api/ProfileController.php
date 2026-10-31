<?php

declare(strict_types=1);

namespace Local\CustomProfile\Api;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\{EmptyResponse, JsonResponse};
use Local\CustomProfile\{Configuration, Input, Profiles};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Http\Server\RequestHandlerInterface;

final class ProfileController implements RequestHandlerInterface
{
    public function __construct(private Profiles $profiles, private Configuration $configuration) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('viewForum');
        $params = $request->getQueryParams();
        $body = Input::object($request->getParsedBody() ?? [], 'body');
        $route = str_replace('local-custom-profile.', '', (string) $request->getAttribute('routeName'));
        $id = 0;
        if (str_starts_with($route, 'users.') || $route === 'reports.resolve') $id = $this->identifier($params['id'] ?? null, 'id');
        $cursor = array_key_exists('cursor', $params) ? $this->identifier($params['cursor'], 'cursor') : null;
        $result = match ($route) {
            'configuration.get' => $this->configuration->get(),
            'configuration.update' => $this->configuration->update($actor, $body),
            'users.show' => $this->profiles->view($actor, $id, Input::choice($params['view'] ?? 'full', 'view', ['full', 'shell'])),
            'users.editor' => $this->profiles->editor($actor, $id),
            'users.draft' => $this->profiles->saveDraft($actor, $id, $body),
            'users.publish' => $this->profiles->publish($actor, $id, $body),
            'users.rollback' => $this->profiles->rollback($actor, $id, $body),
            'users.preview' => $this->profiles->preview($actor, $id, Input::choice($params['audience'] ?? 'guest', 'audience', ['guest', 'members', 'self'])),
            'users.post-preview' => $this->profiles->postPreview($actor, $id, $params),
            'users.moderate' => $this->profiles->moderate($actor, $id, $body),
            'users.audit' => $this->profiles->audit($actor, $id),
            'reports.index' => $this->profiles->reports($actor, $cursor),
            'users.report', 'reports.resolve' => null,
            default => throw new \LogicException('Unknown profile route.'),
        };
        if ($route === 'users.report') $this->profiles->report($actor, $id, $body);
        if ($route === 'reports.resolve') $this->profiles->resolveReport($actor, $id);
        $headers = ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff'];
        return $result === null ? new EmptyResponse(204, $headers) : new JsonResponse($result, 200, $headers);
    }

    private function identifier(mixed $value, string $key): int
    {
        if ((!is_string($value) && !is_int($value)) || !ctype_digit((string) $value)) Input::fail($key, '标识必须为正整数。');
        return Input::integer((int) $value, $key, 1, 2147483647);
    }
}
