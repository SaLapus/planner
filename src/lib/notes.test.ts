import { describe, expect, it } from 'vitest';
import { notesPieces } from './notes.js';

const text = (value: string) => ({ kind: 'text', value });
const link = (href: string) => ({ kind: 'link', href });
const br = { kind: 'break' };

describe('notes display', () => {
	it('plain text is one text piece, empty notes are no pieces', () => {
		expect(notesPieces('Skiena, гл. 3.4')).toEqual([text('Skiena, гл. 3.4')]);
		expect(notesPieces('')).toEqual([]);
	});

	it('keeps line breaks', () => {
		expect(notesPieces('a\nb\r\nc')).toEqual([text('a'), br, text('b'), br, text('c')]);
		expect(notesPieces('a\n\nb')).toEqual([text('a'), br, br, text('b')]);
	});

	it('turns http and https URLs into links', () => {
		expect(notesPieces('see https://leetcode.com/problems/two-sum/ now')).toEqual([
			text('see '),
			link('https://leetcode.com/problems/two-sum/'),
			text(' now')
		]);
		expect(notesPieces('http://a.example/x?y=1#z')).toEqual([link('http://a.example/x?y=1#z')]);
	});

	it('leaves trailing punctuation outside the link', () => {
		expect(notesPieces('(https://a.example/x), и https://b.example.')).toEqual([
			text('('),
			link('https://a.example/x'),
			text('), и '),
			link('https://b.example'),
			text('.')
		]);
		expect(notesPieces('https://a.example/a_(b)!')).toEqual([link('https://a.example/a_(b)'), text('!')]);
	});

	it('handles several links on one line', () => {
		expect(notesPieces('https://a.example http://b.example')).toEqual([
			link('https://a.example'),
			text(' '),
			link('http://b.example')
		]);
	});

	it('leaves other schemes as text', () => {
		for (const s of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://a.example', 'mailto:a@b.c', 'xhttps://a.example', 'https://']) {
			expect(notesPieces(s)).toEqual([text(s)]);
		}
	});

	it('leaves HTML-looking text as text', () => {
		expect(notesPieces('<b>hi</b> <script>alert(1)</script>')).toEqual([text('<b>hi</b> <script>alert(1)</script>')]);
		// a URL inside markup stops at the markup characters
		expect(notesPieces('<a href="https://x.example">y</a>')).toEqual([
			text('<a href="'),
			link('https://x.example'),
			text('">y</a>')
		]);
	});
});
