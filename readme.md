# DTesters Elasticsearch

#### The API is hosted for anyone to use at `https://gnk.gnk.io`

An API for ingesting and searching Discord Testers data.

## Using the `search` API

Send a `GET` request to `/dtesters/search` with some of the querystring parameters. The response will look like this

```json
{
  "total": {
    "value": 100,
    "relation": "eq"
  },
  "hits": [{
    "event": {
      "time": 12345678,
      "board": "aaaaaaaaaa",
      "card": "cccccccccc",
      "id": "11111",
      "kind": "cr",
      "content": "dddd"
    },
    "highlights": [{
      "key": "content",
      "text": "dddd",
      "positions": [{ "start": 0, "end": 4 }]
    }]
  }]
}
```

* `total.relation` can be either `eq` or `gte`. `gte` represents that there are more than `total.value` results, wheras `eq` represents that the result count is exact.
* `hits[].event` is the source event. Specify keys included here using the `include` query parameter.
* `hits[].highlights[]` specifies the relevant text for highlighting results of a search.
* `hits[].highlights[].positions[]` specifies the positions of the highlights. `start` is inclusive, `end` is exclusive.

## Using the `total` API

Send a `GET` request to `/dtesters/total` with some of the querystring parameters. The response will look like this

```json
{
  "total": 100
}
```

* `total` specifies the total number of results from that search

## Parameters for `search` and `total`

* `limit` (required) (`search` only): The number of results on a page. Set to `0` if you only care about the number of results, not the results themselves. Maximum of `50`.
* `page` (required) (`search` only): The page index for pagination. Starts at `0`. Maximum of `100`.
* `sort` (required) (`search` only): Specifies the sort that the results will use. Either `recency` or `relevance`.
* `before` (optional): Only include events before this time. Accepts seconds since Jan 1 1970.
* `after` (optional): Only include events after this time. Accepts seconds since Jan 1 1970.
* `include` (optional): The list of event attributes to include in the response. If this isn't provided, all attributes are included.
* terms `board`, `card`, `link`, `id`, `kind`, `user` (optional): Providing these attributes will filter based on the exact values provided. Partial matches are not possible
* `content` (optional): Providing this parameter will search based on the `actual`, `client`, `content`, `expected`, `steps`, `system`, `title`. Supports partial matches.
* `query` (optional): Providing this parameter will search based on all include and all content attrbutes, using the [elasticsearch simple query syntax](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-simple-query-string-query.html#simple-query-string-syntax)

## Running your own

Before running, create an elasticsearch cluster (a single node with 512MB RAM works fine), and create an index called `events`. The index's mappings and settings are in `index.json`.

* `app.js` will
  * listen for Trello webhooks to `/dtesters/events`, and ingest events into elasticsearch one at a time
  * serve search requests from elasticsearch for `/dtesters/search`

* `import.js` will ingest historical events from Trello into elasticsearch. Because of how the Trello API works, events are indexed in reverse order.
  * Define the `APP_TRELLO_BOARD` environment variable to be the trello ID of the board which you want to ingest.
  * Define the `APP_TRELLO_START_DATE` environment variable to the ISO8601 date where you want to start importing. Importing will go back from this date to the beginning of Trello activity, or to `APP_TRELLO_END_DATE`, whichever is earliest.
  * (optional) Define the `APP_TRELLO_END_DATE` environment variable to ISO8601 date of when you want to end importing. This should be an earlier time than `APP_TRELLO_START_DATE`.

Both of the scripts will need variables defined in a `.env` file. An example `.env` is in `.env.example`.
