W tym pliku znajdują się wymagania wysokiego poziomu, które musisz spełnić.

# Kontekst
Sj.Sim 2026 Predazzo Edition to okienkowy symulator wyników skoków narciarskich z motywem przewodnim Igrzysk Olimpijskich 2026 odbywających się w Cortinie d'Ampezzo (oficjalnie brak powiązań z Igrzyskami ze względów prawnych).
W Predazzo znajdują się dwie skocznie: K98/HS107 i K128/HS141.
W grze istnieje także skocznia w Sapporo (K123/HS137) i w Willingen (K130/HS147). Chodzi o to, że przed Igrzyskami rozgrywane są tam konkursy Pucharu Świata w Sapporo i w Willingen. Gra dysponuje realną klasyfikacją Pucharu Świata przed konkursami w Sapporo, po czym jest ona już "zmieniana" na podstawie konkursów w Sapporo i w Willingen. Po Sapporo trzeba podać powołania, jeśli użytkownik chce powoływać własnych skoczków, a nie jak w rzeczywistości. Sapporo będzie symulowane szczegółowo, tzn. treningi i serie próbne też, za to Willingen — tylko konkursy dla podglądu i zaktualizowania klasyfikacji PŚ.

# Kwestia skoków kobiet
Nie będzie fikcyjnych zawodów kobiet.

# Ekrany
1. Menu główne — klimatyczne zdjęcia jednej lub drugiej skoczni, wybiera się losowo. W tle padający śnieg i ładnie wyglądający tytuł, a także przyciski.
    1.1. Ustawienia (nie wiem co tam będzie, raczej mało rzeczy)
    1.2. Pomoc (krótko o celu gry, o zasadach i o braku powiązań z Igrzyskami)
2. Konfiguracja rozgrywki
    2.1. Wybór trybu gry: Dyrektor (obserwuje, "God Mode") lub Trener (wybiera zawodników po swojemu i ich "prowadzi"; tylko dla mężczyzn są "wcześniejsze konkursy" przed Olimpiadą — dla kobiet od razu Olimpiada)
    2.2.
        Jeśli Dyrektor: Data rozpoczęcia: (1) od konkursów w Sapporo jest losowa forma i fikcyjne wyniki; (2) od razu Olimpiada.
        Jeśli Trener: powołania własne / powołania prawdziwe
    (Jeśli Trener) 2.3 zacznij od Sapporo (na tej podstawie wybieramy skoczków, których forma może trochę zmienić się w stosunku do rzeczywistości) / powołania na bazie realnej formy, bez symulacji konkursów sprzed Olimpiady; wtedy Olimpiada startuje na bazie realnej klasyfikacji generalnej PŚ "niedotkniętej" fikcyjnymi wynikami kilku konkursów.
    (Jeśli Trener i jeśli bez symulacji Sapporo wzwyż) 2.4 Powołania zawodników
    (Jeśli symulacja Sapporo i wzwyż, jeśli Trener) 2.5 Wyniki z Sapporo + zaktualizowana klasyfikacja PŚ.
    (Jeśli symulacja Sapporo i wzwyż, jeśli Dyrektor) 2.5 Wyniki z Sapporo (tylko konkursy główne) i wyniki z Willingen
    (Jeśli symulacja Sapporo i wzwyż, jeśli Trener) 2.6. Powołania zawodników
    (Jeśli symulacja Sapporo i wzwyż, jeśli Dyrektor) 2.6. Podgląd powołanych zawodników. Jeśli od Sapporo, każda kadra nieprowadzona przez użytkownika powołuje skoczków przez algorytm AI (najlepsi skoczkowie + nuta losowości); jeśli od razu Olimpiada, bierzemy oryginalne powołania + ewentualnie zmiany w kadrze użytkownika
3. Dashboard Olimpiady (główny "ekran gry")
    - Spokojna, lekko inspirująca muzyka
    - Klimatyczne tło ze skocznią, na której będą następne zawody. Losowo albo pada śnieg, albo nie pada, albo pada lekko.
    - Drobna ciekawostka "Faworyt", "Czarny Koń" i trzecie — skoczek który niespodziewanie zawodzi
    - Tabelka z wynikami (1) ostatnich zawodów (tylko konkursy główne, nawet jeśli drużynowe) i (2) jeśli ostatnie zawody to trening — tabelka także z wynikami tego ostatniego treningu.
    - Kafelek z informacją o następnych zawodach — która skocznia, czy to trening, czy to seria próbna, czy to konkurs, jaka płeć skacze (lub obie płcie w zawodach mieszanych)
        - W tym: Prognoza pogody: ilość stopni celcjusza, zachmurzenie/słonecznie, opady i wiatr (pod narty/w plecy/boczny + siła w m/s)
    3.1. Podekran z wynikami — po prostu jasny spis wszystkich zawodów, faktów nt. pogody, listy startowej, szczegółowych wyników i prostą grafiką z tym, kto zdobył medale w tej rywalizacji
4. Ekran konkursu (!)

# Rozgrywanie konkursu
W pierwszej serii zawodnicy skaczą w kolejności odwrotnej do miejsc zajmowanych w Pucharze Świata. Skoczkowie bez punktów w PŚ skaczą na samym początku pomieszani losowo w swoim "segmencie bez punktów".
Dyrektor ma wpływ na belkę, jeśli użytkownik odblokuje to sobie w ekranie konkursu, w jakimś subtelnym miejscu.
Trener może zażądać obniżenia belki; punkty za belkę będą dodane tylko, gdy zawodnik uzyska co najmniej 95% punktu HS. Trener nie ma wpływu na belkę.
Zawodnicy mogą zostać zdyskwalifikowani (załóżmy, że 1 na 300 zawodników dostanie "DSQ" przed skokiem, a 1 na 200 po skoku)

# Dodatkowe Funkcje i Uwagi
- Zapis gry i jego późniejsze wczytanie (SQLite)
- Musimy stworzyć system, który dla wygody dewelopera zacznie się od prawdziwych nazwisk skoczków i skoczkiń, a przed wydaniem zrobimy "mapping" na bazie pliku CSV z zamienionymi imionami i nazwiskami, co także dotknie klasyfikacji PŚ i innych rzeczy, które będą zapisane jako assety w pliku CSV.

# Pomysły (nie zwracaj na nie uwagi)
- Opcja wyłączenia skoków kobiet