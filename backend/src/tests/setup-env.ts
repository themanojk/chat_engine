import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const cwd = process.cwd();
const envTestPath = resolve(cwd, ".env.test");
const envPath = resolve(cwd, ".env");

if (existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

if (process.env.TEST_MONGO_URI && !process.env.TEST_MONGO_DB && process.env.MONGO_DB_NAME) {
  process.env.TEST_MONGO_DB = process.env.MONGO_DB_NAME;
}
