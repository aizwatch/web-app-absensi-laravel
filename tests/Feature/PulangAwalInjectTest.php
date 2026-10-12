<?php

namespace Tests\Feature;

use App\Http\Controllers\SettingsController;
use App\Services\SettingsManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PulangAwalInjectTest extends TestCase
{
    public function test_pulang_awal_injects_and_removes_manual_scans(): void
    {
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');
        Schema::create('att_log', function ($t) {
            $t->string('sn'); $t->dateTime('scan_date'); $t->string('pin');
            $t->integer('verifymode'); $t->integer('inoutmode'); $t->integer('reserved'); $t->integer('work_code'); $t->string('att_id');
            $t->unique(['sn', 'scan_date', 'pin']);
        });
        $row = fn($pin, $at) => ['sn' => 'X', 'scan_date' => $at, 'pin' => $pin, 'verifymode' => 1, 'inoutmode' => 0, 'reserved' => 0, 'work_code' => 0, 'att_id' => '0'];
        DB::table('att_log')->insert([
            $row('1', '2026-10-12 07:52:00'), $row('1', '2026-10-12 16:43:00'), // pulang awal → inject
            $row('2', '2026-10-12 17:05:00'),                                   // sudah ≥ 17:00 → skip
            $row('3', '2026-10-11 16:00:00'),                                   // tanggal lain → skip
        ]);

        $sync = fn(array $new) => (new \ReflectionMethod(SettingsController::class, 'syncPulangAwalScans'))
            ->invoke(new SettingsController, $new);
        $ov = ['id' => 'ov-1', 'tanggal' => '2026-10-12', 'tipe' => 'pulang_awal', 'jam_pulang' => '17:00', 'berlaku_untuk' => 'semua'];
        $manual = fn() => DB::table('att_log')->where('sn', 'MANUAL')->pluck('pin')->all();

        SettingsManager::set('daily_overrides', []);
        $saved = $sync([$ov]);
        $this->assertSame(['1'], $saved[0]['injected_pins']);
        $this->assertSame(['1'], $manual());

        SettingsManager::set('daily_overrides', $saved);
        $this->assertSame(['1'], $sync([$ov])[0]['injected_pins']); // existing: carried over, no re-inject
        $this->assertSame(['1'], $manual());

        $this->assertSame([], $sync([]));                            // removed → scan deleted
        $this->assertSame([], $manual());
    }
}
