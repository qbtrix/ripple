// manifest/entries/weather-forecast.ts: the LLM-facing entry for the
// weather-forecast data widget. The model writes the place, the unit its
// numbers are in, an optional "now", the days and optional hours; the widget
// draws the icons, range bars and unit toggle. No bind, no events.
import type { WidgetManifestEntry } from '../index.js';

const CONDITIONS = '"sunny" | "partly-cloudy" | "cloudy" | "rain" | "heavy-rain" | "thunder" | "snow" | "fog" | "wind" | "night-clear"';

export const weatherForecastEntry: WidgetManifestEntry = {
  type: 'weather-forecast',
  category: 'composite',
  description:
    'Weather app card: place, now {temp, condition}, days[{day, condition, high, low, rainChance}], optional hourly. Animated icons, range bars, C/F toggle.',
  props: {
    place: { type: 'string', required: true, description: 'e.g. "Lisbon".' },
    unit: { type: '"C" | "F"', required: false, description: 'The unit the numbers are written in. Default "C". The visitor can toggle.' },
    now: {
      type: `{ temp: number; condition: ${CONDITIONS}; feelsLike?: number; humidity?: number; wind?: string }`,
      required: false,
      description: 'Current conditions. humidity is a percent; wind is text like "14 km/h NW".',
    },
    days: {
      type: `Array<{ day: string; condition: ${CONDITIONS}; high: number; low: number; rainChance?: number; sunrise?: string; sunset?: string }>`,
      required: true,
      description: '1 to 14 days, first is today. day is "Mon" or an ISO date. Other condition words map to the closest icon.',
    },
    hourly: {
      type: `Array<{ time: string; temp: number; condition: ${CONDITIONS}; rainChance?: number }>`,
      required: false,
      description: 'Up to 48 hours, time like "14:00" or "2 PM".',
    },
    note: { type: 'string', required: false, description: 'Small note under the place. Write "Sample forecast" when the numbers are made up.' },
  },
  example: {
    type: 'weather-forecast',
    props: {
      place: 'Lisbon',
      unit: 'C',
      note: 'Sample forecast',
      now: { temp: 21, condition: 'partly-cloudy', feelsLike: 20, humidity: 64, wind: '14 km/h NW' },
      hourly: [
        { time: 'Now', temp: 21, condition: 'partly-cloudy' },
        { time: '15:00', temp: 22, condition: 'sunny' },
        { time: '16:00', temp: 22, condition: 'sunny' },
        { time: '17:00', temp: 21, condition: 'partly-cloudy', rainChance: 10 },
        { time: '18:00', temp: 19, condition: 'cloudy', rainChance: 20 },
      ],
      days: [
        { day: 'Mon', condition: 'partly-cloudy', high: 23, low: 16, rainChance: 10, sunrise: '07:31', sunset: '18:52' },
        { day: 'Tue', condition: 'sunny', high: 25, low: 17 },
        { day: 'Wed', condition: 'cloudy', high: 21, low: 16, rainChance: 30 },
        { day: 'Thu', condition: 'rain', high: 18, low: 14, rainChance: 80 },
        { day: 'Fri', condition: 'thunder', high: 17, low: 13, rainChance: 90 },
        { day: 'Sat', condition: 'partly-cloudy', high: 20, low: 14, rainChance: 20 },
        { day: 'Sun', condition: 'sunny', high: 22, low: 15 },
      ],
    },
  },
};
