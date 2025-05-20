/******/ (() => { // webpackBootstrap
/*!************************!*\
  !*** ./popup/popup.js ***!
  \************************/
// popup.js

// --- Element References ---
const statusDiv = document.getElementById('status');
const publicDidSpan = document.getElementById('publicDid');
const copyDidBtn = document.getElementById('copyDidBtn');
const createPeerDidBtn = document.getElementById('createPeerDidBtn');
const showAllDidsBtn = document.getElementById('showAllDidsBtn'); // For opening manageDids.html
const recentPeerDidsContainer = document.getElementById('recentPeerDidsContainer');
const peerDidListUl = document.getElementById('peerDidList');
const oidcRequestInput = document.getElementById('oidcRequestInput');
const didAuthBtn = document.getElementById('didAuthBtn');

// --- NEW Element References for Navigation & Views ---
const mainViewContainer = document.getElementById('mainViewContainer');
const messagesViewContainer = document.getElementById('messagesViewContainer');
const goToMessagesBtn = document.getElementById('goToMessagesBtn');
const backToMainBtn = document.getElementById('backToMainBtn');
// Note: The #didListContainer and #didList elements are for the "Show All DIDs" page, not directly manipulated by this popup.js anymore.
// However, if you had a version that showed a list *within* the popup, those IDs might be relevant here.
// For now, assuming "Show All DIDs" opens a new tab.
// ----------------------------------------------------

let currentPublicDid = 'N/A'; // Stores the full public DID for copying

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
    console.log('[Popup] Populating Recent Peer DID list UI with:', JSON.stringify(peerDids));
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
        recentPeerDidsContainer.style.display = 'block'; // Show container even if empty
        return;
    }

    peerDids.forEach(fullDid => {
        const li = document.createElement('li');
        const didSpan = document.createElement('span');
        didSpan.className = 'did-text';
        didSpan.textContent = truncateDid(fullDid); // Display truncated DID
        li.appendChild(didSpan);

        const copyButton = document.createElement('button');
        copyButton.textContent = 'copy!';
        copyButton.className = 'copy-peer-did-btn';
        copyButton.title = 'Copy Full Peer DID';
        copyButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent potential parent clicks
            navigator.clipboard.writeText(fullDid) // Copy the FULL DID
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
    recentPeerDidsContainer.style.display = 'block'; // Show the list
}
// --- End Utility Functions ---

// --- Update UI Function ---
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
        statusDiv.style.color = 'var(--status-ok-color)'; // Use CSS var

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
// --- End Update UI Function ---

// --- Request Status on Load ---
function requestStatus() {
    if (statusDiv) { // Check if elements exist before updating
        statusDiv.textContent = 'Requesting status...';
        statusDiv.style.color = 'inherit';
    }
    if (publicDidSpan) publicDidSpan.textContent = 'N/A';

    // Disable buttons while requesting
    const allActionButtons = [copyDidBtn, createPeerDidBtn, showAllDidsBtn, didAuthBtn, goToMessagesBtn];
    allActionButtons.forEach(btn => btn && (btn.disabled = true));
    if(recentPeerDidsContainer) recentPeerDidsContainer.style.display = 'none';


    chrome.runtime.sendMessage({ type: 'GET_AGENT_STATUS' })
        .then(response => {
            console.log("[Popup] Received status response object:", JSON.stringify(response));
            if (response && response.success) {
                 console.log("[Popup] Received status data:", JSON.stringify(response.status));
                 if (response.status?.recentPeerDids) { // Check if property exists
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
// --- End Request Status on Load ---

// --- Event Listeners ---
if (copyDidBtn) {
    copyDidBtn.addEventListener('click', () => {
        if (currentPublicDid !== 'N/A') {
            navigator.clipboard.writeText(currentPublicDid).then(() => {
                const originalHTML = copyDidBtn.innerHTML; // Store original HTML (icon + text)
                copyDidBtn.textContent = 'Copied!';
                setTimeout(() => { copyDidBtn.innerHTML = originalHTML; }, 1500);
            }).catch(err => {
                console.error('Failed to copy DID: ', err);
                const originalHTML = copyDidBtn.innerHTML;
                copyDidBtn.textContent = 'Error!';
                setTimeout(() => { copyDidBtn.innerHTML = originalHTML; }, 1500);
            });
        }
    });
}

if (createPeerDidBtn) {
    createPeerDidBtn.addEventListener('click', () => {
        if (statusDiv) { statusDiv.textContent = 'Creating Peer DID...'; statusDiv.style.color = 'inherit';}
        const buttonsToDisable = [createPeerDidBtn, showAllDidsBtn, didAuthBtn, goToMessagesBtn];
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
                requestStatus(); // Re-fetch status even on error
            });
    });
}

if (showAllDidsBtn) { // Opens manageDids.html in a new tab
    showAllDidsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'pages/manageDids.html' });
    });
}

if (didAuthBtn && oidcRequestInput) {
    const sampleOidcRequest = { response_type: 'id_token', scope: 'openid', client_id: 'YOUR_RP_CLIENT_ID_HERE', redirect_uri: 'YOUR_RP_CALLBACK_URL_HERE', nonce: 'GENERATED_BY_RP_' + crypto.randomUUID(), state: crypto.randomUUID(), nonceCarrierToken: "PASTE_NONCE_CARRIER_TOKEN_FROM_RP_HERE" };
    oidcRequestInput.value = JSON.stringify(sampleOidcRequest, null, 2);

    didAuthBtn.addEventListener('click', () => {
        let requestData; const inputText = oidcRequestInput.value.trim();
        if (!inputText) { if(statusDiv) {statusDiv.textContent = 'Using sample OIDC Request.'; statusDiv.style.color = 'orange';} requestData = sampleOidcRequest; }
        else { try { requestData = JSON.parse(inputText); if (!requestData.client_id || !requestData.redirect_uri || !requestData.nonce || !requestData.response_type?.includes('id_token') || !requestData.nonceCarrierToken) { throw new Error("Required OIDC fields missing."); } }
        catch (e) { if(statusDiv) {statusDiv.textContent = `OIDC Request Parse Error: ${e.message}`; statusDiv.style.color = 'red';} console.error("OIDC Request Parse Error:", e); return; } }
        console.log("[Popup] Sending DID Auth request to background:", requestData);
        if(statusDiv) {statusDiv.textContent = 'Processing DID Auth...'; statusDiv.style.color = 'inherit';}
        didAuthBtn.disabled = true;

        chrome.runtime.sendMessage({ type: 'DID_AUTH_REQUEST', request: requestData })
            .then(response => {
                console.log("[Popup] DID Auth response from background:", response);
                if (response?.success) { if(statusDiv) {statusDiv.textContent = 'DID Auth: Response sent to RP!'; statusDiv.style.color = 'green';} console.log("Signed ID Token Result:", response.result); }
                else { if(statusDiv) {statusDiv.textContent = `DID Auth Failed: ${response?.error || 'Unknown error'}`; statusDiv.style.color = 'red';} }
            })
            .catch(error => { console.error("[Popup] Error sending DID_AUTH_REQUEST message:", error); if(statusDiv) {statusDiv.textContent = `DID Auth Message Error: ${error.message}`; statusDiv.style.color = 'red';} })
            .finally(() => { if (didAuthBtn) didAuthBtn.disabled = false; });
    });
} else {
    console.warn("DID Auth UI elements not found.");
}

// --- NEW Navigation Event Listeners ---
if (goToMessagesBtn && mainViewContainer && messagesViewContainer) {
    goToMessagesBtn.addEventListener('click', () => {
        console.log("[Popup] Navigating to Messages view...");
        mainViewContainer.style.display = 'none';
        messagesViewContainer.style.display = 'block';
        // TODO: Potentially load connections/messages here for the messagesViewContainer
        // For now, it just shows the static placeholder content from HTML.
    });
} else {
    console.warn("[Popup] GoToMessages button or view containers not found for navigation setup.");
}

if (backToMainBtn && mainViewContainer && messagesViewContainer) {
    backToMainBtn.addEventListener('click', () => {
        console.log("[Popup] Navigating back to Main view...");
        messagesViewContainer.style.display = 'none';
        mainViewContainer.style.display = 'block';
        requestStatus(); // Re-fetch status when returning to main view
    });
} else {
    console.warn("[Popup] BackToMain button or view containers not found for navigation setup.");
}
// ------------------------------------

// --- Initial UI State ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[Popup] DOMContentLoaded. Requesting initial status.");
    requestStatus(); // Request status for the main view when popup opens
    // Ensure main view is visible by default and messages view is hidden
    if (mainViewContainer) mainViewContainer.style.display = 'block';
    if (messagesViewContainer) messagesViewContainer.style.display = 'none';
});

/******/ })()
;
//# sourceMappingURL=popup.js.map