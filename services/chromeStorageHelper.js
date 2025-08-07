// services/chromeStorageHelper.js

export async function loadState() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'LOAD_STATE' });
        if (response.error) {
            throw new Error(response.error);
        }
        return response.state || { identifiers: {}, keys: {}, privateKeys: {} };
    } catch (error) {
        console.error('[Storage Helper] Error loading state via service worker:', error);
        return { identifiers: {}, keys: {}, privateKeys: {} };
    }
}

export async function saveState(state) {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'SAVE_STATE', state: state });
        if (response.error) {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('[Storage Helper] Error saving state via service worker:', error);
    }
}