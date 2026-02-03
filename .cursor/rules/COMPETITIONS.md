# Logika konkursu
Zawodnicy skaczą w kolejności odwrotnej do klasyfikacji PŚ. BIB to numer startowy. Np. ostatni zawodnik ma 50, jeśli jest 50 skoczków.
W konkursie drużyn mieszanych zawodnicy skaczą w kolejności odwrotnej do klasyfikacji uzyskanej poprzez dodanie Pucharu Narodów męskiego i Pucharu Narodów żeńskiego. Od początku drugiej serii, po każdej grupie zawodników (grupa = po jednym zawodniku z każdej drużyny) kolejność w następnej grupie aktualizuje się — drużyny skaczą w kolejności odwrotnej do zajmowanych miejsc (jeśli więc ktoś zepsuje skok w konkursie drużynowym i bardzo spadnie, to w następnej grupie mogą skakać znacznie wcześniej). Plik ze ścieżkami do plików z klasyfikacjami: SKI_JUMPING_ASSETS.md.
W konkursie duetów męskich (żeńskich nie ma) drużyny startują w kolejności odwrotnej do Pucharu Narodów męskiego.
W grze obsługiwane są następujące rodzaje zawodów:
- Trening: każdy skacze indywidualnie; liczy się odległość, liczą się rekompensaty za wiatr i belkę. Trening często ma wiele niezależnych serii.
- Seria próbna (to samo, co trening). Zawsze jedna.
- Konkurs indywidualny: dwie serie, do drugiej wchodzi TOP 30 skoczków. W drugiej serii kolejność jest odwrotna do miejsc zajmowanych w konkursie. Gdy jest ex aequo, później skacze zawodnik z wyższym BIBem.
- Konkurs duetów: 3 serie. W pierwszej skaczą wszystkie drużyny dwuosobowe. Do drugiej awansuje 12 najlepszych duetów. Do trzeciej awansuje 8 najlepszych duetów. Od początku drugiej serii, czyli od 3 skoku, kolejność
- Konkurs drużyn mieszanych.
- Seria próbna drużynowa: taka sama, jak seria próbna indywidualna, ale dodatkowo podaje się w wynikach zsumowane wyniki drużynowe, obok wyników indywidualnych
### Nota punktowa za skok
- Skoczek ma na start 60 punktów.
Na skoczni Sapporo HS137, Willingen HS147 i Predazzo HS141, zawodnik dostaje 1.8pkt mniej za każdy metr przed punktem K i 1.8pkt więcej metr za punktem K. Na skoczni normalnej jest to 2.0pkt.
Na bazie **uśrednionego wiatru** podawanego w m/s (dodatnia wartość to wiatr pod narty, a ujemna wiatr w plecy), obliczanego na bazie pewnego dość zawiłego algorytmu.
Na bazie **belki**, tj. różnicy względem belki która była na początku serii skoków, dodaje się lub odejmuje punkty. Np. jeśli konkurs ruszał z belki 15, zawodnik skaczący z belki 13 dostanie 20 punktów, jeśli za belkę dostaje się 10 punktów.
Pięciu sędziów ocenia skok od 1 do 20. Dwie skrajne noty są odrzucane, a ich suma wlicza się do sumy punktów zawodnika. Tylko w konkursach — w treningach i seriach próbnych not nie ma. Maksymalnie 60 punktów za styl.
Jeśli trener obniży zawodnikowi belkę na własne życzenie, a uzyska on przynajmniej 95% punktu HS, otrzyma on rekompensatę za owe obniżenie.
##### Przeliczniki:
(za belkę, za wiatr pod narty 1m/s, za wiatr w plecy 1m/s)
Sapporo HS137: 7.4, 10.8, 16.2
Willingen HS147: 7.99, 11.7, 17.55
Predazzo HS107: 6, 9, 13.5
Predazzo HS141: 7.20, 12.6, 18.9
### Linia to beat i to advance
Linia to beat, tzw. zielona linia, oznacza ile trzeba orientacyjnie skoczyć, by zajmować pierwsze miejsce.
Linia to advance, tzw. czarna linia, oznacza ile trzeba orientacyjnie skoczyć, by zajmować ostatnie miejsce premiowane pewnym awansem (np. po 45 zawodnikach, gdy jest ich 50 a awansuje 30, 25 miejsce po skoku następnego zawodnika, da awans).
Wpływ na te linie mają warunki, belka i tak dalej... czyli porównujemy skok lidera z warunkami zawodnika, który ma skoczyć i wyliczamy potrzebną odległość. Zakładamy, że zawodnik otrzyma takie noty za styl, ile wynosi średnia not za styl w ostatnich 5 skokach.

