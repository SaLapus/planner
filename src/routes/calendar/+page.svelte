<script lang="ts">
	// Svelte notes (for learning):
	//  * `data.feedUrl` comes from `load` in +page.server.ts.
	//  * `use:enhance` sends the form in the background. We pass it a function that runs first
	//    and may `cancel()` the submit: that is how the "are you sure?" question works.
	//  * After the action finishes, SvelteKit runs `load` again by itself, so the new link
	//    appears without any extra code.
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// `$state` makes a variable "reactive": when it changes, the page parts that use it update.
	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(data.feedUrl);
		copied = true;
	}
</script>

<svelte:head>
	<title>Календарная лента</title>
</svelte:head>

<main>
	<nav><a href="/events">← Расписание</a> · <a href="/changes">Журнал изменений</a></nav>
	<h1>Календарная лента</h1>
	<p>
		Ссылка для подписки из Google Calendar, Outlook и других календарей: в них видны события и задачи с блоком времени
		(только чтение). Вход не нужен, поэтому <strong>никому не показывайте эту ссылку</strong>.
	</p>

	<p><input readonly value={data.feedUrl} aria-label="Ссылка на ленту" onfocus={(e) => e.currentTarget.select()} /></p>
	<p><button type="button" onclick={copy}>{copied ? 'Скопировано' : 'Скопировать ссылку'}</button></p>

	<h2>Новая ссылка</h2>
	<p>Если ссылка попала не туда, создайте новую: старая сразу перестанет работать, а календари придётся подписать заново.</p>
	<form
		method="POST"
		action="?/regenerate"
		use:enhance={({ cancel }) => {
			if (!confirm('Старая ссылка перестанет работать. Продолжить?')) cancel();
			copied = false;
		}}
	>
		<button>Создать новую ссылку</button>
	</form>
</main>
