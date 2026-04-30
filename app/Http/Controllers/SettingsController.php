<?php

namespace App\Http\Controllers;

use App\Services\SettingsManager;
use Illuminate\Http\Request;

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

        SettingsManager::save();
        \Log::info('Settings diperbarui oleh: ' . $request->attributes->get('auth_user')?->username);

        return response()->json(['success' => true, 'message' => 'Settings disimpan']);
    }
}
