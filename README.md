# AgentCaps Registry

Enterprise-grade ARD registry for approved agent capabilities.

AgentCaps Registry turns scattered capability sources, starting with `SKILL.md`, into a governed ARD / AI Catalog that agents can discover, search, and consume. It is designed for teams that want agents to use approved, pinned, reviewable capabilities instead of importing arbitrary skills directly from the internet.

```text
SKILL.md-compatible source
-> reviewed CatalogEntry draft
-> published pinned snapshot
-> ai-catalog.json + search index
-> private or public agent capability registry
```

## Positioning

AgentCaps Registry is a registry engine, not another skill marketplace.

It provides the control object between capability producers and capability consumers:

- producers keep capability content in their own repositories or URLs;
- registry maintainers import and review those sources;
- only published entries are exported to the agent-facing catalog;
- consumers point agents at the registry output instead of raw upstream projects.

This makes agent capability discovery reproducible, auditable, and enterprise-friendly.

## What It Does

V0 focuses on a narrow, useful workflow:

- **Import capability sources** from public git repositories or direct `SKILL.md` URLs.
- **Generate standard ARD CatalogEntries** from `SKILL.md` content.
- **Add reviewed ARD fields** such as `tags`, `capabilities`, and `representativeQueries` when the source document is incomplete.
- **Validate metadata quality** with findings and a completeness score.
- **Publish approved entries** through an explicit publication gate.
- **Pin snapshots** by commit URL and content digest so the exported catalog is reproducible.
- **Detect source drift** when an upstream git ref changes after publication.
- **Build static registry artifacts**: `ai-catalog.json`, `search-index.json`, and per-entry listings.
- **Search locally** against the generated static BM25 index.

## What It Is Not

AgentCaps Registry intentionally does not try to do everything in V0:

- not a runtime sandbox or permission enforcement layer;
- not a safety, trust, or publisher-verification score;
- not an automatic installer for skills;
- not a hosted marketplace by default;
- not a mirror that stores every producer artifact;
- not an MCP / A2A / OpenAPI registry yet;
- not a replacement for enterprise approval systems.

The registry decides what agents can discover. Runtime enforcement, execution receipts, and policy checks should be handled by adjacent systems.

## Core Concepts

### Source

A source is where the original capability document lives.

V0 supports:

```text
git_repository  public git repository containing SKILL.md
direct_url      direct URL or local path to a SKILL.md-compatible document
```

### CatalogEntry

The agent-facing output is a standard ARD / AI Catalog `CatalogEntry`.

AgentCaps product state, such as publication status, validation report, source commit, and drift status, is kept outside the CatalogEntry.

### Curation

Many real-world `SKILL.md` files describe the skill well but do not include ARD search fields. Registry maintainers can add reviewed standard fields in `sources.yaml`:

```yaml
sources:
  - slug: frontend-slides
    type: git_repository
    url: https://github.com/zarazhangrui/frontend-slides
    path: SKILL.md
    trackingRef: main
    curation:
      reason: reviewed public SKILL.md for presentation generation use cases
      catalogEntry:
        tags:
          - slides
          - presentation
          - html
          - frontend
          - design
          - pptx
        capabilities:
          - slides.create
          - slides.convert
          - presentation.design
          - html.generate
          - pptx.convert
        representativeQueries:
          - create an animated HTML presentation for a product pitch
          - convert a PowerPoint deck into a web-based slide deck
          - make visually polished frontend slides from a topic
```

`curation.catalogEntry` only fills standard CatalogEntry fields. It is not emitted as AgentCaps-specific metadata.

### Publication Gate

Importing a source does not publish it.

```text
import    creates or updates an entry draft
validate  checks ARD metadata quality
publish   marks an entry as approved for export
build     exports only published entries
revoke    removes an entry from future exports
```

This keeps the registry compatible with Git PR review, existing approval systems, or lightweight maintainer review.

### Drift

Published entries are pinned. If the upstream git ref moves, the registry reports drift but does not silently replace the published snapshot.

```text
published snapshot commit != latest tracked ref
-> driftStatus = drifted
-> maintainer decides whether to re-import and publish again
```

## Quick Start

Requirements:

- Node.js `>=22`
- pnpm
- git

```bash
git clone https://github.com/agentcaps/registry.git
cd registry
pnpm install
pnpm build
```

Create a registry workspace:

```bash
node dist/cli.js --root .agentcaps init
```

