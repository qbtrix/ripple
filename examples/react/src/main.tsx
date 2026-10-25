// examples/react/src/main.tsx: @ripple-ui/react in a plain Vite app. Two cards
// from the shared example specs, a theme toggle, and the last event a card
// emitted. ?theme=dark starts dark. No Svelte or Tailwind in this app.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Ripple, type RippleEvent, type Theme } from '@ripple-ui/react';
import simple from '../../specs/simple-card.json';
import attention from '../../specs/attention.json';

function App() {
	const [theme, setTheme] = useState<Theme>(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light');
	const [last, setLast] = useState<RippleEvent | null>(null);
	useEffect(() => void document.body.classList.toggle('dark', theme === 'dark'), [theme]);

	return (
		<main>
			<p>
				<button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Switch to {theme === 'dark' ? 'light' : 'dark'}</button>{' '}
				Last event: <code>{last ? JSON.stringify(last) : 'none yet'}</code>
			</p>
			<Ripple spec={simple} theme={theme} onEvent={setLast} />
			<Ripple spec={attention} theme={theme} />
		</main>
	);
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
// examples/smoke.mjs waits for this before measuring or taking screenshots.
setTimeout(() => (document.documentElement.dataset.ready = '1'), 1500);
