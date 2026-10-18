<script lang="ts">
	// A component is a reusable piece of page. Its inputs ("props") come from `$props()`;
	// here the parent gives us a list of rows to draw.
	import type { EventRow } from './format.js';

	let { rows }: { rows: EventRow[] } = $props();
</script>

<ul>
	{#each rows as e (e.id)}
		<li>
			<a href="/events/{e.id}">
				<span class="when">{e.when}</span>
				<span class="title">{e.title}</span>
				{#if e.location}<span class="meta">{e.location}</span>{/if}
				{#if e.zone}<span class="meta zone">{e.zone}</span>{/if}
			</a>
		</li>
	{/each}
</ul>

<style>
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		border-bottom: 1px solid #ddd;
	}
	a {
		display: grid;
		gap: 0.1rem;
		padding: 0.6rem 0;
		color: inherit;
		text-decoration: none;
	}
	.when {
		font-variant-numeric: tabular-nums;
		color: #555;
		font-size: 0.9rem;
	}
	.title {
		font-weight: 600;
	}
	.meta {
		color: #777;
		font-size: 0.85rem;
	}
	.zone {
		color: #8a5a00;
	}
</style>
