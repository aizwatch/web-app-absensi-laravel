<?php

namespace App\Http\Middleware;

use App\Services\SettingsManager;
use Closure;
use Illuminate\Http\Request;

class PinMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $pin = $request->header('x-admin-pin') ?? $request->input('pin');

        if (!$pin || $pin !== SettingsManager::get('pin')) {
            return response()->json(['success' => false, 'message' => 'PIN salah'], 401);
        }

        return $next($request);
    }
}
