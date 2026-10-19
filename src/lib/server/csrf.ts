/**
 * Protection against cross-site form posts (CSRF) for the UI.
 *
 * SvelteKit has this check built in, but it runs before our hook and cannot skip single routes.
 * That broke the Claude connector: claude.ai's servers post the OAuth token request as a form
 * without an Origin header, and got "Cross-site POST form submissions are forbidden".
 * So the built-in check is switched off (`csrf.trustedOrigins: ['*']` in vite.config.ts)
 * and this copy of it runs in hooks.server.ts after the connector paths have been handled.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// The content types a plain HTML form (or a no-CORS fetch) can send cross-site.
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

export function isCrossSiteFormPost(request: Request, selfOrigin: string): boolean {
	if (!MUTATING.has(request.method)) return false;
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (type && !FORM_TYPES.includes(type)) return false;
	return request.headers.get('origin') !== selfOrigin;
}
