# Sj.Sim Predazzo 2026 Edition

Monorepo for the Sj.Sim Predazzo 2026 ski jumping simulator. The workspace uses Electron for the desktop shell, React + Vite for the renderer, and TypeScript across all packages.

## Workspaces

- `@sjsim/core` – shared domain logic and dependency container.
- `@sjsim/ui` – Vite-powered React renderer (Zustand for state).
- `@sjsim/app` – Electron shell hosting the renderer.
- `@sjsim/infra` – placeholder for persistence/integration adapters.

## Getting started

```bash
npm install
npm run dev
```

The dev script runs:
- Vite dev server for the UI (`http://localhost:5173`),
- TypeScript watch build for Electron main/preload code,
- Electron desktop app pointed at the Vite server.

## Scripts

At the root you can run:

- `npm run dev` – launch the Electron app with hot-reloading renderer.
- `npm run build` – build every workspace (`dist` output per package).
- `npm run typecheck` – strict type-check across all packages.
- `npm run lint` – ESLint for every workspace.
- `npm run format[:write]` – Prettier check or write mode.
- `npm run clean` – clean build outputs.
