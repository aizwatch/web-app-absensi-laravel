<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class FingerspotApiService
{
    protected const API_URL = 'https://developer.fingerspot.io/api/get_attlog';

    public static function fetchAttlog(string $startDate, string $endDate, string $cloudId): array
    {
        $chunks = self::buildDateChunks($startDate, $endDate, 2);
        $all    = [];

        foreach ($chunks as [$from, $to]) {
            $rows = self::fetchChunk($from, $to, $cloudId);
            $all  = array_merge($all, $rows);
        }

        return $all;
    }

    protected static function fetchChunk(string $startDate, string $endDate, string $cloudId): array
    {
        $response = Http::withoutVerifying()
            ->withToken(env('FINGERSPOT_API_TOKEN'))
            ->post(self::API_URL, [
                'trans_id'   => (string) now()->timestamp,
                'cloud_id'   => $cloudId,
                'start_date' => $startDate,
                'end_date'   => $endDate,
            ]);

        $json = $response->json();

        if (!($json['success'] ?? false)) {
            throw new \RuntimeException('Fingerspot API error: ' . $response->body());
        }

        return $json['data'] ?? [];
    }

    // Pecah rentang tanggal jadi chunks max $maxDays hari
    protected static function buildDateChunks(string $startDate, string $endDate, int $maxDays): array
    {
        $chunks = [];
        $cur    = new \DateTime($startDate);
        $end    = new \DateTime($endDate);

        while ($cur <= $end) {
            $from    = $cur->format('Y-m-d');
            $toDate  = (clone $cur)->modify('+' . ($maxDays - 1) . ' days');
            $to      = min($toDate, $end)->format('Y-m-d');
            $chunks[] = [$from, $to];
            $cur->modify('+' . $maxDays . ' days');
        }

        return $chunks;
    }
}
