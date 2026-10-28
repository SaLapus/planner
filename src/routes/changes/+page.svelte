<script lang="ts">
	// Svelte notes: the filter is made of plain links (`?actor=claude`); clicking one makes
	// SvelteKit run `load` again with the new URL. `class:active` highlights the current filter.
	// The "Отменить" button is disabled (with the reason as a tooltip) when the core says the
	// entity changed after that entry.
	import { enhance } from '$app/forms';
	import { actionName, ACTOR_NAMES } from '#lib/labels.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU');
</script>

<svelte:head>
	<title>Журнал изменений</title>
</svelte:head>

<main>
	<h1>Журнал изменений</h1>

	<p class="filter">
		<a href="/changes" class:active={data.actor === null}>Все</a>
		<a href="/changes?actor=owner" class:active={data.actor === 'owner'}>Я</a>
		<a href="/changes?actor=claude" class:active={data.actor === 'claude'}>Claude</a>
	</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if data.entries.length === 0}
		<p class="empty">Изменений пока нет.</p>
	{:else}
		<ul>
			{#each data.entries as e (e.id)}
				<li>
					<div class="what">
						<strong>{actionName(e.action)}</strong> #{e.entityId}
						<small>{ACTOR_NAMES[e.actor]} · {fmt(e.at)}</small>
					</div>
					<form method="POST" action="?/undo" use:enhance>
						<input type="hidden" name="id" value={e.id} />
						<button disabled={e.blockedReason !== null} title={e.blockedReason ?? ''}>
							Отменить
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 36rem;
		margin: 1rem auto 3rem;
		padding: 0 1rem;
	}
	.filter a {
		margin-right: 0.75rem;
	}
	.filter a.active {
		font-weight: bold;
		text-decoration: none;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	small {
		display: block;
		color: var(--ink-muted);
	}
	.error {
		color: var(--danger);
	}
	.empty {
		color: var(--ink-muted);
	}
</style>
