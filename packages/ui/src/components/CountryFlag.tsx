import { countryToAlpha2 } from '../data/jumpersData';

interface CountryFlagProps {
  /** Kod kraju FIS alpha-3 (np. POL, AUT, GER). */
  country: string;
  /** Dodatkowa klasa CSS. */
  className?: string;
}

/**
 * Flaga kraju w SVG (paczka flag-icons lipis).
 * Zastępuje emoji flagi, które nie działają na Windows.
 * Wyświetla się inline (4x3), w rozmiarze dopasowanym do otaczającego tekstu.
 */
export function CountryFlag({ country, className }: CountryFlagProps) {
  const alpha2 = countryToAlpha2(country);
  return (
    <span
      className={`fi fi-${alpha2}${className ? ` ${className}` : ''}`}
      aria-label={country}
    />
  );
}
