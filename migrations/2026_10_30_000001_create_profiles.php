<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema): void {
        $schema->create('cp_profiles', function (Blueprint $table): void {
            $table->unsignedInteger('user_id')->primary();
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->unsignedInteger('version')->default(1);
            $table->longText('draft');
            $table->longText('published')->nullable();
            $table->longText('previous')->nullable();
            $table->boolean('frozen')->default(false);
            $table->text('hidden_modules');
            $table->dateTime('updated_at');
        });
        $schema->create('cp_configuration', function (Blueprint $table): void {
            $table->unsignedInteger('id')->primary();
            $table->unsignedInteger('version')->default(1);
            $table->text('fields');
        });
        $schema->getConnection()->table('cp_configuration')->insert(['id' => 1, 'version' => 1,
            'fields' => json_encode(\Local\CustomProfile\Configuration::defaults(), JSON_THROW_ON_ERROR)]);
        $schema->create('cp_audit', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id')->nullable()->index();
            $table->unsignedInteger('actor_id')->nullable();
            $table->string('action', 32);
            $table->string('reason', 500);
            $table->dateTime('created_at');
        });
        $schema->create('cp_reports', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->unsignedInteger('reporter_id');
            $table->foreign('reporter_id')->references('id')->on('users')->onDelete('cascade');
            $table->string('reason', 500);
            $table->boolean('resolved')->default(false);
            $table->dateTime('created_at');
            $table->index(['reporter_id', 'created_at']);
            $table->index(['resolved', 'id']);
        });
    },
    'down' => function (Builder $schema): void {
        foreach (['cp_reports', 'cp_audit', 'cp_configuration', 'cp_profiles'] as $table) $schema->dropIfExists($table);
    },
];
