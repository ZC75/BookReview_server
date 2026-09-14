// import { setGlobalDispatcher, ProxyAgent } from "undici"
// process.env.HTTP_PROXY = "http://127.0.0.1:7890"
// process.env.HTTPS_PROXY = "http://127.0.0.1:7890"
// setGlobalDispatcher(new ProxyAgent("http://127.0.0.1:7890"))

import express from "express"
import cors from "cors"

import db from "./data/db.js"
import bcrypt from "bcryptjs"

const app = express()

const port = 3000

app.use(cors())
app.use(express.json())

function getById(res, query, id, notFoundMessage) {
  try {
    const result = db.prepare(query).get(id)
    if (!result) {
      return res.status(404).json({
        error: notFoundMessage,
      })
    }
    return res.json(result)
  } catch (e) {
    console.log(e)
    return res.status(500).json({
      error: `Server error`,
    })
  }
}

function isISBN(str) {
  return false
}

// ********* Book(s) *********

// get books based on keywords: /books?keyword=harry&sort=rating
app.get("/api/books", (req, res) => {
  let keyword = req.query.keyword
  const sort = req.query.sort || "title"

  // only search keywords longer than 2
  if (!keyword || keyword.trim().length < 3) {
    return res.json([])
  }
  // TBC write two queries if keyword is isbn
  let query
  let orderBy = "title"
  if (isISBN(keyword)) {
    query = "TBC"
  } else {
    if (sort == "publish-year") {
      orderBy = "books.publish_year DESC"
    } else if (sort == "most-reviews") {
      orderBy = "review_count DESC, books.title ASC"
    } else if (sort == "rating") {
      orderBy = "average_rating DESC, review_count DESC"
    } else {
      orderBy = "books.title ASC"
    }

    query = `SELECT books.*, authors.id AS author_id, authors.name AS author_name,
      COALESCE(AVG(reviews.rating), 0) AS average_rating,
      COUNT(reviews.id) AS review_count 
    FROM books
    INNER JOIN authors
      ON books.author_id_openlibrary = authors.id_openlibrary
    LEFT JOIN reviews 
      ON books.id = reviews.book_id
    WHERE books.title LIKE ? OR authors.name LIKE ? OR books.isbn LIKE ?
    GROUP BY books.id
    ORDER BY ${orderBy}`
  }

  try {
    keyword = `%${keyword.trim()}%`
    const books = db.prepare(query).all(keyword, keyword, keyword)
    res.json(books)
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Unable to fetch data from database",
    })
  }
})

//get book by id: /books/54
app.get("/api/books/:id", (req, res) => {
  // join authors to get author name; join reviews to calculate average ratings
  const query = `SELECT books.*, authors.id AS author_id, authors.name AS author_name,
    authors.image_url AS author_image_url, 
    COALESCE(AVG(reviews.rating), 0) AS average_rating,
    COUNT(reviews.id) AS review_count
  FROM books
  INNER JOIN authors
    ON books.author_id_openlibrary = authors.id_openlibrary
  LEFT JOIN reviews
    ON books.id = reviews.book_id
  WHERE books.id = ? 
  GROUP BY books.id`

  // const query = `SELECT * FROM books where id = ?`
  getById(res, query, req.params.id, "Book not found")
})

// ********* Author *********

// get author by id
app.get("/api/authors/:id", (req, res) => {
  const query = `SELECT id, id_openlibrary, name, image_url, biography
    FROM authors 
    WHERE id = ?`
  getById(res, query, req.params.id, "Author not found")
})

//get all books of certain author: /api/authors/3/books
app.get("/api/authors/:id/books", (req, res) => {
  const query = `SELECT books.id, books.title, books.cover_url, 
  authors.id AS author_id, authors.name AS author_name, 
  COALESCE(AVG(reviews.rating), 0) AS average_rating,
  COUNT(reviews.id) AS review_count
  FROM books
  INNER JOIN authors
  ON books.author_id_openlibrary = authors.id_openlibrary
  LEFT JOIN reviews
  ON books.id = reviews.book_id
  WHERE authors.id = ?
  GROUP BY books.id
  ORDER BY books.id DESC`

  try {
    const books = db.prepare(query).all(req.params.id)

    res.json(books)
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Unable to fetch data from database",
    })
  }
})

// *********  Reviews *********