# Ekran konkursu
Na środku ekranu jest tabela z aktualnymi wynikami. Wynik ostatnio zakończonego skoku jest podświetlony. Kolumna Odległość 1, Punkty 1, Odległość 2, Punkty 2 (omiń kolumny dla drugiej serii, jeśli jej jeszcze nie ma lub nie jest planowana), Nota (czyli punkty zsumowane — tylko jeśli jest 2 lub więcej serii).
Każdy trening jest osobny, nie sumują się w nich punkty.
Dla konkursu drużynowego lekko zmodyfikuj tę tabelę, by pod "głównym" wynikiem drużyny było także N mini-zapisów wyniku skoczków z danych drużyn. Czyli trochę obszerniej jeden wynik główny (drużyna), ale za to drużyn jest mniej niż zawodników w indywidualnym konkursie, więc się równoważy.
Po lewej stronie mamy listę startową, która "scrolluje się sama" wraz z postępem rozgrywania konkursu. Po prostu po kolei zawodnicy + BIB w formie listy. Ci, którzy skoczyli, są wyszarzeni.
Informacja o następnym zawodniku — imię, nazwisko, flaga. Pod spodem informacja o odległości potrzebnej do objęcia prowadzenia, pod spodem i nie tak "wyróżniająco się" jest też informacja o odległości czarnej linii. Uwaga, to ważne: linia to beat ma być połączona z grafiką przedstawiająca skoczka i zanimowane (naprawdę, ma być animacja, nawet jeśli prosta!) "ruchy powietrza", których szybkość i gęstość jest zależna od wspomnianego wcześniej **uśrednionego wiatru**. Zdjęcie tego, jak to ma mniej więcej wyglądać, jest w pliku `assets/to_beat.png` Także napis "Individual 1st round" niech zostanie. Ewentualnie "Training round", "Trial round", "Super Team 3rd round" (Super Team = duety).
Po kliknięciu na wynik skoczka w tabeli, ma być hover ze szczegółami jego skoku, w stylu podobnym jak na zdjęciu: `assets/jump_result_details.png`.
Gdzieś znajdź miejsce na uśredniony wiatr, już nie w formie zanimowanej a surowej, w dokładności do dwóch miejsc po przecinku.
Kiedy system postanowi zmienić belkę, podświetl tę informację na ekranie, lekko zanimuj i przez chwilę pozostaw kolorem wyróżniającym, by gracz tego nie przeoczył.
### W trybie Dyrektora...
Daj średnio widoczny przycisk "Ręcznie ustaw belkę"; po tym następuje ostrzeżenie w formie dialogu, że od tej pory gracz ustawia belkę, nie będzie to automatyczne, a skoki nie powinny być zbyt dalekie ani krótkie. Potem można wrócić do "Ustaw belkę automatycznie", przez co system automatycznej zmiany belki uruchomi się spowrotem.

# Przed konkursem
Jeśli to: (1) konkurs drużyn mieszanych lub (2) konkurs duetów mężczyzn — przed przejściem do konkursu pojawia się konieczność wybrania składu do drużyny i jego kolejności. Rozwiąż to fajnie pod względem UX, by dało się przeciągając zmieniać kolejność. Uwaga: w konkursach mieszanych kolejność jest taka: kobieta, mężczyzna, kobieta, mężczyzna.
Uwaga: w duetach (2 mężczyzn) lub drużynach mieszanych (2 kobiety + 2 mężczyzn) biorą udział tylko te reprezentacje, które mają wystarczającą ilość osób.


