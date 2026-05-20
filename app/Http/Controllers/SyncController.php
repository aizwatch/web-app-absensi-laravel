<?php

namespace App\Http\Controllers;

use App\Services\FingerspotApiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SyncController extends Controller
{
    protected function cloudIds(): array
    {
        return array_filter(array_map(
            'trim',
            explode(',', env('FINGERSPOT_CLOUD_IDS', env('FINGERSPOT_CLOUD_ID', '')))
        ));
    }

    public function devices()
    {
        return response()->json(['success' => true, 'data' => array_values($this->cloudIds())]);
    }

    public function syncToday(Request $request)
    {
        $secret = env('SYNC_SECRET_KEY');
        if ($secret && $request->header('X-Sync-Key') !== $secret) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $today         = now()->format('Y-m-d');
        $targets       = $this->cloudIds();
        $totalInserted  = 0;
        $totalDuplicate = 0;

        if (empty($targets))
            return response()->json(['success' => false, 'message' => 'Tidak ada Cloud ID terkonfigurasi'], 500);

        foreach ($targets as $cid) {
            $rows = FingerspotApiService::fetchAttlog($today, $today, $cid);

            foreach ($rows as $row) {
                try {
                    DB::table('att_log')->insert([
                        'sn'         => $cid,
                        'scan_date'  => $row['scan_date'] ?? null,
                        'pin'        => (string)($row['pin'] ?? ''),
                        'verifymode' => $row['verify']      ?? 1,
                        'inoutmode'  => $row['status_scan'] ?? 0,
                        'reserved'   => 0,
                        'work_code'  => 0,
                        'att_id'     => '0',
                    ]);
                    $totalInserted++;
                } catch (\Illuminate\Database\QueryException $e) {
                    if (str_contains($e->getMessage(), 'Duplicate')) { $totalDuplicate++; continue; }
                    throw $e;
                }
            }

            Log::channel('webhook')->info("SYNC-TODAY-OK | cloud_id={$cid} date={$today} inserted={$totalInserted} dup={$totalDuplicate}");
        }

        return response()->json([
            'success'   => true,
            'date'      => $today,
            'inserted'  => $totalInserted,
            'duplicate' => $totalDuplicate,
        ]);
    }

    public function syncSetTime(Request $request)
    {
        $targets  = $this->cloudIds();
        $timezone = $request->input('timezone', 'Asia/Jakarta');
        $token    = env('FINGERSPOT_API_TOKEN');

        if (empty($targets))
            return response()->json(['success' => false, 'message' => 'Tidak ada Cloud ID terkonfigurasi'], 500);

        $results = [];
        foreach ($targets as $cid) {
            try {
                $res = Http::withoutVerifying()
                    ->withToken($token)
                    ->post('https://developer.fingerspot.io/api/set_time', [
                        'trans_id' => (string) now()->timestamp,
                        'cloud_id' => $cid,
                        'timezone' => $timezone,
                    ]);
                $json = $res->json();
                $ok   = $json['success'] ?? false;
                Log::channel('webhook')->info("SET-TIME | cloud_id={$cid} timezone={$timezone} success=" . ($ok ? 'true' : 'false'));
                $results[] = ['cloud_id' => $cid, 'success' => $ok, 'message' => $json['message'] ?? null];
            } catch (\Throwable $e) {
                Log::channel('webhook')->error("SET-TIME-FAIL | cloud_id={$cid} err={$e->getMessage()}");
                $results[] = ['cloud_id' => $cid, 'success' => false, 'message' => $e->getMessage()];
            }
        }

        $allOk = collect($results)->every(fn($r) => $r['success']);
        return response()->json(['success' => $allOk, 'results' => $results]);
    }

    public function syncUserInfo(Request $request)
    {
        $targets  = $this->cloudIds();
        $token    = env('FINGERSPOT_API_TOKEN');

        if (empty($targets))
            return response()->json(['success' => false, 'message' => 'Tidak ada Cloud ID terkonfigurasi'], 500);

        $pegawai = DB::table('pegawai')
            ->where('pegawai_status', 1)
            ->select('pegawai_pin', 'pegawai_nama')
            ->get();

        if ($pegawai->isEmpty())
            return response()->json(['success' => false, 'message' => 'Tidak ada karyawan aktif'], 400);

        $results = [];
        foreach ($targets as $cid) {
            $sent = 0; $failed = 0;
            foreach ($pegawai as $p) {
                try {
                    $res = Http::withoutVerifying()
                        ->withToken($token)
                        ->post('https://developer.fingerspot.io/api/set_userinfo', [
                            'trans_id' => (string) now()->timestamp,
                            'cloud_id' => $cid,
                            'data'     => [
                                'pin'       => (string) $p->pegawai_pin,
                                'name'      => $p->pegawai_nama,
                                'privilege' => '0',
                                'password'  => '',
                                'rfid'      => '',
                                'template'  => '',
                            ],
                        ]);
                    $json = $res->json();
                    ($json['success'] ?? false) ? $sent++ : $failed++;
                } catch (\Throwable $e) {
                    $failed++;
                }
            }
            Log::channel('webhook')->info("SYNC-USERINFO | cloud_id={$cid} sent={$sent} failed={$failed}");
            $results[] = ['cloud_id' => $cid, 'sent' => $sent, 'failed' => $failed];
        }

        $allOk = collect($results)->every(fn($r) => $r['failed'] === 0);
        return response()->json(['success' => $allOk, 'results' => $results, 'total_karyawan' => $pegawai->count()]);
    }

    public function backfill(Request $request)
    {
        $data      = $request->input('data', []);
        $startDate = $data['start_date'] ?? null;
        $endDate   = $data['end_date'] ?? null;
        $cloudId   = $data['cloud_id'] ?? null;

        if (!$startDate || !$endDate)
            return response()->json(['success' => false, 'message' => 'start_date dan end_date wajib diisi'], 400);

        $targets = $cloudId ? [$cloudId] : $this->cloudIds();
        if (empty($targets))
            return response()->json(['success' => false, 'message' => 'Tidak ada Cloud ID terkonfigurasi'], 500);

        $totalInserted = 0;
        $totalDuplicate = 0;
        $totalFetched = 0;

        foreach ($targets as $cid) {
            $rows = FingerspotApiService::fetchAttlog($startDate, $endDate, $cid);
            $totalFetched += count($rows);

            foreach ($rows as $row) {
                $pin        = $row['pin'] ?? null;
                $scanDate   = $row['scan_date'] ?? null;
                $verify     = $row['verify'] ?? 1;
                $statusScan = $row['status_scan'] ?? 0;

                try {
                    DB::table('att_log')->insert([
                        'sn'         => $cid,
                        'scan_date'  => $scanDate,
                        'pin'        => (string)$pin,
                        'verifymode' => $verify,
                        'inoutmode'  => $statusScan,
                        'reserved'   => 0,
                        'work_code'  => 0,
                        'att_id'     => '0',
                    ]);
                    $totalInserted++;
                    Log::channel('webhook')->info("BACKFILL-OK | cloud_id={$cid} pin={$pin} scan={$scanDate}");
                } catch (\Illuminate\Database\QueryException $e) {
                    if (str_contains($e->getMessage(), 'Duplicate')) {
                        $totalDuplicate++;
                        continue;
                    }
                    throw $e;
                }
            }

            Log::info("Backfill {$cid} {$startDate}~{$endDate}: {$totalInserted} inserted");
        }

        return response()->json([
            'success'   => true,
            'inserted'  => $totalInserted,
            'duplicate' => $totalDuplicate,
            'total'     => $totalFetched,
        ]);
    }
}
