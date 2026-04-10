# Sj.Sim Predazzo Edition

Sj.Sim Predazzo Edition is a continuation of the ski jumping simulator series [Sj.Sim](https://github.com/SiekamCebule/sj-sim). The player takes the role of a coach or director during competitions in Predazzo, Italy in 2026.

The game is part of a challenge to build a complex ski jumping simulator in the shortest possible time, while showing the capabilities of modern AI tools (used: Cursor, ChatGPT). The plan was to finish the game in 24 hours, but version 1.0.0 was released after about 53 hours due to early bugs.

## Main features
- About 90 male jumpers and 50 female jumpers  
- Hills: 🇯🇵 Sapporo HS137, 🇮🇹 Predazzo HS107, HS147  
- Detailed competition schedule inspired by the 2026 Winter Olympics  
- Individual, mixed team, and duet competitions  
- Custom team selection for Sapporo and full control over squads for training, trial rounds, mixed, and duet events  
- Automatic AI team selections
- Automatic gate and wind changes  
- Gate control in director mode, and the option to lower the gate for your athletes in coach mode  
- Modern dashboard-style UI with results archive  
- Small story elements like current “favorite”, “dark horse”, and “biggest disappointment”  
- Relatively realistic jump simulation based on athlete skills, wind, and probability, inspired by another game by the author — [Ski Jump Draft](https://github.com/Ski-Jump-Draft)  
- Save and load game progress  

## Screenshots
<img width="1816" height="1111" alt="image" src="https://github.com/user-attachments/assets/b83faabe-62e2-4366-9ae8-5a099d45d559" />
<img width="1941" height="1016" alt="image" src="https://github.com/user-attachments/assets/c508e40f-c39f-423a-a0ff-9264936be30d" />
<img width="1939" height="1096" alt="image" src="https://github.com/user-attachments/assets/072b4306-0f24-4eed-af73-1d612e32e691" />
<img width="910" height="619" alt="image" src="https://github.com/user-attachments/assets/77b2f1fb-98b9-4202-b8fe-dd6a501495e9" />
<img width="1958" height="1124" alt="image" src="https://github.com/user-attachments/assets/6e21fa4e-fa6c-4c1e-823d-2c5c49f446e9" />

## For developers
Monorepo for the Sj.Sim Predazzo Edition ski jumping simulator. The project uses Electron for the desktop app, React + Vite for the UI, and TypeScript in all packages.

## About the creation process
I don't even know what TypeScript workspace is or how to build a custom component in React. Almost everything has been written by Cursor/ChatGPT. As the game developer, I focused on a conceptual work and "putting everything together".

## Workspaces
- @sjsim/core – shared logic and dependencies  
- @sjsim/ui – React UI (Vite, Zustand)  
- @sjsim/app – Electron app  
- @sjsim/infra – future integrations and storage  

## Getting started
npm install
npm run dev

## Scripts
- npm run dev – start app with hot reload  
- npm run build – build all packages  
- npm run typecheck – check types  
- npm run lint – run ESLint  
- npm run format[:write] – check or fix formatting  
- npm run clean – remove build files  

## Release builds
Built with Electron Builder:
- build all packages  
- copy UI build to app  
- apply fake names (release only)  
- package app  

Commands:
- npm run release:linux – Linux (AppImage + .deb)  
- npm run release:win – Windows installer  
- npm run release:mac – macOS (requires macOS)  

## Installing
Windows:
Download .exe and run it. If SmartScreen warns, choose More info → Run anyway.

Linux:
- AppImage: chmod +x ...AppImage then run  
- Debian/Ubuntu: sudo dpkg -i ...deb  

macOS:
Download .dmg, move to Applications, run it.  
If blocked, allow it in System Settings → Privacy & Security.

## Developer logs
console.log does not appear in terminal during npm run dev.

Check logs in:
- Electron: View → Toggle Developer Tools → Console  
- Browser: open http://localhost:5173 → F12 → Console  

Look for:
- [SJSIM] – simulation logs  
- [SJSIM-CALLUPS] – AI selection logs  
