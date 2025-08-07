/******/ (() => { // webpackBootstrap
/*!**************************************!*\
  !*** ./background/service-worker.js ***!
  \**************************************/
// background/service-worker.js
const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';
let creating; 

async function setupOffscreenDocument(path) {
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existingContexts.length > 0) return;
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['DOM_PARSER'],
            justification: 'To run Veramo agent with DOM APIs',
        });
        await creating;
        creating = null;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {    
    (async () => {
        try {
            if (message.type === 'LOAD_STATE') {
                const result = await chrome.storage.local.get(['veramoAgentState']);
                sendResponse({ state: result.veramoAgentState });
            } else if (message.type === 'SAVE_STATE') {
                await chrome.storage.local.set({ 'veramoAgentState': message.state });
                sendResponse({ success: true });
            } else if (message.type === 'OPEN_FORM_PAGE') {
                await chrome.tabs.create({
                    url: `pages/form-display.html?formId=${message.formId}`
                });
                sendResponse({ success: true });
            } else {
                await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
                const response = await chrome.runtime.sendMessage(message);
                sendResponse(response);
            }
        } catch (error) {
            console.error(`Service Worker error handling ${message.type}:`, error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
});
/******/ })()
;