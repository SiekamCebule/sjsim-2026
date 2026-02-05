import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { ScheduleItem } from '../data/predazzoSchedule';
import { countryToFlag, type Jumper } from '../data/jumpersData';
import type { GameDataSnapshot } from '../data/gameDataSnapshot';
import { resolveMenTeams, resolveWomenTeams } from '../data/gameDataSnapshot';
import type { GameConfigState } from './GameConfig';
import './team-selection-dialog.css';

interface TeamSelectionDialogProps {
  event: ScheduleItem;
  config: GameConfigState | null;
  gameData?: GameDataSnapshot | null;
  onConfirm: (lineup: Jumper[]) => void;
  onCancel: () => void;
}

function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

function useDragList<T>(items: T[], onReorder: (next: T[]) => void): {
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  onDrop: () => void;
} {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onDragStart = (idx: number): void => {
    setDragIndex(idx);
  };
  const onDragOver = (idx: number): void => {
    setOverIndex(idx);
  };
  const onDrop = (): void => {
    if (dragIndex == null || overIndex == null || dragIndex === overIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved!);
    onReorder(next);
    setDragIndex(null);
    setOverIndex(null);
  };
  return { onDragStart, onDragOver, onDrop };
}

export const TeamSelectionDialog = ({
  event,
  config,
  gameData,
  onConfirm,
  onCancel,
}: TeamSelectionDialogProps): JSX.Element => {
  const country = config?.selectedCountry ?? '';
  const menRoster = useMemo(
    () => resolveMenTeams(gameData).filter((j) => j.country === country),
    [country, gameData]
  );
  const womenRoster = useMemo(
    () => resolveWomenTeams(gameData).filter((j) => j.country === country),
    [country, gameData]
  );

  const [selectedMen, setSelectedMen] = useState<Jumper[]>(() => menRoster.slice(0, 2));
  const [selectedWomen, setSelectedWomen] = useState<Jumper[]>(() => womenRoster.slice(0, 2));

  const dragMen = useDragList(selectedMen, setSelectedMen);
  const dragWomen = useDragList(selectedWomen, setSelectedWomen);

  const isDuet = event.type === 'team_men_pairs';
  const hasCountry = Boolean(country);

  const canConfirm = isDuet
    ? selectedMen.length === 2
    : selectedMen.length === 2 && selectedWomen.length === 2;

  const toggleSelection = (
    list: Jumper[],
    setList: (next: Jumper[]) => void,
    max: number,
    jumper: Jumper
  ): void => {
    const key = jumperKey(jumper);
    const exists = list.some((j) => jumperKey(j) === key);
    if (exists) {
      setList(list.filter((j) => jumperKey(j) !== key));
    } else if (list.length < max) {
      setList([...list, jumper]);
    }
  };

  const handleConfirm = (): void => {
    if (!canConfirm) return;
    if (isDuet) {
      onConfirm(selectedMen);
      return;
    }
    onConfirm([selectedWomen[0]!, selectedMen[0]!, selectedWomen[1]!, selectedMen[1]!]);
  };

  return (
    <div
      className="team-selection-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-selection-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="team-selection-dialog">
        <header className="team-selection-dialog__header">
          <h2 id="team-selection-title">
            {event.type === 'team_men_pairs' ? 'Skład duetów' : 'Skład drużyny mieszanej'}
          </h2>
          {hasCountry && (
            <span className="team-selection-dialog__country">
              <span className="team-selection-dialog__flag" aria-hidden>{countryToFlag(country)}</span>
              {country}
            </span>
          )}
        </header>

        {!hasCountry && (
          <p className="team-selection-dialog__hint">Wybór składu dostępny tylko w trybie Trenera.</p>
        )}

        {hasCountry && (
          <div className="team-selection-dialog__grid">
            <section className="team-selection-dialog__panel">
              <h3>Skład mężczyzn</h3>
              <p className="team-selection-dialog__subhint">Wybierz 2 skoczków (kliknij), kolejność ustaw przeciągając.</p>
              <ul className="team-selection-dialog__roster">
                {menRoster.map((j) => {
                  const key = jumperKey(j);
                  const selected = selectedMen.some((x) => jumperKey(x) === key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={`team-selection-dialog__roster-btn ${selected ? 'team-selection-dialog__roster-btn--selected' : ''}`}
                        onClick={() => toggleSelection(selectedMen, setSelectedMen, 2, j)}
                      >
                        {j.name} {j.surname}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="team-selection-dialog__lineup">
                {selectedMen.map((j, idx) => (
                  <div
                    key={jumperKey(j)}
                    className="team-selection-dialog__lineup-item"
                    draggable
                    onDragStart={() => dragMen.onDragStart(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      dragMen.onDragOver(idx);
                    }}
                    onDrop={dragMen.onDrop}
                  >
                    {idx + 1}. {j.name} {j.surname}
                  </div>
                ))}
              </div>
            </section>

            {!isDuet && (
              <section className="team-selection-dialog__panel">
                <h3>Skład kobiet</h3>
                <p className="team-selection-dialog__subhint">Wybierz 2 skoczkinie (kliknij), kolejność ustaw przeciągając.</p>
                <ul className="team-selection-dialog__roster">
                  {womenRoster.map((j) => {
                    const key = jumperKey(j);
                    const selected = selectedWomen.some((x) => jumperKey(x) === key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className={`team-selection-dialog__roster-btn ${selected ? 'team-selection-dialog__roster-btn--selected' : ''}`}
                          onClick={() => toggleSelection(selectedWomen, setSelectedWomen, 2, j)}
                        >
                          {j.name} {j.surname}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="team-selection-dialog__lineup">
                  {selectedWomen.map((j, idx) => (
                    <div
                      key={jumperKey(j)}
                      className="team-selection-dialog__lineup-item"
                      draggable
                      onDragStart={() => dragWomen.onDragStart(idx)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        dragWomen.onDragOver(idx);
                      }}
                      onDrop={dragWomen.onDrop}
                    >
                      {idx + 1}. {j.name} {j.surname}
                    </div>
                  ))}
                </div>
                <p className="team-selection-dialog__note">Kolejność: kobieta, mężczyzna, kobieta, mężczyzna.</p>
              </section>
            )}
          </div>
        )}

        <footer className="team-selection-dialog__actions">
          <button type="button" className="team-selection-dialog__btn team-selection-dialog__btn--secondary" onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className="team-selection-dialog__btn team-selection-dialog__btn--primary" onClick={handleConfirm} disabled={!canConfirm}>
            Przejdź do konkursu
          </button>
        </footer>
      </div>
    </div>
  );
};
