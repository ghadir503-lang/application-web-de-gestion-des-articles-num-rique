<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'bio')) {
                $table->text('bio')->nullable()->after('avatar');
            }

            if (! Schema::hasColumn('users', 'followers_count')) {
                $table->unsignedBigInteger('followers_count')->default(0)->after('bio');
            }

            if (! Schema::hasColumn('users', 'following_count')) {
                $table->unsignedBigInteger('following_count')->default(0)->after('followers_count');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'following_count')) {
                $table->dropColumn('following_count');
            }

            if (Schema::hasColumn('users', 'followers_count')) {
                $table->dropColumn('followers_count');
            }

            if (Schema::hasColumn('users', 'bio')) {
                $table->dropColumn('bio');
            }
        });
    }
};
