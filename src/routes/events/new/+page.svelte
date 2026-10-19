<script lang="ts">
	import EventFields from '../EventFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// After a failed submit, `form.input` holds what the user typed so nothing is lost.
	const values = $derived(
		form?.input
			? { ...form.input, notes: form.input.notes ?? '', location: form.input.location ?? '', allDay: !!form.input.allDay, timeZone: form.input.timeZone ?? data.homeTimeZone, end: form.input.end ?? '', recurrence: form.input.recurrence ?? null }
			: { title: '', notes: '', location: '', allDay: false, timeZone: data.homeTimeZone, start: `${data.date}T09:00`, end: '', recurrence: null }
	);
</script>

<svelte:head>
	<title>Новое событие</title>
</svelte:head>

<main>
	<a href="/events">‹ Расписание</a>
	<h1>Новое событие</h1>

	<form method="POST">
		<EventFields {values} zones={data.zones} />
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button>Сохранить</button>
	</form>
</main>

<style>
	main {
		max-width: 32rem;
		margin: 1rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	button {
		font: inherit;
		padding: 0.6rem 1.2rem;
		min-height: 2.75rem;
	}
	.error {
		color: #b00020;
	}
</style>
