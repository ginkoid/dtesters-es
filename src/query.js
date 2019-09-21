// Generated automatically by nearley, version 2.19.0
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

  const fields = require('./fields')
var grammar = {
    Lexer: undefined,
    ParserRules: [
    {"name": "main", "symbols": ["_", "query", "_"], "postprocess": p => p[1]},
    {"name": "query", "symbols": [{"literal":"("}, "_", "query", "_", {"literal":")"}], "postprocess": p => p[2]},
    {"name": "query$subexpression$1", "symbols": [/[nN]/, /[oO]/, /[tT]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "query", "symbols": ["query$subexpression$1", "__", "query"], "postprocess": p => ({bool: {must_not: [p[2]]}})},
    {"name": "query$subexpression$2", "symbols": [/[aA]/, /[nN]/, /[dD]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "query", "symbols": ["query", "__", "query$subexpression$2", "__", "query"], "postprocess": p => ({bool: {must: [p[0], p[4]]}})},
    {"name": "query$subexpression$3", "symbols": [/[oO]/, /[rR]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "query", "symbols": ["query", "__", "query$subexpression$3", "__", "query"], "postprocess": p => ({bool: {should: [p[0], p[4]]}})},
    {"name": "query", "symbols": ["term_key", {"literal":":"}, "_", "string"], "postprocess": p => ({term: {[p[0]]: p[3]}})},
    {"name": "query", "symbols": ["string"], "postprocess": p => ({multi_match: {query: p[0], fields: fields.matchFieldBoosts, operator: 'AND'}})},
    {"name": "term_key$subexpression$1", "symbols": [/[bB]/, /[oO]/, /[aA]/, /[rR]/, /[dD]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$1"]},
    {"name": "term_key$subexpression$2", "symbols": [/[cC]/, /[aA]/, /[rR]/, /[dD]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$2"]},
    {"name": "term_key$subexpression$3", "symbols": [/[lL]/, /[iI]/, /[nN]/, /[kK]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$3"]},
    {"name": "term_key$subexpression$4", "symbols": [/[iI]/, /[dD]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$4"]},
    {"name": "term_key$subexpression$5", "symbols": [/[kK]/, /[iI]/, /[nN]/, /[dD]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$5"]},
    {"name": "term_key$subexpression$6", "symbols": [/[uU]/, /[sS]/, /[eE]/, /[rR]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$6"]},
    {"name": "term_key$subexpression$7", "symbols": [/[aA]/, /[dD]/, /[mM]/, /[iI]/, /[nN]/, {"literal":"_"}, /[uU]/, /[sS]/, /[eE]/, /[rR]/], "postprocess": function(d) {return d.join(""); }},
    {"name": "term_key", "symbols": ["term_key$subexpression$7"]},
    {"name": "string$subexpression$1$subexpression$1$ebnf$1", "symbols": [/[a-zA-Z0-9 ]/]},
    {"name": "string$subexpression$1$subexpression$1$ebnf$1", "symbols": ["string$subexpression$1$subexpression$1$ebnf$1", /[a-zA-Z0-9 ]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "string$subexpression$1$subexpression$1", "symbols": ["string$subexpression$1$subexpression$1$ebnf$1"]},
    {"name": "string$subexpression$1", "symbols": ["string$subexpression$1$subexpression$1"]},
    {"name": "string$subexpression$1$subexpression$2$ebnf$1", "symbols": []},
    {"name": "string$subexpression$1$subexpression$2$ebnf$1", "symbols": ["string$subexpression$1$subexpression$2$ebnf$1", /./], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "string$subexpression$1$subexpression$2", "symbols": [{"literal":"\""}, "string$subexpression$1$subexpression$2$ebnf$1", {"literal":"\""}]},
    {"name": "string$subexpression$1", "symbols": ["string$subexpression$1$subexpression$2"]},
    {"name": "string", "symbols": ["string$subexpression$1"], "postprocess": p => p[0][0].length === 3 ? p[0][0][1].join('') : p[0][0][0].join('')},
    {"name": "_$ebnf$1", "symbols": [/[\s]/], "postprocess": id},
    {"name": "_$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": () => null},
    {"name": "__$ebnf$1", "symbols": [/[\s]/]},
    {"name": "__$ebnf$1", "symbols": ["__$ebnf$1", /[\s]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "__", "symbols": ["__$ebnf$1"], "postprocess": () => null}
]
  , ParserStart: "main"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
