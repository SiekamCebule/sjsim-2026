Tu opiszę jak ma działać automatyczna zmiana belek.

Na początku konkursu ustawiamy belkę automatycznie, to się obecnie dzieje. Na podstawie parametru odważności jury, belka może być ustawiona wysoko bądź nisko.
Losujmy JuryBravery dla każdego treningu:
10% - high
45% - medium
40% - low
5% - very low

Dla każdej serii próbnej:
5% - high
30% - medium
50% - low
15% - very low

Dla konkursu indywidualnego:
15% - high
70% - medium
13% - low
2% - very low

Dla konkursu duetów:
15% - high
70% - medium
13% - low
2% - very low

### Belka w konkursie mikstów
Osobne belki są dla mężczyzn i kobiet. Tak jakby były "dwa równoległe" systemy.
UWAGA (liczenie punktów za belkę w mikstach): mężczyźni maja swoją "belkę startową" (odnośnik), a kobiety swoją. Kobiety naturalnie skaczą z innych belek.
Dla konkursu mikstów szanse na JuryBravery:
10% - high
65% - medium
23% - low
2% - very low

# Korekty belek w trakcie konkursu
Tłumacząc intuicyjnie, jury podwyższa rozbieg, gdy:
- Zawodnicy skaczą bardzo krótko, np. najlepsi z trudem przekraczają punkt K
- Jeśli warunki nagle się pogorszyły i ciężko uzyskiwać konkurencjne odległości
- Gdy na razie skacze wiele słabszych zawodników (którzy raczej nie skoczą bardzo daleko za HS), a Jury chce zrobić widowisko
A obniża rozbieg, gdy:
- Zawodnicy, szczególnie ci słabsi, zaczynają skakać blisko punktu HS. Skok dobrego skoczka za HS to już bardzo mocny sygnał.
- Jeśli zaraz skacze jakiś zawodnik z bardzo dużym potencjałem, który może skoczyć za HS
- Gdy jest to mniej ważna seria, gdzie nie warto ryzykować kontuzjami, a widowisko nie jest potrrzebne (treningi, serie próbne)

### Jak to zaimplementować w Sj.Sim?
Po każdym skoku liczymy **score**. Im większy, tym większa szansa, że obniżymy/podwyższymy belkę. Tzn. duży ujemny score to szansa na podwyższenie, a duży dodatni score — na obniżenie. Tzw. współczynnik niebezpieczeńśtwa. Duży wpływ ma JuryBravery w danym konkursie.
Belka jest zmieniana stosunkowo rzadko. Czasami ani razu, a najwięcej razy (w loteryjnych konkursach, gdzie wiatr zmienia się dynamicznie) to i tak 4-5, czasami więcej razy na jedną serię.
Techniki, które myślę, że się przydadzą:
- Oszacowanie odległości następnego skoczka poprzez przesymulowanie jego skoku "pod maską" (użytkownik nic nie widzi, bo to tylko algorytm) kilka razy i sprawdzenie, ile razy wyszedłby za HS
- Analiza ostatnich skoków, ważona poprzez poziom tych skoczków. Jeśli były dalekie skoki słabych skoczków — obniżamy
- Połączenie techniki oszacowania odległości następnego skoczka z oszacowaniem tej odległości dla wielu następnych skoczków — będziemy przez to wiedzieć, czy następni skoczkowie są z dużym potencjałem; jeśli nie — możemy jeszcze chwile pozwolić skakać zawodnikom trochę dalej niż zwykle.
- Może jakiś wzór zamknięty
- Sprawdzenie, jak często zmieniamy belkę. Nie chcemy zmieniać belki co jeden skok, bo to słabo wygląda i wpływa na czytelność (czasami trzeba).