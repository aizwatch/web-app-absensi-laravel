<?php

namespace App\Http\Controllers;

use App\Services\AbsensiService;
use App\Services\SettingsManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AbsensiController extends Controller
{
    public function hariIni()
    {
        $data = AbsensiService::getAttLogGroupedToday();
        return response()->json(['success' => true, 'data' => $data, 'total' => count($data)]);
    }

    public function filter(Request $request)
    {
        $today  = now()->toDateString();
        $dari   = $request->query('tanggal_dari', $today);
        $sampai = $request->query('tanggal_sampai', $today);
        $data   = AbsensiService::getAttLogGrouped($dari, $sampai);
        return response()->json(['success' => true, 'data' => $data, 'total' => count($data)]);
    }

    public function karyawan(Request $request, string $pin)
    {
        $bulan        = $request->query('bulan', now()->format('Y-m'));
        [$year, $month] = explode('-', $bulan);
        $dari         = "{$bulan}-01";
        $sampai       = date('Y-m-t', mktime(0, 0, 0, (int)$month, 1, (int)$year));
        $data         = AbsensiService::getAttLogGrouped($dari, $sampai);
        $filtered     = array_values(array_filter($data, fn($r) => (string)$r['pin'] === (string)$pin));
        return response()->json(['success' => true, 'data' => $filtered, 'bulan' => $bulan]);
    }

    public function bermasalah(Request $request)
    {
        $bulan          = $request->query('bulan', now()->format('Y-m'));
        [$year, $month] = explode('-', $bulan);
        $dari           = "{$bulan}-01";
        $sampai         = date('Y-m-t', mktime(0, 0, 0, (int)$month, 1, (int)$year));

        $allRows    = AbsensiService::getAttLogGrouped($dari, $sampai);
        $settings   = SettingsManager::all();
        $holidays   = collect($settings['holidays'] ?? [])->pluck('tanggal')->flip()->all();
        $activePins = DB::table('pegawai')->where('pegawai_status', 1)
            ->pluck('pegawai_pin')->map(fn($p) => (string)$p)->flip()->all();

        $problems = [];
        foreach ($allRows as $row) {
            $pin = (string)$row['pin'];
            if (!isset($activePins[$pin])) continue;
            if ($row['catatan']) continue;

            $tanggal = $row['tanggal'];
            if (isset($holidays[$tanggal])) continue;

            $shiftId   = $settings['employee_shifts'][$pin] ?? 'normal';
            $shift     = collect($settings['shifts'])->firstWhere('id', $shiftId) ?? $settings['shifts'][0] ?? null;
            $hariKerja = $shift['hari_kerja'] ?? [1, 2, 3, 4, 5, 6];
            $dow       = (int)date('w', strtotime($tanggal));
            if (!in_array($dow, $hariKerja)) continue;

            $isScanTunggal = $row['scan_masuk']
                && !$row['scan_pulang']
                && !$row['scan_istirahat1']
                && !$row['scan_istirahat2'];

            $hasIstWindow = $row['has_ist_window'] ?? false;
            $istCount     = ($row['scan_istirahat1'] ? 1 : 0) + ($row['scan_istirahat2'] ? 1 : 0);
            $isIstTunggal = $hasIstWindow && $row['scan_masuk'] && $istCount === 1;

            if (!$isScanTunggal && !$isIstTunggal) continue;

            if (!isset($problems[$pin])) {
                $problems[$pin] = [
                    'pin'          => $pin,
                    'nama'         => $row['nama'],
                    'shift_nama'   => $row['shift_nama'],
                    'scan_tunggal' => [],
                    'ist_tunggal'  => [],
                ];
            }
            if ($isScanTunggal) {
                $jamPulang = ($row['jam_pulang_efektif'] ?? '17:00') . ':00';
                $jamScan   = $row['scan_masuk'];
                $istDari   = isset($shift['ist_window_dari'])   ? $shift['ist_window_dari']   . ':00' : null;
                $istSampai = isset($shift['ist_window_sampai']) ? $shift['ist_window_sampai'] . ':00' : null;
                if ($istDari && $istSampai && $jamScan >= $istDari && $jamScan <= $istSampai) {
                    $jenis = 'ist_only';
                } elseif ($jamScan >= $jamPulang) {
                    $jenis = 'pulang_only';
                } else {
                    $jenis = 'masuk_only';
                }
                $problems[$pin]['scan_tunggal'][] = [
                    'tanggal' => $tanggal,
                    'jam'     => $jamScan,
                    'jenis'   => $jenis,
                ];
            }
            if ($isIstTunggal) {
                $problems[$pin]['ist_tunggal'][] = [
                    'tanggal'    => $tanggal,
                    'ist_keluar' => $row['scan_istirahat1'],
                    'ist_masuk'  => $row['scan_istirahat2'],
                ];
            }
        }

        usort($problems, fn($a, $b) => strcmp($a['nama'] ?? '', $b['nama'] ?? ''));
        return response()->json(['success' => true, 'data' => array_values($problems), 'bulan' => $bulan]);
    }
}
