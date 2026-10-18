<script lang="ts">
	// A component is a reusable piece of page. Its inputs ("props") come from `$props()`;
	// here the parent gives us a list of rows to draw.
	import type { EventRow } from './format.js';

	let { rows }: { rows: EventRow[] } = $props();
</script>

<ul>
	<!-- The key must be unique across Events AND Tasks, so it is `kind-id`, not just the id. -->
	{#each rows as e (e.key)}
		<li class:task={e.kind === 'task'}>
			<a href={e.href}>
				<span class="when">
					{#if e.kind === 'task'}<span class="tag">{e.timeBlock ? 'Задача · блок' : 'Задача'}</span>{/if}
					{e.when}
				</span>
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
	/* Tasks look different from Events: a green stripe, tinted background and a "Задача" badge. */
	li.task {
		border-left: 4px solid #2e7d32;
		padding-left: 0.6rem;
		background: #f3faf3;
	}
	.tag {
		display: inline-block;
		margin-right: 0.4rem;
		padding: 0 0.4rem;
		border-radius: 0.5rem;
		background: #2e7d32;
		color: #fff;
		font-size: 0.75rem;
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
