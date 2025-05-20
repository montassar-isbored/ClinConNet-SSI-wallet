/******/ (() => { // webpackBootstrap
/*!************************!*\
  !*** ./popup/popup.js ***!
  \************************/
// popup.js
// Manages UI for both the main wallet view and the messages/connections view.

// --- Element References from Main View ---
const statusDiv = document.getElementById('status');
const publicDidSpan = document.getElementById('publicDid');
const copyDidBtn = document.getElementById('copyDidBtn');
const createPeerDidBtn = document.getElementById('createPeerDidBtn');
const showAllDidsBtn = document.getElementById('showAllDidsBtn');
const recentPeerDidsContainer = document.getElementById('recentPeerDidsContainer');
const peerDidListUl = document.getElementById('peerDidList');
const oidcRequestInput = document.getElementById('oidcRequestInput');
const didAuthBtn = document.getElementById('didAuthBtn');

// --- Element References for Navigation & View Containers ---
const mainViewContainer = document.getElementById('mainViewContainer');
const messagesViewContainer = document.getElementById('messagesViewContainer');
const goToMessagesBtn = document.getElementById('goToMessagesBtn');
const backToMainBtn = document.getElementById('backToMainBtn');

// --- Element References for Messages & Connections View ---
const mediatorStatusIndicator = document.getElementById('mediatorStatusIndicator');
const mediatorStatusText = document.getElementById('mediatorStatusText');
const currentMediatorDidSpan = document.getElementById('currentMediatorDid');
const cloudAgentDidInput = document.getElementById('cloudAgentDidInput');
const connectMediatorBtn = document.getElementById('connectMediatorBtn');
const connectMediatorStatus = document.getElementById('connectMediatorStatus');
// const connectionsListDiv = document.getElementById('connectionsList'); // For future use
// const messagesAreaDiv = document.getElementById('messagesArea'); // For future use

// --- State Variables ---
let currentPublicDid = 'N/A'; // Stores the full public DID for copying
const MEDIATION_GRANT_STORAGE_KEY = 'mediationGrant'; // Key used to check stored mediation status

// --- Utility Functions ---
function truncateDid(did, startChars = 20, endChars = 16) {
    if (!did || typeof did !== 'string' || did === 'N/A' || did.length <= startChars + endChars + 3) {
        return did || 'N/A';
    }
    const prefix = did.substring(0, startChars);
    const suffix = did.substring(did.length - endChars);
    return `${prefix}...${suffix}`;
}

function populatePeerDidList(peerDids) {
    // console.log('[Popup] Populating Recent Peer DID list UI with:', JSON.stringify(peerDids)); // Debug
    if (!peerDidListUl || !recentPeerDidsContainer) {
        console.warn("[Popup] Peer DID list elements not found.");
        return;
    }
    peerDidListUl.innerHTML = ''; // Clear previous list

    if (!peerDids || peerDids.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No other Peer DIDs created yet.';
        li.style.fontStyle = 'italic';
        peerDidListUl.appendChild(li);
    } else {
        peerDids.forEach(fullDid => {
            const li = document.createElement('li');
            const didSpan = document.createElement('span');
            didSpan.className = 'did-text';
            didSpan.textContent = truncateDid(fullDid);
            li.appendChild(didSpan);

            const copyButton = document.createElement('button');
            copyButton.textContent = 'copy!';
            copyButton.className = 'copy-peer-did-btn';
            copyButton.title = 'Copy Full Peer DID';
            copyButton.addEventListener('click', (event) => {
                event.stopPropagation();
                navigator.clipboard.writeText(fullDid)
                    .then(() => {
                        copyButton.textContent = 'copied!';
                        setTimeout(() => { copyButton.textContent = 'copy!'; }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy Peer DID: ', err);
                        copyButton.textContent = 'error!';
                        setTimeout(() => { copyButton.textContent = 'copy!'; }, 1500);
                    });
            });
            li.appendChild(copyButton);
            peerDidListUl.appendChild(li);
        });
    }
    recentPeerDidsContainer.style.display = 'block';
}

// --- Update Main View UI Function ---
function updatePopupUI(statusData) {
    const allActionButtons = [copyDidBtn, createPeerDidBtn, showAllDidsBtn, didAuthBtn, goToMessagesBtn];

    if (!statusDiv || !publicDidSpan) {
        console.error("Core UI elements for status/publicDid not found!");
        if (statusDiv) statusDiv.textContent = 'UI Error - Core elements missing.';
        return;
    }

    if (!statusData) {
        statusDiv.textContent = 'Error getting status or Agent not ready.';
        statusDiv.style.color = 'red';
        publicDidSpan.textContent = 'N/A';
        currentPublicDid = 'N/A';
        allActionButtons.forEach(btn => btn && (btn.disabled = true));
        if(recentPeerDidsContainer) recentPeerDidsContainer.style.display = 'none';
        return;
    }

    if (statusData.isInitialized) {
        statusDiv.textContent = `Wallet Initialized (${statusData.didCount || 0} DIDs available)`;
        statusDiv.style.color = 'var(--status-ok-color)';

        currentPublicDid = statusData.publicDid || 'N/A';
        publicDidSpan.textContent = truncateDid(currentPublicDid);

        allActionButtons.forEach(btn => {
            if (btn) {
                btn.disabled = (btn === copyDidBtn && currentPublicDid === 'N/A');
            }
        });
        populatePeerDidList(statusData.recentPeerDids);
    } else {
        statusDiv.textContent = `Error: ${statusData.error || 'Wallet Not Initialized'}`;
        statusDiv.style.color = statusData.error ? 'var(--status-error-color)' : 'var(--status-warn-color)';
        publicDidSpan.textContent = 'N/A';
        currentPublicDid = 'N/A';
        allActionButtons.forEach(btn => btn && (btn.disabled = true));
        if(recentPeerDidsContainer) recentPeerDidsContainer.style.display = 'none';
    }
}

// --- Request Main Status on Load ---
function requestStatus() {
    if (statusDiv) {
        statusDiv.textContent = 'Requesting status...';
        statusDiv.style.color = 'inherit';
    }
    if (publicDidSpan) publicDidSpan.textContent = 'N/A';

    const allActionButtons = [copyDidBtn, createPeerDidBtn, showAllDidsBtn, didAuthBtn, goToMessagesBtn];
    allActionButtons.forEach(btn => btn && (btn.disabled = true));
    if(recentPeerDidsContainer) recentPeerDidsContainer.style.display = 'none';

    chrome.runtime.sendMessage({ type: 'GET_AGENT_STATUS' })
        .then(response => {
            console.log("[Popup] Received status response object:", JSON.stringify(response));
            if (response && response.success) {
                 console.log("[Popup] Received status data:", JSON.stringify(response.status));
                 if (response.status?.recentPeerDids) {
                    console.log("[Popup] Received recentPeerDids:", JSON.stringify(response.status.recentPeerDids));
                 }
                 updatePopupUI(response.status);
            } else {
                 updatePopupUI({ isInitialized: false, error: response?.error || 'Could not get status' });
            }
        })
        .catch(error => {
            console.error("[Popup] Error sending GET_AGENT_STATUS:", error);
            updatePopupUI({ isInitialized: false, error: `Message error: ${error.message}` });
        });
}

// --- Functions for Messages & Connections View ---
function updateMediationStatusUI(grant) {
    if (!mediatorStatusIndicator || !mediatorStatusText || !currentMediatorDidSpan) {
        console.warn("[Popup] Mediation status UI elements not found.");
        return;
    }
    if (grant && grant.granted && grant.mediatorDid) {
        mediatorStatusIndicator.className = 'status-dot status-connected';
        mediatorStatusText.textContent = 'Connected';
        currentMediatorDidSpan.textContent = truncateDid(grant.mediatorDid);
        currentMediatorDidSpan.title = grant.mediatorDid;
        if (cloudAgentDidInput) cloudAgentDidInput.value = grant.mediatorDid;
    } else {
        mediatorStatusIndicator.className = 'status-dot status-disconnected';
        mediatorStatusText.textContent = 'Disconnected';
        currentMediatorDidSpan.textContent = 'Not Connected';
        currentMediatorDidSpan.title = '';
        // Optionally clear cloudAgentDidInput.value = ''; if no grant, or leave as is
    }
    if (connectMediatorStatus) connectMediatorStatus.textContent = '';
}

async function loadAndDisplayMediationStatus() {
    console.log("[Popup] Loading mediation status from storage...");
    if (connectMediatorStatus) connectMediatorStatus.textContent = 'Loading status...';
    try {
        const result = await chrome.storage.local.get([MEDIATION_GRANT_STORAGE_KEY]);
        const grant = result?.[MEDIATION_GRANT_STORAGE_KEY];
        console.log("[Popup] Mediation grant from storage:", grant);
        updateMediationStatusUI(grant);
    } catch (error) {
        console.error("[Popup] Error loading mediation status:", error);
        updateMediationStatusUI(null);
        if (connectMediatorStatus) connectMediatorStatus.textContent = 'Error loading status.';
    }
}

// --- Event Listeners ---
if (copyDidBtn) {
    copyDidBtn.addEventListener('click', () => {
        if (currentPublicDid !== 'N/A') {
            navigator.clipboard.writeText(currentPublicDid).then(() => {
                const originalHTML = copyDidBtn.innerHTML;
                copyDidBtn.innerHTML = copyDidBtn.innerHTML.replace('Copy Full DID', 'Copied!');
                setTimeout(() => { copyDidBtn.innerHTML = originalHTML; }, 1500);
            }).catch(err => {
                console.error('Failed to copy DID: ', err);
                const originalHTML = copyDidBtn.innerHTML;
                copyDidBtn.innerHTML = copyDidBtn.innerHTML.replace('Copy Full DID', 'Error!');
                setTimeout(() => { copyDidBtn.innerHTML = originalHTML; }, 1500);
            });
        }
    });
}

if (createPeerDidBtn) {
    createPeerDidBtn.addEventListener('click', () => {
        if (statusDiv) { statusDiv.textContent = 'Creating Peer DID...'; statusDiv.style.color = 'inherit';}
        const buttonsToDisable = [createPeerDidBtn, showAllDidsBtn, didAuthBtn, goToMessagesBtn, connectMediatorBtn];
        buttonsToDisable.forEach(btn => btn && (btn.disabled = true));
        chrome.runtime.sendMessage({ type: 'CREATE_PEER_DID' })
            .then(response => {
                if (response && response.success) {
                    if (statusDiv) statusDiv.textContent = 'Peer DID Created! Refreshing...';
                    console.log('[Popup] New Peer DID created:', response.newDid);
                } else {
                    updatePopupUI({ isInitialized: true, error: `Create Peer DID failed: ${response?.error || 'Unknown error'}` });
                }
                requestStatus(); // Always re-fetch status
            })
            .catch(error => {
                console.error("[Popup] Error sending CREATE_PEER_DID:", error);
                updatePopupUI({ isInitialized: true, error: `Create Peer DID message failed: ${error.message}` });
                requestStatus();
            });
    });
}

if (showAllDidsBtn) {
    showAllDidsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'pages/manageDids.html' });
    });
}

