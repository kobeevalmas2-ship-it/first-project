(() => {
	"use strict";

	// DummyJSON supplies the initial catalog; browser storage holds durable edits.
	class ShopProducts {
		constructor(storage, validateProduct) {
			this.storage = storage;
			this.validateProduct = validateProduct;
			this.key = "shop:products:v1";
			this.records = new Map();
			this.deleted = new Set();
			this.error = "";
			try {
				const saved = storage.getItem(this.key);
				if (saved === null) return;
				const data = JSON.parse(saved);
				if (!data || !Array.isArray(data.records) || !Array.isArray(data.deleted) ||
					!data.records.every(validateProduct) ||
					!data.deleted.every((id) => Number.isSafeInteger(id) && id > 0) ||
					new Set(data.records.map((product) => product.id)).size !== data.records.length ||
					data.records.some((product) => data.deleted.includes(product.id))) {
					throw new Error("Invalid saved catalog");
				}
				this.records = new Map(data.records.map((product) => [product.id, product]));
				this.deleted = new Set(data.deleted);
			} catch {
				this.error = "Не удалось прочитать сохранённые изменения товаров. Проверьте хранилище браузера; сохранение отключено, чтобы не потерять данные.";
			}
		}

		read(id, fallback) {
			return this.deleted.has(id) ? null : this.records.get(id) || fallback || null;
		}

		list(base = []) {
			const products = new Map(this.records);
			for (const product of base) {
				if (!products.has(product.id)) products.set(product.id, product);
			}
			return [...products.values()].filter((product) => !this.deleted.has(product.id));
		}

		write(records, deleted) {
			if (this.error) throw new Error(this.error);
			try {
				this.storage.setItem(this.key, JSON.stringify({ records: [...records.values()], deleted: [...deleted] }));
			} catch {
				throw new Error("Не удалось сохранить изменения. Проверьте свободное место и настройки хранения браузера.");
			}
			// Commit in memory only after storage succeeds.
			this.records = records;
			this.deleted = deleted;
		}

		create(fields, base = []) {
			let id = Date.now();
			const used = new Set([...base.map((product) => product.id), ...this.records.keys(), ...this.deleted]);
			while (used.has(id)) id += 1;
			const product = { ...fields, id };
			if (!this.validateProduct(product)) throw new Error("Проверьте данные товара.");
			this.write(new Map(this.records).set(id, product), new Set(this.deleted));
			return product;
		}

		update(id, fields, fallback) {
			const previous = this.read(id, fallback);
			if (!previous) throw new Error("Товар уже удалён или недоступен.");
			const product = { ...previous, ...fields, id };
			if (!this.validateProduct(product)) throw new Error("Проверьте данные товара.");
			this.write(new Map(this.records).set(id, product), new Set(this.deleted));
			return product;
		}

		remove(id) {
			if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Неверный идентификатор товара.");
			const records = new Map(this.records);
			records.delete(id);
			this.write(records, new Set(this.deleted).add(id));
		}
	}

	window.ShopProducts = ShopProducts;
})();
