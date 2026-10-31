<?php

declare(strict_types=1);

namespace Local\CustomProfile\Api;

use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\Http\UrlGenerator;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Response\JsonResponse;
use Laminas\Diactoros\Stream;
use Local\CustomProfile\Media\Assets;
use Local\CustomProfile\Media\ImageStorage;
use Local\CustomProfile\Profiles;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class AssetController implements RequestHandlerInterface
{
    public function __construct(
        private Assets $assets,
        private ImageStorage $storage,
        private Profiles $profiles,
        private UrlGenerator $url
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('viewForum');
        $query = $request->getQueryParams();
        $id = is_string($query['id'] ?? null) ? $query['id'] : '';
        $route = (string) $request->getAttribute('routeName');

        if (str_ends_with($route, 'assets.file')) {
            if (!$this->profiles->canReadAsset($actor, $id)) {
                throw new ModelNotFoundException();
            }
            $asset = $this->assets->get($id);
            if ($asset->status !== 'active') {
                throw new ModelNotFoundException();
            }
            $path = $this->storage->path($id);
            if (!is_file($path)) {
                throw new ModelNotFoundException();
            }
            $handle = @fopen($path, 'rb');
            if ($handle === false) {
                throw new ModelNotFoundException();
            }
            $stat = fstat($handle);

            return new Response(new Stream($handle), 200, [
                'Content-Type' => 'image/webp',
                'Content-Length' => (string) $stat['size'],
                'Content-Disposition' => 'inline; filename="profile-image.webp"',
                'Cache-Control' => 'private, no-store',
                'X-Content-Type-Options' => 'nosniff',
                'Content-Security-Policy' => "default-src 'none'; sandbox",
                'Cross-Origin-Resource-Policy' => 'same-origin',
            ]);
        }
        if ($request->getMethod() === 'POST') {
            $file = $request->getUploadedFiles()['file'] ?? null;
            if (!$file instanceof UploadedFileInterface) {
                throw new ValidationException(['file' => '请选择图片，超出 PHP 请求上限也可能导致文件缺失。']);
            }
            $result = ['asset' => $this->withUrl($this->assets->upload($actor, $file))];
            return new JsonResponse($result, 201, ['Cache-Control' => 'private, no-store']);
        }
        if ($request->getMethod() === 'DELETE') {
            $this->assets->delete($actor, $id);
            return new Response\EmptyResponse(204, ['Cache-Control' => 'private, no-store']);
        }
        $cursor = $query['cursor'] ?? null;
        if ($cursor !== null && !is_string($cursor)) {
            throw new ValidationException(['cursor' => '分页游标无效。']);
        }
        $result = $this->assets->listing($actor, $cursor);
        $result['assets'] = array_map(fn (array $asset): array => $this->withUrl($asset), $result['assets']);

        return new JsonResponse($result, 200, ['Cache-Control' => 'private, no-store']);
    }

    private function withUrl(array $asset): array
    {
        $asset['url'] = $this->url->to('api')->path('custom-profile/assets/'.$asset['id'].'/file');
        return $asset;
    }
}
