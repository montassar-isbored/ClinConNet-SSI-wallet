// pages-js/form-display.js
import { Buffer } from 'buffer';
window.Buffer = Buffer;

// Helper to decode the JWS payload for display, without verifying
function decodeJWSPayload(jws) {
    try {
        const payloadB64Url = jws.split('.')[1];
        const payloadJson = Buffer.from(payloadB64Url, 'base64').toString('utf8');
        return JSON.parse(payloadJson);
    } catch (e) {
        console.error("Failed to decode JWS payload", e);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Get references to ALL elements, including the 'send response' section
    const formContainer = document.getElementById('formContainer');
    const verifySignatureBtn = document.getElementById('verifySignatureBtn');
    const verificationStatus = document.getElementById('verificationStatus');
    const signBtn = document.getElementById('signBtn');
    const generateProofBtn = document.getElementById('generateProofBtn');
    const proofContainer = document.getElementById('proofContainer');
    const proofOutput = document.getElementById('proofOutput');
    const copyProofBtn = document.getElementById('copyProofBtn');
    const actionsContainer = document.getElementById('actionsContainer');
    const sendResponseContainer = document.getElementById('sendResponseContainer');
    const txRefInput = document.getElementById('txRefInput');
    const sendResponseBtn = document.getElementById('sendResponseBtn');
    const sendResponseStatus = document.getElementById('sendResponseStatus');

    const urlParams = new URLSearchParams(window.location.search);
    const messageId = urlParams.get('messageId');
    if (!messageId) { formContainer.innerHTML = '<h2>Error: No message ID provided.</h2>'; return; }

    const response = await chrome.runtime.sendMessage({ type: 'GET_MESSAGE_BY_ID', id: messageId });
    if (!response.success || !response.message) { formContainer.innerHTML = '<h2>Error: Message not found.</h2>'; return; }
    
    const message = response.message;
    const formInfo = { from: message.from, original_form_jws: message.body.form_jws };
    const decodedPayload = decodeJWSPayload(formInfo.original_form_jws);
    
    if (!decodedPayload || !decodedPayload.html) { formContainer.innerHTML = '<h2>Error: Could not decode form from message.</h2>'; return; }
    
    formContainer.innerHTML = decodedPayload.html;
    const formElement = formContainer.querySelector('form');

    // Declare variables in the shared parent scope
    let userData = null;
    let userSignatureJws = null;
    let encryptedConsentForSpa = null; // Starts as null

    verifySignatureBtn.addEventListener('click', async () => {
        verificationStatus.textContent = 'Verifying...';
        try {
            const verifyResponse = await chrome.runtime.sendMessage({ 
                type: 'VERIFY_CONSENT_SIGNATURE', 
                payload: { jws: formInfo.original_form_jws, from: message.from }
            });
            if (verifyResponse.success && verifyResponse.verified) {
                verificationStatus.textContent = `Signature VERIFIED. Signer: ${verifyResponse.signerDid}`;
                verificationStatus.style.borderColor = 'green';
                signBtn.disabled = false;
            } else {
                throw new Error(verifyResponse.error || 'Verification failed');
            }
        } catch(e) {
            verificationStatus.textContent = `Signature INVALID: ${e.message}`;
            verificationStatus.style.borderColor = 'red';
        }
    });

    signBtn.addEventListener('click', async () => {
        const formData = new FormData(formElement);
        userData = Object.fromEntries(formData.entries());
        signBtn.disabled = true;
        signBtn.textContent = 'Signing...';

        const signResponse = await chrome.runtime.sendMessage({ type: 'SIGN_CONSENT_DATA', payload: { userData }});
        if (signResponse.success) {
            userSignatureJws = signResponse.userSignatureJws;
            signBtn.textContent = 'Signed!';
            generateProofBtn.disabled = false;
        } else {
            alert(`Signing failed: ${signResponse.error}`);
            signBtn.disabled = false;
            signBtn.textContent = 'Sign';
        }
    });

    generateProofBtn.addEventListener('click', async () => {
        // This is your working method of getting the key
        const organizationEncryptionKeyHex = document.getElementById('org-encryption-key').textContent;
        const proofResponse = await chrome.runtime.sendMessage({
            type: 'GENERATE_CONSENT_PROOF',
            payload: {
                original_form_jws: formInfo.original_form_jws,
                user_consent_data: userData,
                user_signature_jws: userSignatureJws,
                organization_encryption_key_hex: organizationEncryptionKeyHex
            }
        });
        if (proofResponse.success) {
            // <<< THE FIX: Save the encrypted data to the shared variable.
            encryptedConsentForSpa = proofResponse.encryptedConsentForSpa;

            // This part you already had.
            proofOutput.textContent = proofResponse.consentProofHash;
            proofContainer.style.display = 'block';
            actionsContainer.style.display = 'none';
            sendResponseContainer.style.display = 'block'; 
        } else {
            alert(`Proof generation failed: ${proofResponse.error}`);
        }
    });

    copyProofBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(proofOutput.textContent).then(() => {
            copyProofBtn.textContent = 'Copied!';
            setTimeout(() => { copyProofBtn.textContent = 'Copy Proof'; }, 2000);
        });
    });

    // The 'Send' button logic, now able to access the saved data
    sendResponseBtn.addEventListener('click', async () => {
        const txRef = txRefInput.value.trim();
        if (!txRef) {
            alert('Please paste the transaction reference from the portal.');
            return;
        }

        sendResponseStatus.textContent = 'Sending final response...';
        sendResponseBtn.disabled = true;

        try {
            if (!encryptedConsentForSpa) {
                throw new Error("Encrypted consent data is missing. Please regenerate proof.");
            }

            await chrome.runtime.sendMessage({
                type: 'SEND_MESSAGE',
                payload: {
                    to: formInfo.from,
                    body: { 
                        type: 'https://clinconnet.com/protocols/consent/1.0/response', 
                        encryptedSignedConsent: encryptedConsentForSpa,
                        consentProofTxRef: txRef 
                    }
                }
            });

            sendResponseStatus.textContent = 'Response sent successfully! You can now close this page.';
            sendResponseStatus.style.borderColor = 'green';

        } catch(e) {
            sendResponseStatus.textContent = `Error sending response: ${e.message}`;
            sendResponseStatus.style.borderColor = 'red';
            sendResponseBtn.disabled = false;
        }
    });
});