<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:6'
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => bcrypt($request->password),
            'role' => 'user'
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->serializeUser($user),
        ]);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        try {
            $user = User::where('email', $request->email)->first();
        } catch (QueryException $exception) {
            return response()->json([
                'message' => 'Database connection error. Please verify your database configuration.',
            ], 503);
        }

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (($user->status ?? 'active') === 'suspended') {
            return response()->json(['message' => 'Your account has been suspended.'], 403);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'role' => $user->role,
            'user' => $this->serializeUser($user),
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $status = Password::sendResetLink([
            'email' => $request->email,
        ]);

        if ($status !== Password::RESET_LINK_SENT) {
            return response()->json([
                'message' => __($status),
            ], 422);
        }

        return response()->json([
            'message' => 'Password reset link sent successfully.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|min:6|confirmed',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => __($status),
            ], 422);
        }

        return response()->json([
            'message' => 'Password reset successfully.',
        ]);
    }

    public function showResetPasswordForm(Request $request, string $token)
    {
        return view('auth.reset-password', [
            'token' => $token,
            'email' => $request->query('email', ''),
            'apiUrl' => url('/api/reset-password'),
        ]);
    }

    public function updateProfile(Request $request)
    {
        $avatarRules = ['sometimes', 'nullable'];

        if ($request->hasFile('avatar')) {
            $avatarRules[] = 'image';
            $avatarRules[] = 'mimes:jpg,jpeg,png,webp';
            $avatarRules[] = 'max:5120';
        } else {
            $avatarRules[] = 'string';
            $avatarRules[] = 'max:2048';
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'bio' => 'sometimes|nullable|string|max:2000',
            'avatar' => $avatarRules,
        ]);

        $user = $request->user();

        if ($request->has('name')) {
            $user->name = $validated['name'];
        }

        if ($request->has('bio')) {
            $user->bio = $validated['bio'];
        }

        if ($request->hasFile('avatar')) {
            $avatar = $request->file('avatar');
            $fileName = time() . '_' . preg_replace('/\s+/', '_', $avatar->getClientOriginalName());
            $directory = public_path('uploads/avatars');

            if (!is_dir($directory)) {
                mkdir($directory, 0777, true);
            }

            $avatar->move($directory, $fileName);

            if ($user->avatar) {
                $this->deleteUploadedFile($user->avatar);
            }

            $user->avatar = url('uploads/avatars/' . $fileName);
        } elseif ($request->has('avatar')) {
            if ($user->avatar) {
                $this->deleteUploadedFile($user->avatar);
            }

            $user->avatar = $validated['avatar'] ?: null;
        }

        $user->save();

        return response()->json([
            'message' => 'Profile updated',
            'user' => $this->serializeUser($user),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->tokens()->delete();
        return response()->json(['message' => 'Logged out']);
    }

    protected function serializeUser(User $user): array
    {
        return UserResource::make($user)->resolve();
    }

    protected function deleteUploadedFile(?string $path): void
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
