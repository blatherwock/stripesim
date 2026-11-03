import { expect, test } from "vitest";
import { appTitle, mount } from "./main";

test("mounts the app title into an element", () => {
	const target = document.createElement("div");
	mount(target);
	expect(target.textContent).toBe(appTitle);
});
