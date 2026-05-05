<?php

namespace App\Http\Controllers;

use App\Services\SettingsManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class AbsensiMandiriController extends Controller
{
    private static array $TIPE_LABEL = [
        'lembur'             => 'Lembur',
        'izin'               => 'Izin',
        'meeting'            => 'Meeting',
        'setengah_hari_pagi' => 'Setengah Hari Pagi',
        'setengah_hari_siang'=> 'Setengah Hari Siang',
        'customer_visit'     => 'Customer Visit',
        'sakit'              => 'Sakit (MC)',
        'ganti_shift'        => 'Ganti Shift',
    ];

    /** POST /api/absensi-mandiri — karyawan submit request */
    public function store(Request $request)
    {
        $auth     = $request->attributes->get('auth_user');
        $pin      = $auth->pegawai_pin;

        if (! $pin) {
            return response()->json(['success' => false, 'message' => 'Akun tidak terhubung ke data karyawan'], 403);
        }

        // Verifikasi password user
        $password = $request->input('password', '');
        $pegawai  = DB::table('pegawai')->where('pegawai_pin', $pin)->first();

        if (! $pegawai) {
            return response()->json(['success' => false, 'message' => 'Data karyawan tidak ditemukan'], 404);
        }
        if (! $pegawai->password) {
            return response()->json(['success' => false, 'message' => 'Anda belum mengatur password. Ganti password dulu di ⚙️ Pengaturan Akun.'], 403);
        }
        if (! Hash::check($password, $pegawai->password)) {
            return response()->json(['success' => false, 'message' => 'Password salah, coba lagi.'], 401);
        }

        $tanggal  = $request->input('tanggal');
        $tipe     = $request->input('tipe');
        $catatan  = $request->input('catatan', '');
        $noJam    = in_array($tipe, ['setengah_hari_pagi', 'setengah_hari_siang', 'sakit', 'ganti_shift']);
        $isHalfDay = in_array($tipe, ['setengah_hari_pagi', 'setengah_hari_siang']); // keep for compat
        $jam      = $noJam ? null : $request->input('jam');

        if (! $tanggal || ! $tipe) {
            return response()->json(['success' => false, 'message' => 'Tanggal dan tipe wajib diisi'], 422);
        }
        if (! $noJam && ! $jam) {
            return response()->json(['success' => false, 'message' => 'Jam wajib diisi untuk tipe ini'], 422);
        }

        if (! array_key_exists($tipe, self::$TIPE_LABEL)) {
            return response()->json(['success' => false, 'message' => 'Tipe tidak valid'], 422);
        }

        // Upload attachment
        $attachmentPath = null;
        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            if ($file->getSize() > 5 * 1024 * 1024) {
                return response()->json(['success' => false, 'message' => 'File maksimal 5MB'], 422);
            }
            $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
            if (! in_array(strtolower($file->getClientOriginalExtension()), $allowed)) {
                return response()->json(['success' => false, 'message' => 'Format file tidak didukung (jpg/png/gif/webp/pdf)'], 422);
            }
            $attachmentPath = $file->store('attachments', 'public');
        }

        $id = DB::table('absensi_mandiri')->insertGetId([
            'pegawai_pin' => $pin,
            'tanggal'     => $tanggal,
            'jam'         => $jam,
            'tipe'        => $tipe,
            'catatan'     => $catatan ?: null,
            'attachment'  => $attachmentPath,
            'status'      => 'pending',
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Permintaan dikirim, menunggu persetujuan admin', 'id' => $id]);
    }

    /** GET /api/absensi-mandiri/mine — request milik karyawan yg login */
    public function myRequests(Request $request)
    {
        $auth = $request->attributes->get('auth_user');
        $pin  = $auth->pegawai_pin;

        if (! $pin) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $rows = DB::table('absensi_mandiri')
            ->where('pegawai_pin', $pin)
            ->orderBy('tanggal', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $this->formatRows($rows)]);
    }

    /** GET /api/absensi-mandiri — semua request (admin) */
    public function adminList(Request $request)
    {
        $status = $request->input('status', 'pending');

        $query = DB::table('absensi_mandiri')
            ->join('pegawai', 'absensi_mandiri.pegawai_pin', '=', 'pegawai.pegawai_pin')
            ->select('absensi_mandiri.*', 'pegawai.pegawai_nama as nama')
            ->orderBy('absensi_mandiri.created_at', 'desc');

        if ($status !== 'all') {
            $query->where('absensi_mandiri.status', $status);
        }

        return response()->json(['success' => true, 'data' => $this->formatRows($query->get())]);
    }

    /** POST /api/absensi-mandiri/{id}/approve */
    public function approve(Request $request, int $id)
    {
        $auth   = $request->attributes->get('auth_user');
        $row    = DB::table('absensi_mandiri')->where('id', $id)->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => 'Request tidak ditemukan'], 404);
        }
        if ($row->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Request sudah diproses'], 422);
        }

        // Terapkan efek
        $this->applyEffect($row, $auth->username);

        DB::table('absensi_mandiri')->where('id', $id)->update([
            'status'        => 'approved',
            'reviewed_by'   => $auth->username,
            'reviewed_at'   => now(),
            'review_catatan'=> $request->input('catatan'),
            'updated_at'    => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Disetujui dan diterapkan']);
    }

    /** POST /api/absensi-mandiri/{id}/reject */
    public function reject(Request $request, int $id)
    {
        $auth = $request->attributes->get('auth_user');
        $row  = DB::table('absensi_mandiri')->where('id', $id)->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => 'Request tidak ditemukan'], 404);
        }
        if ($row->status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'Request sudah diproses'], 422);
        }

        DB::table('absensi_mandiri')->where('id', $id)->update([
            'status'        => 'rejected',
            'reviewed_by'   => $auth->username,
            'reviewed_at'   => now(),
            'review_catatan'=> $request->input('catatan'),
            'updated_at'    => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Ditolak']);
    }

    /** GET /api/absensi-mandiri/{id}/attachment?token= */
    public function attachment(Request $request, int $id)
    {
        // Validasi token via query param (untuk buka di tab baru)
        $token = $request->query('token') ?: $request->bearerToken();
        if (! $token) {
            return response()->json(['success' => false, 'message' => 'Tidak terautentikasi'], 401);
        }
        $valid = DB::table('pegawai')->where('auth_token', $token)->exists()
              || \App\Models\User::where('auth_token', $token)->exists();
        if (! $valid) {
            return response()->json(['success' => false, 'message' => 'Token tidak valid'], 401);
        }

        $row = DB::table('absensi_mandiri')->where('id', $id)->first();
        if (! $row || ! $row->attachment) {
            abort(404);
        }
        if (! Storage::disk('public')->exists($row->attachment)) {
            abort(404);
        }
        return Storage::disk('public')->response($row->attachment);
    }

    // ── helpers ──

    private function applyEffect(object $row, string $approvedBy): void
    {
        $pin     = $row->pegawai_pin;
        $tanggal = $row->tanggal;
        $label   = self::$TIPE_LABEL[$row->tipe] ?? $row->tipe;
        $catatan = trim(($label . ($row->catatan ? (' — ' . $row->catatan) : '')));

        if (in_array($row->tipe, ['lembur', 'izin', 'meeting', 'customer_visit'])) {
            // Inject scan pulang ke att_log jika ada jam
            if ($row->jam) {
                DB::table('att_log')->insert([
                    'sn'        => 'MANUAL',
                    'scan_date' => $tanggal . ' ' . $row->jam,
                    'pin'       => $pin,
                    'verifymode'=> 1,
                    'inoutmode' => 2,
                ]);
            }
            // Tambah ke scan_notes
            $notes = SettingsManager::get('scan_notes', []);
            $notes = array_values(array_filter($notes,
                fn($n) => !($n['pin'] === $pin && $n['tanggal'] === $tanggal)
            ));
            $notes[] = ['pin' => $pin, 'tanggal' => $tanggal, 'catatan' => $catatan];
            SettingsManager::set('scan_notes', $notes);
            SettingsManager::save();

        } elseif ($row->tipe === 'sakit') {
            // Hanya scan_notes, tidak inject att_log
            $notes = SettingsManager::get('scan_notes', []);
            $notes = array_values(array_filter($notes,
                fn($n) => !($n['pin'] === $pin && $n['tanggal'] === $tanggal)
            ));
            $notes[] = ['pin' => $pin, 'tanggal' => $tanggal, 'catatan' => $catatan];
            SettingsManager::set('scan_notes', $notes);
            SettingsManager::save();

        } elseif ($row->tipe === 'ganti_shift') {
            $shiftId   = trim($row->catatan ?? '');

            // Static presets — embed shift_data directly (tidak bergantung settings shifts)
            $presets = [
                'setengah_pagi_preset' => [
                    'id'                  => 'setengah_pagi_preset',
                    'nama'                => 'Setengah Hari (masuk pagi)',
                    'jam_masuk'           => '08:00',
                    'batas_terlambat'     => '08:06',
                    'batas_setengah_hari' => '',
                    'jam_pulang'          => '11:00',
                    'hari_kerja'          => [1,2,3,4,5,6],
                ],
                'setengah_siang_preset' => [
                    'id'                  => 'setengah_siang_preset',
                    'nama'                => 'Setengah Hari (masuk siang)',
                    'jam_masuk'           => '10:50',
                    'batas_terlambat'     => '',
                    'batas_setengah_hari' => '',
                    'jam_pulang'          => '17:00',
                    'hari_kerja'          => [1,2,3,4,5,6],
                ],
            ];

            $shiftData = $presets[$shiftId] ?? null;
            if (!$shiftData) {
                // fallback: cari di settings
                $shifts    = SettingsManager::get('shifts', []);
                $shiftData = collect($shifts)->firstWhere('id', $shiftId);
            }

            $overrides = SettingsManager::get('daily_overrides', []);
            $entry = [
                'id'           => uniqid('am_'),
                'tanggal'      => $tanggal,
                'nama'         => 'Ganti Shift' . ($shiftData ? ' — ' . $shiftData['nama'] : ''),
                'tipe'         => 'ganti_shift',
                'shift_id'     => $shiftId,
                'jam_pulang'   => $shiftData['jam_pulang'] ?? '17:00',
                'berlaku_untuk'=> [$pin],
                'created_by'   => $approvedBy,
                'created_at'   => now()->toISOString(),
            ];
            if ($shiftData) $entry['shift_data'] = $shiftData;
            $overrides[] = $entry;
            SettingsManager::set('daily_overrides', $overrides);
            SettingsManager::save();

        } elseif ($row->tipe === 'setengah_hari_pagi') {
            // Override pulang 12:00
            $overrides   = SettingsManager::get('daily_overrides', []);
            $overrides[] = [
                'id'           => uniqid('am_'),
                'tanggal'      => $tanggal,
                'nama'         => 'Setengah Hari Pagi' . ($row->catatan ? ' — ' . $row->catatan : ''),
                'tipe'         => 'pulang_awal',
                'jam_pulang'   => '12:00',
                'berlaku_untuk'=> [$pin],
            ];
            SettingsManager::set('daily_overrides', $overrides);
            SettingsManager::save();

        } elseif ($row->tipe === 'setengah_hari_siang') {
            // Override pulang normal, catatan siang
            $overrides   = SettingsManager::get('daily_overrides', []);
            $overrides[] = [
                'id'           => uniqid('am_'),
                'tanggal'      => $tanggal,
                'nama'         => 'Setengah Hari Siang' . ($row->catatan ? ' — ' . $row->catatan : ''),
                'tipe'         => 'pulang_awal',
                'jam_pulang'   => '17:00',
                'berlaku_untuk'=> [$pin],
            ];
            SettingsManager::set('daily_overrides', $overrides);
            // Tambah scan_note juga
            $notes = SettingsManager::get('scan_notes', []);
            $notes = array_values(array_filter($notes,
                fn($n) => !($n['pin'] === $pin && $n['tanggal'] === $tanggal)
            ));
            $notes[] = ['pin' => $pin, 'tanggal' => $tanggal, 'catatan' => 'Setengah Hari Siang'];
            SettingsManager::set('scan_notes', $notes);
            SettingsManager::save();
        }
    }

    private function formatRows($rows): array
    {
        return collect($rows)->map(function ($r) {
            $arr = (array) $r;
            $arr['tipe_label']    = self::$TIPE_LABEL[$r->tipe] ?? $r->tipe;
            $arr['attachment_url'] = $r->attachment
                ? '/api/absensi-mandiri/' . $r->id . '/attachment'
                : null;
            return $arr;
        })->values()->all();
    }
}
