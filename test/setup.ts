/**
 * Load one.core Node.js crypto platform for tests.
 * Only loads crypto-helpers — trie.core doesn't need storage/websocket/etc.
 */
import {setPlatformForCh} from '@refinio/one.core/lib/system/crypto-helpers.js';
import {setPlatformLoaded} from '@refinio/one.core/lib/system/platform.js';
import * as CH from '@refinio/one.core/lib/system/nodejs/crypto-helpers.js';

setPlatformForCh(CH);
setPlatformLoaded('nodejs');
