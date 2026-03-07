import type {Stream} from '@refinio/chat.media';

/**
 * A media entry in the fotos catalog.
 *
 * The Stream is the interoperable media object (shared with chat.media).
 * FotosEntry adds collection-specific metadata.
 *
 * Storage spectrum:
 * - reference: points to existing file, no copies
 * - metadata: reference + extracted EXIF + generated thumbnail
 * - ingested: fully copied into content-addressed blob store
 */
export interface FotosEntry {
    /** The media stream (identity, content type, metadata) */
    stream: Stream;
    /** Original filename */
    name: string;
    /** How this entry is managed */
    managed: 'reference' | 'metadata' | 'ingested';
    /** Path to original file (for reference/metadata mode) */
    sourcePath?: string;
    /** Relative path to thumbnail (if generated) */
    thumb?: string;
    /** Tags/labels */
    tags: string[];
    /** File size in bytes */
    size: number;
    /** Redundancy: which devices have a copy */
    copies?: string[];
}

export interface ExifData {
    date?: string;
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutter?: string;
    iso?: number;
    gps?: {lat: number; lon: number};
    width?: number;
    height?: number;
}

/**
 * V1 catalog format (for viewer/export compatibility).
 * Photos have exif resolved inline from the Stream.
 */
export interface Catalog {
    version: 1;
    name: string;
    created: string;
    device?: string;
    photos: Array<FotosEntry & {exif?: ExifData}>;
}

/** Alias for migration code */
export type CatalogV1 = Catalog;

export interface CatalogV2 {
    version: 2;
    name: string;
    created: string;
    device?: string;
    trie: import('./fotos-trie.js').FotosTrie;
}

export interface FotosConfig {
    /** Where content-addressed blobs are stored */
    blobDir: string;
    /** Where thumbnails are stored */
    thumbDir: string;
    /** Thumbnail max dimension in pixels */
    thumbSize: number;
    /** This device's name (for redundancy tracking) */
    deviceName: string;
    /** Collection owner — used as Stream.creator */
    owner: string;
}

export const DEFAULT_CONFIG: Omit<FotosConfig, 'owner'> = {
    blobDir: 'blobs',
    thumbDir: 'thumbs',
    thumbSize: 400,
    deviceName: 'default'
};
