// figures/style.ts: puts a figure's stylesheet where the figure can see it. A
// figure inside a shadow root (the @ripple-ui/embed card) never reads
// document.head, so its <style> goes into that shadow root; anywhere else it
// goes into the document head. One copy per root, keyed by the style id, so two
// embeds on a page each get their own. The embed's destroy() empties its root,
// which takes the copy with it; the next mount adds it back.

/** Adds `css` as `<style id={id}>` to the root `el` renders in, unless that root already has it. */
export function addFigureStyle(el: HTMLElement, id: string, css: string): void {
	const doc = el.ownerDocument;
	const root = el.getRootNode();
	const shadow = root instanceof ShadowRoot ? root : null;
	if ((shadow ?? doc).getElementById(id)) return;
	const style = doc.createElement('style');
	style.id = id;
	style.textContent = css;
	(shadow ?? doc.head).appendChild(style);
}
