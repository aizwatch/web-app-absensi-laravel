<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->unique()->after('id');
            $table->string('role')->default('user')->after('username'); // admin | user
            $table->string('pegawai_pin')->nullable()->after('role');
            $table->boolean('must_change_password')->default(true)->after('pegawai_pin');
            $table->string('auth_token', 80)->nullable()->after('must_change_password');
            $table->string('email')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['username', 'role', 'pegawai_pin', 'must_change_password', 'auth_token']);
            $table->string('email')->nullable(false)->change();
        });
    }
};
