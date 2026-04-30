<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Admin awal — login pertama dengan password kosong, wajib ganti saat masuk
        if (! User::where('username', 'admin')->exists()) {
            User::create([
                'name'                 => 'Administrator',
                'username'             => 'admin',
                'email'                => null,
                'password'             => null,
                'role'                 => 'admin',
                'pegawai_pin'          => null,
                'must_change_password' => true,
            ]);
        }
    }
}
