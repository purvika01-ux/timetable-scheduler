# TECHNICAL_PLAN.md (superseded)

> **Superseded on 2026-10-26** by `ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_DESIGN.md`, `SECURITY_MODEL.md` and `SCHEDULING_ENGINE.md` (MERN direction, decisions M1 to M10 in `DECISIONS.md`). Do not implement from the earlier version of this file.

The earlier plan (2026-10-21) used FastAPI, PostgreSQL with row-level security and exclusion constraints, Redis with RQ, and OR-Tools CP-SAT. Its technology-neutral parts (token policy, API conventions, security requirements, testing journeys) were carried into the documents above.

The full earlier text is in git history, for example `git show e3f54c7:docs/TECHNICAL_PLAN.md`.