# Systemy działające podczas konkursu
Nie jest to część zasad skoków narciarskich, a logika aplikacyjna.
- System automatycznej zmiany belki — co każdy skok sprawdzany jest warunek, czy powinniśmy obniżyć/podwyższyć belkę. Czynniki: następny zawodnik, wcześniejsze skoki (ważone przez umiejętności zawodnika — jak ktoś słaby skoczy przed HS, ale blisko HS, to ważny sygnał), wiatr w porównaniu do wiatru we wcześniejszych skokach. Nieaktywne, jeśli gracz jest w trybie Dyrektora i włączył samodzielną manipulację belką.
- Silnik wiatru — co kilka sekund "losowany" jest nowy wiatr, działają różne "tendencje" wiatrowe i inne mechanizmy zapewniające realizm. Ogólne zachowanie wiatru może być ustalone przez gracza-Dyrektora przed konkursem (np. czy ma być zmienny wiatr, czy ma być mocny wiatr w plecy itd...)
- Automatyczna symulacja aktualnej serii (dla "leniwych") — symulujemy serię za pomocą jednego kliku
- Auto-skok — co N sekund (do ustawienia przez użytkownika) następny zawodnik oddaje swój skok. Przejście do następnej serii musi być zatwierdzone przez użytkownika.
- Obniżenie belki przez trenera + warunek 95% HS-u, co jest zarządzane także przez boty sterujące drużynami; obniżenie jest na ogół rzadkie, chyba że belka jest wysoka a zawodnik z dużym potencjałem.
**Co do tych systemów, na razie wystarczą mocki i ogólna integracja z resztą aplikacji, a to co się dzieje "pod spodem", jak wpływają jakie czynniki — nad tym popracujemy dłużej**

# Uwagi
- W treningach i seriach próbnych belka jest ustawiana asekuracyjniej. W kwalifikacjach często też.
- W konkursie belka ustawiana jest mniej więcej tak, by najlepsi skakali trochę przed HS.

# Rozgrywanie konkursu
W pierwszej serii zawodnicy skaczą w kolejności odwrotnej do miejsc zajmowanych w Pucharze Świata. Skoczkowie bez punktów w PŚ skaczą na samym początku pomieszani losowo w swoim "segmencie bez punktów".
Dyrektor ma wpływ na belkę, jeśli użytkownik odblokuje to sobie w ekranie konkursu, w jakimś subtelnym miejscu.
Trener może zażądać obniżenia belki; punkty za belkę będą dodane tylko, gdy zawodnik uzyska co najmniej 95% punktu HS. Trener nie ma wpływu na belkę.
Zawodnicy mogą zostać zdyskwalifikowani (załóżmy, że 1 na 300 zawodników dostanie "DSQ" przed skokiem, a 1 na 200 po skoku)

# Kwalifikacje
(konieczne w Sapporo)
Kwalifikacje składają się z X skoczków, ale awansuje tylko 50. Do konkursu głównego. Ewentualnie 50+, jeśli są ex aequo na 50 miejscu.

# Powołania na Sapporo
Znajdują się w pliku men_jumpers_sapporo.csv (format: Country,Name,Surname)

# Konkursy w Sapporo
2 konkursy, ale także treningi, serie próbne i kwalifikacje. Są po to, by gracz mógł wybrać skład na podstawie obserwacji z dodatkiem losowej formy zawodników. Jednak bez konkursów w Willingen.
Są one symulowane "na raz", pod maską, na urządzeniu użytkownika, bez pokazywania przebiegu konkursu. Mimo to, dalej działa tak samo system wiatru i belek, tylko użytkownik widzi końcowe wyniki i nie ma wpływu na rozegranie konkursów. Czyli po prostu automatyzujemy i od razu pokazujemy wyniki. Wyniki trafiaja do archiwum, skąd można podejrzeć wyniki w Predazzo Dashboardzie.