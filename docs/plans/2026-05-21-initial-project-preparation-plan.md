# BlueNote Initial Project Preparation Plan

> **For Hermes:** Use `subagent-driven-development` to execute this plan task-by-task after approval. This document is planning-only; no repo mutations have been performed here.

**Goal:** Turn the current pre-setup BlueNote workspace into a clean, implementation-ready repository for a Bun/OpenTUI terminal app, with disciplined project structure, Git hygiene, Hermes project guidance, phased planning docs, and a clean first commit.

**Architecture:** Start by stabilizing repository scaffolding and documentation before any feature code. Treat `overview.md` as product input, then split it into durable docs plus phased implementation plans. Use Bun for app/runtime package management, Node 20+ compatibility for CLI/core, and project-local Hermes guidance (`AGENTS.md`, plans, workflow docs) so future coding sessions consistently follow the same constraints.

**Tech Stack:** Bun, TypeScript, OpenTUI, Node.js 20+, Git, GitHub Actions, Hermes Agent.

---

## Current context / findings

Observed from the current workspace:

- A Git repository already exists (`.git/` present), but there are **no commits yet**.
- Current tracked candidate files are minimal:
  - `overview.md`
  - `package.json`
  - `bun.lock`
  - `skills-lock.json`
  - local skill copies under `.hermes/skills/opentui/` and `.agents/skills/opentui/`
- `package.json` currently only declares `@opentui/core`.
- `overview.md` is detailed and useful as product/architecture input, but it is too broad to serve as the only living implementation guide.
- `node_modules/` exists and should not be committed.
- The repo currently has no source tree, no test tree, no CI, no repo policy files, and no project-local Hermes guidance files.

## Assumptions

- You want a **plan-first, clean-start repo** before implementation.
- “git init” means “ensure clean Git initialization/hygiene” rather than blindly re-running `git init` over the existing repo.
- BlueNote Phase 1 should remain **local-first, offline-first, no AI/network implementation**.
- OpenTUI should be treated as the primary TUI framework, with Bun as the preferred runtime for TUI execution.
- Hermes should be configured through project files, not by modifying your global Hermes installation.

## Proposed approach

1. Normalize repo foundations first: Git hygiene, ignore rules, environment/tooling files, package metadata.
2. Add project-local Hermes guidance so future agent sessions behave consistently.
3. Replace the single broad `overview.md` workflow with a clearer doc set:
   - concise product/architecture overview
   - phased implementation plans
   - developer workflow / repo conventions
4. Create the intended code/test/doc directory structure before writing features.
5. Remove generated or duplicated files that should not live in the initial clean repo.
6. Validate bootstrapping commands and create a clean initial commit.

---

## Target project structure

This is the proposed structure after the preparation pass:

```text
.
├── AGENTS.md
├── .editorconfig
├── .gitignore
├── .npmrc
├── .node-version                  # optional if you want pinned Node tooling
├── package.json
├── bun.lock
├── tsconfig.json
├── tsconfig.node.json             # optional, if separating runtime/build concerns
├── README.md
├── docs/
│   ├── product/
│   │   └── overview.md
│   ├── architecture/
│   │   ├── runtime-and-dependencies.md
│   │   ├── managed-root-layout.md
│   │   └── note-format-and-indexing.md
│   ├── workflow/
│   │   ├── development-workflow.md
│   │   └── hermes-workflow.md
│   └── phases/
│       ├── phase-0-repo-preparation.md
│       ├── phase-1-core-cli-storage.md
│       ├── phase-2-cli-storage-ux-pivot.md
│       ├── phase-3-tui-workspace.md
│       ├── phase-4-search-editing-and-recovery.md
│       └── phase-5-hardening-and-release.md
├── .hermes/
│   └── plans/
│       └── *.md
├── src/
│   ├── cli/
│   ├── core/
│   ├── storage/
│   ├── index/
│   ├── tui/
│   ├── platform/
│   ├── config/
│   └── shared/
├── bin/
│   └── bn.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── smoke/
│   └── fixtures/
├── scripts/
│   ├── check-env.ts
│   └── smoke-opentui.ts
└── .github/
    └── workflows/
        └── ci.yml
```

