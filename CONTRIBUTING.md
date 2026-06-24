# Contributing to AgentCaps Registry

Thanks for helping improve AgentCaps Registry.

AgentCaps Registry is a file-first ARD registry engine for approved agent capabilities. The most valuable early contributions are real `SKILL.md` examples, CatalogEntry mapping feedback, validation rules, and source adapters.

## Good First Contributions

You do not need to start with code. Useful contributions include:

- submit a `SKILL.md` repository or direct URL that should be importable;
- review a generated CatalogEntry and suggest better `tags`, `capabilities`, or `representativeQueries`;
- add a realistic example registry workspace;
- improve validation findings and metadata quality checks;
- add or improve source adapters;
- improve documentation for private registry workflows.

## Project Boundaries

V0 focuses on `SKILL.md`-compatible capability sources:

- public git repositories containing `SKILL.md`;
- direct `SKILL.md` URLs.

Please keep contributions aligned with the current scope:

- output standard CatalogEntry fields;
- do not add AgentCaps-specific fields to emitted CatalogEntries;
- keep validation scores as metadata quality signals, not safety or trust scores;
- keep runtime enforcement, sandboxing, and execution receipts out of this registry engine.

MCP, A2A, and OpenAPI support are planned as future source types, but V0 should stay narrow and reliable.

## Local Development

Requirements:

- Node.js `>=22`
- pnpm
- git

```bash
pnpm install
pnpm build
pnpm test
pnpm pack --dry-run
```

## CLI Smoke Test

A quick manual workflow:

```bash
node dist/cli.js --root /tmp/agentcaps-registry init
node dist/cli.js --root /tmp/agentcaps-registry import --all
node dist/cli.js --root /tmp/agentcaps-registry build
```

For tests, prefer local fixtures instead of live GitHub state.

## Pull Request Checklist

Before opening a PR:

- run `pnpm build`;
- run `pnpm test`;
- run `pnpm pack --dry-run` if package metadata changed;
- add or update tests for behavior changes;
- keep generated `dist/`, local `.agentcaps/`, and `node_modules/` out of Git;
- explain whether the change affects emitted CatalogEntry fields.

## Issue Triage

Use these labels when applicable:

- `skill-md`: SKILL.md import or source examples;
- `catalog-entry`: CatalogEntry mapping and field quality;
- `validation`: metadata validation rules and findings;
- `drift`: source drift detection and snapshot behavior;
- `source-adapter`: git, direct URL, and future source adapters;
- `good first issue`: suitable for new contributors;
- `help wanted`: useful external contribution area.
