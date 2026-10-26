// Create collections and indexes from the model definitions. Runs at startup after the database
// connects. Index creation is additive (createIndexes never drops anything); removing or changing an
// index is a deliberate migration, not a side effect of starting the server.

import type { Logger } from "../logger.ts";
import { TENANT_MODELS, type Models } from "../models/index.ts";

/** A document without a valid collegeId is refused by the database itself, not only by Mongoose. */
const TENANT_VALIDATOR = {
  $jsonSchema: { bsonType: "object", required: ["collegeId"], properties: { collegeId: { bsonType: "objectId" } } },
};

export async function setUpDatabase(models: Models, logger: Logger): Promise<{ collections: string[] }> {
  const tenant = new Set<string>(TENANT_MODELS);
  const collections: string[] = [];
  for (const [name, model] of Object.entries(models)) {
    const collection = model.collection.collectionName;
    const db = model.db.db;
    if (!db) throw new Error("database not connected");
    const exists = (await db.listCollections({ name: collection }, { nameOnly: true }).toArray()).length > 0;
    if (tenant.has(name)) {
      if (exists) await db.command({ collMod: collection, validator: TENANT_VALIDATOR, validationLevel: "strict", validationAction: "error" });
      else await db.createCollection(collection, { validator: TENANT_VALIDATOR, validationLevel: "strict", validationAction: "error" });
    } else if (!exists) {
      await db.createCollection(collection);
    }
    await model.createIndexes();
    collections.push(collection);
  }
  logger.info({ collections }, "database collections and indexes ready");
  return { collections };
}
