<script lang="ts">
	import EventList from '../../EventList.svelte';
	import ScheduleNav from '../../ScheduleNav.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.label}</title>
</svelte:head>

<main>
	<ScheduleNav today={data.today} date={data.date} />

	<header>
		<a href="/events/day/{data.prev}" aria-label="Предыдущий день">‹</a>
		<h1>{data.label}</h1>
		<a href="/events/day/{data.next}" aria-label="Следующий день">›</a>
	</header>

	{#if data.rows.length === 0}
		<p class="empty">В этот день ничего не запланировано.</p>
	{:else}
		<EventList rows={data.rows} />
	{/if}
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	header a {
		font-size: 2rem;
		text-decoration: none;
		padding: 0 0.75rem;
	}
	h1 {
		font-size: 1.1rem;
		text-align: center;
		text-transform: capitalize;
	}
	.empty {
		color: #888;
	}
</style>
