<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PegawaiController extends Controller
{
    public function index()
    {
        // Hitung pemakaian kuota 'lupa' (approved) per pin dalam 1 query
        $lupaUsed = DB::table('absensi_mandiri')
            ->selectRaw('pegawai_pin, COUNT(*) AS used')
            ->where('tipe', 'lupa')
            ->where('status', 'approved')
            ->groupBy('pegawai_pin')
            ->pluck('used', 'pegawai_pin');
        $quota = AbsensiMandiriController::LUPA_QUOTA;

        $rows = DB::table('pegawai')
            ->selectRaw('pegawai_pin AS pin, pegawai_nama AS nama, pegawai_nip AS nip, pegawai_telp AS telp, pegawai_departemen AS departemen, pegawai_status AS status')
            ->orderBy('pegawai_nama')
            ->get()
            ->each(function ($r) use ($lupaUsed, $quota) {
                $r->foto = $this->fotoUrl((string) $r->pin);
                $r->foto_low = $r->foto ? $this->fotoLow((string) $r->pin) : false;
                $r->cutout = $this->fileUrl("cutout/{$r->pin}.png");
                $used = (int) $lupaUsed->get((string) $r->pin, 0);
                $r->sisa_lupa = max(0, $quota - $used);
            });

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
                'pegawai_id'          => $maxId,
                'pegawai_pin'         => (string)$pin,
                'pegawai_nama'        => $nama,
                'pegawai_nip'         => $data['pegawai_nip'] ?? '',
                'pegawai_telp'        => $data['pegawai_telp'] ?? '',
                'pegawai_departemen'  => $data['pegawai_departemen'] ?? null,
                'pegawai_pwd'         => '0',
                'pegawai_rfid'        => '0',
                'pegawai_privilege'   => '0',
                'pegawai_status'      => 1,
                'gender'              => 1,
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

        $exists = DB::table('pegawai')->where('pegawai_pin', $pin)->exists();
        if (!$exists)
            return response()->json(['success' => false, 'message' => 'Karyawan tidak ditemukan'], 404);

        DB::table('pegawai')->where('pegawai_pin', $pin)->update([
            'pegawai_nama'        => $data['pegawai_nama'] ?? '',
            'pegawai_nip'         => $data['pegawai_nip'] ?? '',
            'pegawai_telp'        => $data['pegawai_telp'] ?? '',
            'pegawai_departemen'  => $data['pegawai_departemen'] ?? null,
            'pegawai_status'      => $data['pegawai_status'] ?? 1,
        ]);

        return response()->json(['success' => true, 'message' => 'Karyawan berhasil diperbarui']);
    }

    public function destroy(string $pin)
    {
        $affected = DB::table('pegawai')->where('pegawai_pin', $pin)->delete();

        if (!$affected)
            return response()->json(['success' => false, 'message' => 'Karyawan tidak ditemukan'], 404);

        return response()->json(['success' => true, 'message' => 'Karyawan berhasil dihapus']);
    }

    // ── Profil & foto (karyawan sendiri atau admin) ─────────────────────────

    public function profil(Request $request, string $pin)
    {
        if ($deny = $this->deny($request, $pin)) return $deny;

        $row = DB::table('pegawai')->where('pegawai_pin', $pin)
            ->selectRaw('pegawai_nama AS nama, pegawai_nip AS nip, pegawai_departemen AS departemen, pegawai_telp AS telp, tempat_lahir, tgl_lahir, gender')
            ->first();
        if (!$row)
            return response()->json(['success' => false, 'message' => 'Karyawan tidak ditemukan'], 404);

        $row->foto     = $this->fotoUrl($pin);
        $row->foto_low = $row->foto ? $this->fotoLow($pin) : false;
        $row->foto_dim = $row->foto ? $this->fotoDim($pin) : null;
        $row->cutout   = $this->fileUrl("cutout/$pin.png");
        return response()->json(['success' => true, 'data' => $row]);
    }

    public function updateProfil(Request $request, string $pin)
    {
        if ($deny = $this->deny($request, $pin)) return $deny;

        $v = $request->validate([
            'telp'         => 'nullable|string|max:20',
            'tempat_lahir' => 'nullable|string|max:50',
            'tgl_lahir'    => 'nullable|date',
            'gender'       => 'required|in:1,2',
        ]);

        $n = DB::table('pegawai')->where('pegawai_pin', $pin)->update([
            'pegawai_telp' => $v['telp'] ?? '',
            'tempat_lahir' => $v['tempat_lahir'] ?? '',
            'tgl_lahir'    => $v['tgl_lahir'] ?? null,
            'gender'       => (int) $v['gender'],
        ]);
        // update() returns 0 for unchanged rows too, so check existence instead
        if (!$n && !DB::table('pegawai')->where('pegawai_pin', $pin)->exists())
            return response()->json(['success' => false, 'message' => 'Karyawan tidak ditemukan'], 404);

        return response()->json(['success' => true, 'message' => 'Data diri disimpan']);
    }

    public function uploadFoto(Request $request, string $pin)
    {
        if ($deny = $this->deny($request, $pin)) return $deny;

        $request->validate(['foto' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120']);
        $request->file('foto')->storeAs('foto', "$pin.jpg", 'public');

        return response()->json([
            'success' => true, 'foto' => $this->fotoUrl($pin),
            'foto_low' => $this->fotoLow($pin), 'foto_dim' => $this->fotoDim($pin),
        ]);
    }

    public function deleteFoto(Request $request, string $pin)
    {
        if ($deny = $this->deny($request, $pin)) return $deny;

        Storage::disk('public')->delete("foto/$pin.jpg");
        return response()->json(['success' => true]);
    }

    /** POST /api/pegawai/{pin}/cutout (admin) — foto tanpa background (PNG transparan) untuk ID Card */
    public function uploadCutout(Request $request, string $pin)
    {
        $request->validate(['cutout' => 'required|file|mimes:png|max:10240']);
        $request->file('cutout')->storeAs('cutout', "$pin.png", 'public');
        return response()->json(['success' => true, 'cutout' => $this->fileUrl("cutout/$pin.png")]);
    }

    public function deleteCutout(string $pin)
    {
        Storage::disk('public')->delete("cutout/$pin.png");
        return response()->json(['success' => true]);
    }

    /** GET /api/pegawai/foto/zip (admin) — semua foto asli, nama file {pin}_{nama}.jpg */
    public function exportFoto()
    {
        $disk = Storage::disk('public');
        $nama = DB::table('pegawai')->pluck('pegawai_nama', 'pegawai_pin');
        $tmp  = tempnam(sys_get_temp_dir(), 'foto');
        $zip  = new \ZipArchive();
        $zip->open($tmp, \ZipArchive::OVERWRITE);
        $n = 0;
        foreach ($nama as $pin => $nm) {
            if (!$disk->exists("foto/$pin.jpg")) continue;
            $zip->addFile($disk->path("foto/$pin.jpg"), $pin . '_' . Str::slug($nm, '_') . '.jpg');
            $n++;
        }
        if (!$n) {
            $zip->close(); @unlink($tmp);
            return response()->json(['success' => false, 'message' => 'Belum ada foto karyawan'], 404);
        }
        $zip->close();

        return response()->download($tmp, 'foto-karyawan-' . date('Ymd') . '.zip')->deleteFileAfterSend(true);
    }

    private function deny(Request $request, string $pin)
    {
        $auth = $request->attributes->get('auth_user');
        if ($auth->role === 'admin' || (string) $auth->pegawai_pin === $pin) return null;
        return response()->json(['success' => false, 'message' => 'Tidak punya akses'], 403);
    }

    private function fotoUrl(string $pin): ?string
    {
        return $this->fileUrl("foto/$pin.jpg");
    }

    private function fileUrl(string $path): ?string
    {
        $disk = Storage::disk('public');
        return $disk->exists($path) ? "/storage/$path?v=" . $disk->lastModified($path) : null;
    }

    private function fotoDim(string $pin): ?array
    {
        $d = @getimagesize(Storage::disk('public')->path("foto/$pin.jpg"));
        return $d ? ['w' => $d[0], 'h' => $d[1]] : null;
    }

    // resolusi rendah: < 600×800 px
    private function fotoLow(string $pin): bool
    {
        $d = $this->fotoDim($pin);
        return !$d || $d['w'] < 600 || $d['h'] < 800;
    }
}
