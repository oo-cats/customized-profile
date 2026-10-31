<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema): void {
        $schema->create('cp_assets', function (Blueprint $table): void {
            $table->char('id', 32)->primary();
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('bytes');
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->string('status', 16)->default('active');
            $table->dateTime('created_at');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->index(['user_id', 'id']);
        });
    },
    'down' => function (Builder $schema): void {
        $schema->dropIfExists('cp_assets');
    },
];
