Limity z men_limits.csv obowiązują tylko przy powołaniach na Predazzo (Olimpiada). W Sapporo powołania są dowolne (plik men_jumpers_sapporo.csv) – bez walidacji limitów.

Jeśli wybrany został tryb gry nie od Predazzo, ale od Sapporo, wtedy powołania do kadr nie są realistyczne, a że zmieniła się forma skoczków (od Sapporo do Predazzo jest około 3 tygodni), to trzeba wybrać je na nowo. Gracz powołuje swoich skoczków, a reszta kadr dobiera wg algorytmu.

# Algorytm automatycznych powołań na konkursy w Predazzo
Obliczany jest score dla każdego zawodnika w kadrze.
Czynniki:
- Pozycja w PŚ (wysoka pozycja -> ważne)
- Konkursy w Sapporo (średnia, ale w której dobra i słaba pozycja jest lepsza od dwóch przeciętnych, jeśli średnia jest taka sama), jeśli skoczek brał udział (jeśli nie brał, a jest wysoko w PŚ w porównaniu z innymi — nie ma to znaczenia)
- Skill na mniejszych i dużych skoczniach, razem z formą (dość spory wpływ)
Przed wybraniem, do każdego score'a dodaje się losową liczbę z przedziału <-2, 2>.

# Algorytm automatycznych powołań na konkursy drużyn mieszanych i duetów męskich
Także obliczany jest score.
Czynniki są inne. Dla mikstów, obie płcie osobno:
- Dwóch najlepszych skoczków z HS107 (poprzedzającym miksty) ma największe szanse. Chyba że ktoś i tak ma wysoki skill + forma, bardziej niż inni, to zwiększa jego szansę. To też załatwiamy score'm, gdzie pozycje w konkursie są ważne.
- Tak samo wybiera się dwie kobiety najlepsze.
Tak samo działa to dla męskich duetów — indywidualne wyniki konkursu na skoczni HS141 są bardzo znaczące, choć skill + forma też jest ważna.