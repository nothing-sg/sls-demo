# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`**: read ADRs that touch the area you're about to work in

This repo is single-context: one modular monolith, one glossary, one ADR log. There is no `CONTEXT-MAP.md` and no per-module `CONTEXT.md` — module boundaries inside `backend/src/` are an implementation detail (see ADR-0001), not separate domain contexts.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-serverless-modular-monolith.md
│   ├── 0002-aurora-postgres-shared-database-module-ownership.md
│   └── 0003-phi-safe-logging-and-audit-trail.md
└── backend/src/
    ├── shared/       ← cross-module kernel (auth, db, logging, config)
    ├── patients/
    ├── scheduling/
    └── audit/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids — this matters more than usual here, since HIPAA "minimum necessary" reasoning and audit-log queries depend on consistent terms for PHI-adjacent concepts (e.g. always "Encounter", never "Visit" or "Session").

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (shared database, module-owned tables), but worth reopening because…_
