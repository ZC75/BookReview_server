//TBC: 这个options是啥？最后如何close?

import Database from "better-sqlite3"
import path from "path"
import { fileURLToPath } from "url"

// use absolute path so files in other folder can find db
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, "bookreview.db"))

db.pragma("journal_mode = WAL")

export default db
