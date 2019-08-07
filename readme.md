# DTesters Elasticsearch

Ingests Discord Testers Trello data into elasticsearch.

Before running, create an elasticsearch cluster (a single node with 512MB RAM works fine), and create an index called `events`.

* `app.js` will listen for Trello webhooks to `/discord/events`, and ingest events into elasticsearch one at a time.

* `import.js` will ingest historical events from Trello into elasticsearch. Define the `APP_TRELLO_BOARD` environment variable to be the trello ID of the board which you want to ingest.

Both of the scripts will need variables defined in a `.env` file. An example `.env` is in `.env.example`.
