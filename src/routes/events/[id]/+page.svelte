<script lang="ts">
	import EventFields from '../EventFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// The form shows the Event in ITS OWN zone (startLocal), because that is how the core reads it back.
	const values = $derived({
		title: data.event.title,
		notes: data.event.notes,
		location: data.event.location,
		allDay: data.event.allDay,
		timeZone: data.event.timeZone,
		start: data.event.startLocal,
		end: data.event.endLocal
	});
</script>

<svelte:head>
	<title>{data.event.title}</title>
</svelte:head>

<main>
	<a href="/events">‹ Расписание</a>
	<h1>Событие</h1>

	<form method="POST" action="?/save">
		<EventFields {values} zones={data.zones} />
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button>Сохранить</button>
	</form>

	<form method="POST" action="?/delete" class="delete">
		<button>В корзину</button>
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
	.delete {
		margin-top: 1.5rem;
	}
	.delete button {
		color: #b00020;
	}
	.error {
		color: #b00020;
	}
</style>
