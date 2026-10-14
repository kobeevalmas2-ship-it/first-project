const themeRoot = document.documentElement;
themeRoot.dataset.theme = "light";

// Бет ашылғанда сақталған тақырыпты қолданады.
try {
	if (localStorage.getItem("site-theme") === "dark") {
		themeRoot.dataset.theme = "dark";
	}
} catch {
	// Сақтау қолжетімсіз болса, ашық тақырып қолданылады.
}

document.addEventListener("DOMContentLoaded", function () {
	const button = document.getElementById("theme-toggle");
	if (!button) return;
	button.setAttribute("aria-pressed", themeRoot.dataset.theme === "dark");

	button.onclick = function () {
		if (themeRoot.dataset.theme === "dark") {
			themeRoot.dataset.theme = "light";
		} else {
			themeRoot.dataset.theme = "dark";
		}
		button.setAttribute("aria-pressed", themeRoot.dataset.theme === "dark");
		try {
			localStorage.setItem("site-theme", themeRoot.dataset.theme);
		} catch {
			// Переключение работает и без сохранения.
		}
	};
});
