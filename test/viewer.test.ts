import {describe, expect, it} from 'vitest';
import type {Stream} from '@refinio/chat.media';
import {generateViewer} from '../src/viewer.js';

describe('viewer', () => {
    it('renders timeline and folder gallery controls', () => {
        const html = generateViewer({
            version: 1,
            name: 'Sample gallery',
            created: '2026-03-10T00:00:00.000Z',
            photos: [{
                stream: {
                    $type$: 'Stream',
                    id: 'a'.repeat(64),
                    creator: 'test-creator' as any,
                    created: Date.parse('2025-03-10T09:30:00.000Z'),
                    mimeType: 'image/jpeg',
                    status: 'finalized',
                } as Stream,
                name: 'berlin.jpg',
                managed: 'metadata',
                folderPath: 'Trips/Berlin',
                tags: ['travel'],
                size: 1234,
                exif: {
                    date: '2025:03:10 09:30:00',
                    camera: 'X100V',
                },
            }],
        });

        expect(html).toContain('id="modeTimeline"');
        expect(html).toContain('id="modeFolders"');
        expect(html).toContain('data-folder="Trips/Berlin"');
        expect(html).toContain("let galleryMode = 'timeline';");
        expect(html).toContain('.gallery-group');
    });
});
