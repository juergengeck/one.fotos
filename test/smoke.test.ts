import { describe, it, expect } from 'vitest';
import { sha256HashFn } from '@refinio/trie.core';

describe('smoke', () => {
    it('sha256HashFn works via one.core platform', async () => {
        const hash = await sha256HashFn('hello');
        expect(hash).toBeTruthy();
        expect(typeof hash).toBe('string');
    });
});
