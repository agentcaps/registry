# AgentCaps Registry

[![CI](https://github.com/agentcaps/registry/actions/workflows/ci.yml/badge.svg)](https://github.com/agentcaps/registry/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@agentcaps/registry.svg)](https://www.npmjs.com/package/@agentcaps/registry)
[![license](https://img.shields.io/npm/l/@agentcaps/registry.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@agentcaps/registry.svg)](https://www.npmjs.com/package/@agentcaps/registry)

[English](./README.md)

企业级 ARD registry，用于管理已审核的 agent capabilities。

AgentCaps Registry 把分散在 GitHub 仓库或 URL 中的 `SKILL.md` 能力文档，转换成可审核、可固定版本、可搜索、可分发给 agent 使用的 ARD / AI Catalog。

```text
SKILL.md-compatible source
-> reviewed CatalogEntry draft
-> published pinned snapshot
-> ai-catalog.json + search index
-> private or public agent capability registry
```

## 这个项目解决什么问题

随着 agent 可以安装 skills、连接 MCP server、调用 A2A agent 或使用各种 API，团队很快会遇到一个问题：

```text
agent 到底可以发现和使用哪些能力？
这些能力是谁审核过的？
当前使用的是哪个版本？
上游变更后会不会静默影响 agent？
```

AgentCaps Registry 的目标不是让 agent 随便安装更多能力，而是在生产者和消费者之间增加一个 registry 控制面：

- 能力生产者继续在自己的仓库或 URL 中维护 `SKILL.md`；
- registry 维护者 import、validate、review、publish；
- 只有 published entries 会进入 agent-facing catalog；
- agent 消费 registry 输出，而不是直接消费互联网上的任意上游项目。

一句话：

```text
不要让 agent 直接从互联网安装能力；先 import、review、pin，再让 agent discover。
```

## 它不是什么

AgentCaps Registry V0 刻意保持边界清晰：

- 不是 runtime sandbox；
- 不是 permission enforcement layer；
- 不是 safety / trust / publisher verification score；
- 不是自动安装器；
- 默认不是 hosted marketplace；
- 还不是 MCP / A2A / OpenAPI registry；
- 不是企业审批系统的替代品。

Registry 负责决定 agent 可以发现什么。运行时权限、执行收据、策略拦截和审计应由相邻系统处理。

## 一分钟开始

要求：

- Node.js `>=22`
- npm
- git

全局安装 CLI：

```bash
npm install -g @agentcaps/registry
```

或者不安装，直接使用 `npx`：

```bash
npx -y @agentcaps/registry@latest --help
```

创建 registry workspace：

```bash
mkdir my-agentcaps-registry
cd my-agentcaps-registry
agentcaps-registry --root .agentcaps init
```

编辑 `.agentcaps/sources.yaml`：

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

运行完整流程：

```bash
agentcaps-registry --root .agentcaps import frontend-slides
agentcaps-registry --root .agentcaps validate frontend-slides
agentcaps-registry --root .agentcaps publish frontend-slides --by alice@example.com
agentcaps-registry --root .agentcaps build
agentcaps-registry --root .agentcaps search "convert pptx to web slides"
```

真实样例见 [`examples/frontend-slides`](https://github.com/agentcaps/registry/tree/main/examples/frontend-slides)，其中包含 `sources.yaml`、生成的 `CatalogEntry`、validation report 和 `ai-catalog.json`。

生成结果：

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

## 从 SKILL.md 到 ai-catalog.json

AgentCaps Registry V0 的核心转换是：

```text
SKILL.md parsed fields
+ sources.yaml curation.catalogEntry reviewed standard fields
-> standard ARD CatalogEntry
```

如果上游 `SKILL.md` 缺少 `tags`、`capabilities`、`representativeQueries`，registry 维护者可以在 `sources.yaml` 中补充审核后的标准 CatalogEntry 字段。

这些字段会进入最终 `ai-catalog.json`，但 AgentCaps 自己的产品状态不会进入 CatalogEntry。

## 为什么需要 publish gate

`import` 不等于 `publish`。

```text
import    生成/更新 entry draft
validate  检查 metadata completeness
publish   标记为允许进入 catalog
build     只导出 published entries
revoke    从后续导出中移除
```

这样可以兼容 Git PR review、轻量 maintainer review，或企业已有审批流程。

## 为什么要 pin snapshot 和检测 drift

Published entry 会记录上游 commit URL 和 digest。上游 ref 变化后，registry 只标记 drift，不会静默替换已经 published 的 snapshot。

```text
published snapshot commit != latest tracked ref
-> driftStatus = drifted
-> maintainer decides whether to re-import and publish again
```

这让 agent 使用的能力版本可复现、可审计，也避免上游变化自动影响生产环境。

## 如何参与

早期最有价值的参与方式不是先写代码，而是提交真实的 `SKILL.md` 样本和 mapping 反馈：

- 提交一个你希望被 import 的 `SKILL.md` 仓库或 URL；
- 反馈某个 CatalogEntry mapping 是否准确；
- 贡献 validation rule；
- 贡献 source adapter；
- 贡献真实 example。

GitHub 仓库：

```text
https://github.com/agentcaps/registry
```

npm 包：

```text
https://www.npmjs.com/package/@agentcaps/registry
```

## 当前边界

V0 只聚焦 `SKILL.md`-compatible capability sources：

- public git repository containing one `SKILL.md`；
- public git repository collection containing multiple `SKILL.md` files；
- direct `SKILL.md` URL。

对于类似 `anthropics/skills` 这样的合集仓库，可以用 `git_repository_collection` + `include` 将一个仓库展开成多个 CatalogEntry：

```yaml
sources:
  - slug: anthropics-skills
    type: git_repository_collection
    url: https://github.com/anthropics/skills
    include:
      - skills/*/SKILL.md
```

每个匹配到的 `SKILL.md` 都会成为独立 entry。

MCP、A2A、OpenAPI 会在后续版本中作为新的 source types 进入，但不是 V0 的范围。

## Roadmap

近期：

- 更强的 CatalogEntry validation rules；
- CI-friendly command output；
- static web deployment examples；
- ARD-compatible HTTP search endpoint adapter；
- richer source adapters and drift notifications。

后续：

- private registry server mode；
- enterprise auth and access-control integration；
- MCP、A2A、OpenAPI capability source types；
- signed catalog artifacts and stronger provenance metadata。

## License

Apache-2.0. See `LICENSE`.
