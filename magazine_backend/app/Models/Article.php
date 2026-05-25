<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use App\Models\User;
use App\Models\Category;
use App\Models\Comment;
use App\Models\Like;
use Illuminate\Database\Eloquent\Model;

class Article extends Model
{
      use HasFactory;
    //
    protected $fillable = [
        'title',
         'content',
         'image',
          'video',
          'user_id',
           'category_id'
            
        ];
     public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function category()
{
    return $this->belongsTo(Category::class);
}

public function comments()
{
    return $this->hasMany(Comment::class);
}

 public function likes()
    {
        return $this->hasMany(Like::class);
    }

    public function views()
{
    return $this->hasMany(View::class);
}

    public function bookmarks()
{
    return $this->hasMany(Bookmark::class);
}
}

