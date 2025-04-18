// background/service-worker.js
// Version for use with JSON store veramoService

import { getAgent, createNewDidKey } from '../services/veramoService.js';

console.log("ClinConNet Veramo Wallet - Service Worker Starting...");

// Agent instance holder & state tracking
let agentInstance = null;
let agentInitializationState = 'pending'; // 'pending', 'success', 'error'
let agentInitializationError = null;

// --- Trigger Initialize Agent on startup ---
// We call getAgent() which handles the singleton initialization promise
console.log('[BG Script] Triggering agent initialization...');
getAgent()
    .then((agent) => {
        agentInstance = agent;
        agentInitializationState = 'success';
        console.log("[BG Script] Veramo Agent initialization promise resolved successfully.");
        // Check methods immediately for debugging
        console.log("[BG Script] Post-init check: typeof agentInstance.didManagerFind:", typeof agentInstance?.didManagerFind);
    })
    .catch(error => {
        agentInitializationState = 'error';
        agentInitializationError = error; // Store the specific error
        console.error("[BG Script] SERVICE WORKER DETECTED AGENT INITIALIZATION FAILURE:", error.message);
    });


// --- Listen for messages ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[BG Script] Raw message received:', JSON.stringify(message), 'from:', sender.origin || sender.id);
    let keepAlive = true; // Assume async response needed

    (async () => {
        // Ensure agent is ready before proceeding
        if (agentInitializationState !== 'success') {
            if (agentInitializationState === 'error') {
                console.error("[BG Script] Agent previously failed initialization. Reporting error.");
                sendResponse({ success: false, error: `Agent failed startup: ${agentInitializationError?.message || 'Unknown initialization error'}` });
                return;
            } else { // State is 'pending'
                console.warn("[BG Script] Agent initialization still pending, awaiting...");
                try {
                    agentInstance = await getAgent(); // Wait for the promise again
                    agentInitializationState = 'success';
                    console.log("[BG Script] Agent finished initializing on demand.");
                    console.log("[BG Script] On-demand check: typeof agentInstance.didManagerFind:", typeof agentInstance?.didManagerFind);
                } catch (initError) {
                    agentInitializationState = 'error';
                    agentInitializationError = initError;
                    console.error("[BG Script] Failed to initialize agent on demand:", initError);
                    sendResponse({ success: false, error: `Agent not initialized: ${initError.message}` });
                    return;
                }
            }
        }
        // If we got here, state should be 'success'
        if (!agentInstance) {
             console.error("[BG Script] Critical Error: Agent state is 'success' but instance is null!");
             sendResponse({ success: false, error: 'Internal error: Agent instance not available.' });
             return;
        }
         // Add safety check for required method before using it
         if (typeof agentInstance.didManagerFind !== 'function' && (message.type === 'GET_AGENT_STATUS' || message.type === 'GET_ALL_DIDS')) {
              console.error("[BG Script] Agent is missing didManagerFind method!");
              sendResponse({ success: false, error: 'Agent is missing required DID methods.' });
              return;
         }
         if (typeof agentInstance.didManagerCreate !== 'function' && message.type === 'CREATE_PEER_DID') {
              console.error("[BG Script] Agent is missing didManagerCreate method!");
              sendResponse({ success: false, error: 'Agent is missing required DID methods.' });
              return;
         }


        // --- Handle Messages ---
        try {
            if (message.type === 'GET_AGENT_STATUS') {
                console.log('[BG Script] Handling GET_AGENT_STATUS...');
                const identifiers = await agentInstance.didManagerFind(); // Use find
                const publicDid = identifiers.find(id => id.provider === 'did:key'); // Find first did:key
                 // Calculate recent peer DIDs (filtering out the first did:key found)
                 const peerDidIdentifiers = publicDid
                    ? identifiers.filter(id => id.provider === 'did:key' && id.did !== publicDid.did)
                    : identifiers.filter(id => id.provider === 'did:key'); // If no public, all are peers
                const recentPeerDids = peerDidIdentifiers.slice(-3).map(id => id.did);

                const status = {
                    isInitialized: true,
                    publicDid: publicDid?.did || 'No did:key found',
                    didCount: identifiers.length,
                    recentPeerDids: recentPeerDids
                };
                console.log('[BG Script] Sending status object:', JSON.stringify(status));
                sendResponse({ success: true, status });

            } else if (message.type === 'CREATE_PEER_DID') {
                console.log('[BG Script] Handling CREATE_PEER_DID...');
                const newIdentifier = await createNewDidKey(); // Use service function (which now calls agentInstance.didManagerCreate)
                sendResponse({ success: true, newDid: newIdentifier.did });

            } else if (message.type === 'GET_ALL_DIDS') {
                console.log('[BG Script] Handling GET_ALL_DIDS...');
                const identifiers = await agentInstance.didManagerFind();
                console.log('[BG Script] Found DIDs for GET_ALL_DIDS:', identifiers);
                sendResponse({ success: true, identifiers: identifiers });
            }
            // No RESOLVE_DID handler
            else {
                 console.warn("[BG Script] Unknown message type received:", message.type);
                 sendResponse({ success: false, error: 'Unknown message type' });
                 keepAlive = false;
            }
        } catch (error) {
             console.error(`[BG Script] Error handling message ${message.type}:`, error);
             sendResponse({ success: false, error: `Error processing ${message.type}: ${error.message || 'Unknown error'}` });
             keepAlive = false;
        }
    })();

    return keepAlive;
});

// Basic keep-alive alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => { /* ... */ });
console.log("Service Worker listeners registered.");