<?php

namespace App\Http\Controllers;

use App\Services\FingerspotApiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
