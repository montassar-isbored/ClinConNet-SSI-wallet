/******/ (() => { // webpackBootstrap
/*!************************!*\
  !*** ./popup/popup.js ***!
  \************************/
// popup/popup.js

const statusDiv = document.getElementById('status');
const publicDidSpan = document.getElementById('publicDid'); // Changed ID reference
const copyDidBtn = document.getElementById('copyDidBtn');
const createPeerDidBtn = document.getElementById('createPeerDidBtn');
const showAllDidsBtn = document.getElementById('showAllDidsBtn');
const didListContainer = document.getElementById('didListContainer');
const didListUl = document.getElementById('didList');
// === Add reference for new Peer DID list ===
const recentPeerDidsContainer = document.getElementById('recentPeerDidsContainer');
const peerDidListUl = document.getElementById('peerDidList');
// ==========================================

let currentPublicDid = 'N/A'; // Store the public DID for copying

// === ADD Truncation Function ===
function truncateDid(did, startChars = 20, endChars = 16) {
    // Show more starting chars for did:key:z...
    if (!did || typeof did !== 'string' || did === 'N/A' || did.length <= startChars + endChars + 3) {
      return did || 'N/A'; // Return original if invalid, N/A, or too short
    }
    const prefix = did.substring(0, startChars);
    const suffix = did.substring(did.length - endChars);
    return `${prefix}...${suffix}`;
  }
// --- NEW: Populate Recent Peer DIDs Function ---
function populatePeerDidList(peerDids) {
    peerDidListUl.innerHTML = ''; // Clear previous list

    if (!peerDids || peerDids.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No Peer DIDs created yet.';
        li.style.fontStyle = 'italic';
        peerDidListUl.appendChild(li);
        recentPeerDidsContainer.style.display = 'block'; // Show container even if empty
        return;
    }

    // Take only the latest 3 (already sliced in background)
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
                    copyButton.textContent = 'error';
                    setTimeout(() => { copyButton.textContent = 'copy!'; }, 1500);
                });
        });
        li.appendChild(copyButton);

        peerDidListUl.appendChild(li);
    });
    recentPeerDidsContainer.style.display = 'block'; // Show the list
}
// =================================================
  
  // --- Update UI Function ---
  function updatePopupUI(statusData) {
      // ... (handle null statusData as before) ...
      if (!statusData) {
        statusDiv.textContent = 'Error getting status or Agent not ready.';
        statusDiv.style.color = 'red';
        publicDidSpan.textContent = 'N/A';
        currentPublicDid = 'N/A';
        copyDidBtn.disabled = true;
        createPeerDidBtn.disabled = true; // Disable actions if not init
        showAllDidsBtn.disabled = true;
        return;
    }
  
      if (statusData?.isInitialized) {
          statusDiv.textContent = `Wallet Initialized (${statusData.didCount} DIDs available) `;
          statusDiv.style.color = 'green';
  
          // Store full DID, display truncated DID
          currentPublicDid = statusData.publicDid || 'N/A';
          publicDidSpan.textContent = truncateDid(currentPublicDid); // <-- Use truncateDid here
          copyDidBtn.disabled = (currentPublicDid === 'N/A');
  
          createPeerDidBtn.disabled = false;
          showAllDidsBtn.disabled = false;
        // === Call new function to populate peer DIDs ===
          populatePeerDidList(statusData.recentPeerDids);
  
      } else {
          // ... (handle not initialized state as before, setting currentPublicDid to 'N/A') ...
          statusDiv.textContent = 'Wallet Not Initialized';
          statusDiv.style.color = 'orange';
          publicDidSpan.textContent = 'N/A';
          currentPublicDid = 'N/A';
          copyDidBtn.disabled = true;
          createPeerDidBtn.disabled = true;
          showAllDidsBtn.disabled = true;
          recentPeerDidsContainer.style.display = 'none'; // Hide peer DIDs if not init
      }
     
    // Hide DID list initially
    didListContainer.style.display = 'none';
    didListUl.innerHTML = '';
}

// --- Request Status on Load ---
function requestStatus() {
    statusDiv.textContent = 'Requesting status...';
    publicDidSpan.textContent = 'N/A';
    copyDidBtn.disabled = true;
    createPeerDidBtn.disabled = true;
    showAllDidsBtn.disabled = true;
    didListContainer.style.display = 'none';

    chrome.runtime.sendMessage({ type: 'GET_AGENT_STATUS' })
        .then(response => {
            // Added more logging instructions to 
            console.log("Popup received status response object:", JSON.stringify(response));
            if (response?.success) {
                 console.log("Popup received status data:", JSON.stringify(response.status));
                 // Log the specific array we need to check:
                 console.log("Popup received recentPeerDids:", JSON.stringify(response.status?.recentPeerDids));
            }
            if (response && response.success) {
                updatePopupUI(response.status);
            } else {
                updatePopupUI(null); // Show error state
                statusDiv.textContent = `Error: ${response?.error || 'Could not get status'}`;
                statusDiv.style.color = 'red';
            }
        })
        .catch(error => {
            console.error("Error sending GET_AGENT_STATUS:", error);
            updatePopupUI(null); // Show error state
            statusDiv.textContent = `Error sending message: ${error.message}`;
            statusDiv.style.color = 'red';
        });
}

// --- Event Listeners ---

// Copy Button
copyDidBtn.addEventListener('click', () => {
    if (currentPublicDid !== 'N/A') {
        navigator.clipboard.writeText(currentPublicDid)
            .then(() => {
                // Visual feedback
                copyDidBtn.textContent = 'Copied!';
                setTimeout(() => { copyDidBtn.textContent = '📋'; }, 1500);
            })
            .catch(err => {
                console.error('Failed to copy DID: ', err);
                // Maybe briefly show an error state on the button
                copyDidBtn.textContent = 'Error';
                setTimeout(() => { copyDidBtn.textContent = '📋'; }, 1500);
            });
    }
});

// Create Peer DID Button
createPeerDidBtn.addEventListener('click', () => {
    statusDiv.textContent = 'Creating Peer DID...';
    createPeerDidBtn.disabled = true; // Disable while processing
    showAllDidsBtn.disabled = true; // Also disable others

    chrome.runtime.sendMessage({ type: 'CREATE_PEER_DID' })
        .then(response => {
            if (response && response.success) {
                statusDiv.textContent = 'Peer DID Created! Fetching status...';
                console.log('New Peer DID created:', response.newDid);
                requestStatus(); // Re-fetch status to update counts and potentially list
            } else {
                statusDiv.textContent = `Error creating Peer DID: ${response?.error || 'Unknown error'}`;
                statusDiv.style.color = 'red';
                // Re-enable buttons on failure after a delay, or fetch status anyway
                setTimeout(requestStatus, 2000);
            }
        })
        .catch(error => {
            console.error("Error sending CREATE_PEER_DID:", error);
            statusDiv.textContent = `Error sending message: ${error.message}`;
            statusDiv.style.color = 'red';
            // Re-enable buttons on failure after a delay, or fetch status anyway
            setTimeout(requestStatus, 2000);
        });
});

// Show All DIDs Button
showAllDidsBtn.addEventListener('click', () => {
    // Instead of sending a message, open the new page
    chrome.tabs.create({ url: 'pages/manageDids.html' });
});


// --- Initial Load ---
requestStatus();
/******/ })()
;
//# sourceMappingURL=popup.js.map