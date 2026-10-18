<!-- A page with no <script> at all: just markup. SvelteKit serves it at /auth/denied. -->
<svelte:head><title>Доступ запрещён</title></svelte:head>

<main>
	<h1>Доступ запрещён</h1>
	<p>Эта учётная запись Pocket ID не имеет доступа к Планировщику.</p>
	<p><a href="/auth/login">Попробовать снова</a></p>
</main>
