<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE absensi_mandiri MODIFY COLUMN tipe ENUM('lembur','izin','meeting','setengah_hari_pagi','setengah_hari_siang','customer_visit','sakit','ganti_shift') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE absensi_mandiri MODIFY COLUMN tipe ENUM('lembur','izin','meeting','setengah_hari_pagi','setengah_hari_siang') NOT NULL");
    }
};
