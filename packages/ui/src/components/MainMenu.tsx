import type { JSX } from 'react';
import menuBg from '@assets/predazzo.jpg';

const APP_VERSION = '1.0.0';

interface MainMenuProps {
  onNewGame: () => void;
}

export const MainMenu = ({ onNewGame }: MainMenuProps): JSX.Element => (
  <div
    className="main-menu"
    style={{ backgroundImage: `url(${menuBg})` }}
  >
    <div className="main-menu__overlay" />
    <header className="main-menu__header">
      <div className="main-menu__title-block">
        <h1 className="main-menu__title">Sj.Sim</h1>
        <p className="main-menu__subtitle">Predazzo Edition</p>
      </div>
      <button
        type="button"
        className="main-menu__settings"
        title="Ustawienia"
        aria-label="Ustawienia"
      >
        <SettingsIcon />
      </button>
    </header>

    <section className="main-menu__content">
      <button
        type="button"
        className="main-menu__card main-menu__card--action"
        onClick={onNewGame}
      >
        <span className="main-menu__card-icon" aria-hidden>
          <PlayIcon />
        </span>
        <div className="main-menu__card-body">
          <h2 className="main-menu__card-title">Nowa rozgrywka</h2>
          <p className="main-menu__card-desc">
            Powołaj swoją kadrę jako Trener lub wciel się w rolę Dyrektora konkursów w Predazzo.
          </p>
        </div>
      </button>
      <div className="main-menu__load-panel">
        <h2 className="main-menu__load-title">
          <span className="main-menu__load-title-icon" aria-hidden>
            <FolderIcon />
          </span>
          Wczytaj rozgrywkę
        </h2>
        <ul className="main-menu__save-list" role="list">
          <li>
            <SaveSlot
              location="Predazzo (Austria)"
              summary="Konkurs mężczyzn, skocznia normalna"
              lastPlayed="1.03.2026"
            />
          </li>
        </ul>
      </div>
    </section>

    <footer className="main-menu__footer">
      <span className="main-menu__version">v{APP_VERSION}</span>
    </footer>
  </div>
);

const SaveSlot = ({
  location,
  summary,
  lastPlayed
}: {
  location: string;
  summary: string;
  lastPlayed: string;
}): JSX.Element => (
  <button type="button" className="main-menu__save-slot">
    <span className="main-menu__save-slot-icon" aria-hidden>
      <SaveFileIcon />
    </span>
    <div className="main-menu__save-slot-content">
      <span className="main-menu__save-slot-label">{location}</span>
      <span className="main-menu__save-slot-summary">{summary}</span>
      <span className="main-menu__save-slot-date">Ostatni zapis: {lastPlayed}</span>
    </div>
  </button>
);

function SettingsIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function SaveFileIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
