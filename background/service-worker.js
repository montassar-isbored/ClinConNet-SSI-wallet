// background/service-worker.js
// Version intended for use with TypeORM/sql.js based veramoService

// Ensure imports point to the correct service file
import { getAgent, createNewDidKey } from '../services/veramoService.js';

console.log("ClinConNet Veramo Wallet - Service Worker Starting...");

// Agent instance holder
let agentInstance = null;
// Track initialization state
let agentInitializationState = 'pending'; // 'pending', 'success', 'error'
let agentInitializationError = null;

// --- Initialize Agent on startup ---
// We call getAgent() which handles the singleton initialization promise
getAgent()
    .then((agent) => {
        agentInstance = agent;
        agentInitializationState = 'success';
        // Log includes expected method check result from veramoService.js
        console.log("[BG Script] Veramo Agent initialization promise resolved successfully in Service Worker.");
    })
    .catch(error => {
        agentInitializationState = 'error';
        agentInitializationError = error; // Store the specific error
        // The FATAL error is already logged in veramoService.js, log context here
        console.error("[BG Script] SERVICE WORKER DETECTED AGENT INITIALIZATION FAILURE:", error.message);
    });


// --- Listen for messages ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[BG Script] Raw message received:', JSON.stringify(message), 'from:', sender.origin || sender.id);
    let keepAlive = true; // Assume async response needed

    (async () => {
        // Check agent status BEFORE attempting operations that require it
        if (agentInitializationState !== 'success') {
            if (agentInitializationState === 'error') {
                console.error("[BG Script] Agent previously failed initialization. Reporting error.");
                sendResponse({ success: false, error: `Agent failed startup: ${agentInitializationError?.message || 'Unknown initialization error'}` });
                return; // Stop processing
            } else { // State is 'pending'
                console.warn("[BG Script] Agent initialization still pending, awaiting...");
                try {
                    // Await the existing promise (or re-trigger init if needed)
                    agentInstance = await getAgent();
                    agentInitializationState = 'success'; // Update state if successful now
                    console.log("[BG Script] Agent finished initializing on demand.");
                } catch (initError) {
                    // Initialization failed during this check
                    agentInitializationState = 'error';
                    agentInitializationError = initError;
                    console.error("[BG Script] Failed to initialize agent on demand:", initError);
                    sendResponse({ success: false, error: `Agent not initialized: ${initError.message}` });
                    return; // Stop processing
                }
            }
        }

        // If we reached here, state should be 'success' and agentInstance should be valid
        if (!agentInstance) {
             console.error("[BG Script] Critical Error: Agent state is 'success' but instance is null!");
             sendResponse({ success: false, error: 'Internal error: Agent instance unavailable.' });
             return;
        }

        // --- Handle Messages ---
        try {
            if (message.type === 'GET_AGENT_STATUS') {
                console.log('[BG Script] Handling GET_AGENT_STATUS...');
                // This call is EXPECTED TO FAIL with "no such table" until persistence is fixed
                const identifiers = await agentInstance.didManagerFind();
                console.log('[BG Script] Raw identifiers found by didManagerFind():', JSON.stringify(identifiers));

                const didKeys = identifiers.filter(id => id.provider === 'did:key');
                const publicDidIdentifier = didKeys.length > 0 ? didKeys[0] : null;
                const publicDid = publicDidIdentifier?.did || 'No did:key found';

                const peerDidIdentifiers = publicDidIdentifier
                    ? didKeys.filter(id => id.did !== publicDidIdentifier.did)
                    : didKeys;

                const recentPeerDids = peerDidIdentifiers.slice(-3).map(id => id.did);
                console.log('[BG Script] Calculated recentPeerDids:', JSON.stringify(recentPeerDids));

                const status = {
                    isInitialized: true, // Reached here, so init part worked
                    publicDid: publicDid,
                    didCount: identifiers.length,
                    recentPeerDids: recentPeerDids // Include the calculated list
                };
                console.log('[BG Script] Sending status object:', JSON.stringify(status));
                sendResponse({ success: true, status });

            } else if (message.type === 'CREATE_PEER_DID') {
                console.log('[BG Script] Handling CREATE_PEER_DID...');
                // This uses the service function which wraps the agent call
                // This call is EXPECTED TO FAIL with "no such table" or similar until persistence is fixed
                const newIdentifier = await createNewDidKey();
                sendResponse({ success: true, newDid: newIdentifier.did }); // Send back success even if save fails for now

            } else if (message.type === 'GET_ALL_DIDS') {
                console.log('[BG Script] Handling GET_ALL_DIDS...');
                 // This call is EXPECTED TO FAIL with "no such table" until persistence is fixed
                const identifiers = await agentInstance.didManagerFind();
                console.log('[BG Script] Found DIDs for GET_ALL_DIDS:', identifiers);
                sendResponse({ success: true, identifiers: identifiers });
            }
            // No RESOLVE_DID handler
            // No OPEN_SIDE_PANEL handler
            else {
                 console.warn("[BG Script] Unknown message type received:", message.type);
                 sendResponse({ success: false, error: 'Unknown message type' });
                 keepAlive = false;
            }
        } catch (error) {
             // This catch block is likely where the "no such table" error will appear
             console.error(`[BG Script] Error handling message ${message.type}:`, error);
             sendResponse({ success: false, error: `Error processing ${message.type}: ${error.message || 'Unknown error'}` });
             keepAlive = false;
        }
    })();

    return keepAlive; // Return true to keep message channel open for async response
});


// Basic keep-alive alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'keepAlive') {
    // console.log("Keep-alive alarm triggered.");
  }
});

console.log("Service Worker listeners registered.");