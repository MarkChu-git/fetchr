import { defineConfig } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars, .dev.vars.example, dist/server/.dev.vars. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "fetchr-web",
		compatibilityDate: "2026-09-25",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "@tanstack/react-start/server-entry",
		observability: {
			enabled: true,
		},
		domains: [
			"fetchr.hanyang.app",
		],
	},
});
