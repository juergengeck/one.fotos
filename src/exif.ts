import ExifReader from 'exifreader';
import { readFile } from 'node:fs/promises';
import type { ExifData } from './types.js';

/**
 * Extract EXIF metadata from an image file.
 */
export async function extractExif(filePath: string): Promise<ExifData> {
    const buffer = await readFile(filePath);
    let tags;
    try {
        tags = ExifReader.load(buffer, { expanded: true });
    } catch {
        return {};
    }

    const exif: ExifData = {};

    // Date
    const dateTag =
        tags.exif?.DateTimeOriginal ?? tags.exif?.DateTime;
    if (dateTag?.description) {
        // EXIF dates are "YYYY:MM:DD HH:MM:SS" — normalize
        exif.date = dateTag.description.replace(
            /^(\d{4}):(\d{2}):(\d{2})/,
            '$1-$2-$3'
        );
    }

    // Camera
    const make = tags.exif?.Make?.description;
    const model = tags.exif?.Model?.description;
    if (make || model) {
        const m = model ?? '';
        exif.camera = make && !m.startsWith(make) ? `${make} ${m}` : m;
    }

    // Lens
    if (tags.exif?.LensModel?.description) {
        exif.lens = tags.exif.LensModel.description;
    }

    // Focal length
    if (tags.exif?.FocalLength?.description) {
        exif.focalLength = tags.exif.FocalLength.description;
    }

    // Aperture
    if (tags.exif?.FNumber?.description) {
        exif.aperture = `f/${tags.exif.FNumber.description}`;
    }

    // Shutter speed
    if (tags.exif?.ExposureTime?.description) {
        exif.shutter = tags.exif.ExposureTime.description;
    }

    // ISO
    const iso = tags.exif?.ISOSpeedRatings?.description;
    if (iso) {
        exif.iso = Number(iso);
    }

    // GPS
    const lat = tags.gps?.Latitude;
    const lon = tags.gps?.Longitude;
    if (lat !== undefined && lon !== undefined) {
        exif.gps = { lat, lon };
    }

    // Dimensions
    const w =
        tags.file?.['Image Width']?.value ??
        tags.exif?.PixelXDimension?.value;
    const h =
        tags.file?.['Image Height']?.value ??
        tags.exif?.PixelYDimension?.value;
    if (w) exif.width = Number(w);
    if (h) exif.height = Number(h);

    return exif;
}
