// services/veramoService.js
// VERSION: Using @veramo/data-store-json + chrome.storage.local
// Minimal plugins (KeyManager, DIDManager) to test method attachment

import { createAgent } from '@veramo/core';
// Interfaces removed for plain JS

import { KeyManager } from '@veramo/key-manager';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
import { DIDManager } from '@veramo/did-manager';
import { KeyDIDProvider } from '@veramo/did-provider-key';

// Import JSON Store classes
import { VeramoJsonStore, DIDStoreJson, KeyStoreJson, PrivateKeyStoreJson } from '@veramo/data-store-json';
// Do NOT import DataStoreJson plugin itself for this test

// Import our chrome.storage helper
import { loadState, saveState } from './chromeStorageHelper.js';

// --- Agent Setup ---
let agent = null;
let initializationPromise = null;

// WARNING: Replace with secure key derivation
const KMS_SECRET_KEY = '1111111111111111111111111111111111111111111111111111111111111111'; // EXAMPLE ONLY

// Debounce save operations
let saveTimeout = null;
const DEBOUNCE_SAVE_MS = 500;
function debounceSave(state) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => { await saveState(state); saveTimeout = null; }, DEBOUNCE_SAVE_MS);
}

async function _initializeVeramoAgent() {
    console.log('[Wallet Veramo Service - JSON Store] Initializing...');
    try {
        // 1. Load initial state from chrome.storage
        const initialState = await loadState();
        console.log('[Wallet Veramo Service - JSON Store] Initial state loaded.');

        // 2. Create the shared 'store manager' object implementing VeramoJsonStore concept
        const jsonStoreManager = {
            state: initialState,
            notifyUpdate: (newState) => {
                // console.log('[Wallet Veramo Service] jsonStoreManager notified of update.'); // Verbose
                jsonStoreManager.state = newState; // Update the in-memory state
                debounceSave(newState); // Trigger debounced save to chrome.storage
            }
        };

        // 3. Instantiate the specific JSON-backed stores using the manager object
        const keyStore = new KeyStoreJson(jsonStoreManager);
        const didStore = new DIDStoreJson(jsonStoreManager);
        const privateKeyStore = new PrivateKeyStoreJson(jsonStoreManager, new SecretBox(KMS_SECRET_KEY));

        // 4. Prepare Agent Plugins List - MINIMAL Set for testing
        const agentPlugins = [
             new KeyManager({
                 store: keyStore, // Use KeyStoreJson
                 kms: {
                     local: new KeyManagementSystem(privateKeyStore) // Use PrivateKeyStoreJson
                 }
             }),
             new DIDManager({
                 store: didStore, // Use DIDStoreJson
                 defaultProvider: 'did:key',
                 providers: {
                     'did:key': new KeyDIDProvider({ defaultKms: 'local' })
                 }
             }),
             // OMIT DataStoreJson plugin itself for this initial test
             // OMIT DIDResolver, MessageHandler, DIDComm, MediationManager etc for now
        ];
        console.log('[Wallet Veramo Service - JSON Store] Minimal plugins prepared:', agentPlugins);


        // 5. Create Veramo Agent instance
        console.log('[Wallet Veramo Service - JSON Store] Creating Veramo agent instance...');
        agent = createAgent({ // NO type hint
            plugins: agentPlugins,
        });
        console.log('[Wallet Veramo Service - JSON Store] Veramo agent created.');

        // 6. === CRITICAL CHECK: Inspect Agent Methods ===
        console.log('[Wallet Veramo Service - JSON Store] Agent object created:', agent);
        console.log('[Wallet Veramo Service - JSON Store] Available methods:', agent.availableMethods());
        console.log('[Wallet Veramo Service - JSON Store] Checking agent.didManagerFind:', agent.didManagerFind);
        console.log('[Wallet Veramo Service - JSON Store] Type of agent.didManagerFind:', typeof agent.didManagerFind);
        console.log('[Wallet Veramo Service - JSON Store] Checking agent.keyManagerCreate:', agent.keyManagerCreate);
        console.log('[Wallet Veramo Service - JSON Store] Type of agent.keyManagerCreate:', typeof agent.keyManagerCreate);
        // ==============================================

        // 7. Initial DID Check/Create (using find, COMMENTED OUT for initial test)
        // We first want to see if the methods exist at all
        /*
        console.log(`[Wallet Veramo Service - JSON Store] Checking/creating initial Participant DID...`);
        try {
            const identifiers = await agent.didManagerFind({ alias: 'user-default-key', provider: 'did:key' });
            if (identifiers.length > 0) {
                 console.log(`[Wallet Veramo Service - JSON Store] Found existing Participant DID: ${identifiers[0].did}`);
            } else {
                 console.log(`[Wallet Veramo Service - JSON Store] No default Participant DID found. Creating...`);
                 await createNewDidKey('user-default-key'); // Will fail if didManagerCreate isn't attached
            }
        } catch (e) { console.error(`[Wallet Veramo Service - JSON Store] Error during initial DID check/create:`, e); }
        */

        console.log('[Wallet Veramo Service - JSON Store] Agent initialization logic finished successfully.');
        return agent;

    } catch (error) {
        console.error('[Wallet Veramo Service - JSON Store] FATAL: Failed to initialize Veramo agent:', error);
        initializationPromise = null;
        throw error;
    }
}

// Singleton pattern
async function getAgent() {
    if (agent) return agent;
    if (!initializationPromise) initializationPromise = _initializeVeramoAgent();
    try {
        agent = await initializationPromise;
        if (!agent) throw new Error("Agent initialization promise resolved but agent is still null.");
        return agent;
    } catch (error) {
        initializationPromise = null;
        throw error;
    }
}

// Updated createNewDidKey to trigger manual save and accept alias
// Note: This needs agent.didManagerCreate to exist!
async function createNewDidKey(alias = undefined) {
    const agentInstance = await getAgent();
    if (typeof agentInstance.didManagerCreate !== 'function') {
         console.error("[Wallet Veramo Service] Agent is missing didManagerCreate method!");
         throw new Error("Agent is missing didManagerCreate method!");
    }
    try {
        console.log(`[Wallet Veramo Service - JSON Store] Creating new did:key${alias ? ` with alias ${alias}` : ''}...`);
        const createOptions = { provider: 'did:key', kms: 'local' };
        if (alias) createOptions.alias = alias;
        const newDid = await agentInstance.didManagerCreate(createOptions);
        console.log(`[Wallet Veramo Service - JSON Store] Created new DID in memory: ${newDid.did}${alias ? ` (alias: ${alias})` : ''}`);
        // Save is handled by the jsonStoreManager.notifyUpdate callback + debounceSave
        return newDid;
    } catch (error) {
        console.error(`[Wallet Veramo Service - JSON Store] Error creating new did:key${alias ? ` for alias ${alias}` : ''}:`, error);
        throw error;
    }
}

// Export functions needed by background/UI
export { getAgent, createNewDidKey };