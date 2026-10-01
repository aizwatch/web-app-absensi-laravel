<?php

namespace App\Http\Controllers;

use App\Services\SettingsManager;
use Illuminate\Http\Request;
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

        if (isset($data['daily_overrides']) && is_array($data['daily_overrides']))
            SettingsManager::set('daily_overrides', array_values(array_filter($data['daily_overrides'], fn($o) => !empty($o['tanggal']))));

        if (isset($data['scan_notes']) && is_array($data['scan_notes']))
            SettingsManager::set('scan_notes', array_values(array_filter($data['scan_notes'], fn($n) => !empty($n['pin']) && !empty($n['tanggal']))));

        if (isset($data['departments']) && is_array($data['departments']))
            SettingsManager::set('departments', array_values(array_filter($data['departments'], fn($d) => !empty(trim($d)))));

        if (isset($data['idcard']) && is_array($data['idcard'])) {
            // url design hanya diubah lewat uploadIdCard
            $cur = SettingsManager::get('idcard', []);
            SettingsManager::set('idcard', array_merge($data['idcard'], array_intersect_key($cur, ['depan' => 1, 'belakang' => 1])));
        }

        SettingsManager::save();
        \Log::info('Settings diperbarui oleh: ' . $request->attributes->get('auth_user')?->username);

        return response()->json(['success' => true, 'message' => 'Settings disimpan']);
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
