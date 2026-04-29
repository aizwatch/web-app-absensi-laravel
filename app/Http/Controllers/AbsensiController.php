<?php

namespace App\Http\Controllers;

use App\Services\AbsensiService;
use Illuminate\Http\Request;

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
}