Notes:

- Keep plan history in `docs/plans/` as part of the repo; treat `.hermes/plans/` as a legacy location rather than an active source of new plans.
- Do **not** commit `node_modules/`.
- Do **not** keep duplicated local skill vendor trees unless they are intentionally part of the project.

---

## Step-by-step plan

### Task 1: Freeze the current baseline and define cleanup scope

**Objective:** Capture what exists and decide what belongs in the repo before creating any new scaffolding.

**Files:**
- Review: `overview.md`
- Review: `package.json`
- Review: `bun.lock`
- Review: `skills-lock.json`
- Review/remove candidates: `.agents/`, `.hermes/skills/`, `node_modules/`

**Planned actions:**
1. Confirm whether `.agents/skills/opentui/` and `.hermes/skills/opentui/` are intentional vendor artifacts or local agent cache copies.
2. Treat `node_modules/` as generated and remove it from version control scope.
3. Decide whether `skills-lock.json` belongs to the product repo or to local agent workflow only.

**Validation:**
- `git status --short --branch`
- `find . -maxdepth 3` sanity check excluding `.git` and `node_modules`

**Expected outcome:**
- A clear keep/remove list before restructuring begins.

---

### Task 2: Normalize Git initialization and branch conventions

**Objective:** Ensure the repo starts from a clean, intentional Git baseline.

**Files:**
- Create/modify: `.gitignore`
- Optional create: `.gitattributes`
- Optional create: `.gitmessage`

**Planned actions:**
1. Because `.git/` already exists, do **not** blindly recreate the repo.
2. Verify branch naming (`main` preferred unless you intentionally want `master`).
3. Add `.gitignore` for:
   - `node_modules/`
   - build outputs (`dist/`, `coverage/`, `.turbo/`, etc. if relevant)
   - runtime/test temp files
   - local caches
   - editor artifacts
   - optionally most of `.hermes/` except plans
4. Add `.gitattributes` to normalize LF endings and treat binaries correctly.

**Suggested commands for execution phase:**
```bash
git branch -m master main  # only if you want to rename
```

**Validation:**
- `git status --short`
- `git check-ignore -v node_modules/` (optional)

**Expected outcome:**
- Clean Git hygiene before any code lands.

---

### Task 3: Create the base package/runtime/tooling setup

**Objective:** Turn the minimal package into a real implementation workspace for a Bun/OpenTUI TypeScript app.

**Files:**
- Modify: `package.json`
- Keep/refresh: `bun.lock`
- Create: `tsconfig.json`
- Optional create: `tsconfig.node.json`
- Create: `.npmrc`
- Optional create: `.node-version`
- Optional create: `README.md`

**Planned actions:**
1. Expand `package.json` with:
   - package name/version/private flag
   - `bin` entries for `bn` and `bluenote`
   - scripts for lint/typecheck/test/smoke/dev
   - explicit engines for Bun/Node
2. Add the baseline dependencies/devDependencies needed for:
   - OpenTUI app shell
   - TypeScript execution/build
   - testing
   - CLI entry bootstrapping
3. Create TypeScript config tuned for the mixed Bun/OpenTUI + Node CLI/core split.
4. Decide whether to keep a no-build dev path first (run with `bun`) and delay bundling until later.

**Likely package scripts:**
```json
{
  "scripts": {
    "dev:tui": "bun run src/tui/app.ts",
    "smoke:opentui": "bun run scripts/smoke-opentui.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "bun run typecheck && bun run test && bun run smoke:opentui"
  }
}
```

**Validation:**
- `bun install`
- `bun run typecheck`
- `bun run smoke:opentui`
- `bun --version && node --version`

**Expected outcome:**
- A reproducible developer environment with clear runtime boundaries.

---

### Task 4: Reconstruct the repository layout before implementation

**Objective:** Create directories that match the intended architecture so implementation work has stable homes.

