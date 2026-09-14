//TBC const 的variable name
import { setGlobalDispatcher, ProxyAgent } from "undici"
process.env.HTTP_PROXY = "http://127.0.0.1:7890"
process.env.HTTPS_PROXY = "http://127.0.0.1:7890"
setGlobalDispatcher(new ProxyAgent("http://127.0.0.1:7890"))

const base_url = "https://openlibrary.org"

const fetchData = async (url, type) => {
  try {
    const response = await fetch(url)
    return response.json()
  } catch (e) {
    console.log(`Fetch ${type} info error`)
    console.log(e)
  }
}

//fetch book info
const getBookInfo = async (isbn) => {
  const url = `${base_url}/isbn/${isbn}.json`
  const data = await fetchData(url, "book")
  if (!data) {
    console.log(`Book isbn: ${isbn} is not found.`)
  } else {
    const title = data.title
    const author_id_openlibrary = data.authors[0].key
    const publish_year = data.publish_date.split("-")[0]
    const publisher = data.publishers[0]
    // image url of cover page, default size is M
    // use isbn https://covers.openlibrary.org/b/isbn/0385472579-S.jpg
    // or image id: https://covers.openlibrary.org/b/id/240727-S.jpg
    const cover_url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`

    //use work id to retrieve book description
    const work_id = data.works[0].key // "/works/OL166894W"
    const url_work = `${base_url + work_id}.json`

    const work = await fetchData(url_work, "work")

    // can be data.bio or data.bio.value
    //   use optional chaining in case description is null
    const description =
      typeof work.description === "string" ? work.description : work.description?.value

    return {
      isbn,
      title,
      author_id_openlibrary,
      publish_year,
      publisher,
      cover_url,
      description,
    }
  }
}

//"author_key in open library":"/authors/OL23919A"
const getAuthorInfo = async (author_key) => {
  const url = `${base_url + author_key}.json`
  const data = await fetchData(url, "author")
  if (!data) {
    console.log("Author: " + author_key + " is not found.")
  } else {
    // only return needed fields

    // can be data.bio or data.bio.value
    //   use optional chaining in case bio is null
    const biography = typeof data.bio === "string" ? data.bio : data.bio?.value
    // TBC if bio is null, will biography also be null?
    //size: S(default), M, L
    const image_url = `https://covers.openlibrary.org/a/olid/${author_key
      .split("/")
      .at(-1)}-M.jpg`

    return { name: data.name, biography, image_url, id_openlibrary: author_key }
  }
}

// //for testing
// ;(async () => {
//   const book = await getBookInfo("9781408855652")
//   console.log(book)
// })()
// ;(async () => {
//   const author = await getAuthorInfo("/authors/OL18319A")
//   console.log(author)
// })()

export { getBookInfo, getAuthorInfo }
