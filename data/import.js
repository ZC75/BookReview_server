// Run this file once to import books and authors infomation

import db from "./db.js"
import { getBookInfo, getAuthorInfo } from "./fetchDataApi.js"

const insertAuthor = ({ name, biography, image_url, id_openlibrary }) => {
  // first check if already exists
  const existing_id = db
    .prepare("SELECT id FROM authors WHERE id_openlibrary = ?")
    .get(id_openlibrary)
  if (existing_id) return existing_id

  const stmt = db.prepare(
    "INSERT INTO authors (name, biography, image_url, id_openlibrary) VALUES (?, ?, ?, ?)"
  )

  const result = stmt.run(name, biography, image_url, id_openlibrary)
  return result.lastInsertRowid
}

const insertBook = (book) => {
  // TBC check if already exists

  const stmt = db.prepare(
    "INSERT INTO books (title, author_id_openlibrary, publisher, publish_year, \
    isbn, description, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
  const result = stmt.run(
    book.title,
    book.author_id_openlibrary,
    book.publisher,
    book.publish_year,
    book.isbn,
    book.description,
    book.cover_url
  )
}

// for testing

// const author = {
//   name: "harry",
//   biography: "some text",
//   image_url: "xxx",
//   id_openlibrary: "/authors/OL23919A",
// }

// const book = {
//   title: "title1",
//   author_id_openlibrary: "ol_id",
//   publisher: "publisher",
//   publish_year: "2014",
//   isbn: "9781408855652",
//   description: "Good book",
//   cover_url: "xxx",
// }

const isbn_list = [
  // "9781408855652", //"Harry Potter and the Philosopher's Stone", 2014, Bloomsbury
  // "9781338878936", //"Harry Potter and the Chamber of Secrets",
  // "9781338878943", //"Harry Potter and the Prisoner of Azkaban",
  // "9781338878950", //"Harry Potter and the Goblet of Fire",
  // "9781338878967", //"Harry Potter and the Order of the Phoenix",
  // "9781338878974", //"Harry Potter and the Half-Blood Prince",
  // "9781338878981", //"Harry Potter and the Deathly Hallows",
  // "9780140441185", //"Thus Spoke Zarathustra",
  // "9780140449235", //"Beyond Good and Evil",
  // "9780451530165", //"The Signet Classic Book of Mark Twain's Short Stories",
  // "9780471433316", //"Introduction to Real Analysis",
  // "9781492040347", //"Database Internals",
  // "9781593279509", //"Eloquent JavaScript",
  // "9781982176860", //"Steve Jobs",
  //"9780321321350", // "A User-Centered Design Approach",
  // "9781542878166", //The_Great_Gatsby
]

const main = async () => {
  for (const isbn of isbn_list) {
    try {
      const book = await getBookInfo(isbn)
      const author = await getAuthorInfo(book.author_id_openlibrary)
      const newBookId = insertBook(book)
      const newAuthorId = insertAuthor(author)
    } catch (e) {
      console.log(`insert ${isbn} failed.`)
      console.log(e)
    }
  }
  console.log("import completed")
  db.close()
}

main()