Edit `.agentcaps/sources.yaml`:

```yaml
sources:
  - slug: frontend-slides
    type: git_repository
    url: https://github.com/zarazhangrui/frontend-slides
    path: SKILL.md
    trackingRef: main
    curation:
      catalogEntry:
        tags: [slides, presentation, html, frontend, design, pptx]
        capabilities:
          - slides.create
          - slides.convert
          - presentation.design
          - html.generate
          - pptx.convert
        representativeQueries:
          - create an animated HTML presentation for a product pitch
          - convert a PowerPoint deck into a web-based slide deck
          - turn markdown or notes into a polished slide deck
```

Run the workflow:

```bash
node dist/cli.js --root .agentcaps import frontend-slides
node dist/cli.js --root .agentcaps validate frontend-slides
node dist/cli.js --root .agentcaps publish frontend-slides --by alice@example.com
node dist/cli.js --root .agentcaps build
```

Search the built index:

```bash
node dist/cli.js --root .agentcaps search "convert pptx to web slides"
```

Generated output:

```text
.agentcaps/
  registry.yaml
  sources.yaml
  entries/
    frontend-slides/
      entry.yaml
      catalog-entry.json
      validation.json
      drift.json
  dist/
    ai-catalog.json
    search-index.json
    listings/
      frontend-slides.json
```

## CLI

```text
agentcaps-registry init
agentcaps-registry import [slug|--all]
agentcaps-registry validate [slug|--all]
agentcaps-registry publish [slug|--all]
agentcaps-registry revoke <slug>
agentcaps-registry drift [slug|--all]
agentcaps-registry build
agentcaps-registry search "<query>"
```

During local development you can run the compiled CLI directly:

```bash
node dist/cli.js --root .agentcaps <command>
```

## Generated `ai-catalog.json`

Example output:

```json
{
  "specVersion": "1.0",
  "host": {
    "displayName": "AgentCaps Registry",
    "identifier": "urn:air:agentcaps.local:registry:default"
  },
  "entries": [
    {
      "identifier": "urn:air:github.com:zarazhangrui:frontend-slides:skill:frontend-slides",
      "displayName": "frontend-slides",
      "type": "application/ai-skill",
      "url": "https://raw.githubusercontent.com/zarazhangrui/frontend-slides/<commit>/SKILL.md",
      "description": "Create stunning, animation-rich HTML presentations from scratch or by converting PowerPoint files.",
      "tags": ["slides", "presentation", "html", "frontend", "design", "pptx"],
      "capabilities": ["slides.create", "slides.convert", "presentation.design", "html.generate", "pptx.convert"],
      "representativeQueries": [
        "create an animated HTML presentation for a product pitch",
        "convert a PowerPoint deck into a web-based slide deck",
        "turn markdown or notes into a polished slide deck"
      ]
    }
  ]
}
```

## Validation Score

The validation score measures ARD metadata completeness and search readiness.

It is not:

- a safety score;
- a trust score;
- a publisher verification score;
- a runtime permission score;
- an enterprise compliance score.

Use validation to improve catalog quality, not to certify execution safety.

## Deployment Model

V0 is file-first and static-export first.

You can commit the registry workspace to Git, review changes through pull requests, and host `dist/` on any static or internal HTTP service.

Typical private deployment:

```text
company registry repo
-> PR adds or updates sources.yaml / entries
-> CI runs import, validate, drift, build
-> approved dist/ai-catalog.json is deployed internally
-> agents consume the internal catalog
```

A future server can expose ARD-compatible endpoints such as `/.well-known/ai-catalog.json` and `POST /search` using the generated static artifacts.

## Repository Boundary

This project is the reusable registry engine.

A public website such as `agentcaps.dev` can be built on top of it by maintaining a curated `sources.yaml`, running the registry pipeline, and rendering the generated listings. The public site depends on this registry engine; this registry engine should not depend on the public site.

## Roadmap

Near-term:

- stronger CatalogEntry validation rules;
- CI-friendly command output;
- static web deployment examples;
- ARD-compatible HTTP search endpoint adapter;
- richer source adapters and drift notifications.

Later:

- private registry server mode;
- enterprise auth and access-control integration;
- MCP, A2A, and OpenAPI capability source types;
- signed catalog artifacts and stronger provenance metadata.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Tests use local fixtures and local git repositories. They do not depend on live GitHub state.

## License

Apache-2.0. See `LICENSE`.
