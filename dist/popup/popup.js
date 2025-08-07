/******/ (() => { // webpackBootstrap
/*!************************!*\
  !*** ./popup/popup.js ***!
  \************************/
// popup/popup.js
const statusDiv = document.getElementById('status');
const publicDidSpan = document.getElementById('publicDid');
const copyDidBtn = document.getElementById('copyDidBtn');
const createPeerDidBtn = document.getElementById('createPeerDidBtn');
const showAllDidsBtn = document.getElementById('showAllDidsBtn');
const recentPeerDidsContainer = document.getElementById('recentPeerDidsContainer');
const peerDidListUl = document.getElementById('peerDidList');
const oidcRequestInput = document.getElementById('oidcRequestInput');
const didAuthBtn = document.getElementById('didAuthBtn');
const goToMessagesBtn = document.getElementById('goToMessagesBtn');

let currentPublicDid = 'N/A';

function truncateDid(did, startChars = 20, endChars = 16) {
    if (!did || typeof did !== 'string' || did.length <= startChars + endChars + 3) return did || 'N/A';
    return `${did.substring(0, startChars)}...${did.substring(did.length - endChars)}`;
}

function populatePeerDidList(peerDids) {
    if (!peerDidListUl || !recentPeerDidsContainer) return;
    peerDidListUl.innerHTML = '';
    if (!peerDids || peerDids.length === 0) {
        peerDidListUl.innerHTML = '<li>No other DIDs created yet.</li>';
    } else {
        peerDids.forEach(fullDid => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="did-text">${truncateDid(fullDid)}</span>`;
            const copyButton = document.createElement('button');
            copyButton.textContent = 'copy';
            copyButton.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(fullDid).then(() => { copyButton.textContent = 'copied!'; setTimeout(() => { copyButton.textContent = 'copy'; }, 1500); }); };
            li.appendChild(copyButton);
            peerDidListUl.appendChild(li);
        });
    }
    recentPeerDidsContainer.style.display = 'block';
}

function updatePopupUI(statusData) {
    const allActionButtons = [copyDidBtn, createPeerDidBtn, showAllDidsBtn, didAuthBtn, goToMessagesBtn];
    if (!statusDiv || !publicDidSpan) return;

    if (statusData?.isInitialized) {
        statusDiv.textContent = `Wallet Initialized (${statusData.didCount || 0} DIDs)`;
        currentPublicDid = statusData.publicDid || 'N/A';
        publicDidSpan.textContent = truncateDid(currentPublicDid);
        allActionButtons.forEach(btn => btn && (btn.disabled = false));
        populatePeerDidList(statusData.recentPeerDids);
    } else {
        statusDiv.textContent = `Error: ${statusData?.error || 'Wallet Not Initialized'}`;
        publicDidSpan.textContent = 'N/A';
        allActionButtons.forEach(btn => btn && (btn.disabled = true));
    }
}

function requestStatus() {
    if (statusDiv) statusDiv.textContent = 'Requesting status...';
    chrome.runtime.sendMessage({ type: 'GET_AGENT_STATUS' })
        .then(response => {
            if (response?.success) updatePopupUI(response.status);
            else updatePopupUI({ isInitialized: false, error: response?.error });
        })
        .catch(error => updatePopupUI({ isInitialized: false, error: error.message }));
}

document.addEventListener('DOMContentLoaded', requestStatus);

if (copyDidBtn) {
    copyDidBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentPublicDid).then(() => {
            copyDidBtn.textContent = 'Copied!';
            setTimeout(() => { copyDidBtn.textContent = 'Copy DID'; }, 1500);
        });
    });
}

if (createPeerDidBtn) {
    createPeerDidBtn.addEventListener('click', () => {
        statusDiv.textContent = 'Creating Peer DID...';
        createPeerDidBtn.disabled = true;

        chrome.runtime.sendMessage({ type: 'CREATE_PEER_DID' })
            .then(response => {
                if (!response.success) console.error('Failed to create DID:', response.error);
                requestStatus();
            })
            .catch(err => {
                console.error('Error sending create message:', err);
                requestStatus();
            })
            .finally(() => {
                createPeerDidBtn.disabled = false;
            });
    });
}

if (showAllDidsBtn) {
    showAllDidsBtn.addEventListener('click', () => chrome.tabs.create({ url: 'pages/manageDids.html' }));
}
if (goToMessagesBtn) {
    goToMessagesBtn.addEventListener('click', () => chrome.tabs.create({ url: 'pages/messages.html' }));
}

if (didAuthBtn && oidcRequestInput) {
    didAuthBtn.addEventListener('click', () => {
        let requestData;
        try { requestData = JSON.parse(oidcRequestInput.value.trim()); } catch (e) { statusDiv.textContent = `OIDC Parse Error: ${e.message}`; return; }
        statusDiv.textContent = 'Processing DID Auth...';
        didAuthBtn.disabled = true;
        chrome.runtime.sendMessage({ type: 'DID_AUTH_REQUEST', request: requestData })
            .then(response => {
                statusDiv.textContent = response?.success ? 'DID Auth: Response sent!' : `DID Auth Failed: ${response?.error}`;
            })
            .catch(error => { statusDiv.textContent = `DID Auth Message Error: ${error.message}`; })
            .finally(() => { didAuthBtn.disabled = false; });
    });
}
/******/ })()
;