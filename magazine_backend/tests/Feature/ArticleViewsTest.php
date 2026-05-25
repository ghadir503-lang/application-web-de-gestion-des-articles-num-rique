<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\User;
use App\Models\View;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ArticleViewsTest extends TestCase
{
    use RefreshDatabase;

    public function test_articles_return_unique_real_viewers_and_matching_count(): void
    {
        $author = User::factory()->create();
        $viewerOne = User::factory()->create([
            'name' => 'Viewer One',
            'avatar' => 'uploads/avatars/one.jpg',
        ]);
        $viewerTwo = User::factory()->create([
            'name' => 'Viewer Two',
            'avatar' => 'uploads/avatars/two.jpg',
        ]);
        $article = Article::factory()->create(['user_id' => $author->id]);

        View::create(['article_id' => $article->id, 'user_id' => $viewerOne->id]);
        View::create(['article_id' => $article->id, 'user_id' => $viewerTwo->id]);
        View::create(['article_id' => $article->id, 'user_id' => null]);

        $this->getJson('/api/articles')
            ->assertOk()
            ->assertJsonPath('data.0.views_count', 2)
            ->assertJsonCount(2, 'data.0.views')
            ->assertJsonPath('data.0.views.0.id', $viewerOne->id)
            ->assertJsonPath('data.0.views.0.name', 'Viewer One')
            ->assertJsonPath('data.0.views.0.email', $viewerOne->email)
            ->assertJsonPath('data.0.views.1.id', $viewerTwo->id);

        $this->getJson("/api/articles/{$article->id}")
            ->assertOk()
            ->assertJsonPath('views_count', 2)
            ->assertJsonCount(2, 'views')
            ->assertJsonPath('views.0.id', $viewerOne->id)
            ->assertJsonPath('views.1.id', $viewerTwo->id);
    }

    public function test_article_view_endpoint_requires_authentication_and_records_current_viewer_once(): void
    {
        $article = Article::factory()->create();
        $viewer = User::factory()->create([
            'name' => 'Current Viewer',
            'avatar' => 'uploads/avatars/current.jpg',
        ]);

        $this->postJson("/api/articles/{$article->id}/view")
            ->assertUnauthorized();

        $this->assertDatabaseCount('views', 0);

        Sanctum::actingAs($viewer);

        $this->postJson("/api/articles/{$article->id}/view")
            ->assertOk()
            ->assertJsonPath('views_count', 1)
            ->assertJsonPath('viewer.id', $viewer->id)
            ->assertJsonPath('viewer.name', 'Current Viewer')
            ->assertJsonPath('viewer.email', $viewer->email);

        $this->postJson("/api/articles/{$article->id}/view")
            ->assertOk()
            ->assertJsonPath('views_count', 1)
            ->assertJsonPath('viewer.id', $viewer->id);

        $this->assertDatabaseCount('views', 1);
        $this->assertDatabaseHas('views', [
            'article_id' => $article->id,
            'user_id' => $viewer->id,
        ]);
    }
}
