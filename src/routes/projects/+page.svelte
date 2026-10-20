<script lang="ts">
	// Svelte note: this page works exactly like the task page. `data` comes from `load`
	// in +page.server.ts, `form` carries an error from the last action, and each
	// <form action="?/name"> calls the action of the same name in +page.server.ts.
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const active = $derived(data.projects.filter((p) => p.archivedAt === null));
	const archived = $derived(data.projects.filter((p) => p.archivedAt !== null));
</script>

<svelte:head>
	<title>Проекты</title>
</svelte:head>

<main>
	<h1>Проекты</h1>

	<form method="POST" action="?/create" use:enhance class="row">
		<input name="name" placeholder="Новый проект…" autocomplete="off" aria-label="Название проекта" />
		<button>Добавить</button>
	</form>
	{#if form?.error}<p class="error">{form.error}</p>{/if}

	{#if active.length === 0}<p class="empty">Нет активных проектов.</p>{/if}
	<ul>
		{#each active as p (p.id)}
			<li>
				<form method="POST" action="?/rename" use:enhance class="row">
					<input type="hidden" name="id" value={p.id} />
					<input name="name" value={p.name} aria-label="Название" />
					<button>Переименовать</button>
				</form>
				<form method="POST" action="?/archive" use:enhance>
					<input type="hidden" name="id" value={p.id} />
					<button>В архив</button>
				</form>
			</li>
		{/each}
	</ul>

	{#if archived.length > 0}
		<h2>Архив</h2>
		<ul>
			{#each archived as p (p.id)}
				<li>
					<a href="/?project={p.id}">{p.name}</a>
					<form method="POST" action="?/unarchive" use:enhance>
						<input type="hidden" name="id" value={p.id} />
						<button>Вернуть</button>
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
	li,
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin: 0.3rem 0;
	}
	.row input:not([type='hidden']) {
		flex: 1;
		padding: 0.4rem;
	}
	.error {
		color: #b00020;
	}
	.empty {
		color: #888;
	}
</style>
