import ResponseError from './response-error'

const safeParseInt = (input) => {
  let out = parseInt(input)
  if (out > Number.MAX_SAFE_INTEGER || out < Number.MIN_SAFE_INTEGER) {
    out = NaN
  }
  return out
}

const parsePagination = (params) => {
  let limit
  let page
  const limitParam = params.get('limit')
  if (limitParam === null) {
    limit = 5
  } else {
    limit = safeParseInt(limitParam)
  }
  if (Number.isNaN(limit) || limit < 1 || limit > 50) {
    throw new ResponseError(400, 'The limit is invalid.')
  }
  const pageParam = params.get('page')
  if (pageParam === null) {
    page = 0
  } else {
    page = safeParseInt(pageParam)
  }
  if (Number.isNaN(page) || page < 0 || page > 100) {
    throw new ResponseError(400, 'The page is invalid.')
  }

  return {
    limit,
    page
  }
}

module.exports = parsePagination
