@{%
  const fields = require('./fields')
%}

main -> _ query _              {% p => p[1] %}

query ->
     "(" _ query _ ")"          {% p => p[2] %}
  |  "not"i __ query            {% p => ({bool: {must_not: [p[2]]}}) %}
  |  query __ "and"i __ query   {% p => ({bool: {must: [p[0], p[4]]}}) %}
  |  query __ "or"i __ query    {% p => ({bool: {should: [p[0], p[4]]}}) %}
  |  term_key ":" _ term_string {% p => ({term: {[p[0]]: p[3]}}) %}
  |  word_string                {% p => ({multi_match: {query: p[0], fields: fields.matchFieldBoosts, operator: 'AND', type: 'cross_fields'}}) %}
  |  quote_string               {% p => ({multi_match: {query: p[0], fields: fields.matchFieldBoosts, operator: 'AND', type: 'phrase'}}) %}

term_key -> "board"i | "card"i | "link"i | "id"i | "kind"i | "user"i | "admin_user"i
term_string -> (([a-zA-Z0-9 ]:+) | ("\"" .:* "\"")) {% p => p[0][0].length === 3 ? p[0][0][1].join('') : p[0][0][0].join('') %}
word_string -> ([a-zA-Z0-9 ]:+) {% p => p[0][0].join('') %}
quote_string -> ("\"" .:* "\"") {% p => p[0][1].join('') %}

_ -> [\s]:?                    {% () => null %}
__ -> [\s]:+                   {% () => null %}