// get all reviews of a book
app.get("/api/books/:bookId/reviews", (req, res) => {
  const bookId = req.params.bookId
  const currentUserId = req.query.userId
  const sort = req.query.sort || "newest"
  let order

  if (sort == "most-liked") {
    order = "like_count DESC, reviews.created_at DESC"
  } else {
    order = "reviews.created_at DESC"
  }
  const query = `SELECT reviews.id, reviews.book_id, reviews.user_id, 
    reviews.rating, reviews.review_text, reviews.last_modified_at, 
    users.username, COUNT(likes.id) AS like_count,
    MAX(CASE WHEN likes.user_id = ? THEN 1 ELSE 0 END) AS liked
    FROM reviews 
    INNER JOIN users 
    ON reviews.user_id = users.id 
    LEFT JOIN likes 
    ON likes.review_id = reviews.id 
    WHERE reviews.book_id = ? 
    GROUP BY reviews.id 
    ORDER BY ${order}`

  try {
    const reviews = db.prepare(query).all(currentUserId, bookId)
    res.json(reviews)
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Unable to fetch data from database",
    })
  }
})

// add a review
app.post("/api/books/:bookId/reviews", (req, res) => {
  const bookId = req.params.bookId

  const { userId, rating, reviewText } = req.body

  if (!userId || !rating) {
    return res.status(400).json({
      error: "userId and rating are required",
    })
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      error: "Rating must be between 1 and 5",
    })
  }

  try {
    //also need to check if the book is already reviewed by the user
    const query1 = "SELECT id FROM reviews WHERE book_id = ? AND user_id = ?"
    const existing = db.prepare(query1).get(bookId, userId)

    if (existing) {
      return res.status(409).json({
        error: "You have already reviewed this book",
      })
    }

    const query2 = `INSERT INTO reviews (book_id, user_id, rating, review_text, 
      created_at, last_modified_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    // const result = db.prepare(query2).run(bookId, userId, rating, reviewText || "")
    const stmt_insert = db.prepare(query2)

    // delete the book from want to read
    const query3 = "DELETE FROM want_to_read WHERE user_id = ? AND book_id = ?"
    const stmt_delete = db.prepare(query3)

    // use transaction to perform insert review and delete want to read together
    const transaction = db.transaction(() => {
      const result = stmt_insert.run(bookId, userId, rating, reviewText || "")
      stmt_delete.run(userId, bookId)
      return result
    })

    const result = transaction()
    res.status(201).json({
      id: result.lastInsertRowid,
      message: "Review added",
    })
  } catch (e) {
    console.error(e)

    res.status(500).json({
      error: "Database error",
    })
  }
})

// modify a review
app.put("/api/reviews/:reviewId", (req, res) => {
  const reviewId = req.params.reviewId

  const { userId, rating, reviewText } = req.body

  if (!userId || !rating) {
    return res.status(400).json({
      error: "userId and rating are required",
    })
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      error: "Rating must be between 1 and 5",
    })
  }

  try {
    const review = db
      .prepare("SELECT id FROM reviews WHERE id = ? AND user_id = ?")
      .get(reviewId, userId)

    if (!review) {
      return res.status(404).json({
        error: "Review not found",
      })
    }
    const query = `UPDATE reviews SET rating = ?, review_text = ?,
  last_modified_at = CURRENT_TIMESTAMP 
  WHERE id = ? AND user_id = ?`
    db.prepare(query).run(rating, reviewText || "", reviewId, userId)

    res.json({ message: "Review updated" })
  } catch (e) {
    console.error(e)
    res.status(500).json({
      error: "Database error",
    })
  }
})

// delete a review
app.delete("/api/reviews/:reviewId", (req, res) => {
  const reviewId = req.params.reviewId
  const { userId } = req.body

  if (!userId) {
    return res.status(400).json({
      error: "userId is required",
    })
  }

  const query = `DELETE FROM reviews WHERE id = ? AND user_id = ?`
  try {
    db.prepare(query).run(reviewId, userId)

    res.json({ message: "Review deleted" })
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Database error",
    })
  }
})

// like a review
app.post("/api/reviews/:reviewId/like", (req, res) => {
  const reviewId = req.params.reviewId
  const { userId } = req.body

  if (!userId) {
    return res.status(400).json({
      error: "userId is required",
    })
  }

  try {
    const existing = db
      .prepare("SELECT id FROM likes WHERE review_id = ? AND user_id = ?")
      .get(reviewId, userId)

    if (existing) {
      return res.json({
        message: "Already liked",
      })
    }
    // console.log("`````````send`````````")
    const query = "INSERT INTO likes (review_id,user_id) VALUES (?, ?)"
    console.log(query)
    db.prepare(query).run(reviewId, userId)

    res.status(201).json({
      message: "Review liked",
    })
  } catch (e) {
    console.error(e)

    res.status(500).json({
      error: "Database error",
    })
  }
})

// unlike a review
app.delete("/api/reviews/:reviewId/like", (req, res) => {
  const reviewId = req.params.reviewId
  const userId = req.body.userId

  if (!userId) {
    return res.status(400).json({
      error: "userId is required",
    })
  }

  try {
    const query = "DELETE FROM likes WHERE review_id = ? AND user_id = ?"
    db.prepare(query).run(reviewId, userId)

    res.json({
      message: "Review unliked",
    })
  } catch (e) {
    console.error(e)

    res.status(500).json({
      error: "Database error",
    })
  }
})

// ********* Want to read *********

// add to want to read
app.post("/api/users/:userId/want-to-read/:bookId", (req, res) => {
  const { userId, bookId } = req.params

  try {
    const existing = db
      .prepare("SELECT id FROM want_to_read WHERE user_id = ? AND book_id = ?")
      .get(userId, bookId)

    if (existing) {
      return res.json({
        message: "Already added",
      })
    }
    const query = `INSERT INTO want_to_read ( user_id,book_id,created_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)`
    db.prepare(query).run(userId, bookId)

    res.status(201).json({
      message: "Book added",
    })
  } catch (e) {
    console.error(e)

    res.status(500).json({
      error: "Database error",
    })
  }
})

// remove from want to read
app.delete("/api/users/:userId/want-to-read/:bookId", (req, res) => {
  const { userId, bookId } = req.params
  const query = "DELETE FROM want_to_read WHERE user_id = ? AND book_id = ?"

  try {
    db.prepare(query).run(userId, bookId)
    res.json({
      message: "Book removed from want to read",
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({
      error: "Database error",
    })
  }
})

// check if added to want to read
app.get("/api/users/:userId/want-to-read/:bookId", (req, res) => {
  const { userId, bookId } = req.params
  try {
    const query = " SELECT id FROM want_to_read WHERE user_id = ? AND book_id = ?"
    const result = db.prepare(query).get(userId, bookId)

    res.json({ saved: !!result })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: "Database error",
    })
  }
})

// ********* HomeScreen *********

// get the first 10 books simple info in a list
function getBooksInSimpleList(filterName, value, res) {
  //filterName can be 'id' or 'list_name'
  const query = `SELECT books.id, books.title, books.publish_year, books.cover_url, 
    authors.id AS author_id, authors.name AS author_name 
  FROM lists 
  INNER JOIN list_book 
    ON lists.id = list_book.list_id 
  INNER JOIN books 
    ON list_book.book_id = books.id 
  INNER JOIN authors 
    ON books.author_id_openlibrary = authors.id_openlibrary
  WHERE lists.${filterName} = ? 
  ORDER BY books.id DESC
  LIMIT 10`

  try {
    const books = db.prepare(query).all(value)
    if (filterName == "id") return books
    res.json(books)
  } catch (e) {
    console.log(e)

    res.status(500).json({
      error: "Unable to fetch data from database",
    })
  }
}
// get newly released books
app.get("/api/lists/new/books", (req, res) => {
  getBooksInSimpleList("list_name", "new", res)
})

// get popular books
app.get("/api/lists/popular/books", (req, res) => {
  getBooksInSimpleList("list_name", "popular", res)
})

// get all featured lists
app.get("/api/lists/featured", (req, res) => {
  // get all lists except new and popular
  const query_lists = `SELECT id, list_name 
    FROM lists
    WHERE list_name NOT IN ('new', 'popular') 
    ORDER BY id DESC`

  // get the first 3 cover images
  const query_cover = `SELECT books.cover_url 
    FROM list_book 
    INNER JOIN books 
    ON list_book.book_id = books.id 
    WHERE list_book.list_id = ? 
    AND books.cover_url IS NOT NULL
    AND books.cover_url != ''
    LIMIT 3`

  // get the number of books in the list
  const query_book_count = `SELECT COUNT(*) AS book_count 
    FROM list_book 
    WHERE list_id = ?`

  try {
    const lists = db.prepare(query_lists).all()
    const stmt_covers = db.prepare(query_cover)
    const stmt_count = db.prepare(query_book_count)

    const result = lists.map((lists) => {
      const covers = stmt_covers.all(lists.id).map((book) => book.cover_url)
      const count = stmt_count.get(lists.id)

      return {
        id: lists.id,
        name: lists.list_name,
        description: lists.list_description,
        book_count: count.book_count,
        covers,
      }
    })

    res.json(result)
  } catch (e) {
    console.log(e)

    res.status(500).json({
      error: "Unable to fetch data from database",
    })
  }
})

app.get("/api/lists/featured-with-books", (req, res) => {
  // first get all lists except 'new' and 'popular'
  const query = `SELECT id, list_name 
  FROM lists
  WHERE list_name != 'new' AND list_name != 'popular'`
  try {
    const lists = db.prepare(query).all()

    const allListsInfo = lists.map((list) => {
      const books = getBooksInSimpleList("id", list.id)
      return {
        id: list.id,
        name: list.list_name,
        book_count: books.length,
        books,
      }
    })

    res.json(allListsInfo)
  } catch (e) {
    console.error(e)

    res.status(500).json({
      error: "Database error",
    })
  }
})

// get featured list by id :/lists/3
app.get("/api/lists/:id", (req, res) => {
  const query = `SELECT id, list_name, list_description FROM lists WHERE id = ?`
  getById(res, query, req.params.id, "List not found")
})

// get all books info in a certain list: /lists/3/books
app.get("/api/lists/:id/books", (req, res) => {
  const listId = req.params.id
  const query = `SELECT books.id, books.title, books.cover_url, 
      authors.id AS author_id, authors.name AS author_name, 
      COALESCE(AVG(reviews.rating), 0) AS average_rating, 
      COUNT(reviews.id) AS review_count
      FROM list_book 
      INNER JOIN books 
      ON list_book.book_id = books.id 
      INNER JOIN authors 
      ON books.author_id_openlibrary = authors.id_openlibrary 
      LEFT JOIN reviews 
      ON books.id = reviews.book_id
      WHERE list_book.list_id = ? 
      GROUP BY books.id
      ORDER BY books.title`
  try {
    const books = db.prepare(query).all(listId)
    res.json(books)
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Unable to fetch data from database",
    })
  }
})

// ********* My Books Screen *********

// get current user's want to read books
app.get("/api/users/:userId/want-to-read", (req, res) => {
  const userId = req.params.userId

  const query = `SELECT books.id, books.title, books.cover_url, books.publish_year, 
      authors.id AS author_id, authors.name AS author_name,
      COALESCE(AVG(reviews.rating), 0) AS average_rating,
      COUNT(reviews.id) AS review_count 
    FROM want_to_read
    INNER JOIN books
      ON want_to_read.book_id = books.id 
    INNER JOIN authors
      ON books.author_id_openlibrary = authors.id_openlibrary
    LEFT JOIN reviews
      ON books.id = reviews.book_id 
    WHERE want_to_read.user_id = ? 
    GROUP BY books.id
    ORDER BY want_to_read.created_at DESC`

  try {
    const books = db.prepare(query).all(userId)
    res.json(books)
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Database error",
    })
  }
})

// get current user's all reviewed books with reviews
// book_id = id
app.get("/api/users/:userId/reviewedBooks", (req, res) => {
  const userId = req.params.userId
  const query = `SELECT reviews.id AS review_id, reviews.book_id, reviews.rating, 
    reviews.review_text, reviews.created_at, reviews.last_modified_at, 
    books.title, books.cover_url, books.publish_year, books.id,
    authors.id AS author_id, authors.name AS author_name,
    (
      SELECT COALESCE(AVG(all_reviews.rating), 0)
      FROM reviews all_reviews
      WHERE all_reviews.book_id = books.id
    ) AS average_rating,
    (
      SELECT COUNT(all_reviews.id)
      FROM reviews all_reviews
      WHERE all_reviews.book_id = books.id
    ) AS review_count
    FROM reviews
    INNER JOIN books
      ON reviews.book_id = books.id
    INNER JOIN authors
      ON books.author_id_openlibrary = authors.id_openlibrary
    WHERE reviews.user_id = ?
    ORDER BY reviews.created_at DESC`

  try {
    const reviews = db.prepare(query).all(userId)
    res.json(reviews)
  } catch (e) {
    console.log(e)
    res.status(500).json({
      error: "Database error",
    })
  }
})

// ********* Ebook using Open Library API *********
// server.js

app.get("/api/books/:isbn/ebook", async (req, res) => {
  if (!req.params.isbn) return
  try {
    // remove possible "-" or spaces from ISBN
    const isbn = req.params.isbn.replace(/[-\s]/g, "")

    // ask Open Library
    const response = await fetch(
      `https://openlibrary.org/api/volumes/brief/isbn/${isbn}.json`
    )
    if (!response.ok) {
      return res.status(502).json({
        error: "Open Library API error",
      })
    }

    const data = await response.json()

    // check if ebook available
    if (
      !data.items ||
      data.items.length === 0 ||
      !data.items[0].itemURL ||
      !data.items[0].itemURL.endsWith("/borrow")
    ) {
      return res.json({
        available: false,
      })
    }

    // remove "/borrow" from the end
    let url = data.items[0].itemURL

    if (url.endsWith("/borrow")) {
      url = url.slice(0, -"/borrow".length)
    }

    return res.json({
      available: true,
      cover: data.items[0].cover?.small || null,
      url,
    })
  } catch (e) {
    console.error(e)

    return res.status(500).json({
      error: "Failed to fetch ebook information",
    })
  }
})

