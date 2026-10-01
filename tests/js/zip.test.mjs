// node tests/js/zip.test.mjs — cek ZIP writer bisa dibaca unzip
import { makeZip, crc32 } from '../../resources/spa/zip.js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert';

assert.strictEqual(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
const zip = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('halo') }, { name: 'b.bin', data: new Uint8Array(1000).map((_, i) => i) }]);
const f = `${process.env.TMPDIR || '/tmp'}/zip-test.zip`;
writeFileSync(f, Buffer.from(await zip.arrayBuffer()));
assert.strictEqual(execFileSync('unzip', ['-p', f, 'a.txt']).toString(), 'halo');
execFileSync('unzip', ['-tq', f]);
console.log('zip ok');
