let initialized = false;

export async function initPlatform(): Promise<void> {
    if (initialized) return;
    // Load the full Node.js platform (crypto, filesystem, etc.)
    await import('@refinio/one.core/lib/system/load-nodejs.js');
    initialized = true;
}
