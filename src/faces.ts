/**
 * Node.js platform implementation for fotos.core face analysis.
 * Wires onnxruntime-node + sharp into the FacePlatform interface.
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {
    setPlatform,
    initFaceModels as coreInitFaceModels,
    disposeFaceModels as coreDisposeFaceModels,
    analyzeImage as coreAnalyzeImage,
    facesToDataAttrs as coreFacesToDataAttrs,
} from '@refinio/fotos.core';
import type {
    FacePlatform, ImageProcessor, OnnxRuntime, OnnxSession, OnnxTensor, FaceAnalysisResult,
} from '@refinio/fotos.core';

// ---------------------------------------------------------------------------
// ImageProcessor: sharp
// ---------------------------------------------------------------------------

const sharpImageProcessor: ImageProcessor = {
    async decodeAndResize(path, width, height) {
        const image = sharp(path);
        const metadata = await image.metadata();
        const data = await image
            .resize(width, height, {fit: 'fill'})
            .removeAlpha()
            .raw()
            .toBuffer();

        return {
            data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            origWidth: metadata.width!,
            origHeight: metadata.height!,
        };
    },

    async cropAndResize(path, x, y, w, h, targetWidth, targetHeight) {
        const data = await sharp(path)
            .extract({left: x, top: y, width: w, height: h})
            .resize(targetWidth, targetHeight, {fit: 'fill'})
            .removeAlpha()
            .raw()
            .toBuffer();

        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    },

    async saveFaceCrop(path, x, y, w, h, outputPath, size) {
        await mkdir(dirname(outputPath), {recursive: true});
        await sharp(path)
            .extract({left: x, top: y, width: w, height: h})
            .resize(size, size, {fit: 'cover'})
            .jpeg({quality: 85})
            .toFile(outputPath);
    },

    async mkdirp(path) {
        await mkdir(path, {recursive: true});
    },
};

// ---------------------------------------------------------------------------
// OnnxRuntime: onnxruntime-node
// ---------------------------------------------------------------------------

/** Wrap ort.InferenceSession to match OnnxSession interface */
function wrapSession(session: ort.InferenceSession): OnnxSession {
    return {
        get inputNames() { return [...session.inputNames]; },
        get outputNames() { return [...session.outputNames]; },
        async run(feeds) {
            // Convert our generic tensors to ort.Tensor
            const ortFeeds: Record<string, ort.Tensor> = {};
            for (const [name, tensor] of Object.entries(feeds)) {
                ortFeeds[name] = new ort.Tensor(
                    'float32',
                    tensor.data as Float32Array,
                    tensor.dims as number[]
                );
            }
            const results = await session.run(ortFeeds);
            // Wrap output tensors
            const out: Record<string, OnnxTensor> = {};
            for (const name of Object.keys(results)) {
                const t = results[name];
                out[name] = {data: t.data as Float32Array, dims: t.dims};
            }
            return out;
        },
        async release() {
            await session.release();
        },
    };
}

const nodeOnnxRuntime: OnnxRuntime = {
    async createSession(modelPath) {
        const session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ['cpu'],
        });
        return wrapSession(session);
    },

    createTensor(type, data, dims) {
        return {data, dims};
    },
};

// ---------------------------------------------------------------------------
// Public API — thin wrappers that wire platform then delegate
// ---------------------------------------------------------------------------

const nodePlatform: FacePlatform = {
    images: sharpImageProcessor,
    onnx: nodeOnnxRuntime,
};

let platformSet = false;

function ensurePlatform(): void {
    if (!platformSet) {
        setPlatform(nodePlatform);
        platformSet = true;
    }
}

export async function initFaceModels(modelDir: string): Promise<void> {
    ensurePlatform();
    const {join} = await import('node:path');
    await coreInitFaceModels(modelDir, join);
}

export async function disposeFaceModels(): Promise<void> {
    await coreDisposeFaceModels();
}

export async function analyzeImage(
    imagePath: string,
    facesDir: string,
    imageId: string
): Promise<FaceAnalysisResult> {
    ensurePlatform();
    return coreAnalyzeImage(imagePath, facesDir, imageId);
}

export function facesToDataAttrs(result: FaceAnalysisResult): Record<string, string> {
    return coreFacesToDataAttrs(result);
}
