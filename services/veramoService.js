// services/veramoService.js
import { createAgent } from '@veramo/core';
import { KeyManager } from '@veramo/key-manager';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'; // Use Local KMS
import { DIDManager } from '@veramo/did-manager';
import { KeyStore, DIDStore, PrivateKeyStore, migrations, Entities } from '@veramo/data-store';
import { KeyDIDProvider } from '@veramo/did-provider-key';
import { DataSource } from 'typeorm';
import initSqlJs from 'sql.js';

// --- Database and Agent Setup ---
let agent = null;
let dbConnection = null;
let initializationPromise = null;

const DB_NAME = 'veramo-wallet.sqlite';
// !!! WARNING: Replace this with a secure key derivation method (e.g., from password) before production !!!
// !!! Must be a 64-character hex string (32 bytes) for SecretBox !!!
const KMS_SECRET_KEY = '0000000000000000000000000000000000000000000000000000000000000000'; // Example only! Generate securely!

async function _initializeVeramoAgent() {
    console.log('Initializing Veramo Agent with sql.js and kms-local...');

    try {
        // Initialize sql.js Wasm
        const SQL = await initSqlJs({
             locateFile: (file) => `/${file}` // Assumes wasm file is in root of dist/
        });
        console.log('sql.js initialized');

        // Create TypeORM connection
        dbConnection = new DataSource({
            type: 'sqljs',
            // location: DB_NAME,
            // autoSave: true,
            useLocalForage: true, // Recommended for persistence
            logging: ['error', 'warn'],
            synchronize: false, // Use migrations
            migrations: migrations, // Veramo migrations
            migrationsRun: true,
            entities: Entities, // Veramo entities
            driver: SQL,
        });

        await dbConnection.initialize();
        console.log('Database connection initialized.');

        // Create Agent
        agent = createAgent({
            plugins: [
                new KeyManager({
                    store: new KeyStore(dbConnection),
                    kms: {
                        // Use kms-local, storing keys encrypted in the DB
                        local: new KeyManagementSystem(
                            new PrivateKeyStore(dbConnection, new SecretBox(KMS_SECRET_KEY))
                        ),
                    },
                }),
                new DIDManager({
                    store: new DIDStore(dbConnection),
                    defaultProvider: 'did:key',
                    providers: {
                        'did:key': new KeyDIDProvider({
                            defaultKms: 'local', // Use the 'local' KMS defined above
                        }),
                        // Add other providers later if needed
                    },
                }),
                // Add Resolver and Credential plugins later
            ],
        });
        console.log('Veramo agent created.');

        // Example: Check / Create initial DID
        const identifiers = await agent.didManagerFind();
        if (identifiers.length === 0) {
            console.log('No DIDs found, creating a new did:key...');
            const newDid = await agent.didManagerCreate({ provider: 'did:key', kms: 'local' }); // Specify KMS
            console.log('Created new DID:', newDid.did);
        } else {
            console.log(`Found ${identifiers.length} existing DIDs. First one: ${identifiers[0].did}`);
        }

        return agent;

    } catch (error) {
        console.error('FATAL: Failed to initialize Veramo agent:', error);
        throw error;
    }
}

// Singleton pattern to ensure agent is initialized only once
async function getAgent() {
    if (!initializationPromise) {
        initializationPromise = _initializeVeramoAgent();
    }
    try {
        agent = await initializationPromise;
        return agent;
    } catch (error) {
        initializationPromise = null; // Reset promise if initialization failed
        throw error;
    }
}

async function createNewDidKey() {
    const agentInstance = await getAgent(); // Ensures agent is initialized (or throws)
    // Check added previously - keep it:
    if (typeof agentInstance.didManagerCreate !== 'function') {
         throw new Error("Agent is missing didManagerCreate method!");
    }
    try {
        console.log('[Veramo Service - Reverted] Creating new did:key...');
        const newDid = await agentInstance.didManagerCreate({ provider: 'did:key', kms: 'local' });
        console.log('[Veramo Service - Reverted] Created new DID:', newDid.did);
        // NOTE: Persistence issue here still
        return newDid;
    } catch (error) {
        console.error('[Veramo Service - Reverted] Error creating new did:key:', error);
        throw error;
    }
}

export { getAgent, createNewDidKey };