<?php

use App\Http\Controllers\AbsensiController;
use App\Http\Controllers\AttLogController;
use App\Http\Controllers\PegawaiController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\WebhookController;
use App\Http\Controllers\SyncController;
use App\Http\Middleware\PinMiddleware;
use Illuminate\Support\Facades\Route;

// Absensi (public)
Route::prefix('absensi')->group(function () {
    Route::get('hari-ini',       [AbsensiController::class, 'hariIni']);
    Route::get('filter',         [AbsensiController::class, 'filter']);
    Route::get('karyawan/{pin}', [AbsensiController::class, 'karyawan']);
});

// Settings
Route::get('settings',  [SettingsController::class, 'index']);
Route::post('settings', [SettingsController::class, 'store']);

// Pegawai
Route::get('pegawai', [PegawaiController::class, 'index']);
Route::middleware(PinMiddleware::class)->group(function () {
    Route::post('pegawai',         [PegawaiController::class, 'store']);
    Route::put('pegawai/{pin}',    [PegawaiController::class, 'update']);
    Route::delete('pegawai/{pin}', [PegawaiController::class, 'destroy']);
});

// Att Log
Route::get('att_log/raw', [AttLogController::class, 'raw']);
Route::middleware(PinMiddleware::class)->group(function () {
    Route::post('att_log/scan',   [AttLogController::class, 'store']);
    Route::put('att_log/scan',    [AttLogController::class, 'update']);
    Route::delete('att_log/scan', [AttLogController::class, 'destroy']);
});

// Webhook — validasi via cloud_id, tidak pakai PIN
Route::post('webhook/fingerspot', [WebhookController::class, 'fingerspot']);

// Sync / Backfill
Route::get('sync/devices', [SyncController::class, 'devices']);
Route::middleware(PinMiddleware::class)->post('sync/backfill', [SyncController::class, 'backfill']);

// Departemen placeholder
Route::get('departemen', fn() => response()->json(['success' => true, 'data' => []]));
