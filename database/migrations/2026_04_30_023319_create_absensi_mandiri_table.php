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
        Schema::create('absensi_mandiri', function (Blueprint $table) {
            $table->id();
            $table->string('pegawai_pin', 20);
            $table->date('tanggal');
            $table->time('jam')->nullable(); // null untuk setengah_hari_pagi/siang
            $table->enum('tipe', ['lembur', 'izin', 'meeting', 'setengah_hari_pagi', 'setengah_hari_siang']);
            $table->text('catatan')->nullable();
            $table->string('attachment', 255)->nullable();   // path relatif dari storage/app/public
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->string('reviewed_by', 100)->nullable();  // username reviewer
            $table->datetime('reviewed_at')->nullable();
            $table->text('review_catatan')->nullable();
            $table->timestamps();

            $table->index(['pegawai_pin', 'tanggal']);
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('absensi_mandiri');
    }
};
