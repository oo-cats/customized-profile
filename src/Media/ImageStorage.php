<?php

declare(strict_types=1);

namespace Local\CustomProfile\Media;

use Flarum\Foundation\Paths;
use Flarum\Foundation\ValidationException;
use Psr\Http\Message\UploadedFileInterface;

/** Stores only bounded, re-encoded static images outside the public directory. */
final class ImageStorage
{
    public const INPUT_BYTES = 5 * 1024 * 1024;
    public const OUTPUT_BYTES = 1024 * 1024;
    public const MAX_EDGE = 4096;
    public const MAX_PIXELS = 12000000;

    private string $root;

    public function __construct(Paths $paths)
    {
        $this->root = $paths->storage.'/custom-profile';
    }

    public function path(string $id): string
    {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) {
            throw new \InvalidArgumentException('Invalid profile asset identifier.');
        }

        return $this->root.'/'.substr($id, 0, 2).'/'.substr($id, 2, 2).'/'.$id.'.webp';
    }

    /** @return array{bytes:int,width:int,height:int,mime:string} */
    public function receive(UploadedFileInterface $file, string $id): array
    {
        $destination = $this->path($id);
        if ($file->getError() !== UPLOAD_ERR_OK) {
            self::invalid('上传未完成，请检查文件大小及请求限制。');
        }
        if (is_file($destination)) {
            throw new \RuntimeException('Profile asset identifier already exists.');
        }
        $directory = dirname($destination);
        if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new \RuntimeException('Cannot create profile image storage.');
        }

        $nonce = bin2hex(random_bytes(8));
        $input = $destination.'.'.$nonce.'.input';
        $output = $destination.'.'.$nonce.'.part';
        $handle = null;
        $image = null;
        try {
            $handle = @fopen($input, 'xb');
            if ($handle === false) {
                throw new \RuntimeException('Cannot create private image input.');
            }
            $stream = $file->getStream();
            $bytes = 0;
            while (!$stream->eof()) {
                $chunk = $stream->read(65536);
                $bytes += strlen($chunk);
                if ($bytes > self::INPUT_BYTES) {
                    self::invalid('图片文件最多 5 MiB。');
                }
                if ($chunk === '' && !$stream->eof()) {
                    self::invalid('上传数据不完整。');
                }
                if (@fwrite($handle, $chunk) !== strlen($chunk)) {
                    throw new \RuntimeException('Cannot write private image input.');
                }
            }
            fclose($handle);
            $handle = null;
            if ($bytes === 0) {
                self::invalid('不能上传空图片。');
            }

            $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($input);
            if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
                self::invalid('仅支持静态 JPEG、PNG 和 WebP 图片。');
            }
            $dimensions = @getimagesize($input);
            if (!$dimensions || ($dimensions['mime'] ?? '') !== $mime) {
                self::invalid('图片内容和格式不匹配。');
            }
            [$width, $height] = $dimensions;
            if ($width < 1 || $height < 1 || $width > self::MAX_EDGE || $height > self::MAX_EDGE
                || $width * $height > self::MAX_PIXELS) {
                self::invalid('图片单边最多 4096 像素，总像素最多 1200 万。');
            }
            $this->assertStatic($input, $mime);
            $image = match ($mime) {
                'image/jpeg' => @imagecreatefromjpeg($input),
                'image/png' => @imagecreatefrompng($input),
                'image/webp' => @imagecreatefromwebp($input),
            };
            if (!$image instanceof \GdImage) {
                self::invalid('无法解码图片。');
            }

            // Each attempt starts from the decoded source, never a previous lossy encoding.
            $encoded = null;
            foreach ([[1920, 82], [1440, 72], [1080, 62]] as [$edge, $quality]) {
                $scale = min(1, $edge / max($width, $height));
                $targetWidth = max(1, (int) floor($width * $scale));
                $targetHeight = max(1, (int) floor($height * $scale));
                $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
                if (!$canvas) {
                    throw new \RuntimeException('Cannot allocate profile image.');
                }
                try {
                    imagealphablending($canvas, false);
                    imagesavealpha($canvas, true);
                    imagefilledrectangle($canvas, 0, 0, $targetWidth - 1, $targetHeight - 1, imagecolorallocatealpha($canvas, 0, 0, 0, 127));
                    if (!imagecopyresampled($canvas, $image, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height)) {
                        throw new \RuntimeException('Cannot resize profile image.');
                    }
                    ob_start();
                    try {
                        $success = @imagewebp($canvas, null, $quality);
                        $candidate = ob_get_contents();
                    } finally {
                        ob_end_clean();
                    }
                    if (!$success || !is_string($candidate) || $candidate === '') {
                        throw new \RuntimeException('Cannot encode profile image.');
                    }
                    $info = @getimagesizefromstring($candidate);
                    if (!$info || ($info['mime'] ?? '') !== 'image/webp' || $info[0] !== $targetWidth || $info[1] !== $targetHeight) {
                        throw new \RuntimeException('Profile image output failed validation.');
                    }
                    if (strlen($candidate) <= self::OUTPUT_BYTES) {
                        $encoded = $candidate;
                        break;
                    }
                } finally {
                    imagedestroy($canvas);
                }
            }
            if ($encoded === null) {
                self::invalid('图片转换后仍超过大小限制，请缩小图片后重试。');
            }
            if (@file_put_contents($output, $encoded, LOCK_EX) !== strlen($encoded) || !@rename($output, $destination)) {
                throw new \RuntimeException('Cannot publish profile image.');
            }

            return ['bytes' => strlen($encoded), 'width' => $targetWidth, 'height' => $targetHeight, 'mime' => 'image/webp'];
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
            if ($image instanceof \GdImage) {
                imagedestroy($image);
            }
            foreach ([$input, $output] as $temporary) {
                if (is_file($temporary)) {
                    @unlink($temporary);
                }
            }
        }
    }

    public function remove(string $id): void
    {
        $path = $this->path($id);
        if (is_file($path) && !@unlink($path)) {
            throw new \RuntimeException('Cannot remove profile image; retry deletion.');
        }
    }

    private function assertStatic(string $input, string $mime): void
    {
        if ($mime === 'image/jpeg') {
            return;
        }
        $bytes = @file_get_contents($input);
        if ($bytes === false || strlen($bytes) > self::INPUT_BYTES) {
            self::invalid('无法读取图片。');
        }
        $length = strlen($bytes);
        if ($mime === 'image/png') {
            $offset = 8;
            while ($offset + 12 <= $length) {
                $size = unpack('N', substr($bytes, $offset, 4))[1];
                $type = substr($bytes, $offset + 4, 4);
                if ($size > $length - $offset - 12) {
                    self::invalid('PNG 文件结构不完整。');
                }
                if (in_array($type, ['acTL', 'fcTL', 'fdAT'], true)) {
                    self::invalid('个人资料暂不支持动态 PNG。');
                }
                $offset += 12 + $size;
                if ($type === 'IEND') {
                    if ($size !== 0 || $offset !== $length) {
                        self::invalid('PNG 文件结构无效。');
                    }
                    return;
                }
            }
            self::invalid('PNG 文件结构不完整。');
        }

        if ($length < 12 || substr($bytes, 0, 4) !== 'RIFF' || substr($bytes, 8, 4) !== 'WEBP'
            || unpack('V', substr($bytes, 4, 4))[1] !== $length - 8) {
            self::invalid('WebP 文件结构无效。');
        }
        $offset = 12;
        while ($offset + 8 <= $length) {
            $type = substr($bytes, $offset, 4);
            $size = unpack('V', substr($bytes, $offset + 4, 4))[1];
            if ($size > $length - $offset - 8) {
                self::invalid('WebP 文件结构不完整。');
            }
            if (in_array($type, ['ANIM', 'ANMF'], true) || ($type === 'VP8X' && $size > 0 && (ord($bytes[$offset + 8]) & 2))) {
                self::invalid('个人资料暂不支持动态 WebP。');
            }
            $offset += 8 + $size + ($size % 2);
        }
        if ($offset !== $length) {
            self::invalid('WebP 文件结构无效。');
        }
    }

    private static function invalid(string $message): never
    {
        throw new ValidationException(['file' => $message]);
    }
}
