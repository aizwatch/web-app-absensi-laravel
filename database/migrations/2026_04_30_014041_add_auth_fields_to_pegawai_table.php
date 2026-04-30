<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('pegawai', function (Blueprint $table) {
            $table->text('password')->nullable()->after('pegawai_telp');
            $table->string('auth_token', 80)->nullable()->after('password');
            $table->boolean('must_change_password')->default(true)->after('auth_token');
            $table->string('role', 20)->default('user')->after('must_change_password');
        });
    }

    public function down(): void
    {
        Schema::table('pegawai', function (Blueprint $table) {
            $table->dropColumn(['password', 'auth_token', 'must_change_password', 'role']);
        });
    }
};
