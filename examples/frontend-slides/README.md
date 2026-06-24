# frontend-slides Example

This is a real AgentCaps Registry example for:

```text
https://github.com/zarazhangrui/frontend-slides
```

It imports the repository's `SKILL.md`, adds reviewed standard CatalogEntry search fields, publishes the entry, and builds a one-entry `ai-catalog.json`.

## Files

```text
sources.yaml        source definition and reviewed CatalogEntry fields
catalog-entry.json  generated standard ARD CatalogEntry
validation.json     metadata quality report
ai-catalog.json     generated AI Catalog manifest
```

## Reproduce

From the `agentcaps/registry` repository root:

```bash
mkdir -p /tmp/agentcaps-frontend-slides-example
cp examples/frontend-slides/sources.yaml /tmp/agentcaps-frontend-slides-example/sources.yaml
cat > /tmp/agentcaps-frontend-slides-example/registry.yaml <<'YAML'
name: AgentCaps frontend-slides Example
identifier: urn:air:agentcaps.dev:example:frontend-slides
skillMediaType: application/ai-skill
excludeDriftedFromCatalog: false
YAML

pnpm build
node dist/cli.js --root /tmp/agentcaps-frontend-slides-example import frontend-slides
node dist/cli.js --root /tmp/agentcaps-frontend-slides-example publish frontend-slides --by agentcaps-example --note frontend-slides-real-example
node dist/cli.js --root /tmp/agentcaps-frontend-slides-example build
cat /tmp/agentcaps-frontend-slides-example/dist/ai-catalog.json
```

Or, after the npm package containing this feature is published:

```bash
npx -y @agentcaps/registry@latest --root /tmp/agentcaps-frontend-slides-example import frontend-slides
npx -y @agentcaps/registry@latest --root /tmp/agentcaps-frontend-slides-example publish frontend-slides --by agentcaps-example --note frontend-slides-real-example
npx -y @agentcaps/registry@latest --root /tmp/agentcaps-frontend-slides-example build
```

## Notes

- `tags`, `capabilities`, and `representativeQueries` are standard CatalogEntry fields used for discovery.
- AgentCaps internal state such as publication status, validation findings, source commit, and digest is stored outside the CatalogEntry.
- The generated `ai-catalog.json` does not emit `metadata.agentcaps`.
