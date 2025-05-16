// services/veramoService.js (Wallet Extension)
// Implements manual JWT creation for DID Auth and handles nonceCarrierToken.
// Uses a minimal plugin set for agent initialization based on user's current working version.

// --- Base64URL Helper Functions ---
function stringToBase64Url(str) {
    const utf8Bytes = new TextEncoder().encode(str);
    const base64 = Buffer.from(utf8Bytes).toString('base64'); // Uses Buffer polyfill
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  function uint8ArrayToBase64Url(arr) {
    const base64 = Buffer.from(arr).toString('base64'); // Uses Buffer polyfill
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  // --- End Helper Functions ---
  
  // --- Veramo Core and Plugin Imports ---
  import { createAgent } from '@veramo/core';
  import { KeyManager } from '@veramo/key-manager';
  import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
  import { DIDManager } from '@veramo/did-manager';
  import { KeyDIDProvider } from '@veramo/did-provider-key';
  import { CredentialPlugin } from '@veramo/credential-w3c'; // For createJWT if it were working, but also for ICredentialPlugin type
  import { DIDStoreJson, KeyStoreJson, PrivateKeyStoreJson } from '@veramo/data-store-json';
  // Imports for other plugins if they were to be added back:
  // import { MessageHandler } from '@veramo/message-handler';
  // import { DIDComm, DIDCommMessageHandler, CoordinateMediationRecipientMessageHandler } from '@veramo/did-comm';
  // import { DIDResolverPlugin } from '@veramo/did-resolver';
  // import { Resolver } from 'did-resolver';
  // import { getResolver as getWebResolver } from 'web-did-resolver';
  // --- End Veramo Imports ---
  
  // Import our chrome.storage helper
  import { loadState, saveState } from './chromeStorageHelper.js'; // Corrected filename
  
  // --- Agent Setup ---
  let agent = null;
  let initializationPromise = null;
  
  const KMS_SECRET_KEY = '1111111111111111111111111111111111111111111111111111111111111111'; // EXAMPLE ONLY
  const USER_DID_ALIAS = 'user-default-key';
  
  // Hardcoded Mediator Info (for requestAndSetupMediation - will error if DIDComm not present)
  const MEDIATOR_DID = 'did:key:z6Mknee8x3XangPXcUDkwn6p7V9i4qyymVfxD1NXALv1tYTK';
  const MEDIATOR_ENDPOINT = `http://localhost:${process.env.PORT || 3000}/didcomm`;
  
  
  // Direct save function (no debounce)
  async function saveStateDirectly(state) {
      console.log('[Wallet Veramo Service] Calling saveState directly...');
      try {
          const stateSize = JSON.stringify(state)?.length || 0;
          console.log(`[Wallet Veramo Service] State size before save: ~${Math.round(stateSize / 1024)} KB`);
          await saveState(state);
          console.log('[Wallet Veramo Service] Direct saveState finished.');
      } catch (e) {
          console.error("[Wallet Veramo Service] Error during direct saveState call:", e);
      }
  }
  
  async function _initializeVeramoAgent() {
      console.log('[Wallet Veramo Service - JSON Store] Initializing...');
      try {
          const initialState = await loadState();
          console.log('[Wallet Veramo Service - JSON Store] Initial state loaded.');
  
          const jsonStoreManager = {
              state: initialState,
              notifyUpdate: async (newState) => {
                  jsonStoreManager.state = newState;
                  await saveStateDirectly(newState);
              }
          };
  
          const keyStore = new KeyStoreJson(jsonStoreManager);
          const didStore = new DIDStoreJson(jsonStoreManager);
          const privateKeyStore = new PrivateKeyStoreJson(jsonStoreManager, new SecretBox(KMS_SECRET_KEY));
  
          // Using the minimal plugin set user confirmed was working for agent method attachment
          const agentPlugins = [
               new KeyManager({
                   store: keyStore,
                   kms: { local: new KeyManagementSystem(privateKeyStore) }
               }),
               new DIDManager({
                   store: didStore,
                   defaultProvider: 'did:key',
                   providers: { 'did:key': new KeyDIDProvider({ defaultKms: 'local' }) }
               }),
               new CredentialPlugin(), // For JWT signing (even if createJWT isn't attaching, other parts might be needed by keyManagerSign implicitly or for future)
          ];
          console.log('[Wallet Veramo Service - JSON Store] Plugins prepared:', agentPlugins.map(p=>p.constructor.name));
  
  
          console.log('[Wallet Veramo Service - JSON Store] Creating Veramo agent instance...');
          agent = createAgent({ plugins: agentPlugins });
          console.log('[Wallet Veramo Service - JSON Store] Veramo agent created.');
  
          console.log('[Wallet Veramo Service - JSON Store] Agent methods check...');
          console.log('[Wallet Veramo Service - JSON Store] Type of agent.didManagerFind:', typeof agent?.didManagerFind);
          console.log('[Wallet Veramo Service - JSON Store] Type of agent.keyManagerSign:', typeof agent?.keyManagerSign);
          console.log('[Wallet Veramo Service - JSON Store] Type of agent.createJWT:', typeof agent?.createJWT); // For checking
  
          // Initial DID Check/Create (using find workaround)
          console.log(`[Wallet Veramo Service - JSON Store] Checking/creating initial Participant DID...`);
          try {
              const identifiers = await agent.didManagerFind({ alias: USER_DID_ALIAS, provider: 'did:key' });
              console.log(`[Wallet Veramo Service - JSON Store] didManagerFind result for alias check:`, JSON.stringify(identifiers));
              if (identifiers.length > 0) {
                   console.log(`[Wallet Veramo Service - JSON Store] Found existing Participant DID: ${identifiers[0].did}`);
              } else {
                   console.log(`[Wallet Veramo Service - JSON Store] No default Participant DID found. Creating...`);
                   await createNewDidKey(USER_DID_ALIAS);
              }
          } catch (e) { console.error(`[Wallet Veramo Service - JSON Store] Error during initial DID check/create:`, e); }
  
          console.log('[Wallet Veramo Service - JSON Store] Agent initialization logic finished successfully.');
          return agent;
  
      } catch (error) {
          console.error('[Wallet Veramo Service - JSON Store] FATAL: Failed to initialize Veramo agent:', error);
          initializationPromise = null;
          throw error;
      }
  }
  
  // Singleton pattern to get the agent
  async function getAgent() {
      if (agent) return agent;
      if (!initializationPromise) initializationPromise = _initializeVeramoAgent();
      try {
          agent = await initializationPromise;
          if (!agent) throw new Error("Agent initialization promise resolved but agent is still null.");
          return agent;
      } catch (error) {
          initializationPromise = null;
          throw error;
      }
  }
  
  // Function to create a new did:key (triggers save via notifyUpdate)
  async function createNewDidKey(alias = undefined) {
      const agentInstance = await getAgent();
      if (typeof agentInstance.didManagerCreate !== 'function') { throw new Error("Agent missing didManagerCreate method!"); }
      try {
          console.log(`[Wallet Veramo Service - JSON Store] Creating new did:key${alias ? ` with alias ${alias}` : ''}...`);
          const createOptions = { provider: 'did:key', kms: 'local' };
          if (alias) createOptions.alias = alias;
          const newDid = await agentInstance.didManagerCreate(createOptions);
          console.log(`[Wallet Veramo Service - JSON Store] Created new DID in memory: ${newDid.did}${alias ? ` (alias: ${alias})` : ''}`);
          return newDid;
      } catch (error) { console.error(`[Wallet Veramo Service - JSON Store] Error creating did:key:`, error); throw error; }
  }
  
  // Function to request mediation (will fail if DIDComm/MessageHandler not in plugins)
  async function requestAndSetupMediation() {
      console.log('[Wallet Veramo Service] Attempting to request mediation...');
      try {
          const agentInstance = await getAgent();
          if (!agentInstance ||
              typeof agentInstance.didManagerFind !== 'function' ||
              typeof agentInstance.packDIDCommMessage !== 'function' || // This method comes from DIDComm plugin
              typeof agentInstance.sendMessage !== 'function') { // This method comes from DIDComm plugin
              throw new Error('Agent missing required DIDComm/DIDManager methods for mediation request.');
          }
          const identifiers = await agentInstance.didManagerFind({ alias: USER_DID_ALIAS, provider: 'did:key' });
          if (identifiers.length === 0) throw new Error(`Default DID (${USER_DID_ALIAS}) not found.`);
          const recipientDid = identifiers[0].did;
          console.log(`[Wallet Veramo Service] Requesting mediation for DID: ${recipientDid} from Mediator: ${MEDIATOR_DID}`);
          const mediateRequestMessage = { type: 'https://didcomm.org/coordinate-mediation/3.0/mediate-request', from: recipientDid, to: MEDIATOR_DID, id: crypto.randomUUID(), body: {} };
          console.log('[Wallet Veramo Service] Packing and sending mediate-request message...');
          const packedMessage = await agentInstance.packDIDCommMessage({ message: mediateRequestMessage, packing: 'authcrypt' });
          await agentInstance.sendMessage({
              messageId: mediateRequestMessage.id,
              packedMessage: packedMessage,
              recipientDidUrl: MEDIATOR_DID,
          });
          console.log(`[Wallet Veramo Service] Mediate-request message sent to ${MEDIATOR_DID}.`);
      } catch (error) { console.error('[Wallet Veramo Service] Failed to send mediation request:', error); throw error; }
  }
  
  // Handle DID Auth Request function (Manual JWT Creation)
  async function handleDidAuthRequest(oidcRequestParams) {
      console.log('[Wallet Veramo Service] Handling DID Auth Request (Manual JWT):', oidcRequestParams);
      try {
          const agentInstance = await getAgent();
          if (!agentInstance ||
              typeof agentInstance.didManagerFind !== 'function' ||
              typeof agentInstance.keyManagerSign !== 'function') {
               throw new Error('Agent not ready or missing required methods (didManagerFind, keyManagerSign).');
          }
  
          console.log("[Wallet Veramo Service] Finding first available did:key for authentication...");
          const identifiers = await agentInstance.didManagerFind({ provider: 'did:key' });
          if (identifiers.length === 0) {
              throw new Error(`Wallet has no did:key available for authentication.`);
          }
          const userDidIdentifier = identifiers[0];
          const userDid = userDidIdentifier.did;
          const signingKey = userDidIdentifier.keys.find(k => k.kms === 'local');
          if (!signingKey) { throw new Error(`No signing key found for DID ${userDid}`); }
          const signingKid = signingKey.kid;
          console.log(`[Wallet Veramo Service] Using DID ${userDid} (Alias: ${userDidIdentifier.alias || 'N/A'}) and key ${signingKid} for signing.`);
  
          const { client_id, redirect_uri, nonce, state, response_type, nonceCarrierToken } = oidcRequestParams;
          if (!client_id || !redirect_uri || !nonce || !response_type?.includes('id_token') || !nonceCarrierToken) {
              throw new Error('Invalid OIDC Request parameters (missing client_id, redirect_uri, nonce, response_type=id_token, or nonceCarrierToken).');
          }
          console.log(`[Wallet Veramo Service] Authenticating to RP: ${client_id}`);
          console.log(`[Wallet Veramo Service] Received nonceCarrierToken (first few chars): ${nonceCarrierToken.substring(0,20)}...`);
  
          const jwtHeader = { alg: 'EdDSA', typ: 'JWT' };
          const now = Math.floor(Date.now() / 1000);
          const exp = now + (60 * 10); // Expires in 10 minutes
          const idTokenPayload = { iss: userDid, sub: userDid, aud: client_id, exp: exp, iat: now, nonce: nonce };
          console.log('[Wallet Veramo Service] JWT Header:', jwtHeader);
          console.log('[Wallet Veramo Service] ID Token Payload:', idTokenPayload);
  
          const encodedHeader = stringToBase64Url(JSON.stringify(jwtHeader));
          const encodedPayload = stringToBase64Url(JSON.stringify(idTokenPayload));
          const signingInputString = `${encodedHeader}.${encodedPayload}`;
          const signingInputBytes = new TextEncoder().encode(signingInputString);
  
          console.log('[Wallet Veramo Service] Calling keyManagerSign...');
          const signatureStringFromKms = await agentInstance.keyManagerSign({
              keyRef: signingKid,
              algorithm: 'EdDSA',
              data: signingInputBytes
          });
          if (!signatureStringFromKms || typeof signatureStringFromKms !== 'string') {
               throw new Error('keyManagerSign did not return a valid string signature.');
          }
          console.log('[Wallet Veramo Service] Signature received from keyManagerSign (Base64URL):', signatureStringFromKms);
          const encodedSignature = signatureStringFromKms;
  
          const idTokenJwt = `${signingInputString}.${encodedSignature}`;
          console.log('------------------------------------------');
          console.log('[Wallet Veramo Service] Assembled ID Token JWT:');
          console.log(idTokenJwt);
          console.log('------------------------------------------');
  
          const responsePayload = new URLSearchParams();
          responsePayload.append('id_token', idTokenJwt);
          if (state) { responsePayload.append('state', state); }
          responsePayload.append('nonceCarrierToken', nonceCarrierToken);
  
          console.log(`[Wallet Veramo Service] Sending response via fetch to RP: ${redirect_uri}`);
          console.log(`[Wallet Veramo Service] Full Response Payload being sent:`, responsePayload.toString());
  
          const response = await fetch(redirect_uri, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: responsePayload.toString(),
              mode: 'cors',
              credentials: 'include'
          });
  
          if (!response.ok) {
               let errorBodyText = await response.text();
               console.error(`[Wallet Veramo Service] RP responded with error: ${response.status} ${response.statusText}`, errorBodyText);
               throw new Error(`RP rejected the response (status ${response.status}). Details: ${errorBodyText}`);
          }
  
          console.log('[Wallet Veramo Service] Successfully sent ID Token response to RP.');
          return { success: true, idToken: idTokenJwt };
  
      } catch (error) {
          console.error('[Wallet Veramo Service] Failed to handle DID Auth Request:', error);
          throw error;
      }
  }
  
  // Export all necessary functions
  export { getAgent, createNewDidKey, requestAndSetupMediation, handleDidAuthRequest };
  