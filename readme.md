# DTesters Elasticsearch

Ingests Discord Testers Trello data into elasticsearch.

Before running, create an elasticsearch cluster (a single node with 512MB RAM works fine), and create an index called `events`.

* `app.js` will listen for Trello webhooks to `/discord/events`, and ingest events into elasticsearch one at a time.

* `import.js` will ingest historical events from Trello into elasticsearch. Because of how the Trello API works, events are indexed in reverse order.
  * Define the `APP_TRELLO_BOARD` environment variable to be the trello ID of the board which you want to ingest.
  * Define the `APP_TRELLO_START_DATE` environment variable to the ISO8601 date where you want to start importing. Importing will go back from this date to the beginning of Trello activity, or to `APP_TRELLO_END_DATE`, whichever is earliest.
  * (optional) Define the `APP_TRELLO_END_DATE` environment variable to ISO8601 date of when you want to end importing. This should be an earlier time than `APP_TRELLO_START_DATE`.

Both of the scripts will need variables defined in a `.env` file. An example `.env` is in `.env.example`.
