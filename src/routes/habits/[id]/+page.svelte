<script lang="ts">
	// A plain form: no `use:enhance`, so the browser posts and the server redirects back to the list.
	import HabitForm from '../HabitForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Изменить привычку</title>
</svelte:head>

<main>
	<nav><a href="/habits">← Привычки</a></nav>
	<h1>Изменить привычку</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	<form method="POST" action="?/save">
		<HabitForm habit={data.habit} submit="Сохранить" />
	</form>
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto 3rem;
		padding: 0 1rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.error {
		color: var(--danger);
	}
</style>
