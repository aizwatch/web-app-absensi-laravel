<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    /**
     * GET /api/auth/users
     * Daftar pengguna untuk dropdown login:
     * - Semua pegawai aktif (username = pegawai_pin)
     * - Standalone admin dari tabel users (misal 'admin')
     */
    public function listUsers()
    {
        $pegawai = DB::table('pegawai')
            ->where('pegawai_status', 1)
            ->orderBy('pegawai_nama')
            ->get(['pegawai_pin as username', 'pegawai_nama as name']);

        $admins = User::where('role', 'admin')
            ->orderBy('name')
            ->get(['username', 'name']);

        $data = $pegawai->map(fn($p) => ['username' => $p->username, 'name' => $p->name])
            ->merge($admins->map(fn($u) => ['username' => $u->username, 'name' => $u->name]))
            ->unique('username')
            ->values();

        return response()->json(['success' => true, 'data' => $data]);
    }

    /** POST /api/auth/login */
    public function login(Request $request)
    {
        $username = trim($request->input('username', ''));
        $password = $request->input('password', '');

        if (! $username) {
            return response()->json(['success' => false, 'message' => 'Username wajib diisi'], 422);
        }

        // ── Coba pegawai dulu ──
        $pegawai = DB::table('pegawai')
            ->where('pegawai_pin', $username)
            ->where('pegawai_status', 1)
            ->first();

        if ($pegawai) {
            // Kalau password belum diset → allow login (first-time, wajib ganti)
            // Kalau sudah diset → cek hash
            if ($pegawai->password && ! Hash::check($password, $pegawai->password)) {
                return response()->json(['success' => false, 'message' => 'Password salah'], 401);
            }

            $token = Str::random(60);
            DB::table('pegawai')->where('pegawai_pin', $username)->update(['auth_token' => $token]);

            return response()->json([
                'success' => true,
                'data'    => [
                    'token' => $token,
                    'user'  => $this->pegawaiPayload($pegawai, $token),
                ],
            ]);
        }

        // ── Fallback: users table (standalone admin) ──
        $user = User::where('username', $username)->first();
        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Username tidak ditemukan'], 401);
        }

        if ($user->password && ! Hash::check($password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'Password salah'], 401);
        }

        $token = Str::random(60);
        $user->auth_token = $token;
        $user->save();

        return response()->json([
            'success' => true,
            'data'    => [
                'token' => $token,
                'user'  => $this->userPayload($user),
            ],
        ]);
    }

    /** POST /api/auth/logout */
    public function logout(Request $request)
    {
        $auth = $request->attributes->get('auth_user');
        if (! $auth) return response()->json(['success' => true]);

        if ($auth->_source === 'pegawai') {
            DB::table('pegawai')->where('pegawai_pin', $auth->username)->update(['auth_token' => null]);
        } else {
            User::where('username', $auth->username)->update(['auth_token' => null]);
        }

        return response()->json(['success' => true]);
    }

    /** GET /api/auth/me */
    public function me(Request $request)
    {
        $auth = $request->attributes->get('auth_user');
        return response()->json(['success' => true, 'data' => $this->publicPayload($auth)]);
    }

    /** POST /api/auth/change-password */
    public function changePassword(Request $request)
    {
        $auth    = $request->attributes->get('auth_user');
        $pw      = $request->input('password', '');
        $confirm = $request->input('password_confirmation', '');

        if (strlen($pw) < 6) {
            return response()->json(['success' => false, 'message' => 'Password minimal 6 karakter'], 422);
        }
        if ($pw !== $confirm) {
            return response()->json(['success' => false, 'message' => 'Konfirmasi password tidak cocok'], 422);
        }

        $hashed = Hash::make($pw);

        if ($auth->_source === 'pegawai') {
            DB::table('pegawai')->where('pegawai_pin', $auth->username)->update([
                'password'             => $hashed,
                'must_change_password' => false,
            ]);
        } else {
            User::where('username', $auth->username)->update([
                'password'             => $hashed,
                'must_change_password' => false,
            ]);
        }

        return response()->json(['success' => true, 'message' => 'Password berhasil diubah']);
    }

    // ── helpers ──

    private function pegawaiPayload(object $pegawai, string $token): array
    {
        return [
            '_source'              => 'pegawai',
            'name'                 => $pegawai->pegawai_nama,
            'username'             => $pegawai->pegawai_pin,
            'role'                 => $pegawai->role ?? 'user',
            'pegawai_pin'          => $pegawai->pegawai_pin,
            'must_change_password' => (bool) $pegawai->must_change_password,
        ];
    }

    private function userPayload(User $user): array
    {
        return [
            '_source'              => 'users',
            'name'                 => $user->name,
            'username'             => $user->username,
            'role'                 => $user->role,
            'pegawai_pin'          => $user->pegawai_pin,
            'must_change_password' => $user->must_change_password,
        ];
    }

    private function publicPayload(object $auth): array
    {
        return [
            'name'                 => $auth->name,
            'username'             => $auth->username,
            'role'                 => $auth->role,
            'pegawai_pin'          => $auth->pegawai_pin,
            'must_change_password' => $auth->must_change_password,
        ];
    }
}
