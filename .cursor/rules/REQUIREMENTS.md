W tym pliku znajdują się wymagania wysokiego poziomu, które musisz spełnić.

# Kontekst
Sj.Sim Predazzo Edition to okienkowy symulator wyników skoków narciarskich z motywem przewodnim konkursów w Predazzo w 2026 roku.
W Predazzo znajdują się dwie skocznie: K98/HS107 i K128/HS141.
W grze istnieje także skocznia w Sapporo (K123/HS137) i w Willingen (K130/HS147). Chodzi o to, że przed Predazzo rozgrywane są tam konkursy Pucharu Świata w Sapporo i w Willingen. Gra dysponuje realną klasyfikacją Pucharu Świata przed konkursami w Sapporo, po czym jest ona już "zmieniana" na podstawie konkursów w Sapporo i w Willingen. Po Sapporo trzeba podać powołania, jeśli użytkownik chce powoływać własnych skoczków, a nie jak w rzeczywistości. Sapporo będzie symulowane szczegółowo, tzn. treningi i serie próbne też, za to Willingen — tylko konkursy dla podglądu i zaktualizowania klasyfikacji PŚ.

# Kwestia skoków kobiet
Nie będzie fikcyjnych zawodów kobiet.

# Ekrany
1. Menu główne — klimatyczne zdjęcia jednej lub drugiej skoczni, wybiera się losowo. W tle padający śnieg i ładnie wyglądający tytuł, a także przyciski.
    1.1. Ustawienia (nie wiem co tam będzie, raczej mało rzeczy)
    1.2. Pomoc (krótko o celu gry, o zasadach)
2. Konfiguracja rozgrywki
    2.1. Wybór trybu gry: Dyrektor (obserwuje, "God Mode") lub Trener (wybiera zawodników po swojemu i ich "prowadzi"; tylko dla mężczyzn są "wcześniejsze konkursy" przed Predazzo — dla kobiet od razu Predazzo)
    2.2.
        Jeśli Dyrektor: Data rozpoczęcia: (1) od konkursów w Sapporo jest losowa forma i fikcyjne wyniki; (2) od razu Predazzo.
        Jeśli Trener: powołania własne / powołania prawdziwe
    (Jeśli Trener) 2.3 zacznij od Sapporo (na tej podstawie wybieramy skoczków, których forma może trochę zmienić się w stosunku do rzeczywistości) / powołania na bazie realnej formy, bez symulacji konkursów sprzed Predazzo; wtedy Predazzo startuje na bazie realnej klasyfikacji generalnej PŚ "niedotkniętej" fikcyjnymi wynikami kilku konkursów.
    (Jeśli Dyrektor) 2.3 zacznij od Sapporo / zacznij od Predazzo
    (Jeśli Trener i jeśli bez symulacji Sapporo wzwyż) 2.4 Powołania zawodników
        UWAGA: każdy kraj ma swój limit skoczków podany w men_limits.csv (zob. SKI_JUMPING_ASSETS.md). Niektóre kraje po prostu nie mają z czego wybierać, bo mają 1-2 skoczków.
    (Jeśli symulacja Sapporo i wzwyż, jeśli Trener) 2.5 Wyniki z Sapporo + zaktualizowana klasyfikacja PŚ.
    (Jeśli symulacja Sapporo i wzwyż, jeśli Dyrektor) 2.5 Wyniki z Sapporo (tylko konkursy główne) i wyniki z Willingen
    (Jeśli symulacja Sapporo i wzwyż, jeśli Trener) 2.6. Powołania zawodników
    (Jeśli symulacja Sapporo i wzwyż, jeśli Dyrektor) 2.6. Podgląd powołanych zawodników. Jeśli od Sapporo, każda kadra nieprowadzona przez użytkownika powołuje skoczków przez algorytm AI (najlepsi skoczkowie + nuta losowości); jeśli od razu Predazzo, bierzemy oryginalne powołania + ewentualnie zmiany w kadrze użytkownika
3. Dashboard Predazzo (główny "ekran gry")
    Sprawdź plik `specific_screens/PREDAZZO_DASHBOARD.md`
4. Ekran konkursu (!)

# Dodatkowe Funkcje i Uwagi
- Zapis gry i jego późniejsze wczytanie (SQLite)
- Musimy stworzyć system, który dla wygody dewelopera zacznie się od prawdziwych nazwisk skoczków i skoczkiń, a przed wydaniem zrobimy "mapping" na bazie pliku CSV z zamienionymi imionami i nazwiskami, co także dotknie klasyfikacji PŚ i innych rzeczy, które będą zapisane jako assety w pliku CSV.

# Pomysły (nie zwracaj na nie uwagi)
- Opcja wyłączenia skoków kobiet