**Files:**
- Create directories under `src/`, `bin/`, `tests/`, `docs/`, `scripts/`
- Create placeholder files where needed (e.g. `.gitkeep` or README stubs)

**Planned actions:**
1. Create source layout around responsibility boundaries rather than premature feature files:
   - `src/core`
   - `src/storage`
   - `src/index`
   - `src/tui`
   - `src/cli`
   - `src/config`
   - `src/platform`
   - `src/shared`
2. Add `bin/bn.ts` as the canonical CLI entrypoint location.
3. Create `tests/unit`, `tests/integration`, `tests/smoke`, `tests/fixtures`.
4. Add `scripts/check-env.ts` and `scripts/smoke-opentui.ts` as future validation entrypoints.

**Validation:**
- Directory tree review
- `bun run smoke:opentui` should eventually target the new structure

**Expected outcome:**
- The filesystem matches the architecture described in the docs.

---

### Task 5: Prepare Hermes project guidance for this repo

**Objective:** Make Hermes work predictably for this project, especially for TUI work, phased development, and plan-first execution.

**Files:**
- Create: `AGENTS.md`
- Create: `docs/workflow/hermes-workflow.md`
- Optional create: `.cursorrules` or `CLAUDE.md` only if you intentionally support non-Hermes agents too

**Planned actions:**
1. Create a root `AGENTS.md` tailored to BlueNote.
2. Put project-specific rules there rather than scattering duplicated guidance across multiple agent files.
3. Only add `.cursorrules` / `CLAUDE.md` if you want parallel compatibility with other coding agents; otherwise keep `AGENTS.md` authoritative.

**`AGENTS.md` should include:**
- Product scope guardrails:
  - local-first only for Phase 1
  - no AI/network implementation in initial phases
  - markdown files are source of truth
- Runtime/tooling rules:
  - prefer Bun for TUI
  - preserve Node 20 compatibility for CLI/core
  - avoid native sqlite bindings; use `sql.js`
- Architecture rules:
  - TUI is presentation/input only
  - core services own storage/index/config logic
  - no direct file mutations from TUI components without service layer
- Workflow rules:
  - plan first
  - implement by phase
  - keep tasks small
  - update docs when architecture changes
- Testing rules:
  - add smoke checks for CLI and OpenTUI launch health
  - keep no-TTY and unsupported-terminal behavior testable
- Git rules:
  - small commits
  - clean status before phase completion

**Validation:**
- Open a fresh Hermes session in the repo and confirm the guidance is being picked up from `AGENTS.md`.

**Expected outcome:**
- Future Hermes sessions automatically inherit the project’s intended workflow.

---

### Task 6: Replace or split `overview.md` into a maintainable doc set

**Objective:** Preserve the valuable product definition while making docs actionable for implementation.

**Files:**
- Move or rewrite: `overview.md`
- Create: `docs/product/overview.md`
- Create: `docs/architecture/runtime-and-dependencies.md`
- Create: `docs/architecture/managed-root-layout.md`
- Create: `docs/architecture/note-format-and-indexing.md`
- Create: `README.md`

**Planned actions:**
1. Do **not** delete `overview.md` without preserving its content.
2. Split it into:
   - product overview / scope
   - architecture references
   - development phases
3. Rewrite the root `README.md` to be concise:
   - what BlueNote is
   - current status
   - runtime requirements
   - how to run checks
   - where docs live
4. Either:
   - move `overview.md` into `docs/product/overview.md`, or
   - rewrite it and keep a much shorter root overview/README.

**Recommendation:**
- Prefer **moving/splitting**, not outright removal.
- Keep root-level docs minimal; place detailed architecture under `docs/`.

**Validation:**
- Doc tree review for duplication
- Ensure no essential architectural rule is lost during the split

**Expected outcome:**
- Clear docs hierarchy instead of one monolithic draft.

---

### Task 7: Create explicit phase plans for future development

**Objective:** Convert the broad product draft into staged implementation documents that can drive actual work.

