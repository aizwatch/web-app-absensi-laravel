<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    protected static array $verifyMap = [
        'finger' => 1, 'card' => 2, 'face' => 3, 'pin' => 4,
    ];

    protected static array $inoutMap = [
        'scan in' => 1, 'scan out' => 2, 'break out' => 3, 'break in' => 4,
    ];

    protected function cloudIds(): array
    {
        return array_filter(array_map(
            'trim',
            explode(',', env('FINGERSPOT_CLOUD_IDS', env('FINGERSPOT_CLOUD_ID', '')))
        ));
    }

    protected function logWebhook(string $status, array $payload, string $note = ''): void
    {
        $data = $payload['data'] ?? [];
        Log::channel('webhook')->info(sprintf(
            '%s | cloud_id=%s type=%s pin=%s scan=%s verify=%s status_scan=%s%s',
            $status,
            $payload['cloud_id'] ?? '-',
            $payload['type'] ?? '-',
            $data['pin'] ?? '-',
            $data['scan'] ?? '-',
            $data['verify'] ?? '-',
            $data['status_scan'] ?? '-',
            $note ? ' | ' . $note : ''
        ));
    }

    public function fingerspot(Request $request)
    {
        $type     = $request->input('type');
        $cloudId  = $request->input('cloud_id');
        $data     = $request->input('data');
        $payload  = $request->all();

        if (!$type || !$cloudId || !$data) {
            $this->logWebhook('INVALID', $payload, 'payload tidak lengkap');
            return response()->json(['success' => false, 'message' => 'Payload tidak valid'], 400);
        }

        if (!in_array($cloudId, $this->cloudIds())) {
            $this->logWebhook('REJECTED', $payload, 'cloud_id tidak dikenal');
            return response()->json(['success' => false, 'message' => 'Cloud ID tidak dikenal'], 401);
        }

        if ($type !== 'attlog') {
            $this->logWebhook('IGNORED', $payload, "type '{$type}' diabaikan");
            return response()->json(['success' => true, 'message' => "Type '{$type}' diabaikan"]);
        }

        $pin        = $data['pin'] ?? null;
        $scan       = $data['scan'] ?? null;
        $verify     = strtolower($data['verify'] ?? '');
        $statusScan = strtolower($data['status_scan'] ?? '');

        if (!$pin || !$scan) {
            return response()->json(['success' => false, 'message' => 'Field pin dan scan wajib ada'], 400);
        }

        $verifymode = self::$verifyMap[$verify] ?? 1;
        $inoutmode  = self::$inoutMap[$statusScan] ?? 0;

        try {
            DB::table('att_log')->insert([
                'sn'         => $cloudId,
                'scan_date'  => $scan,
                'pin'        => (string)$pin,
                'verifymode' => $verifymode,
                'inoutmode'  => $inoutmode,
                'reserved'   => 0,
                'work_code'  => 0,
                'att_id'     => '0',
            ]);

            $this->logWebhook('OK', $payload);
            return response()->json(['success' => true, 'message' => 'Data absensi diterima']);
        } catch (\Illuminate\Database\QueryException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                $this->logWebhook('DUPLICATE', $payload, 'data sudah ada');
                return response()->json(['success' => true, 'message' => 'Data sudah ada, diabaikan']);
            }
            $this->logWebhook('ERROR', $payload, $e->getMessage());
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
