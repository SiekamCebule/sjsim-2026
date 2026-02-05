# Sj.Sim Predazzo Edition

🇵🇱 Sj.Sim Predazzo Edition jest kontynuacją serii symulatorów skoków narciarskich [Sj.Sim](https://github.com/SiekamCebule/sj-sim). Gracz wciela się w trenera lub dyrektora podczas zawodów we włoskim Predazzo w roku 2026.

Gra jest przedmiotem wyzwania, mającego na celu stworzenie rozbudowanego symulatora skoków narciarskich w możliwie jak najkrótszym czasie, ukazując przy tym możliwości współczesnych narzędzi AI (użyto: Cursor, ChatGPT). Grę planowano stworzyć w 24 godziny, ale końcowo skończono po około 51 godzinach od rozpoczęcia prac.

## Główne funkcjonalności
- Około 90 skoczków narciarskich i 50 skoczkiń
- Skocznie: Sapporo HS137, Predazzo HS107, HS147
- Szczegółowy terminarz zawodów inspirowany Igrzyskami Olimpijskimi 2026
- Konkursy indywidualne, konkurs mikstów i konkurs duetów
- Możliwość własnych powołań na zawody w Sapporo, a także selekcję składu na treningi, serie próbne, konkurs mikstów i konkurs duetów
- Automatycznie powołania botów AI
- Automatyczna zmiana belek i wiatru
- Możliwość manipulacji belką w trybie dyrektora, możliwość obniżenia belki swoim zawodnikom w trybie trenera
- Nowoczesne UI w stylu dashboardowym, archiwum wyników
- Drobne elementy fabuły takie jak aktualny "faworyt", "czarny koń" czy "największy zawód"
- Realistyczna symulacja skoków oparta na umiejętnościach zawodników, wietrze i losowości, inspirowana systemem z innej gry autora — [Ski Jump Draft](https://github.com/Ski-Jump-Draft)
- Możliwość zapisu gry i wrócenia do niej

## Screenshots



## For developers
Monorepo for the Sj.Sim Predazzo Edition ski jumping simulator. The workspace uses Electron for the desktop shell, React + Vite for the renderer, and TypeScript across all packages.

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

## Release builds

Release builds are created with Electron Builder and include the fake-name obfuscation step.
The release pipeline:

- builds all workspaces,
- copies `packages/ui/dist` into `packages/app/ui/dist`,
- applies fake names (release-only),
- packages the app for the current OS.

Local release commands:

- `npm run release:linux` – AppImage + .deb (Linux).
- `npm run release:win` – NSIS installer (Windows).
- `npm run release:mac` – DMG (macOS, requires macOS to build).

Notes:

- Windows builds require Windows or Wine. The GitHub workflow uses a Windows runner.
- macOS builds require macOS (code signing/notarization not configured).

GitHub Releases:

- Push a tag like `v0.1.0` to trigger the release workflow.
- Artifacts are uploaded to the GitHub Release automatically.

## Installing (users)

### Windows

Download the `.exe` installer from GitHub Releases and run it. If SmartScreen warns,
click **More info** → **Run anyway**.

### Linux

- AppImage: `chmod +x Sj.Sim-Predazzo-2026-*.AppImage` then run it.
- Debian/Ubuntu: `sudo dpkg -i Sj.Sim-Predazzo-2026-*.deb` (then `sudo apt -f install` if needed).

### macOS (optional)

Download the `.dmg`, drag the app to **Applications**, and launch it.
If Gatekeeper blocks the app, open **System Settings → Privacy & Security** and allow it.

## Logi deweloperskie

`console.log` z aplikacji (UI + core przy wywołaniach z przeglądarki) **nie** trafia do terminala, w którym działa `npm run dev`. Kod działa w przeglądarce (lub w oknie Electron).

**Gdzie oglądać logi:**

- **Electron** (`npm run dev`): w oknie aplikacji **View → Toggle Developer Tools** (lub skrót, np. Ctrl+Shift+I / Cmd+Option+I), potem zakładka **Console**.
- **Sam Vite / przeglądarka**: uruchom UI (`cd packages/ui && npm run dev`), otwórz `http://localhost:5173` w Chrome/Firefox, naciśnij **F12** → zakładka **Console**.

W konsoli szukaj wpisów z prefiksem `[SJSIM]` (symulacja skoków, 3 na 50) oraz `[SJSIM-CALLUPS]` (score’y powołań botów).
