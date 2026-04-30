<?php

use App\Http\Controllers\AbsensiController;
use App\Http\Controllers\AttLogController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PegawaiController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\WebhookController;
use App\Http\Controllers\SyncController;
use App\Http\Middleware\AuthMiddleware;
use Illuminate\Support\Facades\Route;

// ── Auth ──
Route::prefix('auth')->group(function () {
    Route::get('users',            [AuthController::class, 'listUsers']);
    Route::post('login',           [AuthController::class, 'login']);
    Route::middleware(AuthMiddleware::class)->group(function () {
        Route::get('me',                [AuthController::class, 'me']);
        Route::post('logout',           [AuthController::class, 'logout']);
        Route::post('change-password',  [AuthController::class, 'changePassword']);
    });
});

// ── Absensi (public) ──
Route::prefix('absensi')->group(function () {
    Route::get('hari-ini',       [AbsensiController::class, 'hariIni']);
    Route::get('filter',         [AbsensiController::class, 'filter']);
    Route::get('karyawan/{pin}', [AbsensiController::class, 'karyawan']);
});

// ── Settings ──
Route::get('settings', [SettingsController::class, 'index']);
Route::middleware([AuthMiddleware::class . ':admin'])->post('settings', [SettingsController::class, 'store']);

// ── Pegawai ──
Route::get('pegawai', [PegawaiController::class, 'index']);
Route::middleware([AuthMiddleware::class . ':admin'])->group(function () {
    Route::post('pegawai',         [PegawaiController::class, 'store']);
    Route::put('pegawai/{pin}',    [PegawaiController::class, 'update']);
    Route::delete('pegawai/{pin}', [PegawaiController::class, 'destroy']);
});

// ── Att Log ──
Route::get('att_log/raw', [AttLogController::class, 'raw']);
Route::middleware([AuthMiddleware::class . ':admin'])->group(function () {
    Route::post('att_log/scan',   [AttLogController::class, 'store']);
    Route::put('att_log/scan',    [AttLogController::class, 'update']);
    Route::delete('att_log/scan', [AttLogController::class, 'destroy']);
});

// ── Webhook — validasi via cloud_id, tidak butuh auth ──
Route::post('webhook/fingerspot', [WebhookController::class, 'fingerspot']);

// ── Sync / Backfill ──
Route::get('sync/devices', [SyncController::class, 'devices']);
Route::middleware([AuthMiddleware::class . ':admin'])->post('sync/backfill', [SyncController::class, 'backfill']);

// ── Departemen placeholder ──
Route::get('departemen', fn() => response()->json(['success' => true, 'data' => []]));
