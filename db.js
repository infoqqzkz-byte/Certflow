import Database from "better-sqlite3";

const db = new Database("database.sqlite");

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  count INTEGER DEFAULT 0,
  subscribed_until TEXT
)
`).run();

export default db;