if (didAuthBtn && oidcRequestInput) {
    const sampleOidcRequest = { response_type: 'id_token', scope: 'openid', client_id: 'YOUR_RP_CLIENT_ID_HERE', redirect_uri: 'YOUR_RP_CALLBACK_URL_HERE', nonce: 'GENERATED_BY_RP_' + crypto.randomUUID(), state: crypto.randomUUID(), nonceCarrierToken: "PASTE_NONCE_CARRIER_TOKEN_FROM_RP_HERE" };
    oidcRequestInput.value = JSON.stringify(sampleOidcRequest, null, 2);
    didAuthBtn.addEventListener('click', () => { /* ... OIDC Auth logic ... */ });
} else { console.warn("DID Auth UI elements not found."); }

// --- Navigation Event Listeners ---
if (goToMessagesBtn && mainViewContainer && messagesViewContainer) {
    goToMessagesBtn.addEventListener('click', () => {
        console.log("[Popup] Navigating to Messages view...");
        mainViewContainer.style.display = 'none';
        messagesViewContainer.style.display = 'block';
        loadAndDisplayMediationStatus(); // Load status when view becomes active
    });
} else { console.warn("[Popup] GoToMessages button or view containers not found."); }

if (backToMainBtn && mainViewContainer && messagesViewContainer) {
    backToMainBtn.addEventListener('click', () => {
        console.log("[Popup] Navigating back to Main view...");
        messagesViewContainer.style.display = 'none';
        mainViewContainer.style.display = 'block';
        requestStatus(); // Re-fetch main status
    });
} else { console.warn("[Popup] BackToMain button or view containers not found."); }

