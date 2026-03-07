import {describe, it, expect} from 'vitest';
import {hashFile, hashString} from '../src/hash.js';
import {writeFileSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

describe('hash', () => {
    it('hashString produces consistent SHA-256', async () => {
        const h1 = await hashString('hello');
        const h2 = await hashString('hello');
        expect(h1).toBe(h2);
        expect(h1.length).toBe(64);
    });

    it('hashFile hashes file content', async () => {
        const tmp = join(tmpdir(), 'fotos-test-hash.txt');
        writeFileSync(tmp, 'test content');
        try {
            const h = await hashFile(tmp);
            expect(h.length).toBe(64);
        } finally {
            unlinkSync(tmp);
        }
    });

    it('different content produces different hashes', async () => {
        const h1 = await hashString('hello');
        const h2 = await hashString('world');
        expect(h1).not.toBe(h2);
    });
});
