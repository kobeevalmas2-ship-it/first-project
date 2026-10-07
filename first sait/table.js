const tableContainer = document.getElementById("table-container");
// Түстер осы ретпен ауысады: ақ → көк → жасыл → қызыл → ақ.
const colorNames = new Map([
	["#ffffff", "Ақ"],
	["#3b82f6", "Көк"],
	["#22c55e", "Жасыл"],
	["#ef4444", "Қызыл"]
]);
const colorCycle = Array.from(colorNames.keys());
const defaultColor = "#ffffff";

// Әр түске арналған санақ мәтінін бір рет құрады.
const countElements = new Map();
for (const [color, name] of colorNames) {
	const row = document.createElement("span");
	row.className = "color-count-item";
	const swatch = document.createElement("span");
	swatch.className = "color-preview";
	swatch.style.backgroundColor = color;
	swatch.setAttribute("aria-hidden", "true");
	const count = document.createElement("span");
	count.dataset.countColor = color;
	row.append(swatch, `${name}: `, count);
	document.getElementById("color-counts").append(row);
	countElements.set(color, count);
}

// Пайдаланушы енгізген өлшемдер бойынша жаңа кесте құрады.
function createTable(rows, columns) {
	if (!Number.isInteger(rows) || !Number.isInteger(columns) ||
		rows < 1 || columns < 1 || rows > 50 || columns > 50) {
		throw new RangeError("Жолдар мен бағандар саны 1–50 аралығындағы бүтін сан болуы керек.");
	}

	const table = document.createElement("table");
	const caption = table.createCaption();
	caption.textContent = `${rows} жол × ${columns} баған`;
	const body = table.createTBody();

	for (let row = 0; row < rows; row++) {
		const tableRow = body.insertRow();
		for (let column = 0; column < columns; column++) {
			const cell = tableRow.insertCell();
			const button = document.createElement("button");
			button.type = "button";
			button.className = "cell-button";
			button.dataset.position = `${row + 1}-жол, ${column + 1}-баған`;
			cell.append(button);
			setCellColor(cell, defaultColor);
		}
	}

	tableContainer.replaceChildren(table);
	updateColorCount();
	return table;
}

function setCellColor(cell, color) {
	cell.dataset.color = color;
	cell.style.backgroundColor = color;
	const button = cell.querySelector("button");
	button.setAttribute("aria-label", `${button.dataset.position}: ${colorNames.get(color)}`);
}

// Мысалы: countCellsByColor("#ef4444") қызыл ұяшықтардың санын қайтарады.
function countCellsByColor(color) {
	const normalizedColor = color.trim().toLowerCase();
	return Array.from(tableContainer.querySelectorAll("td"))
		.filter((cell) => cell.dataset.color === normalizedColor).length;
}

function updateColorCount() {
	for (const [color, count] of countElements) {
		count.textContent = countCellsByColor(color);
	}
	document.getElementById("total-count").textContent =
		`Барлығы: ${tableContainer.querySelectorAll("td").length} ұяшық`;
}

document.getElementById("table-form").addEventListener("submit", (event) => {
	event.preventDefault();
	const error = document.getElementById("table-error");
	try {
		createTable(
			document.getElementById("rows").valueAsNumber,
			document.getElementById("columns").valueAsNumber
		);
		error.textContent = "";
	} catch (exception) {
		error.textContent = exception.message;
	}
});

tableContainer.addEventListener("click", (event) => {
	const button = event.target.closest(".cell-button");
	if (!button || !tableContainer.contains(button)) return;
	const cell = button.closest("td");
	const nextIndex = (colorCycle.indexOf(cell.dataset.color) + 1) % colorCycle.length;
	setCellColor(cell, colorCycle[nextIndex]);
	updateColorCount();
});

createTable(5, 5);
