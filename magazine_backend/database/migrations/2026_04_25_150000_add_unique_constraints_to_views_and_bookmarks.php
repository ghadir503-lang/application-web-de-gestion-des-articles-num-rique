<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $bookmarkGroups = DB::table('bookmarks')
            ->selectRaw('MIN(id) as keep_id, user_id, article_id, COUNT(*) as duplicates_count')
            ->groupBy('user_id', 'article_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($bookmarkGroups as $group) {
            DB::table('bookmarks')
                ->where('user_id', $group->user_id)
                ->where('article_id', $group->article_id)
                ->where('id', '!=', $group->keep_id)
                ->delete();
        }

        $viewGroups = DB::table('views')
            ->whereNotNull('user_id')
            ->selectRaw('MIN(id) as keep_id, user_id, article_id, COUNT(*) as duplicates_count')
            ->groupBy('user_id', 'article_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($viewGroups as $group) {
            DB::table('views')
                ->where('user_id', $group->user_id)
                ->where('article_id', $group->article_id)
                ->where('id', '!=', $group->keep_id)
                ->delete();
        }

        Schema::table('bookmarks', function (Blueprint $table) {
            $table->unique(['user_id', 'article_id']);
        });

        Schema::table('views', function (Blueprint $table) {
            $table->unique(['user_id', 'article_id']);
        });
    }

    public function down(): void
    {
        Schema::table('views', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'article_id']);
        });

        Schema::table('bookmarks', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'article_id']);
        });
    }
};
