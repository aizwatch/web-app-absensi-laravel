<?php

namespace App\Console\Commands;

use App\Services\FingerspotApiService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SyncFingerspotToday extends Command
{
    protected $signature   = 'fingerspot:sync-today';
    protected $description = 'Sync att_log hari ini dari Fingerspot API (scheduled 18:00)';

    public function handle(): int
    {
        $today   = now()->format('Y-m-d');
        $cloudIds = array_filter(array_map(
            'trim',
            explode(',', env('FINGERSPOT_CLOUD_IDS', env('FINGERSPOT_CLOUD_ID', '')))
        ));

        if (empty($cloudIds)) {
            $this->error('FINGERSPOT_CLOUD_IDS tidak terkonfigurasi.');
            return self::FAILURE;
        }

        $totalInserted  = 0;
        $totalDuplicate = 0;

        foreach ($cloudIds as $cid) {
            try {
                $rows = FingerspotApiService::fetchAttlog($today, $today, $cid);
            } catch (\Throwable $e) {
                Log::channel('webhook')->error("SYNC-TODAY-FAIL | cloud_id={$cid} err=" . $e->getMessage());
                $this->error("Gagal fetch {$cid}: " . $e->getMessage());
                continue;
            }

            foreach ($rows as $row) {
                $pin      = $row['pin']       ?? null;
                $scanDate = $row['scan_date'] ?? null;

                try {
                    DB::table('att_log')->insert([
                        'sn'         => $cid,
                        'scan_date'  => $scanDate,
                        'pin'        => (string) $pin,
                        'verifymode' => $row['verify']      ?? 1,
                        'inoutmode'  => $row['status_scan'] ?? 0,
                        'reserved'   => 0,
                        'work_code'  => 0,
                        'att_id'     => '0',
                    ]);
                    $totalInserted++;
                } catch (\Illuminate\Database\QueryException $e) {
                    if (str_contains($e->getMessage(), 'Duplicate')) {
                        $totalDuplicate++;
                        continue;
                    }
                    throw $e;
                }
            }

            Log::channel('webhook')->info("SYNC-TODAY-OK | cloud_id={$cid} date={$today} inserted={$totalInserted} dup={$totalDuplicate}");
        }

        $this->info("Sync selesai: {$totalInserted} inserted, {$totalDuplicate} duplicate.");
        return self::SUCCESS;
    }
}
