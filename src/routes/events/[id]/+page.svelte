<script lang="ts">
	import EventFields from '../EventFields.svelte';
	import { describeRule } from '../recurrence-form.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// For a recurring Event, which part the change applies to. A `$state` variable: picking a
	// radio button changes it, and everything below that mentions it redraws.
	let scope = $state<'this' | 'following' | 'all'>('this');

	// The form shows the (occurrence of the) Event in ITS OWN zone (startLocal), because that is how the core reads it back.
	const values = $derived({
		title: data.shown.title,
		notes: data.shown.notes,
		location: data.shown.location,
		allDay: data.shown.allDay,
		timeZone: data.shown.timeZone,
		start: data.shown.startLocal,
		end: data.shown.endLocal,
		recurrence: data.event.recurrence
	});
</script>

<svelte:head>
	<title>{data.event.title}</title>
</svelte:head>

<main>
	<a href="/events">‹ Расписание</a>
	<h1>Событие</h1>
	{#if data.event.recurrence}
		<p class="rule">Повторяется: {describeRule(data.event.recurrence, data.event.timeZone)}</p>
	{/if}

	<form method="POST" action="?/save">
		{#if data.occ}
			<input type="hidden" name="occ" value={data.occ} />
			<fieldset>
				<legend>Что изменить</legend>
				<label class="choice"><input type="radio" name="scope" value="this" bind:group={scope} /> Только это событие</label>
				<label class="choice"><input type="radio" name="scope" value="following" bind:group={scope} /> Это и все следующие</label>
				<label class="choice"><input type="radio" name="scope" value="all" bind:group={scope} /> Всё расписание</label>
			</fieldset>
		{/if}
		<!-- When `occurrence` flips, the fields that cannot change for a single occurrence (zone, repeat) disappear or come back. -->
		<EventFields {values} zones={data.zones} occurrence={Boolean(data.occ) && scope === 'this'} />
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button>Сохранить</button>
	</form>

	{#if data.occ}
		<form method="POST" action="?/cancelOccurrence" class="delete">
			<input type="hidden" name="occ" value={data.occ} />
			<button>Отменить только это повторение</button>
		</form>
	{/if}

	<form method="POST" action="?/delete" class="delete">
		<button>{data.occ ? 'Удалить всё расписание в корзину' : 'В корзину'}</button>
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
	.rule {
		color: #555;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.5rem;
	}
</style>
