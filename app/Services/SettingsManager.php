<?php

namespace App\Services;

class SettingsManager
{
    protected static string $path;
    protected static array $data = [];
    protected static bool $loaded = false;

    protected static array $defaults = [
        'pin'               => '1234',
        'ist_window_dari'   => '10:00',
        'ist_window_sampai' => '16:10',
        'shifts'            => [
            ['id' => 'normal', 'nama' => 'Normal', 'jam_masuk' => '08:00', 'batas_terlambat' => '08:06', 'jam_pulang' => '17:00'],
            ['id' => 'art',    'nama' => 'ART',    'jam_masuk' => '08:30', 'batas_terlambat' => '08:36', 'jam_pulang' => '17:00'],
        ],
        'employee_shifts'  => [],
        'holidays'         => [],
        'daily_overrides'  => [],
        'scan_notes'       => [],
    ];

    public static function load(): void
    {
        static::$path = storage_path('app/settings.json');

        if (file_exists(static::$path)) {
            $saved = json_decode(file_get_contents(static::$path), true) ?? [];

            // migrasi format lama
            if (empty($saved['shifts'])) {
                $saved['shifts'] = [
                    ['id' => 'normal', 'nama' => 'Normal',
                     'jam_masuk' => $saved['jam_masuk_normal'] ?? '08:00',
                     'batas_terlambat' => $saved['jam_masuk_batas_terlambat'] ?? '08:06',
                     'jam_pulang' => $saved['jam_pulang'] ?? '17:00'],
                    ['id' => 'art', 'nama' => 'ART', 'jam_masuk' => '08:30', 'batas_terlambat' => '08:36', 'jam_pulang' => '17:00'],
                ];
                unset($saved['jam_masuk_normal'], $saved['jam_masuk_batas_terlambat'], $saved['jam_pulang']);
            }

            static::$data = array_merge(static::$defaults, $saved);
        } else {
            static::$data = static::$defaults;
        }

        static::$loaded = true;
    }

    public static function all(): array
    {
        if (!static::$loaded) static::load();
        return static::$data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        if (!static::$loaded) static::load();
        return static::$data[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        if (!static::$loaded) static::load();
        static::$data[$key] = $value;
    }

    public static function save(): void
    {
        file_put_contents(static::$path, json_encode(static::$data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    public static function public(): array
    {
        $data = static::all();
        unset($data['pin']);
        return $data;
    }
}
