// express-rate-limit store backed by the rateLimits collection (no Redis, M6). One atomic update per
// hit; counters expire with a TTL index. If the database cannot be reached the error reaches the
// error handler (503), so authentication endpoints fail closed rather than allowing unlimited tries.

import type { Store, IncrementResponse, Options } from "express-rate-limit";

import type { Models } from "../models/index.ts";

export class MongoRateLimitStore implements Store {
  windowMs = 60_000;
  readonly prefix: string;
  /** Counters are shared across API instances. */
  readonly localKeys = false;
  private readonly models: Models;
  private readonly now: () => Date;

  constructor(models: Models, prefix: string, now: () => Date = () => new Date()) {
    this.models = models;
    this.prefix = prefix;
    this.now = now;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private id(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = this.now();
    const newReset = new Date(now.getTime() + this.windowMs);
    const live = { $gt: ["$resetAt", now] };
    // Pipeline update: keep counting inside the window, start a new window after it.
    const doc = await this.models.RateLimit.collection.findOneAndUpdate(
      { _id: this.id(key) as never },
      [
        {
          $set: {
            count: { $cond: [live, { $add: ["$count", 1] }, 1] },
            resetAt: { $cond: [live, "$resetAt", newReset] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    return { totalHits: Number(doc?.count ?? 1), resetTime: (doc?.resetAt as Date | undefined) ?? newReset };
  }

  async decrement(key: string): Promise<void> {
    await this.models.RateLimit.collection.updateOne({ _id: this.id(key) as never }, { $inc: { count: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    await this.models.RateLimit.collection.deleteOne({ _id: this.id(key) as never });
  }
}