**Files:**
- Create: `docs/phases/phase-0-repo-preparation.md`
- Create: `docs/phases/phase-1-core-cli-storage.md`
- Create: `docs/phases/phase-2-cli-storage-ux-pivot.md`
- Create: `docs/phases/phase-3-tui-workspace.md`
- Create: `docs/phases/phase-4-search-editing-and-recovery.md`
- Create: `docs/phases/phase-5-hardening-and-release.md`

**Planned phase breakdown:**
1. **Phase 0** — repo prep, docs, tooling, Hermes setup, CI baseline
2. **Phase 1** — managed root init, frontmatter, file storage, config, `sql.js` + MiniSearch indexing, essential CLI flows
3. **Phase 2** — CLI storage/UX pivot: plain note files, `.state/` sidecars, key/path selectors, search output, shell completion, migration
4. **Phase 3** — OpenTUI workspace: renderer shell, elegant layout, inline editor, file navigation, search, and command/action coverage for the implemented CLI workflows
5. **Phase 4** — search/editing/recovery hardening, archive/history polish, templates, today/scratch behavior
6. **Phase 5** — cross-platform hardening, failure-path tests, release readiness, packaging polish

**Validation:**
- Each phase doc should have entry criteria, deliverables, validation targets, and non-goals.

**Expected outcome:**
- Implementation can proceed in deliberate phases instead of directly from the broad overview.

---

### Task 8: Add initial developer workflow and CI scaffolding

