import { Pool } from "pg";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 5432,
});

pool.on("connect", () => {
  logger.info("PostgreSQL pool connected.");
});

pool.on("error", (err) => {
  logger.error("Unexpected error on idle PostgreSQL client", err);
  process.exit(-1);
});

export default pool;
