<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Like;
use Illuminate\Http\Request;

class LikeController extends Controller
{
    public function toggle(Request $request, $articleId)
    {
        $user = auth()->user();
        $article = Article::findOrFail($articleId);

        $like = Like::where('user_id', $user->id)
                    ->where('article_id', $articleId)
                    ->first();

        if ($like) {
            $like->delete();

            return response()->json([
                'message' => 'Unliked',
                'liked_by_user' => false,
                'likes_count' => $article->likes()->count(),
            ]);
        }

        Like::firstOrCreate([
            'user_id' => $user->id,
            'article_id' => $articleId
        ]);

        return response()->json([
            'message' => 'Liked',
            'liked_by_user' => true,
            'likes_count' => $article->likes()->count(),
        ]);
    }
}
