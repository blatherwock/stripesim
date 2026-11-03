import { defineConfig } from "vitest/config";

export default defineConfig({
	server: {
		// Bind all interfaces so the docker port publish can reach the dev
		// server; `just dev` binds the host side to loopback only.
		host: true,
	},
	test: {
		environment: "happy-dom",
	},
});
