import Database from "better-sqlite3"
import bcrypt from "bcryptjs"

const db = new Database("bookreview.db")

const users = db.prepare("SELECT id, password FROM users").all()

const stmt = db.prepare("UPDATE users SET password = ? WHERE id = ?")

for (const user of users) {
  try {
    const hashedPassword = await bcrypt.hash(user.password, 10)
    stmt.run(hashedPassword, user.id)
  } catch (e) {
    console.log(`update password ${user.id} failed.`)
    console.log(e)
  }
}

console.log("Password update completed.")
db.close()
