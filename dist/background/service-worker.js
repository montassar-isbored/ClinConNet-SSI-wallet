/******/ (() => { // webpackBootstrap
/*!**************************************!*\
  !*** ./background/service-worker.js ***!
  \**************************************/
// background/service-worker.js

const OFFSCREEN_DOCUMENT_PATH = '/offscreen/offscreen.html';

// This is a robust, stateless function to safely create the offscreen document.
async function getOffscreenDocument() {
  // Check if a document is already available.
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    return; // It already exists, so we don't need to do anything.
  }

  // Create the document. The `await` ensures we don't proceed until it's ready.
  console.log('Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['DOM_PARSER'],
    justification: 'To run Veramo agent with DOM APIs',
  });
}

// This is the corrected message listener.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {    
    (async () => {
        try {
            // These messages are simple and can be handled directly by the service worker.
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
            } 
            // For any other message type, we assume it's for Veramo.
            // The only job of the service worker is to make sure the offscreen
            // document is running before the message is processed there.
            else {
                await getOffscreenDocument();
                // We DON'T re-send the message here. The offscreen document's listener
                // has already received the original message. We just needed to
                // make sure it was awake. We can send a simple success
                // message back to the original caller if needed.
                // However, the real response will come from the offscreen listener.
                // By not calling sendResponse here, we keep the message channel open
                // for the offscreen document to respond.
            }
        } catch (error) {
            console.error(`Service Worker error handling ${message.type}:`, error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    // Return true to indicate that the response will be sent asynchronously.
    // This is crucial because our offscreen document will be the one to respond.
    return true;
});
/******/ })()
;