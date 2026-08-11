// Cek aturan OT dan batas 1/2 hari di laporan bulanan. Jalankan: node tests/spa/ot.test.mjs
import assert from 'node:assert/strict';
import { hitungOtJam } from '../../resources/spa/laporan.js';
import { isSetengahHari } from '../../resources/spa/utils.js';

const ot = (pulang, masuk = '07:52:00') => hitungOtJam({ scan_masuk: masuk, scan_pulang: pulang }, '17:00');

// Belum lewat batas OT
assert.equal(ot('16:30:00'), 0);   // pulang cepat
assert.equal(ot('17:00:00'), 0);
assert.equal(ot('17:24:00'), 0);
// Setengah jam di menit :25, jam penuh di menit :50
assert.equal(ot('17:25:00'), 0.5);
assert.equal(ot('17:49:00'), 0.5);
assert.equal(ot('17:50:00'), 1);
assert.equal(ot('18:24:00'), 1);
assert.equal(ot('18:25:00'), 1.5);
assert.equal(ot('18:47:00'), 1.5);  // kasus 15 Jul dari laporan
assert.equal(ot('18:49:00'), 1.5);
assert.equal(ot('18:50:00'), 2);
assert.equal(ot('19:25:00'), 2.5);
assert.equal(ot('19:50:00'), 3);
// Wajib ada scan masuk
assert.equal(ot('18:50:00', null), 0);
// Data tidak lengkap
assert.equal(hitungOtJam({ scan_masuk: '07:52:00' }, '17:00'), 0);
assert.equal(hitungOtJam(null, '17:00'), 0);

// Batas 1/2 hari: 08:30 masih Terlambat, 08:31 baru 1/2 Hari
assert.equal(isSetengahHari('08:29:00', '08:30'), false);
assert.equal(isSetengahHari('08:30:00', '08:30'), false);
assert.equal(isSetengahHari('08:30:59', '08:30'), false);  // detik diabaikan
assert.equal(isSetengahHari('08:31:00', '08:30'), true);
assert.equal(isSetengahHari('09:00:00', '08:30'), true);
// Batas shift lain
assert.equal(isSetengahHari('09:00:00', '09:00'), false);
assert.equal(isSetengahHari('09:01:00', '09:00'), true);
// Default 08:30 kalau shift tidak set batas
assert.equal(isSetengahHari('08:30:00', null), false);
assert.equal(isSetengahHari('08:31:00', null), true);
// Tidak ada scan masuk
assert.equal(isSetengahHari(null, '08:30'), false);

console.log('OK — aturan OT & batas 1/2 hari sesuai');
