/******/ (() => { // webpackBootstrap
/*!************************!*\
  !*** ./popup/popup.js ***!
  \************************/
// popup.js

// Element References
const statusDiv = document.getElementById('status');
const publicDidSpan = document.getElementById('publicDid');
const copyDidBtn = document.getElementById('copyDidBtn');
const createPeerDidBtn = document.getElementById('createPeerDidBtn');
const showAllDidsBtn = document.getElementById('showAllDidsBtn');
const recentPeerDidsContainer = document.getElementById('recentPeerDidsContainer');
const peerDidListUl = document.getElementById('peerDidList');
const oidcRequestInput = document.getElementById('oidcRequestInput');
const didAuthBtn = document.getElementById('didAuthBtn');
// const forceMediationBtn = document.getElementById('forceMediationBtn'); // If button added

let currentPublicDid = 'N/A';

// --- Utility Functions ---
function truncateDid(did, startChars = 20, endChars = 16) {
    if (!did || typeof did !== 'string' || did === 'N/A' || did.length <= startChars + endChars + 3) return did || 'N/A';
    return `${did.substring(0, startChars)}...${did.substring(did.length - endChars)}`;
}

function populatePeerDidList(peerDids) {
    console.log('Populating Recent Peer DID list UI with:', JSON.stringify(peerDids));
    peerDidListUl.innerHTML = '';
    if (!peerDids || peerDids.length === 0) {
        const li = document.createElement('li'); li.textContent = 'No Peer DIDs created yet.'; li.style.fontStyle = 'italic'; peerDidListUl.appendChild(li);
    } else {
        peerDids.forEach(fullDid => {
            const li = document.createElement('li');
            const didSpan = document.createElement('span'); didSpan.className = 'did-text'; didSpan.textContent = truncateDid(fullDid); li.appendChild(didSpan);
            const copyButton = document.createElement('button'); copyButton.textContent = 'copy!'; copyButton.className = 'copy-peer-did-btn'; copyButton.title = 'Copy Full Peer DID';
            copyButton.addEventListener('click', (event) => {
                event.stopPropagation(); navigator.clipboard.writeText(fullDid)
                .then(() => { copyButton.textContent = 'copied!'; setTimeout(() => { copyButton.textContent = 'copy!'; }, 1500); })
                .catch(err => { console.error('Failed to copy Peer DID: ', err); copyButton.textContent = 'error!'; setTimeout(() => { copyButton.textContent = 'copy!'; }, 1500); });
            });
            li.appendChild(copyButton); peerDidListUl.appendChild(li);
        });
    }
    recentPeerDidsContainer.style.display = 'block';
}

// --- Update UI Function ---
function updatePopupUI(statusData) {
     const allButtons = [copyDidBtn, createPeerDidBtn, showAllDidsBtn, didAuthBtn /*, forceMediationBtn */];
     if (!statusData) {
         statusDiv.textContent = 'Error getting status or Agent not ready.'; statusDiv.style.color = 'red';
         publicDidSpan.textContent = 'N/A'; currentPublicDid = 'N/A';
         allButtons.forEach(btn => btn && (btn.disabled = true));
         if(recentPeerDidsContainer) recentPeerDidsContainer.style.display = 'none';
         return;
     }
     if (statusData?.isInitialized) {
         statusDiv.textContent = `Wallet Initialized (${statusData.didCount} DIDs available)`; statusDiv.style.color = 'green';
         currentPublicDid = statusData.publicDid || 'N/A'; publicDidSpan.textContent = truncateDid(currentPublicDid);
         allButtons.forEach(btn => btn && (btn.disabled = (btn === copyDidBtn && currentPublicDid === 'N/A'))); // Enable buttons, disable copy if no DID
         populatePeerDidList(statusData.recentPeerDids);
     } else {
         statusDiv.textContent = `Error: ${statusData.error || 'Wallet Not Initialized'}`; statusDiv.style.color = statusData.error ? 'red' : 'orange';
         publicDidSpan.textContent = 'N/A'; currentPublicDid = 'N/A';
         allButtons.forEach(btn => btn && (btn.disabled = true));
         if(recentPeerDidsContainer) recentPeerDidsContainer.style.display = 'none';
     }
}

// --- Request Status on Load ---
function requestStatus() {
    statusDiv.textContent = 'Requesting status...'; // Reset status on request
    statusDiv.style.color = 'inherit';
    updatePopupUI(null); // Set buttons to disabled initially

    chrome.runtime.sendMessage({ type: 'GET_AGENT_STATUS' })
        .then(response => {
            console.log("Popup received status response object:", JSON.stringify(response));
            if (response?.success) {
                 console.log("Popup received status data:", JSON.stringify(response.status));
                 console.log("Popup received recentPeerDids:", JSON.stringify(response.status?.recentPeerDids));
                 updatePopupUI(response.status); // Update UI with received status
            } else { updatePopupUI({ isInitialized: false, error: response?.error || 'Could not get status' }); }
        })
        .catch(error => { console.error("Error sending GET_AGENT_STATUS:", error); updatePopupUI({ isInitialized: false, error: `Error sending message: ${error.message}` }); });
}

// --- Event Listeners ---
if (copyDidBtn) {
    copyDidBtn.addEventListener('click', () => {
        if (currentPublicDid !== 'N/A') {
            navigator.clipboard.writeText(currentPublicDid).then(() => {
                copyDidBtn.textContent = 'Copied!'; setTimeout(() => { copyDidBtn.textContent = '📋 Copy'; }, 1500);
            }).catch(err => { console.error('Failed to copy DID: ', err); copyDidBtn.textContent = 'Error!'; setTimeout(() => { copyDidBtn.textContent = '📋 Copy'; }, 1500); });
        }
    });
}

if (createPeerDidBtn) {
    createPeerDidBtn.addEventListener('click', () => {
        statusDiv.textContent = 'Creating Peer DID...'; statusDiv.style.color = 'inherit';
        createPeerDidBtn.disabled = true; showAllDidsBtn.disabled = true; if (didAuthBtn) didAuthBtn.disabled = true;
        chrome.runtime.sendMessage({ type: 'CREATE_PEER_DID' })
            .then(response => { if (response?.success) { console.log('New Peer DID created:', response.newDid); requestStatus(); } else { updatePopupUI({ isInitialized: true, error: `Create Peer DID failed: ${response?.error}` }); /* Keep existing state otherwise */ } }) // Update status on success
            .catch(error => { console.error("Error sending CREATE_PEER_DID:", error); updatePopupUI({ isInitialized: true, error: `Create Peer DID message failed: ${error.message}` }); })
            .finally(() => { /* Buttons re-enabled by requestStatus or error display */ });
    });
}

if (showAllDidsBtn) {
    showAllDidsBtn.addEventListener('click', () => { chrome.tabs.create({ url: 'pages/manageDids.html' }); });
}

/* // Optional: Listener for force mediation button
if (forceMediationBtn) {
    forceMediationBtn.addEventListener('click', () => {
        statusDiv.textContent = 'Re-requesting mediation...'; statusDiv.style.color = 'inherit';
        chrome.runtime.sendMessage({ type: 'FORCE_MEDIATION_REQUEST' })
            .then(response => { statusDiv.textContent = response?.success ? 'Mediation re-request sent.' : `Error: ${response?.error}`; })
            .catch(e => { statusDiv.textContent = `Error sending message: ${e.message}`; });
    });
} */

// === UPDATED Event Listener for DID Auth Button use NonceCarrierToken ===
if (didAuthBtn && oidcRequestInput) {
    // Update sample to include nonceCarrierToken placeholder
    const sampleOidcRequest = {
        response_type: 'id_token',
        scope: 'openid',
        client_id: 'YOUR_RP_CLIENT_ID_HERE', // e.g., http://localhost:3001 (Portal Frontend)
        redirect_uri: 'YOUR_RP_CALLBACK_URL_HERE', // e.g., https://localhost:3000/api/auth/oidc-callback (Portal Backend)
        nonce: 'GENERATED_BY_RP_' + crypto.randomUUID(),
        state: crypto.randomUUID(),
        nonceCarrierToken: "PASTE_NONCE_CARRIER_TOKEN_FROM_RP_HERE" // <<< New field
    };
    oidcRequestInput.value = JSON.stringify(sampleOidcRequest, null, 2);

    didAuthBtn.addEventListener('click', () => {
        let requestData;
        const inputText = oidcRequestInput.value.trim();

        if (!inputText) {
             statusDiv.textContent = 'Using sample OIDC Request (update placeholders!).';
             statusDiv.style.color = 'orange';
             requestData = sampleOidcRequest;
        } else {
            try {
                requestData = JSON.parse(inputText);
                // Basic validation for new required field
                if (!requestData.client_id || !requestData.redirect_uri || !requestData.nonce || !requestData.response_type?.includes('id_token') || !requestData.nonceCarrierToken) { // <<< Check for nonceCarrierToken
                    throw new Error("Required fields missing (client_id, redirect_uri, nonce, response_type=id_token, nonceCarrierToken).");
                }
            } catch (e) {
                statusDiv.textContent = `OIDC Request Parse Error: ${e.message}`;
                statusDiv.style.color = 'red';
                console.error("OIDC Request Parse Error:", e);
                return; // Stop processing
            }
        }

        console.log("Sending DID Auth request to background with data:", requestData);
        statusDiv.textContent = 'Processing DID Auth...';
        statusDiv.style.color = 'inherit';
        didAuthBtn.disabled = true;

        // Send the full requestData (which now includes nonceCarrierToken)
        chrome.runtime.sendMessage({ type: 'DID_AUTH_REQUEST', request: requestData })
            .then(response => {
                console.log("DID Auth response from background:", response);
                if (response?.success) {
                     statusDiv.textContent = 'DID Auth: Response sent to RP!';
                     statusDiv.style.color = 'green';
                } else {
                     statusDiv.textContent = `DID Auth Failed: ${response?.error || 'Unknown error'}`;
                     statusDiv.style.color = 'red';
                }
            })
            .catch(error => {
                console.error("Error sending DID_AUTH_REQUEST message:", error);
                statusDiv.textContent = `DID Auth Message Error: ${error.message}`;
                statusDiv.style.color = 'red';
            })
            .finally(() => {
                 didAuthBtn.disabled = false;
            });
    });
} else {
    console.warn("DID Auth UI elements not found.");
}
// ===================================

// --- Initial Load ---
requestStatus();
/******/ })()
;
//# sourceMappingURL=popup.js.map