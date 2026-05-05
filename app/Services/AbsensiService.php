<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class AbsensiService
{
    public static function getAttLogGrouped(string $dari, string $sampai): array
    {
        $rows = DB::select("
            SELECT
                DATE_FORMAT(DATE(a.scan_date), '%Y-%m-%d') AS tanggal,
                a.pin,
                p.pegawai_nama AS nama,
                DATE_FORMAT(a.scan_date, '%H:%i:%s') AS jam
            FROM att_log a
            LEFT JOIN pegawai p ON CAST(a.pin AS CHAR) = CAST(p.pegawai_pin AS CHAR)
            WHERE DATE(a.scan_date) BETWEEN ? AND ?
            ORDER BY a.pin, a.scan_date ASC
        ", [$dari, $sampai]);

        // Group per pin+tanggal
        $map = [];
        foreach ($rows as $row) {
            $key = "{$row->tanggal}|{$row->pin}";
            if (!isset($map[$key])) {
                $map[$key] = ['tanggal' => $row->tanggal, 'pin' => $row->pin, 'nama' => $row->nama, 'scans' => []];
            }
            $map[$key]['scans'][] = $row->jam;
        }

        $settings  = SettingsManager::all();

        $result = [];
        foreach ($map as ['tanggal' => $tanggal, 'pin' => $pin, 'nama' => $nama, 'scans' => $scans]) {
            $override = self::getActiveOverride($pin, $tanggal, $settings);

            // Tentukan shift
            if ($override && ($override['tipe'] ?? '') === 'ganti_shift' && !empty($override['shift_id'])) {
                $shiftId  = $override['shift_id'];
                // Cek shift_data embedded (preset statis) sebelum lookup ke settings
                $shift    = $override['shift_data']
                            ?? collect($settings['shifts'])->firstWhere('id', $shiftId)
                            ?? $settings['shifts'][0]
                            ?? null;
                $jamPulang = $shift['jam_pulang'] ?? '17:00';
            } else {
                $shiftId  = $settings['employee_shifts'][(string)$pin] ?? 'normal';
                $shift    = collect($settings['shifts'])->firstWhere('id', $shiftId) ?? $settings['shifts'][0] ?? null;
                $jamPulang = $override ? ($override['jam_pulang'] ?? ($shift['jam_pulang'] ?? '17:00')) : ($shift['jam_pulang'] ?? '17:00');
            }

            $istDari   = isset($shift['ist_window_dari'])   ? $shift['ist_window_dari']   . ':00' : null;
            $istSampai = isset($shift['ist_window_sampai']) ? $shift['ist_window_sampai'] . ':00' : null;

            // Klasifikasi scan
            $scanMasuk = $scans[0] ?? null;
            $restScans = array_slice($scans, 1);
            $lastScan  = end($restScans) ?: null;

            if ($istDari && $istSampai) {
                $lastIsPulang = $lastScan && $lastScan > $istSampai;
                $scanPulang   = $lastIsPulang ? $lastScan : null;
                $forIst       = $lastIsPulang ? array_slice($restScans, 0, -1) : $restScans;
                $istScans     = array_values(array_filter($forIst, fn($t) => $t >= $istDari && $t <= $istSampai));
            } else {
                $scanPulang = $lastScan ?: null;
                $istScans   = [];
            }
            $scanIstirahat1 = $istScans[0] ?? null;
            $scanIstirahat2 = $istScans[1] ?? null;

            $durasiIstirahat = null;
            if ($scanIstirahat1 && $scanIstirahat2) {
                $toMin = fn($t) => (int)explode(':', $t)[0] * 60 + (int)explode(':', $t)[1] + ((int)explode(':', $t)[2] ?? 0) / 60;
                $durasiIstirahat = (int)round($toMin($scanIstirahat2) - $toMin($scanIstirahat1));
            }

            $noteEntry = collect($settings['scan_notes'] ?? [])->first(
                fn($n) => (string)$n['pin'] === (string)$pin && $n['tanggal'] === $tanggal
            );

            $result[] = [
                'tanggal'          => $tanggal,
                'pin'              => $pin,
                'nama'             => $nama,
                'scan_masuk'       => $scanMasuk,
                'scan_istirahat1'  => $scanIstirahat1,
                'scan_istirahat2'  => $scanIstirahat2,
                'scan_pulang'      => $scanPulang,
                'durasi_istirahat' => $durasiIstirahat,
                'shift_id'         => $shiftId,
                'shift_nama'       => $shift['nama'] ?? $shiftId,
                'jam_pulang_efektif' => $jamPulang,
                'override'         => $override ? [
                    'nama'       => $override['nama'] ?? null,
                    'tipe'       => $override['tipe'] ?? null,
                    'jam_pulang' => $override['jam_pulang'] ?? null,
                ] : null,
                'catatan' => $noteEntry['catatan'] ?? null,
            ];
        }

        // Tambah virtual rows dari scan_notes yang tidak punya att_log (misal: izin tanpa scan)
        $existingKeys = array_flip(array_map(fn($r) => "{$r['tanggal']}|{$r['pin']}", $result));
        foreach ($settings['scan_notes'] ?? [] as $note) {
            $pin     = (string)($note['pin']     ?? '');
            $tanggal = $note['tanggal'] ?? '';
            if (! $pin || ! $tanggal) continue;
            if ($tanggal < $dari || $tanggal > $sampai) continue;
            if (isset($existingKeys["{$tanggal}|{$pin}"])) continue; // sudah ada dari att_log

            $pegawai = DB::table('pegawai')->where('pegawai_pin', $pin)->first();
            $shiftId = $settings['employee_shifts'][(string)$pin] ?? 'normal';
            $shift   = collect($settings['shifts'])->firstWhere('id', $shiftId) ?? $settings['shifts'][0] ?? null;

            $result[] = [
                'tanggal'          => $tanggal,
                'pin'              => $pin,
                'nama'             => $pegawai?->pegawai_nama ?? $pin,
                'scan_masuk'       => null,
                'scan_istirahat1'  => null,
                'scan_istirahat2'  => null,
                'scan_pulang'      => null,
                'durasi_istirahat' => null,
                'shift_id'         => $shiftId,
                'shift_nama'       => $shift['nama'] ?? $shiftId,
                'jam_pulang_efektif' => $shift['jam_pulang'] ?? '17:00',
                'override'         => null,
                'catatan'          => $note['catatan'] ?? null,
            ];
        }

        usort($result, fn($a, $b) => strcmp($a['nama'] ?? '', $b['nama'] ?? '') ?: strcmp($a['tanggal'], $b['tanggal']));

        return $result;
    }

    public static function getAttLogGroupedToday(): array
    {
        $today = now()->toDateString();
        return self::getAttLogGrouped($today, $today);
    }

    public static function getActiveOverride(string $pin, string $tanggal, array $settings): ?array
    {
        foreach ($settings['daily_overrides'] ?? [] as $o) {
            if (($o['tipe'] ?? '') === 'absen_inject') continue;
            if (($o['tanggal'] ?? '') !== $tanggal) continue;
            if (($o['berlaku_untuk'] ?? '') === 'semua') return $o;
            if (is_array($o['berlaku_untuk'] ?? null) && in_array((string)$pin, $o['berlaku_untuk'])) return $o;
        }
        return null;
    }
}
