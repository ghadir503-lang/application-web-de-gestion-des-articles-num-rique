<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Category;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ArticleController extends Controller
{
    public function index(Request $request)
    {
        $query = Article::with([
            'user:id,name,email,avatar',
            'category',
            'likes.user:id,name,email,avatar',
            'likes:id,user_id,article_id',
            'views' => fn ($query) => $query
                ->select('id', 'user_id', 'article_id')
                ->whereNotNull('user_id'),
            'views.user:id,name,email,avatar',
            'comments.user:id,name,email,avatar',
            'bookmarks:id,user_id,article_id',
        ])->withCount([
            'likes',
            'comments',
            'views as views_count' => fn ($query) => $query
                ->whereNotNull('user_id')
                ->select(DB::raw('COUNT(DISTINCT user_id)')),
        ]);

        if ($request->search) {
            $query->where('title', 'LIKE', '%' . $request->search . '%');
        }

        $articles = $query->latest()->paginate(10);
        $articles->getCollection()->transform(fn ($article) => $this->decorateArticle($article, $request));

        return $articles;
    }

    public function show(Request $request, $id)
    {
        $article = Article::with([
            'user:id,name,email,avatar',
            'comments.user:id,name,email,avatar',
            'likes.user:id,name,email,avatar',
            'likes:id,user_id,article_id',
            'views' => fn ($query) => $query
                ->select('id', 'user_id', 'article_id')
                ->whereNotNull('user_id'),
            'views.user:id,name,email,avatar',
            'bookmarks:id,user_id,article_id',
        ])->withCount([
            'likes',
            'comments',
            'views as views_count' => fn ($query) => $query
                ->whereNotNull('user_id')
                ->select(DB::raw('COUNT(DISTINCT user_id)')),
        ])
          ->findOrFail($id);

        return $this->decorateArticle($article, $request);
    }

    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'media' => 'required|file|mimes:jpg,jpeg,png,webp,mp4,mov,avi,pdf|max:30720',
            'category_id' => 'nullable|exists:categories,id',
        ]);

        $categoryId = $request->category_id ?: Category::query()->value('id');

        if (!$categoryId) {
            $categoryId = Category::create(['name' => 'General'])->id;
        }

        $articleData = [
            'title' => $request->title,
            'content' => $request->content,
            'user_id' => auth()->id(),
            'category_id' => $categoryId,
        ];

        if ($request->hasFile('media')) {
            $media = $request->file('media');
            $fileName = time() . '_' . preg_replace('/\s+/', '_', $media->getClientOriginalName());
            $directory = public_path('uploads/articles');

            if (!is_dir($directory)) {
                mkdir($directory, 0777, true);
            }

            $media->move($directory, $fileName);
            $relativePath = 'uploads/articles/' . $fileName;

            if (str_starts_with((string) $media->getMimeType(), 'video/')) {
                $articleData['video'] = $relativePath;
            } else {
                $articleData['image'] = $relativePath;
            }
        }

        $article = Article::create($articleData)
            ->load([
                'user:id,name,email,avatar',
                'category',
                'likes.user:id,name,email,avatar',
                'likes:id,user_id,article_id',
                'views' => fn ($query) => $query
                    ->select('id', 'user_id', 'article_id')
                    ->whereNotNull('user_id'),
                'views.user:id,name,email,avatar',
                'comments.user:id,name,email,avatar',
                'bookmarks:id,user_id,article_id',
            ])
            ->loadCount([
                'likes',
                'comments',
                'views as views_count' => fn ($query) => $query
                    ->whereNotNull('user_id')
                    ->select(DB::raw('COUNT(DISTINCT user_id)')),
            ]);

        return response()->json($this->decorateArticle($article, $request), 201);
    }

    public function destroy($id)
    {
        $article = Article::findOrFail($id);
        $user = auth()->user();

        if ($user->role !== 'admin' && $article->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $this->deleteUploadedFile($article->image);
        $this->deleteUploadedFile($article->video);
        $article->delete();

        return response()->json(['message' => 'Article deleted']);
    }

    public function serializeArticleForUser(Article $article, ?User $authUser = null): Article
    {
        $request = request();

        if ($authUser) {
            $request->setUserResolver(fn () => $authUser);
        }

        return $this->decorateArticle($article, $request);
    }

    protected function decorateArticle(Article $article, ?Request $request = null)
    {
        $userId = $this->resolveAuthenticatedUserId($request);

        $article->image = $this->buildMediaUrl($article->image);
        $article->video = $this->buildMediaUrl($article->video);

        if ($article->relationLoaded('user') && $article->user) {
            $article->user->avatar = $this->buildMediaUrl($article->user->avatar);
        }

        if ($article->relationLoaded('comments')) {
            $article->comments->each(function ($comment) {
                if ($comment->relationLoaded('user') && $comment->user) {
                    $comment->user->avatar = $this->buildMediaUrl($comment->user->avatar);
                }
            });
        }

        if ($article->relationLoaded('likes')) {
            $article->likes->each(function ($like) {
                if ($like->relationLoaded('user') && $like->user) {
                    $like->user->avatar = $this->buildMediaUrl($like->user->avatar);
                }
            });
        }

        $viewedByUser = $userId && $article->relationLoaded('views')
            ? $article->views->contains('user_id', $userId)
            : false;

        if ($article->relationLoaded('views')) {
            $article->views->each(function ($view) {
                if ($view->relationLoaded('user') && $view->user) {
                    $view->user->avatar = $this->buildMediaUrl($view->user->avatar);
                }
            });

            $article->setRelation(
                'views',
                $article->views
                    ->filter(fn ($view) => $view->user_id && $view->relationLoaded('user') && $view->user)
                    ->unique('user_id')
                    ->map(fn ($view) => $view->user)
                    ->values()
            );
        }

        $article->setAttribute('liked_by_user', $userId ? $article->likes->contains('user_id', $userId) : false);
        $article->setAttribute('bookmarked_by_user', $userId ? $article->bookmarks->contains('user_id', $userId) : false);
        $article->setAttribute('viewed_by_user', (bool) $viewedByUser);

        return $article;
    }

    protected function resolveAuthenticatedUserId(?Request $request = null): ?int
    {
        return $request?->user('sanctum')?->id
            ?? auth('sanctum')->id()
            ?? auth()->id();
    }

    protected function buildMediaUrl($path)
    {
        if (!$path) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return url($path);
    }

    protected function deleteUploadedFile($path): void
    {
        if (!$path) {
            return;
        }

        $relativePath = preg_replace('#^https?://[^/]+/#', '', $path);
        $fullPath = public_path($relativePath);

        if ($relativePath && file_exists($fullPath)) {
            unlink($fullPath);
        }
    }
}
