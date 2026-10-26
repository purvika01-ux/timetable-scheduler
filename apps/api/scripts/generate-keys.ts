// Generates an Ed25519 keypair for JWT signing and a 32-byte key for MFA secret encryption.
// Prints values formatted for apps/api/.env.

import { Buffer } from "node:buffer";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

const privateB64 = Buffer.from(privatePem).toString("base64");
const publicB64 = Buffer.from(publicPem).toString("base64");
const mfaKey = randomBytes(32).toString("base64");

console.log("# Generated keys for apps/api/.env (keep AUTH_JWT_PRIVATE_KEY and MFA_ENCRYPTION_KEY secret):\n");
console.log(`AUTH_JWT_PRIVATE_KEY=${privateB64}`);
console.log(`AUTH_JWT_KEY_ID=k1`);
console.log(`MFA_ENCRYPTION_KEY=${mfaKey}`);
console.log(`\n# Corresponding public key (for verification or rotation documentation):\n# ${publicB64}\n`);
