Na głównym ekranie Predazzo (dashboardzie) mamy:
- Informację o ostatnim konkursie (konkurs, nie trening ani seria próbna), jeśli jest. Jeśli nie, pokaż ostatni trening. Ikonka płci także.
- Jeśli już jest powyższy konkurs, to pokaż także ostatni trening, jeśli ostatnimi skokami nie był konkurs, tylko właśnie jakiś trening lub seria próbna.
- Leci sobie spokojna, inspirująca muzyczka.
- Jest mały "kącik" z informacją o tym, kto jest "czarnym koniem" (obliczane algorytmem na bazie formy nieznanej przez użytkownika i na bazie wyników Sapporo i szczególnie — wyników już w Predazzo, np. na treningach); o tym, kto jest "faworytem"; o tym, kto radzi sobie nadspodziewanie słabo. Ten algorytm wspólnie zaprojektujemy, ale zrób już jakiś szkielet wyboru tych skoczków.
- Informacja nt. następnych skoków
    - Pogoda: słońce/pochmurno, opady, stopnie celcjusza, wiatr (!!, kierunek ogólny - pod narty/w plecy/boczny i jego siła)
    - Typ: trening, seria próbna, duety mężczyzn, drużyny mieszane, indywidualny. także informacja o skoczni (HS107/HS141)
    - Płcie, np. męski, żeński, mieszany
    - Godzina
- Przejście do następnego konkursu (przycisk)
- Pełny harmonogram po lewej stronie. Zbliżające się zawody i te już rozegrane (wyszarzone). Także treningi. Treningi grupowo, że np. x3, jeśli są trzy.
- Co do godziny, jeśli trening są trzy pod rząd, interpoluj to mądrze. Trening maksymalnie godzinę trwa. A jeśli po dodaniu `n * 1hour` wyjdzie, że treningi kłócą się z następnymi zawodami, podziel czas po równo. Jeśli o 17 jest trening mężczyzn, a o 19 trening kobiet — trening trwa 40 minut. O godzinach mówię dlatego, że po zakończeniu jednego treningu, chcemy w UI dodać ten czas w informacji o godzinie następnego konkursu.
- W tle skocznia, na którym będzie następny konkurs. Jeśli mają być opady, w menu głównym pada śnieg (animacja taka).
- Jeśli następne skoki są rano/w południe/jeszcze nie ma zmierzchu, tło i wszystko ma być jaśniejsze (dalej ciemny motyw — to się nie zmienia!)
Ważne: sprawdź `predazzo_dashboard_concept.png`