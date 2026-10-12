<?php

namespace App\Http\Controllers;

use App\Services\SettingsManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SettingsController extends Controller
{
    public function index()
    {
        return response()->json(['success' => true, 'data' => SettingsManager::public()]);
    }

    public function store(Request $request)
    {
        $data = $request->input('data', []);

        if (!empty($data['ist_window_dari']))   SettingsManager::set('ist_window_dari', $data['ist_window_dari']);
        if (!empty($data['ist_window_sampai'])) SettingsManager::set('ist_window_sampai', $data['ist_window_sampai']);

        if (!empty($data['shifts']) && is_array($data['shifts'])) {
            $valid = array_filter($data['shifts'], fn($s) => !empty($s['id']) && !empty($s['nama']));
            if ($valid) SettingsManager::set('shifts', array_values($valid));
        }

        if (isset($data['employee_shifts']) && is_array($data['employee_shifts']))
            SettingsManager::set('employee_shifts', $data['employee_shifts']);

        if (isset($data['holidays']) && is_array($data['holidays']))
            SettingsManager::set('holidays', array_values(array_filter($data['holidays'], fn($h) => !empty($h['tanggal']))));

        if (isset($data['daily_overrides']) && is_array($data['daily_overrides'])) {
            $new = array_values(array_filter($data['daily_overrides'], fn($o) => !empty($o['tanggal'])));
            SettingsManager::set('daily_overrides', $this->syncPulangAwalScans($new));
        }

        if (isset($data['scan_notes']) && is_array($data['scan_notes']))
            SettingsManager::set('scan_notes', array_values(array_filter($data['scan_notes'], fn($n) => !empty($n['pin']) && !empty($n['tanggal']))));

        if (isset($data['departments']) && is_array($data['departments']))
            SettingsManager::set('departments', array_values(array_filter($data['departments'], fn($d) => !empty(trim($d)))));

        // Ganti nama departemen → ikut perbarui karyawan yang memakai nama lama
        foreach ((array) ($data['department_renames'] ?? []) as $r) {
            $from = trim((string) ($r['from'] ?? ''));
            $to   = trim((string) ($r['to'] ?? ''));
            if ($from !== '' && $to !== '' && $from !== $to)
                DB::table('pegawai')->where('pegawai_departemen', $from)->update(['pegawai_departemen' => $to]);
        }

        if (isset($data['idcard']) && is_array($data['idcard'])) {
            // url design hanya diubah lewat uploadIdCard
            $cur = SettingsManager::get('idcard', []);
            SettingsManager::set('idcard', array_merge($data['idcard'], array_intersect_key($cur, ['depan' => 1, 'belakang' => 1])));
        }

        SettingsManager::save();
        \Log::info('Settings diperbarui oleh: ' . $request->attributes->get('auth_user')?->username);

        return response()->json(['success' => true, 'message' => 'Settings disimpan']);
    }

    /**
     * Override pulang_awal baru → inject scan MANUAL di jam_pulang untuk karyawan yang hadir
     * tapi scan terakhirnya lebih awal (supaya Odoo menerima jam itu). Override dihapus → scan dihapus.
     * ponytail: inject hanya saat override disimpan; yang scan setelahnya tidak ikut (hapus & buat ulang override).
     */
    private function syncPulangAwalScans(array $new): array
    {
        $old    = collect(SettingsManager::get('daily_overrides', []))->keyBy('id');
        $newIds = array_column($new, 'id');

        foreach ($old as $id => $o) {
            if (in_array($id, $newIds, true) || empty($o['injected_pins'])) continue;
            DB::table('att_log')->where('sn', 'MANUAL')->whereIn('pin', $o['injected_pins'])
                ->where('scan_date', "{$o['tanggal']} {$o['jam_pulang']}:00")->delete();
        }

        foreach ($new as &$o) {
            $id = $o['id'] ?? '';
            if ($old->has($id)) {
                if (isset($old[$id]['injected_pins'])) $o['injected_pins'] = $old[$id]['injected_pins'];
                continue;
            }
            // am_* = override dari absensi mandiri (setengah hari), bukan untuk inject
            if (($o['tipe'] ?? '') !== 'pulang_awal' || empty($o['jam_pulang']) || str_starts_with($id, 'am_')) continue;

            $at = "{$o['tanggal']} {$o['jam_pulang']}:00";
            $q  = DB::table('att_log')->whereRaw('DATE(scan_date) = ?', [$o['tanggal']]);
            if (is_array($o['berlaku_untuk'] ?? null)) $q->whereIn('pin', array_map('strval', $o['berlaku_untuk']));
            $pins = $q->groupBy('pin')->havingRaw('MAX(scan_date) < ?', [$at])->pluck('pin')->map(fn($p) => (string) $p)->all();

            DB::table('att_log')->insertOrIgnore(array_map(fn($pin) => [
                'sn' => 'MANUAL', 'scan_date' => $at, 'pin' => $pin,
                'verifymode' => 1, 'inoutmode' => 0, 'reserved' => 0, 'work_code' => 0, 'att_id' => '0',
            ], $pins));
            $o['injected_pins'] = $pins;
        }

        return $new;
    }

    /** POST /api/settings/idcard/{side} (admin) — design ID card depan/belakang */
    public function uploadIdCard(Request $request, string $side)
    {
        $request->validate(['design' => 'required|image|mimes:jpg,jpeg,png|max:10240']);
        $ext  = $request->file('design')->extension() === 'png' ? 'png' : 'jpg';
        $disk = Storage::disk('public');
        $disk->delete(["idcard/$side.png", "idcard/$side.jpg"]);
        $path = $request->file('design')->storeAs('idcard', "$side.$ext", 'public');

        $idcard = SettingsManager::get('idcard', []);
        $idcard[$side] = "/storage/$path?v=" . $disk->lastModified($path);
        SettingsManager::set('idcard', $idcard);
        SettingsManager::save();

        return response()->json(['success' => true, 'url' => $idcard[$side]]);
    }
}
