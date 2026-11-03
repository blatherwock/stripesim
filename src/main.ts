export const appTitle = "stripe-planner";

export function mount(target: HTMLElement): void {
	target.textContent = appTitle;
}

const app = document.querySelector<HTMLElement>("#app");
if (app) {
	mount(app);
}
