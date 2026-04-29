<?php

namespace App\Http\Controllers;

use App\Services\SettingsManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AttLogController extends Controller
{
    public function raw(Request $request)
    {
        $today  = now()->toDateString();
        $dari   = $request->query('dari', $today);
        $sampai = $request->query('sampai', $today);
        $pin    = $request->query('pin');

        $query = DB::table('att_log as a')
            ->leftJoin('pegawai as p', DB::raw('CAST(a.pin AS CHAR)'), '=', DB::raw('CAST(p.pegawai_pin AS CHAR)'))
            ->selectRaw("a.sn, DATE_FORMAT(a.scan_date,'%Y-%m-%d %H:%i:%s') AS scan_date, a.pin, p.pegawai_nama AS nama, a.verifymode, a.inoutmode, a.att_id")
            ->whereRaw('DATE(a.scan_date) BETWEEN ? AND ?', [$dari, $sampai])
            ->orderBy('a.pin')->orderBy('a.scan_date');

        if ($pin) $query->where('a.pin', $pin);

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->input('data', []);
        $pin  = $data['pin'] ?? null;
        $scanDate = $data['scan_date'] ?? null;
        $catatan  = $data['catatan'] ?? null;

        if (!$pin || !$scanDate)
            return response()->json(['success' => false, 'message' => 'pin dan scan_date wajib diisi'], 400);

        DB::table('att_log')->insert([
            'sn'         => 'MANUAL',
            'scan_date'  => $scanDate,
            'pin'        => (string)$pin,
            'verifymode' => 1,
            'inoutmode'  => 0,
            'reserved'   => 0,
            'work_code'  => 0,
            'att_id'     => '0',
        ]);

        if ($catatan && trim($catatan)) {
            $tanggal = substr($scanDate, 0, 10);
            $notes   = SettingsManager::get('scan_notes', []);
            $idx     = array_search(true, array_map(fn($n) => (string)$n['pin'] === (string)$pin && $n['tanggal'] === $tanggal, $notes));
            if ($idx !== false) $notes[$idx]['catatan'] = trim($catatan);
            else $notes[] = ['pin' => (string)$pin, 'tanggal' => $tanggal, 'catatan' => trim($catatan)];
            SettingsManager::set('scan_notes', $notes);
            SettingsManager::save();
        }

        return response()->json(['success' => true, 'message' => 'Scan berhasil ditambahkan']);
    }

    public function update(Request $request)
    {
        $data = $request->input('data', []);
        ['sn' => $sn, 'scan_date_lama' => $lama, 'pin' => $pin, 'scan_date_baru' => $baru] = $data + ['sn'=>null,'scan_date_lama'=>null,'pin'=>null,'scan_date_baru'=>null];

        if (!$sn || !$lama || !$pin || !$baru)
            return response()->json(['success' => false, 'message' => 'Data tidak lengkap'], 400);

        $affected = DB::table('att_log')
            ->where('sn', $sn)->where('scan_date', $lama)->where('pin', (string)$pin)
            ->update(['scan_date' => $baru]);

        if (!$affected)
            return response()->json(['success' => false, 'message' => 'Data tidak ditemukan'], 404);

        return response()->json(['success' => true, 'message' => 'Scan berhasil diperbarui']);
    }

    public function destroy(Request $request)
    {
        $data = $request->input('data', []);
        ['sn' => $sn, 'scan_date' => $scanDate, 'pin' => $pin] = $data + ['sn'=>null,'scan_date'=>null,'pin'=>null];

        if (!$sn || !$scanDate || !$pin)
            return response()->json(['success' => false, 'message' => 'Data tidak lengkap'], 400);

        $affected = DB::table('att_log')
            ->where('sn', $sn)->where('scan_date', $scanDate)->where('pin', (string)$pin)
            ->delete();

        if (!$affected)
            return response()->json(['success' => false, 'message' => 'Data tidak ditemukan'], 404);

        return response()->json(['success' => true, 'message' => 'Scan berhasil dihapus']);
    }
}
