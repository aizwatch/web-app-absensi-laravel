<?php

use Illuminate\Support\Facades\Route;

Route::get('/dashboard', function () {
    return file_get_contents(public_path('dashboard.html'));
});

Route::get('/{any}', function () {
    return file_get_contents(public_path('index.html'));
})->where('any', '^(?!api|dashboard).*');
