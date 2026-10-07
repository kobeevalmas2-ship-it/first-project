(() => {
	const storageKey = "site-theme";
	const root = document.documentElement;
	let theme = "light";

	try {
		if (localStorage.getItem(storageKey) === "dark") theme = "dark";
	} catch {
		// Сақтау қолжетімсіз болса да, тақырыпты ауыстыру жұмыс істейді.
	}
	root.dataset.theme = theme;

	function initializeThemeToggle() {
		const button = document.getElementById("theme-toggle");
		if (!button) return;
		button.setAttribute("aria-pressed", String(theme === "dark"));
		button.addEventListener("click", () => {
			theme = root.dataset.theme === "dark" ? "light" : "dark";
			root.dataset.theme = theme;
			button.setAttribute("aria-pressed", String(theme === "dark"));
			try {
				localStorage.setItem(storageKey, theme);
			} catch {
				// Бұл жағдайда таңдалған тақырып тек ағымдағы бетте сақталады.
			}
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initializeThemeToggle, { once: true });
	} else {
		initializeThemeToggle();
	}
})();
