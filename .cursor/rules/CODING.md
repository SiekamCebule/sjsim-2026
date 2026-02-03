# Stack technologiczny
- Electron
- TypeScript do logiki, bezpieczny i czysty kod.
- Monorepo.
- React.
- Na razie gra jest 100% offline
- Potem użyjemy SQLite czy jakiejś bazy danych, a także innych rozwiązań
- Foldery: core, ui, app (Electron), infra (później SQLite i inne takie)
- Stan: Zustand
- Vite
- Node 20
- Bez serwera backend, bez MUI, bez Reduxa

# Architektura
- DIP (interfejsy), by móc sprawnie zamienić źródła danych, symulatory skoków, silniki pogodowe i nie tylko.
- Nie overengineeruj, ale zachowaj czystą i efektywną architekturę.
- Keep It Simple, Stupid!