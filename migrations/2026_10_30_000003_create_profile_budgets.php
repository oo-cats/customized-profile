<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema): void {
        $schema->create('cp_budgets', function (Blueprint $table): void {
            $table->unsignedInteger('user_id');
            $table->string('kind', 16);
            $table->unsignedBigInteger('window_start');
            $table->unsignedInteger('attempts');
            $table->primary(['user_id', 'kind']);
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    },
    'down' => function (Builder $schema): void {
        $schema->dropIfExists('cp_budgets');
    },
];
