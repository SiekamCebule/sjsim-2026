Nasza gra używa "silnika formy skoczków", który steruje parametrem "formy" u skoczków. Intuicyjnie wyjaśniając, chodzi o to, by w ciągu Predazzo lub przed nim, forma skoczków się jeszcze zmieniała, przez co ich forma nie jest stała, taka jak w rzeczywistości. Jeśli ktoś zacznie od Sapporo, jeszcze bardziej forma może się różnić, bo domyślna paczka skoczków dla rozpoczęcia od razu od Predazzo zakłada brak istnienia 3-tygodniowej luki, gdzie fikcyjnie może zmienić się forma w naszej grze.

# Wyjaśnienie parametru formy
Forma skoczka jest od 0 do 10. 5 oznacza zwyczajny poziom skoczka, 10 oznacza "życiową formę", znacznie powyżej swojej normy.
Natomiast słaby skoczek (niski skill na mniejszych i dużych skoczniach) z dobrą formą często będzie słabszy od dobrego skoczka (wysoki skill na mniejszych i dużych skoczniach) ze słabą formą. 0 oznacza, że skoczek jest pogrążony w głębokim kryzysie, choć jego poziom "bazowy" jest dużo wyższy.

# Jak forma się zmienia?
W grze ma to wyglądać tak:
- Załóżmy że generowaniem formy zarządza parametr alfa. Im większa alfa, tym większe zmiany. `Alfa=0.04` oznacza, że średnio forma zmieni się o około 0.04, natomiast nie chodzi tu o liniową średnią ani nawet o rozkład Gaussa — szukam rozkładu z szerszymi ogonami niż Gauss, trochę jak Cauchy ale bez tak skrajnych liczb i ze skończoną wariancją.

- Jeśli gracz zaczyna od Sapporo, zmień formę na starcie gry, z alfą = 0.1.
- Jeśli gracz zaczyna w Sappporo, Zmień formę po sobotnim konkursie w Sapporo, z alfą = 0.01.
- Jeśli gracz zaczyna od Sapporo, zmień formę po niedzielnym konkursie w Sapporo, z alfą = 0.7
- Jeśli gracz zaczyna od Predazzo, zmień formę na starcie gry, z alfą = 0.2

Potrzebuję skryptu, który umożliwi mi testowanie systemu zmiany formy — który pozwoli wpisanie alfy i wypisanie w konsoli zmian formy, wraz z rankingiem największych zmian i miar statystycznych, także tych ciekawych, na bazie skoczków z men_jumpers_all.csv. Tabela przed i po z kolorami.