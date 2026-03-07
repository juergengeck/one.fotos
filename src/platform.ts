import {setPlatformForCh} from '@refinio/one.core/lib/system/crypto-helpers.js';
import {setPlatformLoaded} from '@refinio/one.core/lib/system/platform.js';

let initialized = false;

export async function initPlatform(): Promise<void> {
    if (initialized) return;
    const CH = await import('@refinio/one.core/lib/system/nodejs/crypto-helpers.js');
    setPlatformForCh(CH);
    setPlatformLoaded('nodejs');
    initialized = true;
}
