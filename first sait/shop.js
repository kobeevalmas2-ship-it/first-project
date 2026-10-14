(() => {
	"use strict";

	const API_BASE = "https://dummyjson.com";
	const CART_KEY = "shop:cart:v1";
	const LIMIT = 12;
	const root = document.querySelector(".shop-page");
	if (!root) return;

	const elements = {
		searchForm: document.getElementById("shop-search"),
		searchInput: document.getElementById("search-input"),
		category: document.getElementById("category-select"),
		sort: document.getElementById("sort-select"),
		status: document.getElementById("shop-status"),
		count: document.getElementById("result-count"),
		grid: document.getElementById("product-grid"),
		error: document.getElementById("catalog-error"),
		retryCatalog: document.getElementById("retry-catalog"),
		empty: document.getElementById("empty-results"),
		showMore: document.getElementById("show-more"),
		cartCount: document.getElementById("cart-count"),
		cartStatus: document.getElementById("cart-status"),
		cartItems: document.getElementById("cart-items"),
		cartEmpty: document.getElementById("cart-empty"),
		cartTotal: document.getElementById("cart-total"),
		retryCart: document.getElementById("retry-cart"),
		checkout: document.getElementById("checkout-button"),
		orderStatus: document.getElementById("order-status"),
		dialog: document.getElementById("product-dialog"),
		closeDialog: document.getElementById("close-dialog"),
		dialogContent: document.getElementById("dialog-content"),
		createProduct: document.getElementById("create-product"),
		managementStatus: document.getElementById("management-status"),
		editor: document.getElementById("editor-dialog"),
		editorTitle: document.getElementById("editor-title"),
		form: document.getElementById("product-form"),
		editorError: document.getElementById("editor-error"),
		categoryList: document.getElementById("product-categories"),
		deleteDialog: document.getElementById("delete-dialog"),
		deleteDescription: document.getElementById("delete-description"),
		deleteError: document.getElementById("delete-error"),
		confirmDelete: document.getElementById("confirm-delete"),
	};

	const state = {
		query: "",
		category: "",
		sortBy: "",
		order: "",
		products: [],
		total: 0,
		skip: 0,
		loading: false,
		loadingMore: false,
		error: false,
		requestId: 0,
		controller: null,
		detailController: null,
		cartRequestId: 0,
		cartLoading: false,
		cartStorageError: false,
		checkoutLoading: false,
		productsById: new Map(),
		catalogProducts: null,
		categories: new Map(),
		editingId: null,
		deletingId: null,
	};

	const products = new window.ShopProducts({
		getItem: (key) => localStorage.getItem(key),
		setItem: (key, value) => localStorage.setItem(key, value),
	}, isProduct);

	const api = {
		async request(path, options = {}) {
			const controller = new AbortController();
			const timeout = window.setTimeout(() => controller.abort(), 12000);
			const externalSignal = options.signal;
			const abortFromCaller = () => controller.abort();
			if (externalSignal) {
				if (externalSignal.aborted) controller.abort();
				else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
			}

			try {
				const response = await fetch(`${API_BASE}${path}`, {
					...options,
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(`Сервер ответил с ошибкой ${response.status}.`);
				}
				return await response.json();
			} catch (error) {
				if (controller.signal.aborted && !(externalSignal && externalSignal.aborted)) {
					throw new Error("Время ожидания ответа истекло.");
				}
				throw error;
			} finally {
				window.clearTimeout(timeout);
				if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);
			}
		},
		product(id, signal) {
			return this.request(`/products/${encodeURIComponent(id)}`, { signal });
		},
	};

	const cart = {
		items: [],
		message: "",

		isValid(value) {
			return Array.isArray(value) && value.every((item, index) =>
				item !== null &&
				typeof item === "object" &&
				Number.isSafeInteger(item.id) &&
				item.id > 0 &&
				Number.isSafeInteger(item.quantity) &&
				item.quantity > 0 &&
				item.quantity <= 99 &&
				value.findIndex((candidate) => candidate && candidate.id === item.id) === index
			);
		},

		restore() {
			try {
				const saved = localStorage.getItem(CART_KEY);
				if (saved === null) return;
				const parsed = JSON.parse(saved);
				if (this.isValid(parsed)) {
					this.items = parsed.map(({ id, quantity }) => ({ id, quantity }));
				} else {
					state.cartStorageError = true;
					this.message = "Сохранённая корзина повреждена; её содержимое не загружено.";
				}
			} catch {
				state.cartStorageError = true;
				this.message = "Не удалось прочитать корзину из этого браузера.";
			}
		},

		persist() {
			try {
				localStorage.setItem(CART_KEY, JSON.stringify(this.items));
				state.cartStorageError = false;
				this.message = "";
				return true;
			} catch {
				state.cartStorageError = true;
				this.message = "Не удалось сохранить корзину. Проверьте настройки хранения браузера.";
				return false;
			}
		},

		add(product) {
			if (state.checkoutLoading || product.stock === 0 || products.deleted.has(product.id)) return;
			const found = this.items.find((item) => item.id === product.id);
			if (found) {
				if (found.quantity >= 99) {
					this.message = "Для одного товара можно выбрать не более 99 штук.";
					render.cart();
					return;
				}
				found.quantity += 1;
			} else {
				this.items.push({ id: product.id, quantity: 1 });
			}
			state.productsById.set(product.id, product);
			this.persist();
			render.cart();
		},

		change(id, amount) {
			if (state.checkoutLoading) return;
			const item = this.items.find((entry) => entry.id === id);
			if (!item) return;
			const next = item.quantity + amount;
			if (next > 99) {
				this.message = "Для одного товара можно выбрать не более 99 штук.";
			} else if (next < 1) {
				this.items = this.items.filter((entry) => entry.id !== id);
				this.message = "";
			} else {
				item.quantity = next;
				this.message = "";
			}
			this.persist();
			render.cart();
		},

		remove(id) {
			if (state.checkoutLoading) return;
			this.items = this.items.filter((item) => item.id !== id);
			this.message = "";
			this.persist();
			render.cart();
		},

		clear() {
			this.items = [];
			this.persist();
		},
	};

	const render = {
		catalog() {
			elements.grid.replaceChildren();
			elements.grid.setAttribute("aria-busy", String(state.loading || state.loadingMore));
			const cards = state.products.map((product) => this.productCard(product));
			elements.grid.append(...cards);
			if (state.loading || state.loadingMore) {
				const count = state.loadingMore ? Math.min(4, LIMIT) : 8;
				for (let index = 0; index < count; index += 1) {
					elements.grid.append(this.skeletonCard());
				}
			}

			elements.error.hidden = !state.error;
			elements.retryCatalog.disabled = state.loading;
			elements.empty.hidden = state.loading || state.error || state.products.length > 0;
			elements.count.textContent = state.total
				? `${state.products.length} из ${state.total} товаров`
				: state.loading ? "Загружаем каталог…" : "";
			elements.showMore.hidden = state.loading ||
				state.products.length === 0 || state.products.length >= state.total;
			elements.showMore.disabled = state.loadingMore;
		},

		productCard(product) {
			const item = document.createElement("li");
			item.className = "product-card";

			const open = document.createElement("button");
			open.className = "product-open";
			open.type = "button";
			open.dataset.productId = String(product.id);
			open.setAttribute("aria-label", `Подробнее о товаре: ${product.title}`);

			const imageWrap = document.createElement("span");
			imageWrap.className = "product-image-wrap";
			const image = createImage(product.thumbnail || product.images[0], product.title, "product-image");
			imageWrap.append(image);

			if (product.discountPercentage > 0) {
				const badge = document.createElement("span");
				badge.className = "discount-badge";
				badge.textContent = `−${Math.round(product.discountPercentage)}%`;
				imageWrap.append(badge);
			}

			const copy = document.createElement("span");
			copy.className = "product-copy";
			const brand = document.createElement("span");
			brand.className = "product-brand";
			brand.textContent = product.brand || "Бренд не указан";
			const title = document.createElement("span");
			title.className = "product-title";
			title.textContent = product.title;
			const rating = document.createElement("span");
			rating.className = "product-rating";
			rating.textContent = `★ `;
			const ratingValue = document.createElement("strong");
			ratingValue.textContent = formatNumber(product.rating);
			rating.append(ratingValue, document.createTextNode(" / 5"));
			const prices = priceElements(product);
			const stock = document.createElement("span");
			stock.className = "product-stock";
			stock.dataset.availability = availabilityKey(product.availabilityStatus);
			stock.textContent = `${availabilityText(product.availabilityStatus)} · Остаток: ${product.stock}`;
			copy.append(brand, title, rating, prices, stock);
			open.append(imageWrap, copy);

			const add = document.createElement("button");
			add.className = "shop-button add-to-cart";
			add.type = "button";
			add.dataset.addProductId = String(product.id);
			add.textContent = "В корзину";
			add.disabled = state.checkoutLoading || product.stock === 0;
			item.append(open, add, managementActions(product));
			return item;
		},

		skeletonCard() {
			const item = document.createElement("li");
			item.className = "skeleton-card";
			item.setAttribute("aria-hidden", "true");
			const image = document.createElement("span");
			image.className = "skeleton-block skeleton-image";
			const line = document.createElement("span");
			line.className = "skeleton-block skeleton-line";
			const shortLine = document.createElement("span");
			shortLine.className = "skeleton-block skeleton-line skeleton-line--short";
			item.append(image, line, shortLine);
			return item;
		},

		cart() {
			const quantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
			elements.cartCount.textContent = String(quantity);
			elements.cartCount.setAttribute("aria-label", `Товаров в корзине: ${quantity}`);
			elements.cartStatus.textContent = cart.message;
			elements.retryCart.hidden = !state.cartError;
			elements.cartItems.replaceChildren();

			if (state.cartLoading) {
				elements.cartEmpty.hidden = false;
				elements.cartEmpty.textContent = "Загружаем товары корзины…";
				elements.cartTotal.textContent = "—";
				elements.checkout.disabled = true;
				return;
			}

			elements.cartEmpty.hidden = cart.items.length > 0;
			elements.cartEmpty.textContent = cart.items.length ? "" : "Корзина пока пуста.";
			let total = 0;
			for (const item of cart.items) {
				const product = state.productsById.get(item.id);
				if (!product) continue;
				total += discountedPrice(product) * item.quantity;
				elements.cartItems.append(this.cartItem(product, item.quantity));
			}
			elements.cartTotal.textContent = formatCurrency(total);
			elements.checkout.disabled = cart.items.length === 0 || state.cartError || state.checkoutLoading;
			elements.checkout.textContent = state.checkoutLoading ? "Оформляем…" : "Оформить заказ";
		},

		cartItem(product, quantity) {
			const row = document.createElement("li");
			row.className = "cart-item";
			const image = createImage(product.thumbnail || product.images[0], product.title, "cart-item__image");
			const body = document.createElement("div");
			body.className = "cart-item__body";
			const title = document.createElement("p");
			title.className = "cart-item__title";
			title.textContent = product.title;
			const price = document.createElement("p");
			price.className = "cart-item__price";
			price.textContent = `${formatCurrency(discountedPrice(product))} × ${quantity}`;
			const actions = document.createElement("div");
			actions.className = "cart-item__actions";
			actions.append(
				quantityButton(product, "−", -1, "Уменьшить количество"),
				createQuantity(quantity),
				quantityButton(product, "+", 1, "Увеличить количество")
			);
			const remove = document.createElement("button");
			remove.className = "remove-button";
			remove.type = "button";
			remove.dataset.removeProductId = String(product.id);
			remove.textContent = "Удалить";
			remove.disabled = state.checkoutLoading;
			actions.append(remove);
			body.append(title, price, actions);
			row.append(image, body);
			return row;
		},

		detail(product) {
			elements.dialogContent.replaceChildren();
			const layout = document.createElement("div");
			layout.className = "detail-layout";
			const gallery = document.createElement("div");
			gallery.className = "detail-gallery";
			const images = uniqueImages([product.thumbnail, ...product.images], product.title);
			const mainImage = createImage(images[0] || "", product.title, "detail-main-image");
			mainImage.id = "detail-main-image";
			const galleryList = document.createElement("ul");
			galleryList.className = "gallery-list";
			for (const [index, url] of images.entries()) {
				const item = document.createElement("li");
				const button = document.createElement("button");
				button.className = "gallery-thumb";
				button.type = "button";
				button.dataset.imageUrl = url;
				button.setAttribute("aria-pressed", String(index === 0));
				button.setAttribute("aria-label", `Показать изображение ${index + 1}`);
				const thumb = createImage(url, `${product.title}, изображение ${index + 1}`, "");
				button.append(thumb);
				item.append(button);
				galleryList.append(item);
			}
			gallery.append(mainImage, galleryList);

			const copy = document.createElement("div");
			copy.className = "detail-copy";
			const heading = document.createElement("h2");
			heading.id = "dialog-title";
			heading.textContent = product.title;
			const brand = document.createElement("p");
			brand.className = "detail-brand";
			brand.textContent = product.brand || "Бренд не указан";
			const price = document.createElement("p");
			price.className = "detail-price";
			price.textContent = formatCurrency(discountedPrice(product));
			if (product.discountPercentage > 0) {
				price.append(document.createTextNode(` · скидка ${Math.round(product.discountPercentage)}%`));
			}
			const category = document.createElement("p");
			category.className = "detail-meta";
			category.textContent = `Категория: ${categoryName(product.category)}`;
			const rating = document.createElement("p");
			rating.className = "detail-meta";
			rating.textContent = `Рейтинг: ${formatNumber(product.rating)} из 5 · Остаток: ${product.stock}`;
			const status = document.createElement("p");
			status.className = "detail-meta";
			status.textContent = `Наличие: ${availabilityText(product.availabilityStatus)}`;
			const description = document.createElement("p");
			description.className = "detail-description";
			description.textContent = product.description;
			const add = document.createElement("button");
			add.className = "shop-button add-to-cart";
			add.type = "button";
			add.dataset.addProductId = String(product.id);
			add.textContent = "В корзину";
			add.disabled = state.checkoutLoading || product.stock === 0;
			copy.append(heading, brand, price, category, rating, status, description, add, managementActions(product));
			const reviews = createReviews(product.reviews);
			copy.append(reviews);
			layout.append(gallery, copy);
			elements.dialogContent.append(layout);
		},
	};

	state.cartError = false;

	function isProduct(value) {
		return value !== null &&
			typeof value === "object" &&
			Number.isSafeInteger(value.id) &&
			value.id > 0 &&
			typeof value.title === "string" &&
			typeof value.description === "string" &&
			typeof value.price === "number" &&
			Number.isFinite(value.price) &&
			typeof value.discountPercentage === "number" &&
			Number.isFinite(value.discountPercentage) &&
			typeof value.rating === "number" &&
			Number.isFinite(value.rating) &&
			Number.isFinite(value.stock) &&
			typeof value.category === "string" &&
			Array.isArray(value.images);
	}

	function cacheProduct(product) {
		const current = products.read(product.id, product);
		if (current) state.productsById.set(current.id, current);
		else state.productsById.delete(product.id);
		return current;
	}

	function managementActions(product) {
		const actions = document.createElement("div");
		actions.className = "product-management-actions";
		for (const [action, label] of [["edit", "Изменить"], ["delete", "Удалить"]]) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "text-button";
			button.dataset[`${action}ProductId`] = String(product.id);
			button.textContent = label;
			button.setAttribute("aria-label", `${label} товар: ${product.title}`);
			button.disabled = state.checkoutLoading || Boolean(products.error);
			actions.append(button);
		}
		return actions;
	}

	function refreshCategories() {
		const selected = state.category;
		const categories = new Map(state.categories);
		for (const product of products.list(state.catalogProducts || [])) {
			if (!categories.has(product.category)) categories.set(product.category, categoryName(product.category));
		}
		elements.category.replaceChildren(new Option("Все товары", ""));
		elements.categoryList.replaceChildren();
		for (const [slug, name] of categories) {
			elements.category.append(new Option(name, slug));
			const suggestion = new Option(name, slug);
			elements.categoryList.append(suggestion);
		}
		if (selected && !categories.has(selected)) elements.category.append(new Option(categoryName(selected), selected));
		elements.category.value = selected;
	}

	function refreshCatalog(reset = true) {
		const query = state.query.trim().toLocaleLowerCase("ru");
		const filtered = sortProducts(products.list(state.catalogProducts || []).filter((product) => {
			if (state.category && product.category !== state.category) return false;
			return !query || [product.title, product.description, product.brand || "", categoryName(product.category)]
				.some((value) => value.toLocaleLowerCase("ru").includes(query));
		}));
		state.skip = reset ? LIMIT : state.skip + LIMIT;
		state.products = filtered.slice(0, state.skip);
		state.total = filtered.length;
		filtered.forEach(cacheProduct);
		render.catalog();
	}

	function openEditor(id = null) {
		if (state.checkoutLoading || products.error) return;
		const product = id === null ? null : products.read(id, state.productsById.get(id));
		if (id !== null && !product) return;
		state.editingId = id;
		elements.form.reset();
		elements.editorTitle.textContent = product ? "Изменить товар" : "Добавить товар";
		elements.editorError.hidden = true;
		const defaults = product || { stock: 1, discountPercentage: 0, category: state.category };
		for (const name of ["title", "brand", "price", "stock", "category", "discountPercentage", "thumbnail", "description"]) {
			elements.form.elements.namedItem(name).value = defaults[name] ?? "";
		}
		if (elements.dialog.open) elements.dialog.close();
		elements.editor.showModal();
	}

	function saveProduct(event) {
		event.preventDefault();
		if (state.checkoutLoading) return;
		elements.editorError.hidden = true;
		try {
			const data = new FormData(elements.form);
			const title = String(data.get("title")).trim();
			const description = String(data.get("description")).trim();
			const category = String(data.get("category")).trim();
			const thumbnail = String(data.get("thumbnail")).trim();
			const price = Number(data.get("price"));
			const stock = Number(data.get("stock"));
			const discountPercentage = Number(data.get("discountPercentage"));
			if (!title || !description || !category || !Number.isFinite(price) || price <= 0 || price > 100000000 ||
				!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000 ||
				!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
				throw new Error("Заполните название, описание и категорию; укажите положительную цену, целый остаток и скидку от 0 до 100%.");
			}
			if (thumbnail && !/^https:\/\//i.test(thumbnail)) throw new Error("Ссылка на изображение должна начинаться с https://.");
			const previous = state.editingId === null ? null : products.read(state.editingId, state.productsById.get(state.editingId));
			const fields = {
				title, description, category, thumbnail, price, stock, discountPercentage,
				brand: String(data.get("brand")).trim(),
				rating: previous ? previous.rating : 0,
				images: previous && previous.thumbnail === thumbnail ? previous.images : thumbnail ? [thumbnail] : [],
				availabilityStatus: stock === 0 ? "Out of Stock" : stock <= 5 ? "Low Stock" : "In Stock",
			};
			const product = previous
				? products.update(state.editingId, fields, previous)
				: products.create({ ...fields, reviews: [] }, state.catalogProducts || []);
			cacheProduct(product);
			refreshCategories();
			refreshCatalog();
			render.cart();
			elements.editor.close();
			elements.managementStatus.textContent = `Товар «${product.title}» ${previous ? "изменён" : "добавлен"}. Изменения сохранены в этом браузере.`;
		} catch (error) {
			elements.editorError.textContent = error.message;
			elements.editorError.hidden = false;
		}
	}

	function requestDelete(id) {
		if (state.checkoutLoading || products.error) return;
		const product = products.read(id, state.productsById.get(id));
		if (!product) return;
		state.deletingId = id;
		elements.deleteDescription.textContent = `«${product.title}» будет удалён из каталога и корзины в этом браузере.`;
		elements.deleteError.hidden = true;
		if (elements.dialog.open) elements.dialog.close();
		elements.deleteDialog.showModal();
	}

	function deleteProduct() {
		if (state.deletingId === null || state.checkoutLoading) return;
		try {
			const id = state.deletingId;
			products.remove(id);
			state.productsById.delete(id);
			cart.remove(id);
			refreshCategories();
			refreshCatalog();
			elements.deleteDialog.close();
			elements.managementStatus.textContent = "Товар удалён из каталога и корзины. Изменения сохранены в этом браузере.";
		} catch (error) {
			elements.deleteError.textContent = error.message;
			elements.deleteError.hidden = false;
		}
	}

	function createImage(url, alt, className) {
		const image = document.createElement("img");
		image.className = className;
		image.alt = alt;
		image.loading = "lazy";
		image.decoding = "async";
		const safeUrl = safeImageUrl(url);
		if (safeUrl) image.src = safeUrl;
		return image;
	}

	function safeImageUrl(value) {
		if (typeof value !== "string" || !value) return "";
		try {
			return new URL(value, API_BASE).protocol === "https:" ? value : "";
		} catch {
			return "";
		}
	}

	function uniqueImages(values) {
		return [...new Set(values.map(safeImageUrl).filter(Boolean))];
	}

	function discountedPrice(product) {
		return product.price * (1 - Math.min(Math.max(product.discountPercentage, 0), 100) / 100);
	}

	function priceElements(product) {
		const prices = document.createElement("span");
		prices.className = "product-prices";
		const current = document.createElement("span");
		current.className = "product-price";
		current.textContent = formatCurrency(discountedPrice(product));
		prices.append(current);
		if (product.discountPercentage > 0) {
			const old = document.createElement("span");
			old.className = "old-price";
			old.textContent = formatCurrency(product.price);
			prices.append(old);
		}
		return prices;
	}

	function formatCurrency(value) {
		return new Intl.NumberFormat("ru-RU", {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 2,
		}).format(value);
	}

	function formatNumber(value) {
		return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
	}

	function availabilityText(value) {
		if (value === "Out of Stock") return "Нет в наличии";
		if (value === "Low Stock") return "Заканчивается";
		if (value === "In Stock") return "В наличии";
		return typeof value === "string" && value ? value : "Наличие не указано";
	}

	function availabilityKey(value) {
		if (value === "Low Stock") return "low";
		if (value === "Out of Stock") return "out";
		return "available";
	}

	const categoryTranslations = {
		beauty: "Красота",
		fragrances: "Парфюмерия",
		furniture: "Мебель",
		groceries: "Продукты",
		"home-decoration": "Украшения для дома",
		"kitchen-accessories": "Кухонные аксессуары",
		laptops: "Ноутбуки",
		"mens-shirts": "Мужские рубашки",
		"mens-shoes": "Мужская обувь",
		"mens-watches": "Мужские часы",
		"mobile-accessories": "Аксессуары для телефонов",
		motorcycle: "Мотоциклы",
		"skin-care": "Уход за кожей",
		smartphones: "Смартфоны",
		"sports-accessories": "Спортивные аксессуары",
		sunglasses: "Солнцезащитные очки",
		tablets: "Планшеты",
		tops: "Одежда",
		vehicle: "Транспорт",
		"womens-bags": "Женские сумки",
		"womens-dresses": "Женские платья",
		"womens-jewellery": "Женские украшения",
		"womens-shoes": "Женская обувь",
		"womens-watches": "Женские часы",
	};

	function categoryName(slug, apiName = "") {
		return categoryTranslations[slug] || apiName || slug;
	}

	function createQuantity(quantity) {
		const value = document.createElement("span");
		value.className = "quantity-value";
		value.textContent = String(quantity);
		return value;
	}

	function quantityButton(product, label, amount, description) {
		const button = document.createElement("button");
		button.className = "quantity-button";
		button.type = "button";
		button.dataset.changeProductId = String(product.id);
		button.dataset.amount = String(amount);
		button.textContent = label;
		button.setAttribute("aria-label", `${description}: ${product.title}`);
		button.disabled = state.checkoutLoading || (amount < 0 && cart.items.some((item) => item.id === product.id && item.quantity === 1));
		return button;
	}

	function createReviews(reviews) {
		const section = document.createElement("section");
		section.className = "detail-reviews";
		const heading = document.createElement("h3");
		heading.textContent = "Отзывы";
		section.append(heading);
		if (!Array.isArray(reviews) || reviews.length === 0) {
			const empty = document.createElement("p");
			empty.className = "dialog-empty";
			empty.textContent = "Пока нет отзывов.";
			section.append(empty);
			return section;
		}
		for (const review of reviews.slice(0, 8)) {
			if (!review || typeof review.comment !== "string") continue;
			const item = document.createElement("article");
			item.className = "review";
			const meta = document.createElement("p");
			meta.className = "review-meta";
			const reviewer = typeof review.reviewerName === "string" ? review.reviewerName : "Покупатель";
			const rating = Number.isFinite(review.rating) ? ` · ★ ${formatNumber(review.rating)}` : "";
			meta.textContent = `${reviewer}${rating}`;
			const text = document.createElement("p");
			text.className = "review-text";
			text.textContent = review.comment;
			item.append(meta, text);
			section.append(item);
		}
		return section;
	}

	function sortProducts(products) {
		const sorted = [...products];
		if (!state.sortBy) return sorted;
		const direction = state.order === "desc" ? -1 : 1;
		sorted.sort((first, second) => {
			const a = first[state.sortBy];
			const b = second[state.sortBy];
			if (typeof a === "string" && typeof b === "string") {
				return a.localeCompare(b, "ru") * direction;
			}
			return ((a || 0) - (b || 0)) * direction;
		});
		return sorted;
	}

	async function loadCategories() {
		try {
			const result = await api.request("/products/categories");
			if (!Array.isArray(result)) throw new Error("Сервер вернул неверный список категорий.");
			for (const category of result) {
				if (!category || typeof category.slug !== "string" || typeof category.name !== "string") continue;
				state.categories.set(category.slug, categoryName(category.slug, category.name));
			}
			refreshCategories();
		} catch {
			elements.status.textContent = "Не удалось загрузить категории; каталог и поиск остаются доступны.";
		}
	}

	async function loadCatalog(reset = true) {
		if (state.catalogProducts !== null || (!reset && state.error)) {
			refreshCatalog(reset);
			return;
		}
		if (state.controller) state.controller.abort();
		const controller = new AbortController();
		state.controller = controller;
		const requestId = ++state.requestId;
		state.error = false;
		state.loading = reset;
		state.loadingMore = !reset;
		if (reset) {
			state.skip = 0;
			state.products = [];
			state.total = 0;
		}
		render.catalog();

		try {
			const data = await api.request("/products?limit=0", { signal: controller.signal });
			if (!Array.isArray(data.products) || !Number.isFinite(data.total)) {
				throw new Error("Сервер вернул неверный список товаров.");
			}
			if (requestId !== state.requestId) return;
			state.catalogProducts = data.products.filter(isProduct);
			state.catalogProducts.forEach(cacheProduct);
			state.loading = false;
			state.loadingMore = false;
			elements.status.textContent = "";
			refreshCategories();
			refreshCatalog(reset);
			render.cart();
		} catch (error) {
			if (requestId !== state.requestId || controller.signal.aborted) return;
			state.loading = false;
			state.loadingMore = false;
			state.error = true;
			refreshCatalog(reset);
			elements.status.textContent = error instanceof Error
				? `Ошибка загрузки: ${error.message}`
				: "Ошибка загрузки каталога.";
		}
		render.catalog();
	}

	async function loadCartProducts() {
		const requestId = ++state.cartRequestId;
		state.cartError = false;
		state.cartLoading = true;
		render.cart();
		try {
			const retained = cart.items.filter((item) => !products.deleted.has(item.id));
			if (retained.length !== cart.items.length) {
				cart.items = retained;
				cart.persist();
			}
			products.records.forEach(cacheProduct);
			const missing = cart.items.filter((item) => !state.productsById.has(item.id));
			const cartProducts = await Promise.all(missing.map((item) => api.product(item.id)));
			for (const product of cartProducts) {
				if (!isProduct(product)) throw new Error("Сервер вернул неверные данные товара в корзине.");
				cacheProduct(product);
			}
			if (requestId !== state.cartRequestId) return;
			state.cartLoading = false;
			if (!state.cartStorageError) cart.message = "";
		} catch (error) {
			if (requestId !== state.cartRequestId) return;
			state.cartLoading = false;
			state.cartError = true;
			cart.message = error instanceof Error
				? `Не удалось загрузить товары корзины: ${error.message}`
				: "Не удалось загрузить товары корзины.";
		}
		render.cart();
	}

	async function openProduct(id) {
		if (state.detailController) state.detailController.abort();
		const controller = new AbortController();
		state.detailController = controller;
		elements.dialogContent.replaceChildren();
		const loading = document.createElement("p");
		loading.className = "dialog-loading";
		loading.setAttribute("role", "status");
		loading.textContent = "Загружаем товар…";
		elements.dialogContent.append(loading);
		if (!elements.dialog.open) elements.dialog.showModal();
		try {
			const product = products.read(id, state.productsById.get(id)) ||
				(products.deleted.has(id) ? null : await api.product(id, controller.signal));
			if (!isProduct(product) || controller.signal.aborted) {
				if (!controller.signal.aborted) throw new Error("Сервер вернул неверные данные товара.");
				return;
			}
			cacheProduct(product);
			render.detail(products.read(id, product));
			render.cart();
		} catch (error) {
			if (controller.signal.aborted) return;
			const message = document.createElement("p");
			message.className = "dialog-error";
			message.setAttribute("role", "alert");
			message.textContent = error instanceof Error
				? `Не удалось загрузить товар: ${error.message}`
				: "Не удалось загрузить товар.";
			const retry = document.createElement("button");
			retry.className = "shop-button shop-button--quiet";
			retry.type = "button";
			retry.dataset.retryProductId = String(id);
			retry.textContent = "Повторить";
			elements.dialogContent.replaceChildren(message, retry);
		}
	}

	async function checkout() {
		if (!cart.items.length || state.checkoutLoading || state.cartError) return;
		state.checkoutLoading = true;
		elements.orderStatus.textContent = "";
		render.cart();
		render.catalog();
		try {
			const hasLocalChanges = cart.items.some((item) => products.records.has(item.id));
			// The demo API cannot price browser-created or edited products.
			if (!hasLocalChanges) await api.request("/carts/add", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId: 1,
					products: cart.items.map(({ id, quantity }) => ({ id, quantity })),
				}),
			});
			cart.clear();
			elements.orderStatus.textContent = hasLocalChanges
				? "Демонстрационный заказ с изменёнными товарами оформлен в браузере. Заказ не отправляется и не сохраняется."
				: "Заказ оформлен. Сервер DummyJSON демонстрационный и ничего не сохраняет.";
			state.cartError = false;
			await loadCartProducts();
		} catch (error) {
			elements.orderStatus.textContent = error instanceof Error
				? `Не удалось оформить заказ: ${error.message}`
				: "Не удалось оформить заказ.";
		} finally {
			state.checkoutLoading = false;
			render.cart();
			render.catalog();
		}
	}

	elements.createProduct.addEventListener("click", () => openEditor());
	elements.form.addEventListener("submit", saveProduct);
	for (const id of ["close-editor", "cancel-editor"]) {
		document.getElementById(id).addEventListener("click", () => elements.editor.close());
	}
	elements.editor.addEventListener("close", () => { if (!elements.editor.open) state.editingId = null; });
	elements.confirmDelete.addEventListener("click", deleteProduct);
	document.getElementById("cancel-delete").addEventListener("click", () => elements.deleteDialog.close());
	elements.deleteDialog.addEventListener("close", () => { if (!elements.deleteDialog.open) state.deletingId = null; });
	for (const container of [elements.grid, elements.dialogContent]) {
		container.addEventListener("click", (event) => {
			if (!(event.target instanceof Element)) return;
			const edit = event.target.closest("button[data-edit-product-id]");
			const remove = event.target.closest("button[data-delete-product-id]");
			if (edit) openEditor(Number(edit.dataset.editProductId));
			if (remove) requestDelete(Number(remove.dataset.deleteProductId));
		});
	}

	let searchTimer = 0;
	elements.searchInput.addEventListener("input", () => {
		state.query = elements.searchInput.value;
		window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => void loadCatalog(true), 300);
	});
	elements.searchForm.addEventListener("submit", (event) => {
		event.preventDefault();
		window.clearTimeout(searchTimer);
		state.query = elements.searchInput.value;
		void loadCatalog(true);
	});
	elements.category.addEventListener("change", () => {
		state.category = elements.category.value;
		void loadCatalog(true);
	});
	elements.sort.addEventListener("change", () => {
		const [sortBy = "", order = ""] = elements.sort.value.split(":");
		state.sortBy = sortBy;
		state.order = order;
		void loadCatalog(true);
	});
	elements.retryCatalog.addEventListener("click", () => void loadCatalog(true));
	elements.showMore.addEventListener("click", () => void loadCatalog(false));
	elements.retryCart.addEventListener("click", () => void loadCartProducts());
	elements.checkout.addEventListener("click", () => void checkout());
	elements.closeDialog.addEventListener("click", () => elements.dialog.close());
	elements.dialog.addEventListener("close", () => {
		if (state.detailController) state.detailController.abort();
	});
	elements.dialogContent.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const retry = event.target.closest("button[data-retry-product-id]");
		if (retry) {
			void openProduct(Number(retry.dataset.retryProductId));
			return;
		}
		const thumbnail = event.target.closest("button[data-image-url]");
		if (!thumbnail) return;
		const mainImage = elements.dialogContent.querySelector("#detail-main-image");
		if (mainImage) mainImage.src = thumbnail.dataset.imageUrl;
		elements.dialogContent.querySelectorAll(".gallery-thumb").forEach((button) => {
			button.setAttribute("aria-pressed", String(button === thumbnail));
		});
	});
	elements.grid.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const addButton = event.target.closest("button[data-add-product-id]");
		if (addButton) {
			const product = state.productsById.get(Number(addButton.dataset.addProductId));
			if (product) cart.add(product);
			return;
		}
		const openButton = event.target.closest("button[data-product-id]");
		if (openButton) void openProduct(Number(openButton.dataset.productId));
	});
	elements.dialogContent.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const button = event.target.closest("button[data-add-product-id]");
		if (!button) return;
		const product = state.productsById.get(Number(button.dataset.addProductId));
		if (product) cart.add(product);
	});
	elements.cartItems.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const button = event.target.closest("button");
		if (!button) return;
		const id = Number(button.dataset.changeProductId || button.dataset.removeProductId);
		if (!Number.isSafeInteger(id)) return;
		if (button.dataset.changeProductId) cart.change(id, Number(button.dataset.amount));
		if (button.dataset.removeProductId) cart.remove(id);
	});

	elements.createProduct.disabled = Boolean(products.error);
	elements.managementStatus.textContent = products.error;
	cart.restore();
	products.records.forEach(cacheProduct);
	refreshCategories();
	render.catalog();
	void loadCategories();
	void loadCatalog();
	void loadCartProducts();
})();
