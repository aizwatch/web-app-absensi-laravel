<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuthMiddleware
{
    public function handle(Request $request, Closure $next, string $role = null): mixed
    {
        $token = $request->bearerToken();

        if (! $token) {
            return response()->json(['success' => false, 'message' => 'Tidak terautentikasi'], 401);
        }

        // ── Cek pegawai dulu ──
        $pegawai = DB::table('pegawai')->where('auth_token', $token)->first();

        if ($pegawai) {
            $auth = (object) [
                '_source'              => 'pegawai',
                'name'                 => $pegawai->pegawai_nama,
                'username'             => $pegawai->pegawai_pin,
                'role'                 => $pegawai->role ?? 'user',
                'pegawai_pin'          => $pegawai->pegawai_pin,
                'must_change_password' => (bool) $pegawai->must_change_password,
            ];
            if ($role === 'admin' && $auth->role !== 'admin') {
                return response()->json(['success' => false, 'message' => 'Akses ditolak — hanya admin'], 403);
            }
            $request->attributes->set('auth_user', $auth);
            return $next($request);
        }

        // ── Fallback: users table (standalone admin) ──
        $user = User::where('auth_token', $token)->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Token tidak valid atau sudah logout'], 401);
        }

        if ($role === 'admin' && $user->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Akses ditolak — hanya admin'], 403);
        }

        $auth = (object) [
            '_source'              => 'users',
            'name'                 => $user->name,
            'username'             => $user->username,
            'role'                 => $user->role,
            'pegawai_pin'          => $user->pegawai_pin,
            'must_change_password' => $user->must_change_password,
        ];
        $request->attributes->set('auth_user', $auth);

        return $next($request);
    }
}
