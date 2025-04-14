// pages/manageDids.js

// Helper function (No longer needed if we display full DIDs here)
/*
function truncateDid(did, startChars = 12, endChars = 8) {
  if (!did || typeof did !== 'string' || did.length <= startChars + endChars + 3) {
    return did || 'N/A';
  }
  const prefix = did.substring(0, startChars);
  const suffix = did.substring(did.length - endChars);
  return `${prefix}...${suffix}`;
}
*/

// Function to populate the list
function renderDidList(identifiers, listElement, firstDidKey) {
    listElement.innerHTML = ''; // Clear loading/previous

    if (!identifiers || identifiers.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No DIDs found in the wallet.';
        listElement.appendChild(li);
        return;
    }

    let publicDidLabeled = false;

    identifiers.forEach(identifier => {
        const li = document.createElement('li');
        const infoDiv = document.createElement('div');
        infoDiv.className = 'did-info';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'did-label';

        // Labeling logic
        if (identifier.did === firstDidKey && !publicDidLabeled) {
            labelSpan.textContent = 'Public DID (did:key)';
            publicDidLabeled = true;
        } else if (identifier.provider === 'did:key') {
            labelSpan.textContent = 'Peer DID (did:key)';
        } else {
            labelSpan.textContent = `Other DID (${identifier.provider || 'Unknown'})`;
        }

        const didSpan = document.createElement('span');
        // Display FULL DID as requested
        didSpan.textContent = identifier.did;
        didSpan.style.wordBreak = 'break-all'; // Ensure long DIDs wrap

        infoDiv.appendChild(labelSpan);
        infoDiv.appendChild(didSpan);

        // --- Date Placeholder ---
        // Add date display here if/when available from Veramo
        // const dateSpan = document.createElement('span');
        // dateSpan.textContent = 'Date Unavailable';
        // infoDiv.appendChild(dateSpan);
        // ----------------------

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.className = 'copy-did-page-btn';
        copyButton.title = 'Copy Full DID';
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(identifier.did) // Copy FULL DID
                .then(() => {
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1500);
                }).catch(err => {
                    console.error('Failed to copy DID:', err);
                    copyButton.textContent = 'Error';
                    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1500);
                });
        });

        li.appendChild(infoDiv);
        li.appendChild(copyButton);
        listElement.appendChild(li);
    });
}


// --- Main Execution ---
document.addEventListener('DOMContentLoaded', () => {
    const allDidsListElement = document.getElementById('allDidsList');
    // Removed closeButton reference

    if (!allDidsListElement) {
        console.error('Required elements not found on manageDids page.');
        return;
    }

    // Request DIDs from background script
    console.log('Requesting all DIDs from background...');
    chrome.runtime.sendMessage({ type: 'GET_ALL_DIDS' })
        .then(response => {
            console.log('Received response:', response);
            if (response && response.success && Array.isArray(response.identifiers)) {
                 // Identify the first did:key to pass for labeling
                 const firstDidKey = response.identifiers.find(id => id.provider === 'did:key')?.did;
                 renderDidList(response.identifiers, allDidsListElement, firstDidKey);
            } else {
                allDidsListElement.innerHTML = `<li>Error fetching DIDs: ${response?.error || 'Unknown error'}</li>`;
            }
        })
        .catch(error => {
            console.error('Error sending GET_ALL_DIDS message:', error);
            allDidsListElement.innerHTML = `<li>Error sending message: ${error.message}</li>`;
        });

    // Removed closeButton listener
});