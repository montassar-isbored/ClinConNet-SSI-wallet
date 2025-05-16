// background/service-worker.js (Wallet Extension)
// Version using JSON store service and handling DID Auth

// Import ALL exported functions from the service
import { getAgent, requestAndSetupMediation, handleDidAuthRequest } from '../services/veramoService.js';
// createNewDidKey is now only used internally by veramoService on init check

console.log("ClinConNet Veramo Wallet - Service Worker Starting...");

let agentInstance = null;
let agentInitializationState = 'pending';
let agentInitializationError = null;
const MEDIATION_SETUP_KEY = 'mediationSetupComplete'; // Key for chrome.storage

async function checkAndRequestMediationIfNeeded() {
    // This function stays the same as provided before, using chrome.storage.local
    // and calling requestAndSetupMediation from veramoService if needed.
    if (!agentInstance) { console.warn("[BG Script] Agent not ready for mediation check."); return; }
    try {
        const result = await chrome.storage.local.get([MEDIATION_SETUP_KEY]);
        if (result[MEDIATION_SETUP_KEY] === true) { console.log("[BG Script] Mediation setup flag is true."); return; }
        console.log("[BG Script] Mediation flag not true. Attempting request...");
        await requestAndSetupMediation();
        console.log("[BG Script] Initial mediation request sent (or attempted).");
        await chrome.storage.local.set({ [MEDIATION_SETUP_KEY]: true }); // Assume success for now
        console.log("[BG Script] Mediation setup flag set to true.");
    } catch (mediationError) { console.error("[BG Script] Error during mediation check/request function:", mediationError); }
}

// --- Trigger Initialize Agent on startup ---
console.log('[BG Script] Triggering agent initialization...');
getAgent()
    .then(async (agent) => {
        agentInstance = agent;
        agentInitializationState = 'success';
        console.log("[BG Script] Veramo Agent initialized successfully.");
        await checkAndRequestMediationIfNeeded(); // Check/Request mediation after init
    })
    .catch(error => {
        agentInitializationState = 'error';
        agentInitializationError = error;
        console.error("[BG Script] SERVICE WORKER DETECTED AGENT INITIALIZATION FAILURE:", error);
    });

// --- Listen for messages ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const messageType = message?.type || 'UNKNOWN';
    console.log(`[BG Script] Message received: type=${messageType}`, message);
    let keepAlive = true;

    (async () => {
        // Agent readiness check
        if (agentInitializationState !== 'success') {
            if (agentInitializationState === 'error') {
                const errorMsg = `Agent previously failed initialization: ${agentInitializationError?.message || 'Unknown initialization error'}`;
                console.error(`[BG Script] Handling ${messageType}: ${errorMsg}`);
                sendResponse({ success: false, error: errorMsg }); return;
            } else {
                console.warn(`[BG Script] Handling ${messageType}: Agent initialization pending, awaiting...`);
                try {
                    agentInstance = await getAgent(); agentInitializationState = 'success';
                    console.log(`[BG Script] Handling ${messageType}: Agent finished initializing on demand.`);
                } catch (initError) {
                    agentInitializationState = 'error'; agentInitializationError = initError;
                    const errorMsg = `Failed to initialize agent on demand: ${initError.message}`;
                    console.error(`[BG Script] Handling ${messageType}: ${errorMsg}`, initError);
                    sendResponse({ success: false, error: errorMsg }); return;
                }
            }
        }
        if (!agentInstance) { /* ... handle null agent instance ... */ sendResponse({ success: false, error: 'Internal error: Agent instance unavailable.' }); return; }

        // Handle Messages
        try {
            // No need for explicit method checks now if init is stable
            if (messageType === 'GET_AGENT_STATUS') {
                console.log('[BG Script] Handling GET_AGENT_STATUS...');
                const identifiers = await agentInstance.didManagerFind(); // Use find
                const didKeys = identifiers.filter(id => id.provider === 'did:key');
                const publicDidIdentifier = identifiers.find(id => id.alias === 'user-default-key' && id.provider === 'did:key') || didKeys[0]; // Prefer alias, fallback to first
                const publicDid = publicDidIdentifier?.did || 'No did:key found';
                const peerDidIdentifiers = publicDidIdentifier ? didKeys.filter(id => id.did !== publicDidIdentifier.did) : didKeys;
                const recentPeerDids = peerDidIdentifiers.slice(-3).map(id => id.did);
                const status = { isInitialized: true, publicDid: publicDid, didCount: identifiers.length, recentPeerDids: recentPeerDids };
                console.log('[BG Script] Sending status object:', JSON.stringify(status));
                sendResponse({ success: true, status });

            } else if (messageType === 'CREATE_PEER_DID') {
                 console.log('[BG Script] Handling CREATE_PEER_DID...');
                 // createNewDidKey IS exported, let's use it for consistency as it handles logging
                 // Ensure it was actually exported from veramoService.js -> YES
                 const veramoService = await import('../services/veramoService.js');
                 const newIdentifier = await veramoService.createNewDidKey(); // Call service function directly
                 sendResponse({ success: true, newDid: newIdentifier.did });

            } else if (messageType === 'GET_ALL_DIDS') {
                console.log('[BG Script] Handling GET_ALL_DIDS...');
                const identifiers = await agentInstance.didManagerFind();
                console.log('[BG Script] Found DIDs for GET_ALL_DIDS:', identifiers);
                sendResponse({ success: true, identifiers: identifiers });

            } else if (messageType === 'FORCE_MEDIATION_REQUEST') {
                 console.log('[BG Script] Handling FORCE_MEDIATION_REQUEST...');
                 await chrome.storage.local.remove([MEDIATION_SETUP_KEY]);
                 await checkAndRequestMediationIfNeeded();
                 console.log('[BG Script] FORCE_MEDIATION_REQUEST completed.');
                 sendResponse({ success: true, message: "Mediation request re-initiated." });

            } else if (messageType === 'DID_AUTH_REQUEST' && message.request) { // Check for request data
                console.log('[BG Script] Handling DID_AUTH_REQUEST...');
                console.log('[BG Script] DID_AUTH_REQUEST content:', message.request);
                 // Call the service function directly now it's exported
                 const veramoService = await import('../services/veramoService.js');
                const result = await veramoService.handleDidAuthRequest(message.request);
                sendResponse({ success: true, result });
            }
            else {
                 console.warn("[BG Script] Unknown message type received:", messageType);
                 console.log("[BG Script] Message content:", message);
                 sendResponse({ success: false, error: `Unknown message type: ${messageType}` });
                 keepAlive = false;
            }
        } catch (error) {
             console.error(`[BG Script] Error handling message ${messageType}:`, error);
             console.log(`[BG Script] Message content:`, message);
             sendResponse({ success: false, error: `Error processing ${messageType}: ${error.message || 'Unknown error'}` });
             keepAlive = false;
        }
    })();
    return keepAlive;
});

// Keep-alive alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => { /* console.log('Keep-alive'); */ });
console.log("Service Worker listeners registered.");