<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\View;
use Illuminate\Http\Request;

class ViewController extends Controller
{
    public function store(Request $request, $articleId)
    {
        $user = $request->user();
        $userId = $user?->id;
        $article = Article::findOrFail($articleId);

        if (! $userId) {
            return response()->json([
                'message' => 'Unauthenticated',
            ], 401);
        }

        View::firstOrCreate([
            'user_id' => $userId,
            'article_id' => $articleId,
        ]);

        return response()->json([
            'message' => 'View recorded',
            'viewed_by_user' => true,
            'views_count' => $article->views()->whereNotNull('user_id')->count(),
            'viewer' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $this->buildMediaUrl($user->avatar),
            ],
        ]);
    }

    protected function buildMediaUrl(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return url($path);
    }
}
