// Tenant scoping in the data layer (DATABASE_DESIGN.md section 5, SECURITY_MODEL.md section 3).
//
// Every college-owned model uses `tenantPlugin`. Queries, updates, deletes and aggregates on such a
// model are limited to the college in the current tenant context, and throw if there is none; new
// documents take their collegeId from the context. Code that genuinely works across colleges must
// say so with `.setOptions({ platformScope: true })` (allowed only in listed platform modules).

import { AsyncLocalStorage } from "node:async_hooks";

import { Types, type MongooseQueryMiddleware, type Query, type Schema } from "mongoose";

export interface TenantContext {
  collegeId: Types.ObjectId;
}

const storage = new AsyncLocalStorage<TenantContext>();

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

/**
 * Run `fn` with every tenant-scoped query limited to one college. The result is awaited inside the
 * context, so a lazy Mongoose query returned by `fn` (for example `() => Model.find()`) also runs
 * with the college applied instead of running later without it.
 */
export function runInTenant<T>(collegeId: Types.ObjectId | string, fn: () => T): Promise<Awaited<T>> {
  return storage.run({ collegeId: new Types.ObjectId(collegeId) }, async (): Promise<Awaited<T>> => await fn());
}

export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

const QUERY_OPS: MongooseQueryMiddleware[] = [
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "distinct",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
];

function sameCollege(a: unknown, b: Types.ObjectId): boolean {
  return a !== undefined && a !== null && String(a) === String(b);
}

export function tenantPlugin(schema: Schema): void {
  schema.pre(QUERY_OPS, function (this: Query<unknown, unknown>) {
    if (this.getOptions().platformScope) return;
    const tenant = currentTenant();
    if (!tenant) throw new TenantScopeError(`${this.model.modelName}.${(this as unknown as { op?: string }).op ?? "query"} ran without a college context`);
    const requested = this.getFilter().collegeId;
    if (requested !== undefined && !sameCollege(requested, tenant.collegeId)) {
      throw new TenantScopeError(`${this.model.modelName}.${(this as unknown as { op?: string }).op ?? "query"} asked for another college's data`);
    }
    this.where({ collegeId: tenant.collegeId });
  });

  schema.pre("aggregate", function () {
    if (this.options.platformScope) return;
    const tenant = currentTenant();
    if (!tenant) throw new TenantScopeError("aggregate ran without a college context");
    this.pipeline().unshift({ $match: { collegeId: tenant.collegeId } });
  });

  schema.pre("validate", function () {
    if (!this.isNew) return;
    const tenant = currentTenant();
    if (!tenant) throw new TenantScopeError(`a new ${(this.constructor as { modelName?: string }).modelName ?? "document"} was created without a college context`);
    const current = this.get("collegeId") as unknown;
    if (current === undefined || current === null) this.set("collegeId", tenant.collegeId);
    else if (!sameCollege(current, tenant.collegeId)) throw new TenantScopeError("a new document named another college");
  });
}

declare module "mongoose" {
  interface QueryOptions {
    /** Explicitly cross-college access (platform modules only). */
    platformScope?: boolean;
  }
  interface AggregateOptions {
    platformScope?: boolean;
  }
}