app.listen(port, () => {
  console.log(`server is listening on port ${port}`)
})

// ********* Account Setting *********

// Check username exists
// api/users/check-username?username=${encodeURIComponent(username)}`
app.get("/api/users/check-username", (req, res) => {
  const username = req.query.username

  if (!username) return res.status(400).json({ error: "Username is required" })
  const query = "SELECT id FROM users WHERE username = ?"

  try {
    const user = db.prepare(query).get(username)
    res.json({ exists: !!user })
  } catch (e) {
    console.log(e)
    res.status(500).json({ error: "Database error" })
  }
})

// Check email exists
//api/users/check-email?email=${encodeURIComponent(email)}
app.get("/api/users/check-email", (req, res) => {
  const email = req.query.email
  if (!email) return res.status(400).json({ error: "Email is required" })

  const query = `SELECT id FROM users WHERE email = ?`
  try {
    const user = db.prepare(query).get(email)
    // console.log(user)
    res.json({ exists: !!user })
  } catch (e) {
    console.log(e)
    res.status(500).json({ error: "Database error" })
  }
})

// Check password correct
// /api/users/${userId}/check-password
app.post("/api/users/:id/check-password", async (req, res) => {
  const userId = req.params.id
  const { password } = req.body

  const query = `SELECT password FROM users WHERE id = ?`

  try {
    const user = db.prepare(query).get(userId)
    if (!user) {
      res.status(404).json({ error: "User not found" })
    } else {
      const correct = await bcrypt.compare(password, user.password)
      res.json({ correct })
    }
  } catch (e) {
    console.log(e)
    res.status(500).json({ error: "Database error" })
  }
})

