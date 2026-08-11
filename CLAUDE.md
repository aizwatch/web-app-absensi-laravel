# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Employee attendance system (absensi) integrated with Fingerspot fingerprint machines. Laravel 13 API backend + vanilla JS SPA frontend. Database: MySQL (`finger_db`).

`SYSTEM_MAP.md` (Indonesian) is the deep reference: function-level flowcharts for login, live polling, absensi mandiri approval, and sync. Read it before tracing a flow across files. `README.md` is the stock Laravel readme — ignore it.

## Commands

```bash
# Full dev environment (server + queue + logs + vite)
composer dev

# Setup from scratch
composer setup

# Tests — NOTE: suite is stock Laravel ExampleTest only, no real coverage yet
composer test                          # all tests
php artisan test --filter=ClassName    # single test

# Set a password from CLI (identifier = users.username, or pegawai_pin with --pegawai)
php artisan user:set-password <identifier> <password> [--pegawai]

# Pull today's scans from Fingerspot manually
php artisan fingerspot:sync-today

# Build SPA (vanilla JS bundle → public/build/spa/)
npm run build:spa

# Watch SPA during development
npm run dev:spa

# Build Blade assets
npm run build

# Lint PHP
./vendor/bin/pint
```

## Architecture

**API-first monolith**: Laravel serves REST API (`routes/api.php`), frontend is a static SPA (`public/index.html`) bundled separately via `vite.spa.config.js`.

`routes/web.php` is just two `file_get_contents` routes: `/dashboard` → `public/dashboard.html` (separate TV/live-display page), everything else → `public/index.html` via a catch-all regex excluding `api|dashboard`. No Blade views in the request path.

### Auth model
- Custom Bearer token auth (NOT Sanctum sessions, despite Sanctum being installed)
- Dual source: checks `pegawai` table first, falls back to `users` table
- Token stored in `auth_token` column on both tables
- Middleware: `AuthMiddleware` validates token, optional `:admin` role gate
- Token accepted from `Authorization: Bearer` **or** `?token=` query string (needed for direct-link downloads like `absensi-mandiri/{id}/attachment`)
- Authed user is on `$request->attributes->get('auth_user')` — a stdClass with `_source` (`pegawai`|`users`), `role`, `pegawai_pin`, `must_change_password`. Not `Auth::user()`.
- Route gating is per-route in `routes/api.php`, not a global group: reads are `AuthMiddleware`, writes/admin endpoints are `AuthMiddleware::class.':admin'`. Webhook is unauthenticated (validated by `cloud_id`, `throttle:60,1`).
- `PinMiddleware` exists but is unused (legacy)

### Database access pattern
- Tables `pegawai` and `att_log` are **legacy Fingerspot tables** — no CREATE migration exists, only ALTER migrations adding auth columns
- These tables use `DB::table()` query builder (not Eloquent)
- Only `users` table has an Eloquent model (`User.php`)
- Table `absensi_mandiri` is Laravel-managed with full migration

### Settings system
- App config (shifts, holidays, overrides, departments, scan_notes) stored in `storage/app/settings.json` (not DB)
- Managed by `SettingsManager` service — file-based read/write, no locking

### Frontend SPA
- Vanilla JS ES modules in `resources/spa/`
- Entry: `main.js` → boots auth, starts polling (5s live, 30s personal)
- All functions exposed to `window.*` via `Object.assign` in `main.js`
- No router — tab switching via DOM manipulation
- XSS protection via `escHtml()` helper in `utils.js` — use it for ALL user-controlled data in innerHTML
- Two Vite configs: `vite.config.js` (Blade assets) and `vite.spa.config.js` (SPA bundle)
- Shared mutable state lives in `state.js`; `inject.js` builds DOM shells the other modules fill
- Module → tab: `dashboard.js` (live), `filter.js` + `laporan.js` (history/reports), `absensi-mandiri.js` (requests), `admin.js` (pegawai + raw att_log), `settings.js` (shift/holiday editors, biggest file), `picker.js` (employee picker), `table.js` (shared renderers)

### Key services
- `AbsensiService` — core attendance logic: query att_log, group by pin+date, classify scans (masuk/istirahat/pulang) based on shift
- `FingerspotApiService` — HTTP client to Fingerspot Cloud API, chunked date ranges
- `SettingsManager` — read/write settings.json with defaults and migration from old format

### External integration
- Fingerspot Cloud API (`developer.fingerspot.io`) for pulling attendance logs, setting machine time, pushing user info
- Inbound webhook at `POST /api/webhook/fingerspot` for real-time scan pushes
- Scheduled command `fingerspot:sync-today` runs daily at 18:00

### Env vars that matter
- `FINGERSPOT_CLOUD_IDS` — comma-separated machine cloud IDs
- `FINGERSPOT_API_TOKEN` — API bearer token for Fingerspot
- `DB_DATABASE=finger_db` — shared database with Fingerspot system
- `QUEUE_CONNECTION=sync` — no worker; the `queue` process in `composer dev` is decorative

## Conventions

- Use `DB::table()` for `pegawai` and `att_log` queries (no Eloquent model)
- Manual scan records use `sn='MANUAL'` in att_log
- Always use `escHtml()` when rendering user data in SPA innerHTML
- Absensi mandiri approval uses `applyEffect()`/`undoEffect()` pattern for reversible side effects
- Settings changes go through `SettingsManager::set()` then `::save()`
- API responses are always `{success: bool, message?, data?}` — keep the shape, the SPA fetch helpers depend on it
- Migrations only ALTER the legacy tables; never write a CREATE for `pegawai` or `att_log` (Fingerspot owns them, `dump.sql` has the real schema)
- `php artisan test` runs against `DB_DATABASE=testing` (phpunit.xml), not `finger_db`
