# Repository Guidelines

## Project Structure & Modules

- Core assets live in `src/core` (`agents`, `tasks`, `workflows`, `_module-installer`, `resources`). Module-specific assets sit under `src/modules/<module>` with their own `agents`, `workflows`, and docs. Shared utilities are in `src/utility`; CLI/bundler tooling is in `tools/cli` and `tools/cli/bundlers`.
- Documentation artifacts are in `docs/`; automated validation lives in `test/`. Package entry points and binaries (`bmad`, `bmad-method`) resolve to `tools/bmad-npx-wrapper.js`.
- Keep new agent or workflow files alongside similar ones (`*.agent.yaml|xml`, `*.workflow.yaml`), and mirror the folder shape used in existing modules.

## Build, Test, and Development Commands

- Install deps (Node >=20): `npm install`.
- Populate/reference agent bundles: `npm run bmad:install` (or `npm run bmad:agent-install` when updating agent assets).
- Build web bundles: `npm run bundle` (full) or `npm run rebundle` (incremental).
- Quality gates: `npm run lint` (ESLint, max-warnings=0), `npm run format:check`, `npm run format:fix` for autofix.
- Validation & tests: `npm run test` (schema checks, install test, bundle + schema validation, lint, format check), `npm run test:schemas`, `npm run validate:bundles`, `npm run validate:schemas`, coverage via `npm run test:coverage`.

## Coding Style & Naming

- JavaScript/Node code uses ESLint (`@eslint/js`, `eslint-plugin-n`, `eslint-plugin-unicorn`) and Prettier; default format is 2-space indent, single quotes discouraged by Prettier defaults.
- Filenames stay kebab-case; agent/workflow definitions use explicit suffixes (`*.agent.yaml`, `*.agent.xml`). Module directories use short lowercase keys (e.g., `bmb`, `bmgd`).
- Prefer `camelCase` for variables/functions, `PascalCase` only for constructors/classes. Keep YAML keys lowercase with hyphens to match existing agents.

## Testing Guidelines

- Schema and bundle validation guardrails: keep agent/workflow schema changes accompanied by updates under `test/` (e.g., `test/test-agent-schema.js`). Add fixture agents/workflows next to tests when extending schemas.
- Name new tests to reflect behavior under check (`<feature>-schema.test.js` or similar) and ensure they run with `npm run test:schemas`.
- Aim to keep the full `npm test` suite green before PRs; use `npm run test:coverage` when altering schemas to confirm coverage signals remain stable.

## Commit & Pull Request Guidelines

- Follow a concise Conventional Commits style (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). Group related file changes per commit.
- PRs should include: purpose summary, scope of changes, how to validate (`npm run ...` commands run), and any screenshots or bundle diffs when altering generated artifacts.
- Link to tracking issues when applicable; call out schema-impacting changes so reviewers can rerun `npm run validate:schemas` and `npm run validate:bundles`.

## Security & Secrets

- No secrets or tokens belong in agent/workflow definitions or configs. Use environment variables or local config files excluded by `.gitignore`.
- Validate third-party additions (npm deps, schema includes) for license compatibility with MIT.