// user login
app.post("/api/users/login", async (req, res) => {
  const { email, password } = req.body
  const query = "SELECT id, username, email, password FROM users WHERE email = ?"

  try {
    const user = db.prepare(query).get(email)

    if (!user) {
      return res.json({ success: false })
    }

    //compare password
    const correct = await bcrypt.compare(password, user.password)
    if (!correct) {
      return res.json({ success: false })
    }
    res.json({
      success: true,
      user: { userId: user.id, username: user.username, email: user.email },
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false })
  }
})

// user sign-up (create a user account)
app.post("/api/users", async (req, res) => {
  const { email, username, password } = req.body

  try {
    // first check if email already exists
    const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email)

    if (existingEmail) {
      return res.status(400).json({ success: false })
    }

    // Check if username already exists
    const existingUsername = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(username)

    if (existingUsername) {
      return res.status(400).json({
        success: false,
      })
    }

    // Then create user account
    // first hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    const query = "INSERT INTO users (username,email,password) VALUES (?, ?, ?)"
    const result = db.prepare(query).run(username, email, hashedPassword)

    res.status(201).json({
      success: true,
      userId: result.lastInsertRowid,
    })
  } catch (e) {
    console.error(e)

    res.status(500).json({
      success: false,
    })
  }
})

// ************ Edit user info ***************

// change username
app.put("/api/users/:id/username", (req, res) => {
  const { username } = req.body
  const userId = req.params.id

  try {
    const existing = db
      .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
      .get(username, userId)

    if (existing) {
      return res.status(400).json({
        success: false,
      })
    }
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, userId)

    res.json({ success: true, user: { userId, username } })
  } catch (e) {
    console.error(e)

    res.status(500).json({ success: false })
  }
})

// change password
//  TBC: may verify current password again
app.put("/api/users/:id/password", async (req, res) => {
  const userId = req.params.id
  const { oldPassword, newPassword } = req.body
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, userId)

    res.json({ success: true })
  } catch (e) {
    console.error(e)

    res.status(500).json({
      success: false,
    })
  }
})
