// Signed tokens (SECURITY_MODEL.md section 2.4). Access tokens carry identity only (user and
// session id): roles and colleges are always read from the database. EdDSA signatures with a key id,
// so keys can be rotated while older tokens expire.

import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

import { errors, jwtVerify, SignJWT } from "jose";

const ISSUER = "timetable-api";
const ACCESS_AUDIENCE = "timetable-web";
const CHALLENGE_AUDIENCE = "timetable-mfa";
const ALGORITHM = "EdDSA";

export interface AccessClaims {
  userId: string;
  sessionId: string;
  issuedAt: number;
}

export interface ChallengeClaims {
  userId: string;
  /** "verify" for a returning user; "enrol" when the user must set up two-step sign-in first. */
  purpose: "verify" | "enrol";
}

export class TokenError extends Error {
  readonly expired: boolean;
  constructor(message: string, expired = false) {
    super(message);
    this.name = "TokenError";
    this.expired = expired;
  }
}

export interface TokenServiceOptions {
  privateKeyPem: string;
  keyId: string;
  previousPublicKeys?: { keyId: string; publicKeyPem: string }[];
  accessTokenTtlSeconds: number;
  now?: () => Date;
}

export function createTokenService(options: TokenServiceOptions) {
  const privateKey: KeyObject = createPrivateKey(options.privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("AUTH_JWT_PRIVATE_KEY must be an Ed25519 key");
  const publicKeys = new Map<string, KeyObject>([[options.keyId, createPublicKey(privateKey)]]);
  for (const k of options.previousPublicKeys ?? []) publicKeys.set(k.keyId, createPublicKey(k.publicKeyPem));
  const now = options.now ?? (() => new Date());
  const seconds = () => Math.floor(now().getTime() / 1000);

  async function sign(payload: Record<string, unknown>, subject: string, audience: string, ttlSeconds: number) {
    const iat = seconds();
    return new SignJWT(payload)
      .setProtectedHeader({ alg: ALGORITHM, kid: options.keyId, typ: "JWT" })
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ttlSeconds)
      .sign(privateKey);
  }

  async function verifyToken(token: string, audience: string) {
    try {
      const { payload } = await jwtVerify(token, async (header) => {
        const key = header.kid ? publicKeys.get(header.kid) : undefined;
        if (!key) throw new TokenError("unknown signing key");
        return key;
      }, { issuer: ISSUER, audience, algorithms: [ALGORITHM], currentDate: now(), clockTolerance: 5 });
      return payload;
    } catch (err) {
      if (err instanceof errors.JWTExpired) throw new TokenError("token expired", true);
      throw new TokenError("invalid token");
    }
  }

  return {
    accessTokenTtlSeconds: options.accessTokenTtlSeconds,

    signAccess(userId: string, sessionId: string): Promise<string> {
      return sign({ sid: sessionId }, userId, ACCESS_AUDIENCE, options.accessTokenTtlSeconds);
    },

    async verifyAccess(token: string): Promise<AccessClaims> {
      const p = await verifyToken(token, ACCESS_AUDIENCE);
      if (typeof p.sub !== "string" || typeof p.sid !== "string" || typeof p.iat !== "number") throw new TokenError("invalid token");
      return { userId: p.sub, sessionId: p.sid, issuedAt: p.iat };
    },

    /** Five-minute token proving the password step passed, for the two-step code that follows. */
    signChallenge(userId: string, purpose: ChallengeClaims["purpose"]): Promise<string> {
      return sign({ purpose }, userId, CHALLENGE_AUDIENCE, 300);
    },

    async verifyChallenge(token: string): Promise<ChallengeClaims> {
      const p = await verifyToken(token, CHALLENGE_AUDIENCE);
      if (typeof p.sub !== "string" || (p.purpose !== "verify" && p.purpose !== "enrol")) throw new TokenError("invalid token");
      return { userId: p.sub, purpose: p.purpose };
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