// --- Connect Mediator Button Listener ---
if (connectMediatorBtn && cloudAgentDidInput && connectMediatorStatus) {
    connectMediatorBtn.addEventListener('click', async () => {
        const targetMediatorDid = cloudAgentDidInput.value.trim();
        if (!targetMediatorDid) {
            connectMediatorStatus.textContent = 'Please enter a Mediator DID.';
            connectMediatorStatus.style.color = 'red';
            return;
        }
        console.log(`[Popup] Requesting mediation with DID: ${targetMediatorDid}`);
        connectMediatorStatus.textContent = `Connecting to ${truncateDid(targetMediatorDid, 15, 10)}...`;
        connectMediatorStatus.style.color = 'inherit';
        connectMediatorBtn.disabled = true;
        if (mediatorStatusIndicator) mediatorStatusIndicator.className = 'status-dot status-pending';
        if (mediatorStatusText) mediatorStatusText.textContent = 'Connecting...';

        try {
            const response = await chrome.runtime.sendMessage({ type: 'REQUEST_MEDIATION_WITH_DID', mediatorDid: targetMediatorDid });
            console.log("[Popup] Response from REQUEST_MEDIATION_WITH_DID:", response);
            if (response && response.success) {
                connectMediatorStatus.textContent = `Mediation request sent. Refreshing status...`;
                connectMediatorStatus.style.color = 'green';
                setTimeout(loadAndDisplayMediationStatus, 1500); // Give time for grant to be processed and saved
            } else { throw new Error(response?.error || 'Mediation request failed.'); }
        } catch (error) {
            console.error("[Popup] Error sending/processing REQUEST_MEDIATION_WITH_DID:", error);
            connectMediatorStatus.textContent = `Error: ${error.message}`;
            connectMediatorStatus.style.color = 'red';
            updateMediationStatusUI(null); // Revert to disconnected on error
        } finally {
            if (connectMediatorBtn) connectMediatorBtn.disabled = false;
        }
    });
} else { console.warn("Connect Mediator UI elements not found."); }
// --- End Event Listeners ---

// --- Initial UI State ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[Popup] DOMContentLoaded. Requesting initial main status.");
    requestStatus();
    if (mainViewContainer) mainViewContainer.style.display = 'block';
    if (messagesViewContainer) messagesViewContainer.style.display = 'none';
});

/******/ })()
;
//# sourceMappingURL=popup.js.map