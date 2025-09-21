import express from "express";
import dotenv from "dotenv";
import db from "./utils/db.js";

const conn = await db.getConnection();

const app = express();

dotenv.config();

const fetchData = async () => {
	try {
		const [gasRes, elecRes] = await Promise.all([
			fetch("https://www.err.ee/api/gasPriceData/get"),
			fetch("https://www.err.ee/api/electricityMarketData/get"),
		]);

		const gasJson = await gasRes.json();
		const elecJson = await elecRes.json();

		const gasData = gasJson?.data ?? {};

		const electricityRaw =
			(Array.isArray(elecJson) && elecJson[0]) ||
			elecJson?.data ||
			elecJson ||
			{};
		const times = electricityRaw.data?.time ?? [];
		const prices = electricityRaw.data?.price ?? [];

		const len = Math.min(times.length, prices.length);
		const pricesByTime = new Array(len);
		for (let i = 0; i < len; i++) {
			pricesByTime[i] = { time: times[i], price: prices[i] };
		}

		const inserts = [
			conn.query(
				"INSERT INTO gas_prices (price_d, price_95, price_98) VALUES (?, ?, ?)",
				[gasData.D ?? null, gasData["95"] ?? null, gasData["98"] ?? null]
			),
			conn.query(
				"INSERT INTO electricity_prices (prices_by_time, avg_price, max_price, min_price) VALUES (?, ?, ?, ?)",
				[
					JSON.stringify(pricesByTime),
					electricityRaw.avg ?? null,
					electricityRaw.max ?? null,
					electricityRaw.min ?? null,
				]
			),
		];

		const results = await Promise.allSettled(inserts);
		results.forEach((r, i) => {
			if (r.status === "rejected") {
				console.error(`DB insert ${i} failed:`, r.reason);
			}
		});

		return true;
	} catch (err) {
		console.error("fetchData failed:", err);
		return false;
	}
};

const { default: cron } = await import("node-cron");

cron.schedule(
	"0 3 * * *",
	async () => {
		try {
			console.log("Daily fetch starting...");
			await fetchData();
			console.log("Daily fetch completed.");
		} catch (err) {
			console.error("Daily fetch failed:", err);
		}
	},
	{ timezone: "Europe/Tallinn" }
);

app.get("/api/prices/30d", async (req, res) => {
	try {
		const days = 30;
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		const [gasRows] = await conn.query(
			"SELECT * FROM gas_prices WHERE created_at >= ? ORDER BY created_at ASC",
			[since]
		);

		const [elecRows] = await conn.query(
			"SELECT * FROM electricity_prices WHERE created_at >= ? ORDER BY created_at ASC",
			[since]
		);

		res.json({
			gas: gasRows,
			electricity: elecRows,
		});
	} catch (err) {
		console.error("Failed to fetch 30 day data:", err);
		res.status(500).json({ error: "Failed to fetch 30 day data" });
	}
});

app.listen(process.env.PORT, process.env.HOST, () => {
	console.log(
		`Server running at http://${process.env.HOST}:${process.env.PORT}/`
	);
});
