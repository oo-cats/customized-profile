<?php

namespace Local\CustomProfile;

use Flarum\Foundation\AbstractServiceProvider;

final class ProfileServiceProvider extends AbstractServiceProvider
{
    public function register()
    {
        $this->container->singleton(ModuleRegistry::class);
        $this->container->singleton(Integrations\Acgn::class);
        $this->container->singleton(Integrations\Achievements::class);
    }
}
