import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
	host: process.env.HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
});

// Test connection

() => {
	pool.getConnection((err, connection) => {
		if (err) {
			console.error("Error connecting to the database:", err);
		}
		if (connection) connection.release();
		console.log("Database connected successfully");
	});
};

async function getConnection() {
	const connection = await pool.getConnection();
	return connection;
}

export default { getConnection };
