(() => {
	const root = document.getElementById("nrTodo");
	if (!root) return;

	const $ = (id) => root.querySelector(`#${id}`);
	const API = "https://dummyjson.com/todos";
	const KEY = "nr-todo:v2";
	const elements = {
		list: $("nrList"),
		fill: $("nrFill"),
		track: $("nrTrack"),
		count: $("nrCount"),
		percent: $("nrPct"),
		message: $("nrMsg"),
		input: $("nrInput"),
		empty: $("nrEmpty"),
		loading: $("nrLoading"),
		limit: $("nrLimit"),
		retry: $("nrRetry"),
		clear: $("nrClear"),
		form: $("nrForm"),
		filters: $("nrFilters"),
	};

	let items = [];
	let filter = "all";
	let editingId = null;
	let loading = false;

	function say(text, isError = false) {
		elements.message.textContent = text;
		elements.message.classList.toggle("err", isError);
	}

	function isTaskList(value) {
		return Array.isArray(value) && value.every((task) =>
			task !== null &&
			typeof task === "object" &&
			(typeof task.id === "number" || typeof task.id === "string") &&
			typeof task.text === "string" &&
			typeof task.done === "boolean" &&
			typeof task.remote === "boolean"
		);
	}

	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(items));
			return true;
		} catch {
			say("Не удалось сохранить список в браузере. Изменения доступны только до закрытия этой вкладки.", true);
			return false;
		}
	}

	function restore() {
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === null) return null;
			const parsed = JSON.parse(saved);
			if (isTaskList(parsed)) return parsed;
			say("Сохранённый список задач повреждён. Загружен новый список.", true);
			return null;
		} catch {
			say("Не удалось прочитать сохранённый список. Загружен новый список.", true);
			return null;
		}
	}

	async function sync(item, method, body) {
		if (!item.remote) return;

		try {
			const response = await fetch(`${API}/${item.id}`, {
				method,
				headers: { "Content-Type": "application/json" },
				body: body ? JSON.stringify(body) : undefined,
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
		} catch {
			say("Изменение сохранено локально, но сервер недоступен.", true);
		}
	}

	function setLoading(value) {
		loading = value;
		elements.loading.hidden = !value;
		elements.list.hidden = value;
		if (value) elements.retry.hidden = true;
	}

	async function loadRemote() {
		setLoading(true);
		elements.empty.hidden = true;
		say("");
		let failed = false;

		try {
			const response = await fetch(`${API}?limit=${elements.limit.value}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			if (!Array.isArray(data.todos)) throw new Error("Invalid todo response");

			const localItems = items.filter((item) => !item.remote);
			const previousRemote = new Map(
				items.filter((item) => item.remote).map((item) => [String(item.id), item])
			);
			items = data.todos.map((task) => previousRemote.get(String(task.id)) || ({
				id: task.id,
				text: task.todo,
				done: task.completed,
				remote: true,
			})).concat(localItems);
			save();
		} catch {
			failed = true;
			say("Не удалось загрузить задачи с сервера. Можно повторить попытку или добавить свои задачи.", true);
		}

		setLoading(false);
		elements.retry.hidden = !failed;
		render();
	}

	function find(id) {
		return items.find((item) => String(item.id) === String(id));
	}

	function addItem(text) {
		const item = {
			id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			text,
			done: false,
			remote: false,
		};
		items.unshift(item);
		const stored = save();
		render();
		if (stored) say("Задача добавлена.");
	}

	function toggle(id) {
		const item = find(id);
		if (!item) return;
		item.done = !item.done;
		void sync(item, "PUT", { completed: item.done });
		save();
		render();
	}

	function remove(id) {
		const item = find(id);
		if (!item) return;
		items = items.filter((task) => String(task.id) !== String(id));
		void sync(item, "DELETE");
		const stored = save();
		render();
		if (stored) say("Задача удалена.");
	}

	function rename(id, text) {
		const item = find(id);
		const value = text.trim();
		editingId = null;
		if (item && !value) {
			say("Название задачи не может быть пустым.", true);
		} else if (item && value !== item.text) {
			item.text = value;
			void sync(item, "PUT", { todo: value });
			if (save()) say("Изменения сохранены.");
		}
		render();
	}

	function createRow(item) {
		const li = document.createElement("li");
		li.className = `nr-item${item.done ? " done" : ""}`;
		li.dataset.id = String(item.id);

		if (editingId === String(item.id)) {
			const input = document.createElement("input");
			input.className = "nr-edit";
			input.value = item.text;
			input.maxLength = 200;
			input.setAttribute("aria-label", "Изменить задачу");
			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") rename(item.id, input.value);
				if (event.key === "Escape") {
					editingId = null;
					render();
				}
			});
			input.addEventListener("blur", () => {
				if (editingId === String(item.id)) rename(item.id, input.value);
			});
			li.append(input);
			window.setTimeout(() => {
				input.focus();
				input.select();
			});
			return li;
		}

		const label = document.createElement("label");
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = item.done;
		checkbox.dataset.act = "toggle";
		checkbox.setAttribute("aria-label", `Отметить задачу «${item.text}» выполненной`);
		const text = document.createElement("span");
		text.className = "nr-text";
		text.textContent = item.text;
		label.append(checkbox, text);

		const actions = document.createElement("div");
		actions.className = "nr-acts";
		const editButton = document.createElement("button");
		editButton.type = "button";
		editButton.className = "edit";
		editButton.dataset.act = "edit";
		editButton.textContent = "Изменить";
		editButton.setAttribute("aria-label", `Изменить задачу «${item.text}»`);
		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "del";
		deleteButton.dataset.act = "del";
		deleteButton.textContent = "Удалить";
		deleteButton.setAttribute("aria-label", `Удалить задачу «${item.text}»`);
		actions.append(editButton, deleteButton);
		li.append(label, actions);
		return li;
	}

	function render() {
		const shown = items.filter((item) =>
			filter === "all" || (filter === "done" ? item.done : !item.done)
		);
		elements.list.replaceChildren(...shown.map(createRow));

		const total = items.length;
		const done = items.filter((item) => item.done).length;
		const percent = total ? Math.round((done / total) * 100) : 0;
		elements.fill.style.width = `${percent}%`;
		elements.track.setAttribute("aria-valuenow", String(percent));
		elements.percent.textContent = `${percent}%`;
		elements.count.textContent = `Всего: ${total} · Выполнено: ${done}`;
		elements.clear.disabled = done === 0;

		const emptyText = !total
			? "Список пуст. Добавьте первую задачу выше."
			: filter === "done"
				? "Выполненных задач пока нет."
				: filter === "active"
					? "Все задачи выполнены."
					: "";
		elements.empty.textContent = emptyText;
		elements.empty.hidden = shown.length > 0 || loading;
	}

	elements.form.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = elements.input.value.trim();
		if (!text) {
			say("Введите текст задачи.", true);
			elements.input.focus();
			return;
		}
		addItem(text);
		elements.input.value = "";
		elements.input.focus();
	});

	elements.list.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const button = event.target.closest("button[data-act]");
		const row = button?.closest(".nr-item");
		if (!button || !row) return;
		const id = row.dataset.id;
		if (!id) return;
		if (button.dataset.act === "del") remove(id);
		if (button.dataset.act === "edit") {
			editingId = id;
			render();
		}
	});

	elements.list.addEventListener("change", (event) => {
		if (!(event.target instanceof HTMLInputElement) || event.target.dataset.act !== "toggle") return;
		const id = event.target.closest(".nr-item")?.dataset.id;
		if (id) toggle(id);
	});

	elements.list.addEventListener("dblclick", (event) => {
		if (!(event.target instanceof Element)) return;
		const row = event.target.closest(".nr-item");
		if (row && event.target.closest(".nr-text") && row.dataset.id) {
			editingId = row.dataset.id;
			render();
		}
	});

	elements.filters.addEventListener("click", (event) => {
		if (!(event.target instanceof HTMLButtonElement)) return;
		const selectedFilter = event.target.dataset.f;
		if (!selectedFilter) return;
		filter = selectedFilter;
		elements.filters.querySelectorAll("button[data-f]").forEach((button) => {
			button.setAttribute("aria-pressed", String(button === event.target));
		});
		render();
	});

	elements.clear.addEventListener("click", () => {
		const completed = items.filter((item) => item.done);
		completed.forEach((item) => void sync(item, "DELETE"));
		items = items.filter((item) => !item.done);
		const stored = save();
		render();
		if (stored) say(`Удалено выполненных задач: ${completed.length}.`);
	});

	elements.limit.addEventListener("change", () => void loadRemote());
	elements.retry.addEventListener("click", () => void loadRemote());

	const saved = restore();
	if (saved !== null) {
		items = saved;
		setLoading(false);
		render();
	} else {
		void loadRemote();
	}
})();
