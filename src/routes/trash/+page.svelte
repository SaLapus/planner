<script lang="ts">
	// Svelte note: `data` is what `load` returned; each <form> posts to the `restore` action
	// in +page.server.ts, and `use:enhance` makes it happen without reloading the page.
	import { enhance } from '$app/forms';
	import { entityName } from '#lib/labels.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');
</script>

<svelte:head>
	<title>Корзина</title>
</svelte:head>

<main>
	<nav><a href="/">← Задачи</a> · <a href="/changes">Журнал изменений</a></nav>
	<h1>Корзина</h1>
	<p class="hint">Удалённое хранится 30 дней, потом стирается навсегда.</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if data.items.length === 0}
		<p class="empty">Корзина пуста.</p>
	{:else}
		<ul>
			{#each data.items as item (item.entityType + ':' + item.entityId)}
				<li>
					<span class="kind">{entityName(item.entityType)}</span>
					<span class="label">{item.label}</span>
					<small>удалится {fmt(item.purgeAt)}</small>
					<form method="POST" action="?/restore" use:enhance>
						<input type="hidden" name="type" value={item.entityType} />
						<input type="hidden" name="id" value={item.entityId} />
						<button>Восстановить</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 32rem;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.4rem 0;
		border-bottom: 1px solid #ddd;
	}
	.label {
		flex: 1;
	}
	.kind,
	small,
	.hint,
	.empty {
		color: #888;
	}
	.error {
		color: #b00020;
	}
</style>
