// Out-of-band CLI tool to seed the initial Platform Administrator (PA) account with 2-Step TOTP MFA.
// Usage:
//   npx tsx scripts/create-platform-admin.ts [email] [name] [password]

import { randomBytes } from "node:crypto";

import { hashPassword } from "../src/auth/passwords.ts";
import { encryptSecret } from "../src/auth/totp.ts";
import { loadConfig } from "../src/config.ts";
import { Database } from "../src/db/connection.ts";
import { setUpDatabase } from "../src/db/setup.ts";
import { createLogger } from "../src/logger.ts";
import { registerModels } from "../src/models/index.ts";

function generateBase32Secret(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = randomBytes(length);
  let res = "";
  for (let i = 0; i < length; i++) {
    res += chars[bytes[i]! % 32];
  }
  return res;
}

async function main() {
  const emailArg = process.argv[2]?.trim() || process.env.INITIAL_PA_EMAIL || "admin@platform.example.edu";
  const nameArg = process.argv[3]?.trim() || process.env.INITIAL_PA_NAME || "Platform Administrator";
  const passArg = process.argv[4]?.trim() || process.env.INITIAL_PA_PASSWORD || "PlatformMaster123!";

  const config = loadConfig(process.env);
  const logger = createLogger({ logLevel: "info", env: config.env });

  logger.info({ email: emailArg }, "Connecting to database to provision Platform Administrator...");
  const db = new Database({
    uri: config.mongoUri,
    serverSelectionTimeoutMs: config.dbServerSelectionTimeoutMs,
    logger,
  });

  const models = registerModels(db.connection);
  await db.connectWithRetry(async () => {
    await setUpDatabase(models, logger);
  });

  const emailNormalized = emailArg.toLowerCase();
  const totpSecret = generateBase32Secret(16);
  const secretEncrypted = encryptSecret(totpSecret, config.auth.mfaEncryptionKey);
  const passwordHash = await hashPassword(passArg);

  const existing = await models.User.findOne({ emailNormalized });
  if (existing) {
    existing.name = nameArg;
    existing.passwordHash = passwordHash;
    existing.status = "active";
    if (!existing.platformRoles.includes("PA")) {
      existing.platformRoles.push("PA");
    }
    existing.mfa = { enabled: true, secretEncrypted };
    await existing.save();
    logger.info({ userId: existing._id }, "Updated existing user to Platform Administrator with MFA enabled.");
  } else {
    const user = await models.User.create({
      name: nameArg,
      email: emailArg,
      emailNormalized,
      passwordHash,
      platformRoles: ["PA"],
      status: "active",
      mfa: { enabled: true, secretEncrypted },
    });
    logger.info({ userId: user._id }, "Created initial Platform Administrator account.");
  }

  const totpUri = `otpauth://totp/TimetableOptimizer:${encodeURIComponent(emailNormalized)}?secret=${totpSecret}&issuer=TimetableOptimizer`;

  console.log("\n========================================================");
  console.log("   PLATFORM ADMINISTRATOR (PA) PROVISIONED SUCCESSFULLY");
  console.log("========================================================");
  console.log(`Email:        ${emailArg}`);
  console.log(`Password:     ${passArg}`);
  console.log(`TOTP Secret:  ${totpSecret}`);
  console.log(`TOTP URI:     ${totpUri}`);
  console.log("========================================================");
  console.log("Scan or enter the TOTP Secret into Google Authenticator or 1Password.");
  console.log("Sign in at: /login with these credentials.\n");

  await db.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to provision Platform Administrator:", err);
  process.exit(1);
});
