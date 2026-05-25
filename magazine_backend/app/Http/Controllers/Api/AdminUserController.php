<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;

class AdminUserController extends Controller
{
    public function index()
    {
        $users = User::query()
            ->latest()
            ->get();

        return response()->json([
            'data' => UserResource::collection($users),
        ]);
    }

    public function update(Request $request, int $id)
    {
        $admin = $request->user();
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'role' => 'sometimes|in:admin,user',
            'status' => 'sometimes|in:active,suspended',
        ]);

        if ($admin->id === $user->id) {
            if (array_key_exists('role', $validated) && $validated['role'] !== $user->role) {
                return response()->json([
                    'message' => 'You cannot change your own role.',
                ], 422);
            }

            if (array_key_exists('status', $validated) && $validated['status'] !== $user->status) {
                return response()->json([
                    'message' => 'You cannot change your own status.',
                ], 422);
            }
        }

        $user->fill($validated);
        $user->save();

        return response()->json([
            'message' => 'User updated successfully.',
            'data' => UserResource::make($user),
        ]);
    }
}
