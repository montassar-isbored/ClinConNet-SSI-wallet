// services/chromeStorageJsonStoreHelper.js

// Key used within chrome.storage.local to store the entire Veramo state object
const STORAGE_KEY = 'veramoAgentState';

// Default empty state structure expected by DataStoreJson stores
// Ensure this matches the top-level keys your Veramo plugins will use.
const DEFAULT_STATE = {
    identifiers: {}, // For DIDStoreJson
    keys: {},        // For KeyStoreJson
    privateKeys: {}, // For PrivateKeyStoreJson
    credentials: {}, // For CredentialPlugin (if added later)
    presentations: {}, // For CredentialPlugin (if added later)
    // Add other top-level keys if other plugins using DataStoreJson need them
};

/**
 * Loads the agent's state from chrome.storage.local.
 * Returns a structured default state if nothing is found or on error.
 * @returns {Promise<object>} The loaded agent state object.
 */
async function loadState() {
    console.log(`[Storage Helper] Loading state for key '${STORAGE_KEY}' from chrome.storage.local...`);
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const loadedData = result?.[STORAGE_KEY]; // Use optional chaining

        if (loadedData && typeof loadedData === 'object' && loadedData !== null) {
            console.log('[Storage Helper] State loaded successfully.');
            // Ensure all default keys exist, merging loaded data over defaults
            const mergedState = { ...DEFAULT_STATE, ...loadedData };
            // Maybe add a check here if critical sub-keys like 'identifiers' are missing?
            return mergedState;
        } else {
            if (loadedData !== undefined) { // Log if data existed but was invalid type
                 console.warn('[Storage Helper] Loaded data is not a valid object, returning default state.');
            } else {
                console.log('[Storage Helper] No state found for key, returning default empty state.');
            }
            return { ...DEFAULT_STATE }; // Return a copy of the default state
        }
    } catch (error) {
        console.error('[Storage Helper] Error loading state:', error);
        console.warn('[Storage Helper] Returning default empty state due to load error.');
        return { ...DEFAULT_STATE }; // Return default on error
    }
}

/**
 * Saves the agent's state to chrome.storage.local.
 * @param {object} state The complete agent state JSON object to save.
 * @returns {Promise<void>}
 */
async function saveState(state) {
    // Avoid logging full state unless debugging size issues, as it can be large
    console.log(`[Storage Helper] Attempting to save state for key '${STORAGE_KEY}' to chrome.storage.local...`);
    try {
        if (typeof state !== 'object' || state === null) {
            throw new Error('Attempted to save invalid state (not an object).');
        }
        // Optional: Deep clone state before saving if mutations are a concern,
        // but chrome.storage handles structured clone internally.
        await chrome.storage.local.set({ [STORAGE_KEY]: state });
        console.log('[Storage Helper] State saved successfully.');
    } catch (error) {
        console.error('[Storage Helper] Error saving state:', error);
        // Check specifically for quota errors
        if (error.message.includes('QUOTA_BYTES')) {
            console.error('!!! Chrome Storage Quota Exceeded !!! Consider requesting "unlimitedStorage" permission in manifest.json.');
        }
        // Decide if error should be re-thrown or handled differently
        // throw error;
    }
}

// Export the load and save functions to be used by veramoService.js
export { loadState, saveState };