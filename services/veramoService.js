// services/veramoService.js
import { createAgent } from '@veramo/core';
import { KeyManager } from '@veramo/key-manager';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
import { DIDManager } from '@veramo/did-manager';
import { KeyDIDProvider } from '@veramo/did-provider-key';
import { CredentialPlugin } from '@veramo/credential-w3c';
import { DIDStoreJson, KeyStoreJson, PrivateKeyStoreJson } from '@veramo/data-store-json';
import { loadState, saveState } from './chromeStorageHelper.js';
import { DIDResolverPlugin } from '@veramo/did-resolver';
import { Resolver } from 'did-resolver';
import { getResolver as getKeyDidResolver } from 'key-did-resolver';
import { DIDComm } from '@veramo/did-comm';
import { MessageHandler } from '@veramo/message-handler';

let agent = null;
let initializationPromise = null;

const KMS_SECRET_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
const USER_DID_ALIAS = 'user-default-key';

function stringToBase64Url(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  return Buffer.from(utf8Bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function _initializeVeramoAgent() {
    try {
        const initialState = await loadState();
        const jsonStoreManager = {
            state: initialState,
            notifyUpdate: async (newState) => await saveState(newState),
        };
        const didResolver = new Resolver({ ...getKeyDidResolver() });
        const agentPlugins = [
             new KeyManager({ store: new KeyStoreJson(jsonStoreManager), kms: { local: new KeyManagementSystem(new PrivateKeyStoreJson(jsonStoreManager, new SecretBox(KMS_SECRET_KEY))) } }),
             new DIDManager({ store: new DIDStoreJson(jsonStoreManager), defaultProvider: 'did:key', providers: { 'did:key': new KeyDIDProvider({ defaultKms: 'local' }) } }),
             new CredentialPlugin(),
             new DIDResolverPlugin({ resolver: didResolver }),
             new MessageHandler({ messageHandlers: [] }),
             new DIDComm(),
        ];
        agent = createAgent({ plugins: agentPlugins });
        const identifiers = await agent.didManagerFind({ alias: USER_DID_ALIAS });
        if (identifiers.length === 0) {
             await agent.didManagerCreate({ provider: 'did:key', kms: 'local', alias: USER_DID_ALIAS });
        }
        return agent;
    } catch (error) {
        console.error('[Veramo Service] FATAL:', error);
        initializationPromise = null;
        throw error;
    }
}

export async function getAgent() {
    if (agent) return agent;
    if (!initializationPromise) initializationPromise = _initializeVeramoAgent();
    agent = await initializationPromise;
    return agent;
}

export async function createNewDidKey(alias = undefined) {
    const agentInstance = await getAgent();
    return await agentInstance.didManagerCreate({ provider: 'did:key', kms: 'local', alias });
}

export async function handleDidAuthRequest(oidcRequestParams) {
    console.log('[Auth] Step 1: Entered handleDidAuthRequest.');
    try {
        const agentInstance = await getAgent();
        console.log('[Auth] Step 2: Agent retrieved.');

        const identifiers = await agentInstance.didManagerFind({ provider: 'did:key' });
        if (identifiers.length === 0) throw new Error(`Wallet has no did:key available.`);
        console.log('[Auth] Step 3: DIDs found.');

        const userDidIdentifier = identifiers.find(id => id.alias === USER_DID_ALIAS) || identifiers[0];
        const userDid = userDidIdentifier.did;
        const signingKey = userDidIdentifier.keys.find(k => k.kms === 'local');
        if (!signingKey) { throw new Error(`No signing key found for DID ${userDid}`); }
        const signingKid = signingKey.kid;
        console.log('[Auth] Step 4: Signing key found:', signingKid);

        const { client_id, redirect_uri, nonce, state, response_type, nonceCarrierToken } = oidcRequestParams;
        if (!client_id || !redirect_uri || !nonce || !response_type?.includes('id_token') || !nonceCarrierToken) {
            throw new Error('Invalid OIDC Request parameters.');
        }

        const jwtHeader = { alg: 'EdDSA', typ: 'JWT', kid: `${userDid}#${signingKid}` };
        const now = Math.floor(Date.now() / 1000);
        const exp = now + (60 * 10);
        const idTokenPayload = { iss: userDid, sub: userDid, aud: client_id, exp: exp, iat: now, nonce: nonce };

        const encodedHeader = stringToBase64Url(JSON.stringify(jwtHeader));
        const encodedPayload = stringToBase64Url(JSON.stringify(idTokenPayload));
        const signingInputString = `${encodedHeader}.${encodedPayload}`;
        const signingInputBytes = new TextEncoder().encode(signingInputString);
        console.log('[Auth] Step 5: JWT payload created. Attempting to sign...');
        
        const signatureStringFromKms = await agentInstance.keyManagerSign({ keyRef: signingKid, algorithm: 'EdDSA', data: signingInputBytes });
        console.log('[Auth] Step 6: Signing successful!');
        
        if (!signatureStringFromKms || typeof signatureStringFromKms !== 'string') {
             throw new Error('keyManagerSign did not return a valid string signature.');
        }

        const idTokenJwt = `${signingInputString}.${signatureStringFromKms}`;
        const responsePayload = new URLSearchParams();
        responsePayload.append('id_token', idTokenJwt);
        if (state) { responsePayload.append('state', state); }
        responsePayload.append('nonceCarrierToken', nonceCarrierToken);
        console.log('[Auth] Step 7: JWT assembled. Sending to server...');

        const response = await fetch(redirect_uri, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: responsePayload.toString(),
            mode: 'cors'
        });
        console.log('[Auth] Step 8: Server responded.');

        if (!response.ok) {
             throw new Error(`RP rejected the response (status ${response.status}).`);
        }
        return { success: true, idToken: idTokenJwt };
    } catch (error) {
        console.error('[Wallet Veramo Service] Failed to handle DID Auth Request:', error);
        throw error;
    }
}