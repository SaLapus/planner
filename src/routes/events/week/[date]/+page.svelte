<script lang="ts">
	// Week view for the PC: seven columns, Monday first. Svelte note: `{#each}` draws one column
	// per day, and each column reuses the same EventList component the agenda and day views use,
	// so Events and Tasks look the same everywhere.
	import EventList from '../../EventList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Неделя {data.title}</title>
</svelte:head>

<main>
	<nav>
		<a href="/events">Расписание</a>
		<a href="/events/week/{data.today}">Эта неделя</a>
		<a href="/events/new" class="add">+ Событие</a>
	</nav>

	<header>
		<a href="/events/week/{data.prev}" aria-label="Предыдущая неделя">‹</a>
		<h1>{data.title}</h1>
		<a href="/events/week/{data.next}" aria-label="Следующая неделя">›</a>
	</header>

	<div class="week">
		{#each data.days as day (day.date)}
			<section class:today={day.isToday}>
				<h2><a href="/events/day/{day.date}">{day.label}</a></h2>
				{#if day.rows.length === 0}
					<p class="empty">—</p>
				{:else}
					<EventList rows={day.rows} />
				{/if}
			</section>
		{/each}
	</div>
</main>

<style>
	main {
		max-width: 96rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	nav {
		display: flex;
		gap: 1rem;
	}
	.add {
		margin-left: auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}
	header a {
		font-size: 2rem;
		text-decoration: none;
		padding: 0 0.75rem;
	}
	h1 {
		font-size: 1.1rem;
		text-align: center;
	}
	/* Desktop: seven equal columns. Narrow screens: one column per row, a plain list. */
	.week {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}
	@media (min-width: 60rem) {
		.week {
			grid-template-columns: repeat(7, minmax(0, 1fr));
		}
	}
	section {
		min-width: 0;
		padding: 0 0.5rem 0.5rem;
		border: 1px solid #ddd;
		border-radius: 0.5rem;
	}
	section.today {
		border-color: #0a58ca;
		box-shadow: 0 0 0 1px #0a58ca;
	}
	h2 {
		font-size: 0.9rem;
		margin: 0.6rem 0 0.2rem;
		text-transform: capitalize;
	}
	h2 a {
		color: inherit;
		text-decoration: none;
	}
	.empty {
		color: #bbb;
		margin: 0.3rem 0;
	}
</style>
