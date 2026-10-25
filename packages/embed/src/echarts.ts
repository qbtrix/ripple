// src/echarts.ts: what `import('echarts')` resolves to in the embed build
// (vite.config.ts aliases it). The Chart widget only calls init(), so this
// registers just the series and components Chart.svelte draws with instead of
// shipping all of echarts (about a third of the size). echarts.test.ts fails
// if Chart.svelte starts drawing a series type that is not registered here.
// A themeOverrides option that needs another component (dataZoom, toolbox,
// ...) is ignored by echarts in the embed.
import { init, use } from 'echarts/core';
import { BarChart, CandlestickChart, GaugeChart, HeatmapChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

export const SERIES = ['bar', 'candlestick', 'gauge', 'heatmap', 'line', 'pie', 'radar'];

use([
	BarChart, CandlestickChart, GaugeChart, HeatmapChart, LineChart, PieChart, RadarChart,
	GridComponent, LegendComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
	CanvasRenderer
]);

export { init };
