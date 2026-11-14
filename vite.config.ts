import { defineConfig } from "vitest/config";

export default defineConfig({
	// GitHub Pages serves the site from a project page subpath.
	base: "/stripesim/",
	server: {
		// Bind all interfaces so the docker port publish can reach the dev
		// server; `just dev` binds the host side to loopback only.
		host: true,
	},
	test: {
		environment: "happy-dom",
	},
});
