<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('follows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('follower_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('following_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['follower_id', 'following_id']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE follows ADD CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('follows');
    }
};
