<script lang="ts">
	// Shows Notes with tappable links and kept line breaks. Everything is a plain element
	// and Svelte escapes the text, so nothing in Notes can inject HTML.
	import { notesPieces } from './notes.js';

	let { notes }: { notes: string } = $props();
	const pieces = $derived(notesPieces(notes));
</script>

{#if pieces.length > 0}
	<p class="notes">
		{#each pieces as piece}
			{#if piece.kind === 'text'}{piece.value}{:else if piece.kind === 'link'}<a href={piece.href} target="_blank" rel="noopener noreferrer">{piece.href}</a>{:else}<br />{/if}
		{/each}
	</p>
{/if}

<style>
	.notes {
		overflow-wrap: anywhere;
		margin: 0.5rem 0;
	}
</style>
