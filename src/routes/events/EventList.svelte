<script lang="ts">
	// A component is a reusable piece of page. Its inputs ("props") come from `$props()`;
	// here the parent gives us a list of rows to draw.
	import type { EventRow } from './format.js';

	let { rows }: { rows: EventRow[] } = $props();
</script>

<ul>
	<!-- The key must be unique across Events AND Tasks, and across the occurrences of a repeating Event. -->
	{#each rows as e (e.key)}
		<li class:task={e.kind === 'task'}>
			<a href={e.href}>
				<span class="when">
					{#if e.kind === 'task'}<span class="tag">{e.timeBlock ? 'Задача · блок' : 'Задача'}</span>{/if}
					{e.when}{#if e.repeats} ↻{/if}
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
		border-bottom: 1px solid var(--line);
	}
	a {
		display: grid;
		gap: 0.1rem;
		padding: 0.6rem 0;
		color: inherit;
		text-decoration: none;
	}
	/* Tasks look different from Events: a stripe, a shallow tint and a "Задача" badge. */
	li.task {
		border-left: 4px solid var(--level-3);
		padding-left: 0.6rem;
		background: var(--wash);
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
	}
	li.task + li.task {
		margin-top: 2px;
	}
	.tag {
		display: inline-block;
		margin-right: 0.4rem;
		padding: 0 0.4rem;
		border-radius: var(--radius-s);
		background: var(--level-4);
		color: var(--on-level-4);
		font-size: 0.75rem;
		font-weight: 550;
	}
	a:hover .title {
		color: var(--accent);
	}
	.when {
		font-variant-numeric: tabular-nums;
		color: var(--ink-soft);
		font-size: 0.9rem;
	}
	.title {
		font-weight: 600;
	}
	.meta {
		color: var(--ink-muted);
		font-size: 0.85rem;
	}
	.zone {
		color: var(--ink-soft);
	}
</style>
