const pageLinks = document.querySelectorAll("[data-page]");

pageLinks.forEach(function (link) {
	link.addEventListener("click", function (event) {
		event.preventDefault();
		window.location.href = link.dataset.page;
	});
});
