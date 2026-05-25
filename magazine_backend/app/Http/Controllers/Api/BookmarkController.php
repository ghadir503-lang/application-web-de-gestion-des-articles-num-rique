<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Bookmark;
use Illuminate\Support\Facades\DB;

class BookmarkController extends Controller
{
    public function __construct(protected ArticleController $articleController)
    {
    }

    public function toggle($articleId)
    {
        $user = auth()->user();
        Article::findOrFail($articleId);

        $bookmarkQuery = Bookmark::where('user_id', $user->id)
            ->where('article_id', $articleId)
            ->orderBy('id');
        $bookmark = $bookmarkQuery->first();

        if ($bookmark) {
            $bookmarkQuery->delete();

            return response()->json([
                'message' => 'Bookmark removed',
                'bookmarked_by_user' => false,
            ]);
        }

        Bookmark::firstOrCreate([
            'user_id' => $user->id,
            'article_id' => $articleId
        ]);

        return response()->json([
            'message' => 'Article bookmarked',
            'bookmarked_by_user' => true,
        ]);
    }

    public function myBookmarks()
    {
        $user = auth()->user();

        return Bookmark::with([
            'article.user:id,name,email,avatar',
            'article.category',
            'article.likes.user:id,name',
            'article.likes:id,user_id,article_id',
            'article.views.user:id,name',
            'article.views:id,user_id,article_id',
            'article.comments.user:id,name,email,avatar',
            'article.bookmarks:id,user_id,article_id',
        ])
            ->where('user_id', auth()->id())
            ->get()
            ->map(function (Bookmark $bookmark) use ($user) {
                if ($bookmark->relationLoaded('article') && $bookmark->article) {
                    $bookmark->setRelation(
                        'article',
                        $this->articleController->serializeArticleForUser(
                            $bookmark->article->loadCount([
                                'likes',
                                'comments',
                                'views as views_count' => fn ($query) => $query
                                    ->whereNotNull('user_id')
                                    ->select(DB::raw('COUNT(DISTINCT user_id)')),
                            ]),
                            $user
                        )
                    );
                }

                return $bookmark;
            });
    }
}
