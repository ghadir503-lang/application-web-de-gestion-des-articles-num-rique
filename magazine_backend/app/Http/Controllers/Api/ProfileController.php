<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Follow;
use App\Models\Like;
use App\Models\User;
use App\Models\View;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfileController extends Controller
{
    public function show(Request $request, int $id)
    {
        $profile = User::query()
            ->select('users.*')
            ->selectSub(
                Article::query()
                    ->selectRaw('COUNT(*)')
                    ->whereColumn('articles.user_id', 'users.id'),
                'posts_count'
            )
            ->selectSub(
                Like::query()
                    ->join('articles', 'articles.id', '=', 'likes.article_id')
                    ->selectRaw('COUNT(DISTINCT likes.user_id)')
                    ->whereColumn('articles.user_id', 'users.id'),
                'likes_count'
            )
            ->selectSub(
                View::query()
                    ->join('articles', 'articles.id', '=', 'views.article_id')
                    ->selectRaw('COUNT(DISTINCT views.user_id)')
                    ->whereNotNull('views.user_id')
                    ->whereColumn('articles.user_id', 'users.id'),
                'views_count'
            )
            ->findOrFail($id);

        $authUser = $request->user('sanctum');

        return response()->json([
            'data' => $this->serializeProfile($profile, $authUser),
        ]);
    }

    public function likedBy(int $id)
    {
        User::findOrFail($id);

        $users = User::query()
            ->select('users.id', 'users.name', 'users.email', 'users.avatar')
            ->join('likes', 'likes.user_id', '=', 'users.id')
            ->join('articles', 'articles.id', '=', 'likes.article_id')
            ->where('articles.user_id', $id)
            ->distinct()
            ->orderBy('users.name')
            ->get()
            ->map(fn (User $user) => $this->serializeInteractionUser($user))
            ->values();

        return response()->json([
            'data' => $users,
        ]);
    }

    public function viewedBy(int $id)
    {
        User::findOrFail($id);

        $users = User::query()
            ->select('users.id', 'users.name', 'users.email', 'users.avatar')
            ->join('views', 'views.user_id', '=', 'users.id')
            ->join('articles', 'articles.id', '=', 'views.article_id')
            ->where('articles.user_id', $id)
            ->whereNotNull('views.user_id')
            ->distinct()
            ->orderBy('users.name')
            ->get()
            ->map(fn (User $user) => $this->serializeInteractionUser($user))
            ->values();

        return response()->json([
            'data' => $users,
        ]);
    }

    public function follow(Request $request, int $id)
    {
        $user = $request->user();
        $target = User::findOrFail($id);

        if ($user->id === $target->id) {
            return response()->json([
                'message' => 'You cannot follow yourself.',
                'errors' => [
                    'id' => ['You cannot follow yourself.'],
                ],
            ], 422);
        }

        DB::transaction(function () use ($user, $target) {
            $inserted = Follow::query()->insertOrIgnore([
                'follower_id' => $user->id,
                'following_id' => $target->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($inserted) {
                User::whereKey($user->id)->increment('following_count');
                User::whereKey($target->id)->increment('followers_count');
            }
        });

        return response()->json([
            'data' => $this->serializeFollowState($target->fresh(), $user),
        ]);
    }

    public function unfollow(Request $request, int $id)
    {
        $user = $request->user();
        $target = User::findOrFail($id);

        if ($user->id === $target->id) {
            return response()->json([
                'message' => 'You cannot unfollow yourself.',
                'errors' => [
                    'id' => ['You cannot unfollow yourself.'],
                ],
            ], 422);
        }

        DB::transaction(function () use ($user, $target) {
            $deleted = Follow::query()
                ->where('follower_id', $user->id)
                ->where('following_id', $target->id)
                ->delete();

            if ($deleted) {
                User::whereKey($user->id)->decrement('following_count');
                User::whereKey($target->id)->decrement('followers_count');
            }
        });

        return response()->json([
            'data' => $this->serializeFollowState($target->fresh(), $user),
        ]);
    }

    protected function serializeProfile(User $profile, ?User $authUser): array
    {
        return [
            'id' => $profile->id,
            'name' => $profile->name,
            'email' => $profile->email,
            'avatar' => $this->buildMediaUrl($profile->avatar),
            'bio' => $profile->bio,
            'followers_count' => (int) ($profile->followers_count ?? 0),
            'following_count' => (int) ($profile->following_count ?? 0),
            'posts_count' => (int) ($profile->posts_count ?? 0),
            'likes_count' => (int) ($profile->likes_count ?? 0),
            'views_count' => (int) ($profile->views_count ?? 0),
            'is_following' => $this->isFollowing($profile, $authUser),
        ];
    }

    protected function serializeFollowState(User $profile, ?User $authUser): array
    {
        return [
            'profile_id' => $profile->id,
            'is_following' => $this->isFollowing($profile, $authUser),
            'followers_count' => (int) ($profile->followers_count ?? 0),
            'following_count' => (int) ($profile->following_count ?? 0),
        ];
    }

    protected function isFollowing(User $profile, ?User $authUser): bool
    {
        if (! $authUser || $authUser->id === $profile->id) {
            return false;
        }

        return $authUser->following()
            ->where('following_id', $profile->id)
            ->exists();
    }

    protected function serializeInteractionUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'avatar' => $this->buildMediaUrl($user->avatar),
        ];
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
