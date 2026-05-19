# Fullstack Refactor Workflow

`main` is production and autodeployed. Do not work directly on `main` unless the maintainer explicitly asks for it.

## Working Branches

- Start feature and fix work from the latest `main` on a short-lived branch.
- Prefer branch names like `ryad/<feature-or-fix>`.
- Use `ryad/fullstack-refactor` as the current refactor branch.
- Treat unrelated dirty files as someone else's work. Do not revert, rewrite, or reformat outside the assigned ownership area.

## Current App Shape

- Fullstack is a Next.js App Router app under `src/app`.
- Shared application code lives under `src/lib`, components under `src/components`, and generated Prisma client output under `src/generated/prisma`.
- There is no active Vite `client` folder workflow for this app.
- Local Fullstack runs on `http://localhost:3000`.
- Algorithms runs on `http://localhost:1880`.
- Simulation runs on `http://localhost:1870`.

## Worker Handoff Checklist

- Confirm the branch and worktree before editing.
- Keep edits inside the assigned ownership scope.
- Avoid package, lockfile, generated-code, and broad formatting churn unless explicitly owned.
- Keep public env names aligned with `.env.example` and README.
- Run the validation gates before handoff when the changed area warrants it:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For database-affecting changes, also run the relevant Prisma command against a local database.
