<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Category;
use App\Models\Article;
use App\Models\Comment;
use App\Models\Like;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

           // Création Admin
        $admin = User::factory()->create([
            'name' => 'Admin',
            'email' => 'admin@magazine.com',
            'role' => 'admin',
        ]);

        // 10 utilisateurs
        $users = User::factory(10)->create();

        // 5 catégories
        $categories = Category::factory(5)->create();

        // 20 articles
        $articles = Article::factory(20)->make()->each(function ($article) use ($users, $categories) {
            $article->user_id = $users->random()->id;
            $article->category_id = $categories->random()->id;
            $article->save();
        });

        // 50 commentaires
        Comment::factory(50)->make()->each(function ($comment) use ($users, $articles) {
            $comment->user_id = $users->random()->id;
            $comment->article_id = $articles->random()->id;
            $comment->save();
        });

        // 50 likes (sans doublons)
        foreach ($articles as $article) {
            $users->random(3)->each(function ($user) use ($article) {
                Like::firstOrCreate([
                    'user_id' => $user->id,
                    'article_id' => $article->id,
                ]);
            });
        }
    }
}
