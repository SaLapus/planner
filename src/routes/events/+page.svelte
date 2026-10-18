<script lang="ts">
	import EventList from './EventList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Расписание</title>
</svelte:head>

<main>
	<nav>
		<a href="/">Задачи</a>
		<a href="/events/day/{data.today}">День</a>
		<a href="/events/new" class="add">+ Событие</a>
	</nav>
	<h1>Расписание</h1>

	{#each data.days as day (day.date)}
		<section>
			<h2>
				<a href="/events/day/{day.date}">{day.label}</a>
				{#if day.isToday}<small>сегодня</small>{/if}
			</h2>
			{#if day.rows.length === 0}
				<p class="empty">Нет событий.</p>
			{:else}
				<EventList rows={day.rows} />
			{/if}
		</section>
	{/each}
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	nav {
		display: flex;
		gap: 1rem;
		align-items: center;
	}
	.add {
		margin-left: auto;
	}
	h2 {
		font-size: 1rem;
		margin: 1.2rem 0 0.2rem;
		text-transform: capitalize;
	}
	h2 a {
		color: inherit;
		text-decoration: none;
	}
	small {
		color: #0a58ca;
		text-transform: none;
	}
	.empty {
		color: #888;
		margin: 0.3rem 0;
	}
</style>
