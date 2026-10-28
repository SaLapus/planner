<script lang="ts">
	// The "Повторение" part of the Event form.
	//  * `$state` holds what the user picked; `$derived` computes the RRULE text from those picks and
	//    is recomputed automatically whenever any of them changes.
	//  * The computed rule travels to the server in a hidden <input name="recurrence">, so the
	//    ordinary form post carries it; no JavaScript fetch needed.
	import { buildRule, parseRule, WEEKDAYS, WEEKDAY_LABELS } from './recurrence-form.js';

	// `rule` is the existing rule (or null), `startDate` the date of the first occurrence,
	// used when "weekly" has no weekday ticked.
	let { rule, startDate, timeZone }: { rule: string | null; startDate: string; timeZone: string } = $props();

	// svelte-ignore state_referenced_locally
	let f = $state(parseRule(rule, timeZone));

	const result = $derived(buildRule(f, startDate) ?? '');
	const unit = $derived(
		{ DAILY: 'дн.', WEEKLY: 'нед.', MONTHLY: 'мес.', YEARLY: 'г.', NONE: '' }[f.freq]
	);
</script>

<fieldset>
	<legend>Повторение</legend>

	{#if f.custom}
		<p>Особое правило: <code>{f.custom}</code></p>
		<button type="button" onclick={() => (f = parseRule(null, timeZone))}>Сбросить</button>
	{:else}
		<label>Как часто
			<select bind:value={f.freq}>
				<option value="NONE">Не повторяется</option>
				<option value="DAILY">Каждый день</option>
				<option value="WEEKLY">Каждую неделю</option>
				<option value="MONTHLY">Каждый месяц</option>
				<option value="YEARLY">Каждый год</option>
			</select>
		</label>

		{#if f.freq !== 'NONE'}
			<label class="row">Каждые
				<input type="number" min="1" bind:value={f.interval} class="narrow" />
				{unit}
			</label>

			{#if f.freq === 'WEEKLY'}
				<div class="days">
					{#each WEEKDAYS as d (d)}
						<label class="day"><input type="checkbox" value={d} bind:group={f.days} /> {WEEKDAY_LABELS[d]}</label>
					{/each}
				</div>
			{/if}

			<label>Закончить
				<select bind:value={f.end}>
					<option value="never">Никогда</option>
					<option value="until">В дату</option>
					<option value="count">После N раз</option>
				</select>
			</label>
			{#if f.end === 'until'}
				<input type="date" bind:value={f.until} aria-label="Дата окончания (включительно)" />
			{:else if f.end === 'count'}
				<input type="number" min="1" bind:value={f.count} class="narrow" aria-label="Число повторений" />
			{/if}
		{/if}
	{/if}

	<input type="hidden" name="recurrence" value={result} />
</fieldset>

<style>
	fieldset {
		margin: 0.75rem 0;
		padding: 0.5rem 0.75rem;
	}
	label {
		display: grid;
		gap: 0.25rem;
		margin: 0.5rem 0;
		font-size: 0.9rem;
		color: var(--ink-soft);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
	}
	.day {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	select,
	input[type='date'],
	.narrow {
		font: inherit;
		padding: 0.5rem;
		min-height: 2.5rem;
	}
	.narrow {
		width: 5rem;
	}
</style>
