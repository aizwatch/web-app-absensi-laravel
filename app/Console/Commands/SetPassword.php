<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SetPassword extends Command
{
    protected $signature   = 'user:set-password {identifier} {password} {--pegawai : identifier adalah pegawai_pin, bukan username users}';
    protected $description = 'Set/reset password user (tabel users atau pegawai) dari CLI tanpa quote nested';

    public function handle(): int
    {
        $identifier = $this->argument('identifier');
        $password   = $this->argument('password');

        if ($this->option('pegawai')) {
            $affected = DB::table('pegawai')
                ->where('pegawai_pin', $identifier)
                ->update(['password' => Hash::make($password)]);

            if (! $affected) {
                $this->error("pegawai_pin '{$identifier}' tidak ditemukan.");
                return self::FAILURE;
            }

            $this->info("Password pegawai '{$identifier}' berhasil diupdate.");
            return self::SUCCESS;
        }

        $user = User::where('username', $identifier)->first();
        if (! $user) {
            $this->error("username '{$identifier}' tidak ditemukan di tabel users.");
            return self::FAILURE;
        }

        $user->password = $password; // cast 'hashed' otomatis bcrypt
        $user->save();

        $this->info("Password user '{$identifier}' berhasil diupdate.");
        return self::SUCCESS;
    }
}
