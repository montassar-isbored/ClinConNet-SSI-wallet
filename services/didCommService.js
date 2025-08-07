// services/didCommService.js
import { getAgent } from './veramoService.js';
import { DIDCommMessageMediaType } from '@veramo/did-comm';
import { loadState, saveState } from './chromeStorageHelper.js';

const USER_DID_ALIAS = 'user-default-key';
const MEDIATOR_DID = 'did:key:z6Mknee8x3XangPXcUDkwn6p7V9i4qyymVfxD1NXALv1tYTK';
const MEDIATOR_ENDPOINT = `http://localhost:3002/didcomm`;
const MEDIATOR_PICKUP_ENDPOINT = `http://localhost:3002/pickup`;
const MEDIATOR_STORAGE_KEY = 'clinconnet-ssi-wallet-mediator';

export async function requestAndSetupMediation() {
    const agentInstance = await getAgent();
    const state = await loadState();
    if (state[MEDIATOR_STORAGE_KEY]?.did === MEDIATOR_DID) {
        return { success: true, message: 'Already mediated.' };
    }
    const identifiers = await agentInstance.didManagerFind({ alias: USER_DID_ALIAS });
    if (identifiers.length === 0) throw new Error(`Default DID (${USER_DID_ALIAS}) not found.`);
    const userDid = identifiers[0].did;
    const mediateRequestMessage = { type: 'https://didcomm.org/coordinate-mediation/2.0/mediate-request', from: userDid, to: MEDIATOR_DID, id: crypto.randomUUID(), body: {} };
    const packedMessage = await agentInstance.packDIDCommMessage({ message: mediateRequestMessage, packing: 'authcrypt' });
    const response = await fetch(MEDIATOR_ENDPOINT, { method: 'POST', headers: { 'Content-Type': DIDCommMessageMediaType.ENCRYPTED }, body: packedMessage.message });
    if (!response.ok) throw new Error(`Mediation request HTTP error: ${response.status}`);
    const packedGrant = await response.text();
    const unpackedGrant = await agentInstance.unpackDIDCommMessage({ message: packedGrant });
    if (unpackedGrant.message.type === 'https://didcomm.org/coordinate-mediation/2.0/mediate-grant') {
        const mediatorInfo = { did: MEDIATOR_DID, endpoint: MEDIATOR_ENDPOINT };
        const currentState = await loadState();
        await saveState({ ...currentState, [MEDIATOR_STORAGE_KEY]: mediatorInfo });
        return { success: true, mediatorInfo };
    } else {
        throw new Error(`Unexpected response from mediator: ${unpackedGrant.message.type}`);
    }
}

export async function pickupMessages() {
    const agentInstance = await getAgent();
    const allIdentifiers = await agentInstance.didManagerFind();
    const allDids = allIdentifiers.map(id => id.did);
    if (allDids.length === 0) return [];
    const state = await loadState();
    const mediatorInfo = state[MEDIATOR_STORAGE_KEY];
    if (!mediatorInfo) throw new Error('Mediation not set up.');
    let allNewMessages = [];
    for (const did of allDids) {
        try {
            const response = await fetch(MEDIATOR_PICKUP_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_did: did }) });
            if (!response.ok) continue;
            const deliveryMessage = await response.json();
            if (deliveryMessage.type === 'https://didcomm.org/messagepickup/3.0/delivery' && deliveryMessage.attachments?.length > 0) {
                for (const attachment of deliveryMessage.attachments) {
                    try {
                        const unpacked = await agentInstance.unpackDIDCommMessage({ message: JSON.stringify(attachment.data.json) });
                        allNewMessages.push(unpacked.message);
                    } catch (e) {
                        allNewMessages.push({ error: 'Failed to unpack message', raw: attachment.data.json });
                    }
                }
            }
        } catch (e) {
            console.error(`[DIDComm Service] Failed to pick up messages for ${did}:`, e);
        }
    }
    return allNewMessages;
}

// THIS IS THE CORRECTED FUNCTION
export async function sendMessage(payload) {
    console.log('[DIDCommService] Preparing to send message via mediator:', payload);
    const agentInstance = await getAgent();

    const identifiers = await agentInstance.didManagerFind({ alias: USER_DID_ALIAS });
    if (identifiers.length === 0) throw new Error(`Default DID (${USER_DID_ALIAS}) not found to send from.`);
    const senderDid = identifiers[0].did;

    // 1. Create the message for the final recipient (the SPA)
    const messageToRecipient = {
        type: 'https://didcomm.org/basicmessage/2.0/message',
        from: senderDid,
        to: payload.to,
        id: crypto.randomUUID(),
        created_time: new Date().getTime(),
        body: { content: payload.body },
    };

    // 2. Pack the message for the final recipient
    const packedForRecipient = await agentInstance.packDIDCommMessage({
        message: messageToRecipient,
        packing: 'authcrypt',
    });

    // 3. Create the "forward" message wrapper for the mediator
    const forwardMessage = {
        type: 'https://didcomm.org/routing/2.0/forward',
        from: senderDid,
        to: MEDIATOR_DID, // This message is FOR the mediator
        id: crypto.randomUUID(),
        body: {
            next: payload.to, // Tell the mediator to forward to this DID
        },
        attachments: [{
            media_type: 'application/json',
            data: { json: JSON.parse(packedForRecipient.message) },
        }],
    };

    // 4. Pack the forward message for the mediator
    const packedForMediator = await agentInstance.packDIDCommMessage({
        message: forwardMessage,
        packing: 'authcrypt',
        to: MEDIATOR_DID
    });

    // 5. Send the wrapped message
    const response = await fetch(MEDIATOR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': DIDCommMessageMediaType.ENCRYPTED },
        body: packedForMediator.message,
    });

    if (!response.ok) {
        throw new Error(`Mediator rejected the forward message: ${response.status}`);
    }

    return { success: true, messageId: messageToRecipient.id };
}