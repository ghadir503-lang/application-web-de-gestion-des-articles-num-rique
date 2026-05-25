<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ArticleController;
use App\Http\Controllers\Api\CommentController;
use App\Http\Controllers\Api\LikeController;
use App\Http\Controllers\Api\ViewController;
use App\Http\Controllers\Api\BookmarkController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\AdminUserController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);

Route::get('/articles', [ArticleController::class, 'index']);
Route::get('/articles/{id}', [ArticleController::class, 'show']);
Route::get('/profiles/{id}', [ProfileController::class, 'show']);
Route::get('/profiles/{id}/likes', [ProfileController::class, 'likedBy']);
Route::get('/profiles/{id}/views', [ProfileController::class, 'viewedBy']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
});

Route::middleware(['auth:sanctum', 'active_user'])->group(function () {
    Route::patch('/me', [AuthController::class, 'updateProfile']);
    Route::post('/profiles/{id}/follow', [ProfileController::class, 'follow']);
    Route::delete('/profiles/{id}/follow', [ProfileController::class, 'unfollow']);

    Route::post('/articles', [ArticleController::class, 'store']);
    Route::delete('/articles/{id}', [ArticleController::class, 'destroy']);

    Route::post('/comments', [CommentController::class, 'store']);
    Route::delete('/comments/{id}', [CommentController::class, 'destroy']);

    Route::post('/articles/{id}/like', [LikeController::class, 'toggle']);
    Route::post('/articles/{id}/view', [ViewController::class, 'store']);
    Route::post('/articles/{id}/bookmark', [BookmarkController::class, 'toggle']);

    Route::get('/my-bookmarks', [BookmarkController::class, 'myBookmarks']);
});

Route::middleware(['auth:sanctum', 'active_user', 'admin'])->group(function () {
    Route::get('/admin/users', [AdminUserController::class, 'index']);
    Route::patch('/admin/users/{id}', [AdminUserController::class, 'update']);
});
