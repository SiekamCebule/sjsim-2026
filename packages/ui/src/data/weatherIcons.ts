import type { WeatherCondition } from './predazzoSchedule';

import sunny from '@assets/icons/weather/sunny.svg';
import partlyCloudy from '@assets/icons/weather/partly-cloudy.svg';
import cloudy from '@assets/icons/weather/cloudy.svg';
import rainy from '@assets/icons/weather/rainy.svg';
import rainySunny from '@assets/icons/weather/rainy-sunny.svg';
import snowy from '@assets/icons/weather/snowy.svg';
import snowySunny from '@assets/icons/weather/snowy-sunny.svg';
import thunder from '@assets/icons/weather/thunder.svg';
import night from '@assets/icons/weather/night.svg';

export const WEATHER_ICONS: Record<WeatherCondition, string> = {
  sunny,
  partly_cloudy: partlyCloudy,
  cloudy,
  rainy,
  rainy_sunny: rainySunny,
  snowy,
  snowy_sunny: snowySunny,
  thunder,
  night,
};
