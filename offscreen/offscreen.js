// offscreen/offscreen.js

function stringToBase64Url(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  return Buffer.from(utf8Bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeB64UrlToJson(b64Url) {
    const json = Buffer.from(b64Url, 'base64').toString('utf8');
    return JSON.parse(json);
}

import { Buffer } from 'buffer';
import process from 'process/browser';
window.Buffer = Buffer;
window.process = process;

import { getAgent, handleDidAuthRequest, createNewDidKey } from '../services/veramoService.js';
import { requestAndSetupMediation, pickupMessages, sendMessage } from '../services/didCommService.js';
import { loadState, saveState } from '../services/chromeStorageHelper.js';

import { ed25519, x25519 } from '@noble/curves/ed25519';
import { base58btc } from 'multiformats/bases/base58';


function getPublicKeyBytesFromDidKey(didKey) {
    if (!didKey.startsWith('did:key:z6Mk')) {
        throw new Error('Invalid did:key format for Ed25519.');
    }
    const multibaseKey = didKey.substring(8);
    const multicodecBytes = base58btc.decode(multibaseKey);
    return multicodecBytes.slice(2);
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const messageType = message?.type || 'UNKNOWN';
    (async () => {
        try { 
            if (messageType === 'SETUP_FETCH_MOCK') {
                self.fetch = (url, options) => {
                    if (url.includes('https://example.com/redirect')) {
                        console.log(`[Mock Fetch] Intercepted request to: ${url}`);
                        return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), {
                          status: 200,
                          headers: { 'Content-Type': 'application/json' },
                        }));
                    }
                    // This part is crucial: we must import the original fetch
                    // to avoid an infinite loop if we called self.fetch again.
                    // This assumes you are using a bundler that allows dynamic import.
                    return import('cross-fetch').then(({ fetch }) => fetch(url, options));
                };
                sendResponse({ success: true, mocked: true });
        } else if (messageType === 'VERIFY_CONSENT_SIGNATURE') {
                const jws = message.payload.jws;
                const signerDid = message.payload.from;

                const [encodedHeader, encodedPayload, signatureB64Url] = jws.split('.');
                if (!encodedHeader || !encodedPayload || !signatureB64Url) throw new Error('JWS is not a valid 3-part string.');
                
                // This now uses the corrected helper function
                const publicKeyBytes = getPublicKeyBytesFromDidKey(signerDid);

                const signingInput = `${encodedHeader}.${encodedPayload}`;
                const signingInputBytes = new TextEncoder().encode(signingInput);
                const signatureBytes = Buffer.from(signatureB64Url, 'base64');
                
                const isValid = await ed25519.verify(signatureBytes, signingInputBytes, publicKeyBytes);
                if (!isValid) throw new Error('Signature verification calculation failed.');

                sendResponse({ success: true, verified: true, signerDid: signerDid });

            } else if (messageType === 'GET_AGENT_STATUS') {
                const agent = await getAgent();
                const identifiers = await agent.didManagerFind();
                const allDidKeys = identifiers.filter(id => id.provider === 'did:key');
                const publicDidIdentifier = allDidKeys.find(id => id.alias === 'user-default-key') || allDidKeys[0];
                const peerDidIdentifiers = publicDidIdentifier ? allDidKeys.filter(id => id.did !== publicDidIdentifier.did) : allDidKeys;
                const recentPeerDids = peerDidIdentifiers.slice(-3).map(id => id.did);
                sendResponse({ success: true, status: { isInitialized: true, publicDid: publicDidIdentifier?.did, didCount: identifiers.length, recentPeerDids }});
            } else if (messageType === 'PICKUP_MESSAGES') {
                const newMessages = await pickupMessages();
                if (newMessages.length > 0) {
                    const currentState = await loadState();
                    const existingMessages = currentState.messages || [];
                    let stateWasModified = false;
                    for (const msg of newMessages) {
                        existingMessages.push({ ...msg, receivedTs: new Date().toISOString() });
                        stateWasModified = true;
                    }
                    if (stateWasModified) await saveState({ ...currentState, messages: existingMessages });
                }
                sendResponse({ success: true, count: newMessages.length });
            } else if (messageType === 'GET_MESSAGES') {
                const state = await loadState();
                const sortedMessages = (state.messages || []).sort((a, b) => new Date(b.receivedTs) - new Date(a.receivedTs));
                sendResponse({ success: true, messages: sortedMessages });
            } else if (messageType === 'GET_MESSAGE_BY_ID') {
                const state = await loadState();
                const foundMessage = (state.messages || []).find(m => m.id === message.id);
                sendResponse({ success: !!foundMessage, message: foundMessage });
            } else if (messageType === 'SIGN_CONSENT_DATA') {
                const agent = await getAgent();
                const userDidIdentifier = (await agent.didManagerFind({ alias: 'user-default-key' }))[0];
                const signingKey = userDidIdentifier.keys.find(k => k.kms === 'local');
                if (!signingKey) throw new Error('Could not find signing key for user');
                const header = { alg: 'EdDSA', typ: 'JWT', kid: `${userDidIdentifier.did}#${signingKey.kid}` };
                const encodedHeader = stringToBase64Url(JSON.stringify(header));
                const encodedPayload = stringToBase64Url(JSON.stringify(message.payload.userData));
                const signingInput = `${encodedHeader}.${encodedPayload}`;
                const signature = await agent.keyManagerSign({ keyRef: signingKey.kid, data: new TextEncoder().encode(signingInput) });
                sendResponse({ success: true, userSignatureJws: `${signingInput}.${signature}` });
            } else if (messageType === 'GENERATE_CONSENT_PROOF') {
                const { original_form_jws, user_consent_data, user_signature_jws, organization_encryption_key_hex } = message.payload;
                const agent = await getAgent();

                const finalConsentData = {
                    original_form_jws: original_form_jws,
                    user_consent_data: user_consent_data,
                    user_signature_jws: user_signature_jws
                };
                const finalConsentDataString = JSON.stringify(finalConsentData);
                // 2. Encrypt this entire object for the organization using the provided key
                const encryptedConsent = await agent.keyManagerEncryptJWE({
                    to: { type: 'X25519', publicKeyHex: organization_encryption_key_hex },
                    data: JSON.stringify(finalConsentData)
                });

                // 3. Hash the resulting encrypted string (JWE) to create the proof
                const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptedConsent));
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const consentProofHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                
                // 4. Send both back to the UI
                sendResponse({ success: true, consentProofHash, encryptedConsentForSpa: encryptedConsent });
            } else {
                if (messageType === 'GET_ALL_DIDS') {
                    const agent = await getAgent();
                    const identifiers = await agent.didManagerFind();
                    sendResponse({ success: true, identifiers });
                } else if (messageType === 'CREATE_PEER_DID') {
                    const newIdentifier = await createNewDidKey();
                    sendResponse({ success: true, newDid: newIdentifier.did });
                } else if (messageType === 'DID_AUTH_REQUEST') {
                    const result = await handleDidAuthRequest(message.request);
                    sendResponse({ success: true, result });
                } else if (messageType === 'REQUEST_MEDIATION') {
                    const result = await requestAndSetupMediation();
                    sendResponse({ success: true, ...result });
                } else if (messageType === 'SEND_MESSAGE') {
                    const result = await sendMessage(message.payload);
                    sendResponse(result);
                } else {
                     throw new Error(`[Offscreen] Unknown message type received: ${messageType}`);
                }
            }
        } catch (error) {
             console.error(`[Offscreen] Error handling message ${messageType}:`, error);
             sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
});