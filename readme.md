# DTesters Elasticsearch

An API for ingesting and searching Discord Testers data.

### The API is hosted for everyone to use at [`https://gnk.gnk.io`](https://gnk.gnk.io)

## Examples

* [`/dtesters/total`](https://gnk.gnk.io/dtesters/total)
  * Find the total number of events in the system.
* [`/dtesters/total?board=5771673855f47b547f2decc3&kind=approve`](https://gnk.gnk.io/dtesters/total?board=5771673855f47b547f2decc3&kind=approve)
  * Find the total number of approved desktop bugs.
* [`/dtesters/search?limit=10`](https://gnk.gnk.io/dtesters/search?limit=10)
  * Find the 10 most recent events in the system.
* [`/dtesters/search?kind=approve`](https://gnk.gnk.io/dtesters/search?kind=approve)
  * Find the 5 most recent approved bugs.
* [`/dtesters/search?id=42024`](https://gnk.gnk.io/dtesters/search?id=42024):
  * Find the 5 most recent events pertaining to bug report ID 42024.
* [`/dtesters/search?sort=relevance&kind=approve&content=modal`](https://gnk.gnk.io/dtesters/search?sort=relevance&kind=approve&content=modal)
  * Find the 5 most relevant bugs regarding modals.
* [`/dtesters/search?sort=relevance&kind=approve&content=modal&include=link,title`](https://gnk.gnk.io/dtesters/search?sort=relevance&kind=approve&content=modal&include=link,title) 
  * Find the 5 most relevant bugs regarding modals.
  * Filter the response attributes to only include the Trello card link and the card title.
* [`/dtesters/search?sort=relevance&kind=approve&content=modal&include=link,title&board=5771673855f47b547f2decc3&highlights=first`](https://gnk.gnk.io/dtesters/search?sort=relevance&kind=approve&content=modal&include=link,title&board=5771673855f47b547f2decc3&highlights=first)
  * Find the 5 most relevant desktop bugs regarding modals.
  * Filter the response attributes to only include the Trello card link and the card title.
  * Filter the response to only include a highlighted snippet for the most relevant section.
* [`/dtesters/search?sort=relevance&kind=approve&query=modal and not button`](https://gnk.gnk.io/dtesters/search?sort=relevance&kind=approve&query=modal%20and%20not%20button)
  * Find the 5 most relevant bugs regarding modals but not buttons.

## Using the `search` API

Send a `GET` request to [`/dtesters/search`](https://gnk.gnk.io/dtesters/search) with some of the parameters. The response will look like this:

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

* `total.relation` can be either `eq` or `gte`. `gte` represents that there are more than `total.value` results, whereas `eq` represents that the result count is exact.
* `hits[].event` is the source event. Specify keys included here using the `include` query parameter.
* `hits[].highlights[]` specifies the relevant text for highlighting results of a search.
* `hits[].highlights[].positions[]` specifies the positions of the highlights. `start` is inclusive, `end` is exclusive.

## Using the `total` API

Send a `GET` request to [`/dtesters/total`](https://gnk.gnk.io/dtesters/total) with some of the parameters. The response will look like this:

```json
{
  "total": 100
}
```

* `total` specifies the total number of results from that search. This number is always exact.

## Parameters for `search` and `total`

* `limit` (default `5`) (`search` only): The number of results on a page. Maximum of `50`. Minimum of `1`.
* `page` (default `0`) (`search` only): The page index for pagination. Starts at `0`. Maximum of `100`.
* `sort` (default `recency`) (`search` only): Specifies the sort that the results will use. Either `recency` or `relevance`.
* `include` (optional) (`search` only): The list of event attributes to include in the response. If this isn't provided, all attributes are included.
* `highlights` (optional) (`search` only): Specifies how to include highlights in the response. Either `all`, `first`, or `none`. Defaults to `all`.
* `before` (optional): Only include events before this time. Accepts seconds since Jan 1 1970.
* `after` (optional): Only include events after this time. Accepts seconds since Jan 1 1970.
* terms `board`, `card`, `link`, `id`, `kind`, `user`, `admin_user` (optional): Providing these attributes will filter based on the exact values provided. Partial matches are not possible.
* `content` (optional): Providing this parameter will search based on the `actual`, `client`, `content`, `expected`, `steps`, `system`, `title` attributes. Partial matches are possible.
* `query` (optional): Providing this parameter will search based on all content attrbutes, using the query syntax defined in [`src/query.ne`](src/query.ne).

## Event attributes

* `board`: The Trello board ID.
* `card`: The Trello card ID.
* `link`: The Trello card short link.
* `id`: The bug report ID number.
* `kind`: The event kind. Possible values: `cr`, `cnr`, `approve`, `attach`, `note`, `archive`, `unarchive`, `admin_note`, `admin_attach`.
* `user`: The Discord user, in `DiscordTag#0000` form.
* `admin_user`: The Trello user ID of an admin for this event.
* `title`: The bug report short description.
* `actual`: The bug report actual result.
* `expected`: The bug report expected result.
* `steps`: The bug report reproduction steps.
* `system`: The bug report system settings.
* `client`: The bug report client settings.
* `content`: The content of a `cr`, `cnr`, `note`, or the content of a bug when the card cannot be parsed.

## Running your own

* Create an Elasticsearch cluster. A single node assigned 512MB of memory should work, but you should be able to dedicate at least 2GB to Elasticsearch.
* Copy the [`app_data`](app_data) folder into your Elasticsearch config directory.
* Create an index, using the settings and mappings from [`src/es-index.json`](src/es-index.json).
* Create a `.env` file, containing all the environment variables defined in [`.env.example`](.env.example).
* Run `node src/app.js`. The server listens on `127.0.0.1:8001`.
* Use a reverse proxy to forward requests to the node.js server.
* [Configure Trello to send webhooks](https://developers.trello.com/page/webhooks) for the boards defined in `APP_TRELLO_BOARDS` to the URL in `APP_TRELLO_WEBHOOK_URL`.

### `src/app.js`
* listens for Trello webhooks to `/dtesters/events`, and ingests events into Elasticsearch one at a time.
* serves search requests from Elasticsearch for `/dtesters/search` and `/dtesters/total`.

### `src/import.js`
* backfills historical events from Trello into Elasticsearch. Because of how the Trello API works, events are indexed in reverse chronological order.
* needs the `APP_TRELLO_START_DATE` environment variable to be set to the ISO8601 date of when you want to start importing. Importing will go back from this date to the beginning of Trello activity, or to `APP_TRELLO_END_DATE`, whichever is earliest.
* (optional) needs the `APP_TRELLO_END_DATE` environment variable to be defined as the ISO8601 date of when you want to end importing. This should be an earlier date than `APP_TRELLO_START_DATE`.
