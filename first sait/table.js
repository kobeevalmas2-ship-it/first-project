const tableContainer = document.getElementById("table-container");
const colors = [
	{ value: "#ffffff", name: "Ақ" },
	{ value: "#3b82f6", name: "Көк" },
	{ value: "#22c55e", name: "Жасыл" },
	{ value: "#ef4444", name: "Қызыл" }
];

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
			let colorIndex = 0;
			setCellColor(cell, colorIndex);

			// Әр басқанда келесі түс таңдалады.
			button.onclick = function () {
				colorIndex++;
				if (colorIndex === colors.length) colorIndex = 0;
				setCellColor(cell, colorIndex);
				updateColorCount();
			};
		}
	}

	tableContainer.replaceChildren(table);
	updateColorCount();
	return table;
}

function setCellColor(cell, colorIndex) {
	const color = colors[colorIndex];
	cell.dataset.color = color.value;
	cell.style.backgroundColor = color.value;
	const button = cell.querySelector("button");
	button.setAttribute("aria-label", `${button.dataset.position}: ${color.name}`);
}

// Мысалы: countCellsByColor("#ef4444") қызыл ұяшықтардың санын қайтарады.
function countCellsByColor(color) {
	color = color.trim().toLowerCase();
	const cells = tableContainer.querySelectorAll("td");
	let count = 0;
	for (let i = 0; i < cells.length; i++) {
		if (cells[i].dataset.color === color) count++;
	}
	return count;
}

function updateColorCount() {
	for (let i = 0; i < colors.length; i++) {
		document.getElementById("count-" + i).textContent = countCellsByColor(colors[i].value);
	}
	document.getElementById("total-count").textContent =
		`Барлығы: ${tableContainer.querySelectorAll("td").length} ұяшық`;
}

document.getElementById("table-form").onsubmit = function (event) {
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
};

createTable(5, 5);
