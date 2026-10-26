import type { Router } from "express";

/** A feature area mounted under /api/v1 (for example health now; colleges, sign-in and others later). */
export interface ApiModule {
  /** Mount path below /api/v1, starting with "/". */
  path: string;
  router: Router;
}
