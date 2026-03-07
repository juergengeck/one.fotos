/**
 * A photo entry in the catalog.
 *
 * Storage spectrum:
 * - reference: points to existing file, no copy made
 * - metadata: reference + extracted EXIF + generated thumbnail
 * - ingested: fully copied into content-addressed blob store
 */
export interface PhotoEntry {
    /** Content hash (SHA-256) of the original file */
    hash: string;
    /** Original filename */
    name: string;
    /** How this photo is managed */
    managed: 'reference' | 'metadata' | 'ingested';
    /** Path to original file (for reference/metadata mode) */
    sourcePath?: string;
    /** Relative path to thumbnail (if generated) */
    thumb?: string;
    /** Tags/labels */
    tags: string[];
    /** EXIF metadata */
    exif?: ExifData;
    /** When this entry was added to the catalog */
    addedAt: string;
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
    gps?: { lat: number; lon: number };
    width?: number;
    height?: number;
}

export interface Catalog {
    version: 1;
    name: string;
    created: string;
    device?: string;
    photos: PhotoEntry[];
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
}

export const DEFAULT_CONFIG: FotosConfig = {
    blobDir: 'blobs',
    thumbDir: 'thumbs',
    thumbSize: 400,
    deviceName: 'default'
};
