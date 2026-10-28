// Notes text -> display pieces. Svelte renders each piece as a plain element, so nothing in
// Notes can inject HTML. Only http:// and https:// URLs become links; the rest stays text.

export type NotesPiece =
	| { kind: 'text'; value: string }
	| { kind: 'link'; href: string }
	| { kind: 'break' };

// A URL runs until whitespace or a character that can't be part of one in prose or markup.
const URL = /https?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,;:!?'*\]}>)]$/;
const OPENER: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

// Cuts trailing punctuation off a matched URL. A closing bracket stays when it has its opener
// inside the URL, as in .../a_(b).
function trimUrl(url: string): string {
	while (TRAILING.test(url)) {
		const last = url.at(-1)!;
		const opener = OPENER[last];
		if (opener && count(url, last) <= count(url, opener)) break;
		url = url.slice(0, -1);
	}
	return url;
}

function count(s: string, ch: string): number {
	return s.split(ch).length - 1;
}

function lineToPieces(line: string, out: NotesPiece[]): void {
	let from = 0;
	const text = (end: number) => {
		if (end > from) out.push({ kind: 'text', value: line.slice(from, end) });
	};
	for (const m of line.matchAll(URL)) {
		// "xhttps://..." is not a link start.
		if (m.index > 0 && /[A-Za-z0-9+.-]/.test(line[m.index - 1])) continue;
		const url = trimUrl(m[0]);
		if (/^https?:\/\/$/i.test(url)) continue;
		text(m.index);
		out.push({ kind: 'link', href: url });
		from = m.index + url.length;
	}
	text(line.length);
}

export function notesPieces(notes: string): NotesPiece[] {
	const out: NotesPiece[] = [];
	if (notes === '') return out;
	notes.split(/\r\n|\r|\n/).forEach((line, i) => {
		if (i > 0) out.push({ kind: 'break' });
		lineToPieces(line, out);
	});
	return out;
}
