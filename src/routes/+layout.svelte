<script lang="ts">
	// Importing a CSS file from the root layout makes it global: it applies to every page.
	import '@fontsource-variable/golos-text';
	import '../lib/theme.css';
	import { page } from '$app/state';
	import { NAV_MAIN, NAV_SECONDARY, currentSection, showsNav } from './nav.js';

	let { children } = $props();

	let section = $derived(currentSection(page.url.pathname));
</script>

{#if showsNav(page.url.pathname)}
	<header class="topbar">
		<div class="inner">
			<nav aria-label="Разделы" class="main">
				{#each NAV_MAIN as item (item.href)}
					<a href={item.href} aria-current={section === item.href ? 'page' : undefined}>{item.label}</a>
				{/each}
			</nav>
			<nav aria-label="Служебные" class="secondary">
				{#each NAV_SECONDARY as item (item.href)}
					<a href={item.href} aria-current={section === item.href ? 'page' : undefined}>{item.label}</a>
				{/each}
				<form method="POST" action="/auth/logout"><button>Выйти</button></form>
			</nav>
		</div>
	</header>
{/if}

{@render children()}

<style>
	/* A full-width band, pale in light mode and raised graphite in dark; its colour matches the
	   phone's status bar (theme-color in app.html). */
	.topbar {
		background: var(--bar);
		color: var(--on-bar);
		border-bottom: 1px solid var(--bar-line);
	}
	.inner {
		max-width: 40rem;
		margin: 0 auto;
		padding: 0.5rem 1rem 0.35rem;
	}
	.topbar nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem 1rem;
	}
	.topbar a {
		color: inherit;
		text-decoration: none;
		padding: 0.2rem 0;
		border-bottom: 2px solid transparent;
	}
	.topbar a:hover {
		border-bottom-color: color-mix(in srgb, var(--bar-mark) 50%, transparent);
	}
	.topbar a[aria-current='page'] {
		font-weight: 650;
		border-bottom-color: var(--bar-mark);
	}
	.main {
		font-size: 1.0625rem;
	}
	.secondary {
		font-size: 0.8125rem;
		margin-top: 0.15rem;
		color: color-mix(in srgb, var(--on-bar) 72%, transparent);
	}
	.secondary form {
		display: inline;
		margin: 0 0 0 auto;
	}
	.secondary button {
		font: inherit;
		min-height: 0;
		padding: 0.2rem 0;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	.topbar :focus-visible {
		outline-color: var(--bar-mark);
	}

	/* The second row: navigation inside a section, shared by every page that has one. */
	:global(nav.subnav) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		margin: 1rem 0;
		font-size: 0.9375rem;
	}
	:global(nav.subnav a) {
		color: var(--ink-soft);
	}
	:global(nav.subnav a.active),
	:global(nav.subnav a[aria-current='page']) {
		color: var(--ink);
		font-weight: 650;
		text-decoration-color: var(--level-3);
		text-decoration-thickness: 2px;
	}
</style>