**Objective:** Prepare the repo for disciplined day-to-day work before feature implementation starts.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/workflow/development-workflow.md`
- Optional create: `.github/pull_request_template.md`

**Planned actions:**
1. Add a minimal CI workflow that checks:
   - Bun availability
   - dependency install
   - typecheck
   - tests
   - OpenTUI import/smoke command
2. Document the local workflow:
   - install
   - run smoke checks
   - create/update plans
   - phase-by-phase implementation expectations
3. Keep CI conservative early; avoid heavy matrix complexity until core structure is stable.

**Validation:**
- CI YAML lints
- commands in docs match package scripts exactly

**Expected outcome:**
- The repo is ready for collaborative or agent-assisted development.

---

### Task 9: Remove unused or inappropriate files from the clean initial repo

**Objective:** Eliminate clutter so the initial commit contains only intentional project assets.

**Files:**
- Remove candidate: `node_modules/`
- Remove or ignore candidate: `.agents/`
- Remove or ignore candidate: `.hermes/skills/`
- Review candidate: `skills-lock.json`

**Recommended decision matrix:**
- `node_modules/` → remove from repo scope, ignore
- `.agents/skills/opentui/` → remove unless the repo intentionally vendors agent docs
- `.hermes/skills/opentui/` → remove unless the repo intentionally vendors Hermes-local skills
- `skills-lock.json` → keep only if the repo explicitly treats skill pinning as project infrastructure

**Validation:**
- `git status --short` should show only intentional files
- tree should no longer contain generated caches/vendor leftovers unless deliberate

**Expected outcome:**
- A minimal, understandable first commit.

---

### Task 10: Create the clean initial commit

**Objective:** Establish a stable project starting point after preparation work is complete.

**Files:**
- All intentionally retained prep files

**Planned actions:**
1. Review staged files for scope creep.
2. Ensure the first commit contains only preparation/setup/docs/scaffolding.
3. Use a clean message such as:

```bash
git commit -m "chore: initialize BlueNote project scaffold"
```

**Validation:**
- `git status --short` returns clean
- initial docs, CI, tooling, and repo rules are all present

**Expected outcome:**
- A trustworthy base commit for Phase 1 implementation.

---

## Files likely to change

### Keep and modify
- `package.json`
- `bun.lock`
- `overview.md` (move, split, or rewrite)
- `skills-lock.json` (decision required)

### Create
- `AGENTS.md`
- `.gitignore`
- `.gitattributes`
- `.editorconfig`
- `.npmrc`
- `.node-version` (optional)
- `README.md`
- `tsconfig.json`
- `tsconfig.node.json` (optional)
- `bin/bn.ts`
- `scripts/check-env.ts`
- `scripts/smoke-opentui.ts`
- `.github/workflows/ci.yml`
- `docs/product/overview.md`
- `docs/architecture/runtime-and-dependencies.md`
- `docs/architecture/managed-root-layout.md`
- `docs/architecture/note-format-and-indexing.md`
- `docs/workflow/development-workflow.md`
- `docs/workflow/hermes-workflow.md`
- `docs/phases/phase-0-repo-preparation.md`
- `docs/phases/phase-1-core-cli-storage.md`
- `docs/phases/phase-3-tui-workspace.md`
- `docs/phases/phase-4-search-editing-and-recovery.md`
- `docs/phases/phase-5-hardening-and-release.md`

### Remove or stop tracking
- `node_modules/`
- possibly `.agents/`
- possibly `.hermes/skills/`

---

## Tests / validation plan

These are the checks to run during execution, not yet performed here:

### Environment validation
```bash
bun --version
node --version
git --version
```

### Package and type validation
```bash
bun install
bun run typecheck
```

### OpenTUI sanity validation
```bash
bun run smoke:opentui
```

### Repo hygiene validation
```bash
git status --short
find . -maxdepth 3 \( -path './.git' -o -path './node_modules' \) -prune -o -print
```

### CI alignment validation
- Every command referenced in docs must exist in `package.json` scripts.
- CI must call the same commands developers run locally.

---

## Risks, tradeoffs, and decisions to make

### 1. `overview.md`: rewrite vs move vs delete
- **Best option:** split and preserve.
- **Risk:** deleting it too early could lose important scope constraints.

### 2. Bun-only vs Bun+Node split
- The overview calls for Bun-preferred TUI and Node-compatible CLI/core.
- **Tradeoff:** stricter compatibility now means slightly more setup complexity later.
- **Recommendation:** preserve the split because it matches the product constraints.

### 3. Whether to commit `.hermes/` artifacts
- **Recommendation:** commit plans, not local skill caches.
- **Risk:** committing local Hermes caches makes the repo noisy and user-specific.

### 4. Whether to vendor OpenTUI skill docs inside the repo
- **Recommendation:** no, unless this repo’s purpose includes agent-doc portability.
- **Risk:** duplicated docs become stale quickly.

### 5. First-commit size
- **Tradeoff:** a richer prep commit reduces ambiguity, but too much speculative scaffolding can be wasteful.
- **Recommendation:** create only the structure and checks needed for Phase 1, not future optional systems.

---

## Open questions for execution

1. Do you want the default branch renamed to `main` if it is currently `master`?
2. Should `docs/plans/` be treated as the canonical in-repo home for all plans, with `.hermes/plans/` considered legacy-only?
3. Do you want `.agents/` and `.hermes/skills/` preserved in-repo as project infrastructure, or treated as local caches to remove?
4. Should `skills-lock.json` be kept as an intentional dependency pin for agent workflows?
5. Do you want `CLAUDE.md` / `.cursorrules` compatibility files, or should `AGENTS.md` be the single source of truth?

---

## Recommended execution order

1. Cleanup scope decision
2. `.gitignore` + Git hygiene
3. `package.json` + TypeScript/tooling base
4. project structure creation
5. `AGENTS.md` + Hermes workflow docs
6. `overview.md` split/rewrite
7. phase docs
8. CI/workflow files
9. final cleanup of unused artifacts
10. clean initial commit

---

## Suggested initial commit boundaries

To keep history readable, split execution into a few small commits rather than one giant prep change:

1. `chore: normalize repo ignores and tooling`
2. `docs: add BlueNote architecture and phase plans`
3. `chore: add Hermes project guidance and workflow docs`
4. `chore: scaffold project structure and CI`
5. `chore: create clean initial project baseline`

If you specifically want a single pristine starting snapshot, squash those into:

```bash
git commit -m "chore: initialize BlueNote project scaffold"
```
