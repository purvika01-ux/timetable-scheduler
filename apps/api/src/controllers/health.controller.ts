import type { RequestHandler } from "express";

import { sendData } from "../http/response.ts";
import type { HealthService } from "../services/health.service.ts";

export function healthController(service: HealthService) {
  /** GET /api/v1/health: 200 when the API and database are up, 503 (same body shape) when the database is not. */
  const health: RequestHandler = async (_req, res) => {
    const report = await service.check();
    res.setHeader("Cache-Control", "no-store");
    if (report.status !== "ok") res.setHeader("Retry-After", "5");
    sendData(res, report, report.status === "ok" ? 200 : 503);
  };

  /** GET /api/v1/health/live: the process is running and answering (no dependency checks). */
  const live: RequestHandler = (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    sendData(res, { status: "up" });
  };

  return { health, live };
}
