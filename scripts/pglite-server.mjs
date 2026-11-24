/*
 * Máy Postgres giả bằng PGlite qua giao thức wire (chỉ dùng cho e2e trên máy
 * làm việc không có Postgres thật — scripts/pglite-server.mjs). DATABASE_URL
 * trỏ vào đây: postgres://postgres:pglite@127.0.0.1:54321/noteim
 * Không dùng trong production; Supabase thật vẫn là nơi duy nhất chạy thật.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PGLITE_PORT || 54321);
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`CREATE SCHEMA IF NOT EXISTS noteim`);
await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", username: "postgres", database: "noteim" });
await server.start();
console.log(`[pglite-server] listening on 127.0.0.1:${port}`);
