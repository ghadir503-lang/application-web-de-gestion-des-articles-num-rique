<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\Like;
use App\Models\User;
use App\Models\View;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileSocialFeaturesTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_follow_and_unfollow_another_user(): void
    {
        $follower = User::factory()->create();
        $target = User::factory()->create();

        Sanctum::actingAs($follower);

        $this->postJson("/api/profiles/{$target->id}/follow")
            ->assertOk()
            ->assertJsonPath('data.profile_id', $target->id)
            ->assertJsonPath('data.is_following', true)
            ->assertJsonPath('data.followers_count', 1)
            ->assertJsonPath('data.following_count', 0);

        $this->assertDatabaseHas('follows', [
            'follower_id' => $follower->id,
            'following_id' => $target->id,
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $follower->id,
            'following_count' => 1,
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'followers_count' => 1,
        ]);

        $this->deleteJson("/api/profiles/{$target->id}/follow")
            ->assertOk()
            ->assertJsonPath('data.is_following', false)
            ->assertJsonPath('data.followers_count', 0)
            ->assertJsonPath('data.following_count', 0);

        $this->assertDatabaseMissing('follows', [
            'follower_id' => $follower->id,
            'following_id' => $target->id,
        ]);
    }

    public function test_follow_is_idempotent_and_does_not_duplicate_counts(): void
    {
        $follower = User::factory()->create();
        $target = User::factory()->create();

        Sanctum::actingAs($follower);

        $this->postJson("/api/profiles/{$target->id}/follow")->assertOk();
        $this->postJson("/api/profiles/{$target->id}/follow")
            ->assertOk()
            ->assertJsonPath('data.is_following', true)
            ->assertJsonPath('data.followers_count', 1)
            ->assertJsonPath('data.following_count', 0);

        $this->assertDatabaseCount('follows', 1);
        $this->assertDatabaseHas('users', [
            'id' => $follower->id,
            'following_count' => 1,
        ]);
        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'followers_count' => 1,
        ]);
    }

    public function test_user_cannot_follow_themselves(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/profiles/{$user->id}/follow")
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot follow yourself.');

        $this->assertDatabaseCount('follows', 0);
    }

    public function test_patch_me_persists_bio(): void
    {
        $user = User::factory()->create([
            'bio' => null,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson('/api/me', [
            'bio' => 'Backend-persisted bio',
            'name' => 'Updated Name',
        ])->assertOk()
            ->assertJsonPath('user.bio', 'Backend-persisted bio')
            ->assertJsonPath('user.name', 'Updated Name');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'bio' => 'Backend-persisted bio',
            'name' => 'Updated Name',
        ]);
    }

    public function test_profile_details_are_available_even_without_posts(): void
    {
        $viewer = User::factory()->create();
        $profile = User::factory()->create([
            'bio' => 'No posts yet',
            'followers_count' => 1,
            'following_count' => 2,
        ]);

        Sanctum::actingAs($viewer);

        $this->getJson("/api/profiles/{$profile->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $profile->id)
            ->assertJsonPath('data.bio', 'No posts yet')
            ->assertJsonPath('data.posts_count', 0)
            ->assertJsonPath('data.likes_count', 0)
            ->assertJsonPath('data.views_count', 0)
            ->assertJsonPath('data.followers_count', 1)
            ->assertJsonPath('data.following_count', 2)
            ->assertJsonPath('data.is_following', false);
    }

    public function test_profile_details_include_aggregate_post_metrics_and_follow_state(): void
    {
        $viewer = User::factory()->create();
        $profile = User::factory()->create([
            'bio' => 'Writer bio',
        ]);
        $liker = User::factory()->create();

        $articleOne = Article::factory()->create(['user_id' => $profile->id]);
        $articleTwo = Article::factory()->create(['user_id' => $profile->id]);

        Like::factory()->create(['article_id' => $articleOne->id, 'user_id' => $viewer->id]);
        Like::factory()->create(['article_id' => $articleTwo->id, 'user_id' => $liker->id]);
        View::create(['article_id' => $articleOne->id, 'user_id' => $viewer->id]);
        View::create(['article_id' => $articleOne->id, 'user_id' => $liker->id]);
        View::create(['article_id' => $articleTwo->id, 'user_id' => null]);

        Sanctum::actingAs($viewer);
        $this->postJson("/api/profiles/{$profile->id}/follow")->assertOk();

        $this->getJson("/api/profiles/{$profile->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $profile->id)
            ->assertJsonPath('data.posts_count', 2)
            ->assertJsonPath('data.likes_count', 2)
            ->assertJsonPath('data.views_count', 2)
            ->assertJsonPath('data.is_following', true)
            ->assertJsonPath('data.followers_count', 1)
            ->assertJsonPath('data.following_count', 0);
    }

    public function test_profile_details_count_unique_users_for_likes_and_views(): void
    {
        $viewer = User::factory()->create();
        $profile = User::factory()->create();

        $articleOne = Article::factory()->create(['user_id' => $profile->id]);
        $articleTwo = Article::factory()->create(['user_id' => $profile->id]);

        Like::factory()->create(['article_id' => $articleOne->id, 'user_id' => $viewer->id]);
        Like::factory()->create(['article_id' => $articleTwo->id, 'user_id' => $viewer->id]);

        View::create(['article_id' => $articleOne->id, 'user_id' => $viewer->id]);
        View::create(['article_id' => $articleTwo->id, 'user_id' => $viewer->id]);
        View::create(['article_id' => $articleTwo->id, 'user_id' => null]);

        Sanctum::actingAs($viewer);

        $this->getJson("/api/profiles/{$profile->id}")
            ->assertOk()
            ->assertJsonPath('data.likes_count', 1)
            ->assertJsonPath('data.views_count', 1);
    }

    public function test_profile_like_and_view_details_return_unique_users_only(): void
    {
        $viewer = User::factory()->create(['name' => 'Viewer']);
        $liker = User::factory()->create(['name' => 'Liker']);
        $profile = User::factory()->create();

        $articleOne = Article::factory()->create(['user_id' => $profile->id]);
        $articleTwo = Article::factory()->create(['user_id' => $profile->id]);

        Like::factory()->create(['article_id' => $articleOne->id, 'user_id' => $viewer->id]);
        Like::factory()->create(['article_id' => $articleTwo->id, 'user_id' => $viewer->id]);
        Like::factory()->create(['article_id' => $articleTwo->id, 'user_id' => $liker->id]);

        View::create(['article_id' => $articleOne->id, 'user_id' => $viewer->id]);
        View::create(['article_id' => $articleTwo->id, 'user_id' => $viewer->id]);
        View::create(['article_id' => $articleTwo->id, 'user_id' => null]);

        $this->getJson("/api/profiles/{$profile->id}/likes")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Liker')
            ->assertJsonPath('data.1.name', 'Viewer');

        $this->getJson("/api/profiles/{$profile->id}/views")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Viewer');
    }

    public function test_profile_view_details_include_real_users_even_when_named_you(): void
    {
        $profile = User::factory()->create();
        $viewerNamedYou = User::factory()->create(['name' => 'You']);
        $viewer = User::factory()->create(['name' => 'Viewer']);

        $article = Article::factory()->create(['user_id' => $profile->id]);

        View::create(['article_id' => $article->id, 'user_id' => $viewerNamedYou->id]);
        View::create(['article_id' => $article->id, 'user_id' => $viewer->id]);

        $this->getJson("/api/profiles/{$profile->id}/views")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Viewer')
            ->assertJsonPath('data.1.name', 'You');
    }
}
