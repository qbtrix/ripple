import type { WidgetManifestEntry } from '../index.js';

export const chartEntry: WidgetManifestEntry = {
  type: 'chart',
  category: 'data',
  description: 'ECharts wrapper. Supports bar/line/area/pie/donut/candlestick/sparkline/heatmap/gauge/radar.',
  props: {
    data: { type: 'Array<{ label: string; value?: number; series?: Record<string, number> }>', required: true, description: 'Data points (shape varies by chart type).' },
    type: { type: '"bar" | "line" | "area" | "pie" | "donut" | "candlestick" | "sparkline" | "heatmap" | "gauge" | "radar"', required: false, description: 'Chart type. Default "bar".' },
    title: { type: 'string', required: false, description: 'Chart title.' },
    height: { type: 'number', required: false, description: 'Height in px. Default 200.' },
    colors: { type: 'string[]', required: false, description: 'Palette in order: one per series when points carry `series`, one per slice on pie/donut. On one series (bar, line) every point wears the first colour; give two or more to colour points individually. Default palette is the theme\'s chart-1 to chart-5 (brand blue first), then categorical; no status colours.' },
    reference: { type: 'string | string[]', required: false, description: 'Series keys that are a reference, not data (a target, plan or benchmark): drawn muted and dashed, outside the palette order.' },
    tooltip: { type: 'boolean', required: false, description: 'Show tooltip on hover. Default true.' },
  },
  example: {
    type: 'chart',
    props: {
      type: 'bar',
      title: 'Q4 Revenue',
      data: [
        { label: 'Jan', value: 24000 },
        { label: 'Feb', value: 18500 },
        { label: 'Mar', value: 32100 },
      ],
      height: 280,
    },
  },
};
