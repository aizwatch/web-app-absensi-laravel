<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PegawaiController extends Controller
{
    public function index()
    {
        $rows = DB::table('pegawai')
            ->selectRaw('pegawai_pin AS pin, pegawai_nama AS nama, pegawai_nip AS nip, pegawai_telp AS telp, pegawai_status AS status')
            ->orderBy('pegawai_nama')
            ->get();

        return response()->json(['success' => true, 'data' => $rows]);
    }

    public function store(Request $request)
    {
        $data = $request->input('data', []);
        $pin  = $data['pegawai_pin'] ?? null;
        $nama = $data['pegawai_nama'] ?? null;

        if (!$pin || !$nama)
            return response()->json(['success' => false, 'message' => 'PIN dan Nama wajib diisi'], 400);

        $maxId = (DB::table('pegawai')->max('pegawai_id') ?? 0) + 1;

        try {
            DB::table('pegawai')->insert([
                'pegawai_id'        => $maxId,
                'pegawai_pin'       => (string)$pin,
                'pegawai_nama'      => $nama,
                'pegawai_nip'       => $data['pegawai_nip'] ?? '',
                'pegawai_telp'      => $data['pegawai_telp'] ?? '',
                'pegawai_pwd'       => '0',
                'pegawai_rfid'      => '0',
                'pegawai_privilege' => '0',
                'pegawai_status'    => 1,
                'gender'            => 1,
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                return response()->json(['success' => false, 'message' => 'PIN sudah digunakan karyawan lain'], 400);
            }
            throw $e;
        }

        return response()->json(['success' => true, 'message' => 'Karyawan berhasil ditambahkan', 'id' => $maxId]);
    }

    public function update(Request $request, string $pin)
    {
        $data = $request->input('data', []);

        $affected = DB::table('pegawai')->where('pegawai_pin', $pin)->update([
            'pegawai_nama'   => $data['pegawai_nama'] ?? '',
            'pegawai_nip'    => $data['pegawai_nip'] ?? '',
            'pegawai_telp'   => $data['pegawai_telp'] ?? '',
            'pegawai_status' => $data['pegawai_status'] ?? 1,
        ]);

        if (!$affected)
            return response()->json(['success' => false, 'message' => 'Karyawan tidak ditemukan'], 404);

        return response()->json(['success' => true, 'message' => 'Karyawan berhasil diperbarui']);
    }

    public function destroy(string $pin)
    {
        $affected = DB::table('pegawai')->where('pegawai_pin', $pin)->delete();

        if (!$affected)
            return response()->json(['success' => false, 'message' => 'Karyawan tidak ditemukan'], 404);

        return response()->json(['success' => true, 'message' => 'Karyawan berhasil dihapus']);
    }
}
