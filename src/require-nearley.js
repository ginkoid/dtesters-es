const path = require('path')
const fs = require('fs')
const { createRequireFromPath } = require('module')
const vm = require('vm')
const nearley = require('nearley')
const compile = require('nearley/lib/compile')
const generate = require('nearley/lib/generate')
const nearleyGrammar = require('nearley/lib/nearley-language-bootstrapped')

const requireNearley = (filePathInput) => {
  const filePath = path.join(__dirname, filePathInput)
  const sourceCode = fs.readFileSync(filePath).toString('utf8')
  const grammarParser = new nearley.Parser(nearleyGrammar)
  grammarParser.feed(sourceCode)
  const grammarAst = grammarParser.results[0]
  const grammarInfoObject = compile(grammarAst, {})
  const grammarJs = generate(grammarInfoObject, 'grammar')
  const sandbox = {
    module: { exports: {} },
    require: createRequireFromPath(filePath),
  }
  vm.createContext(sandbox)
  vm.runInContext(grammarJs, sandbox)
  return sandbox.module.exports
}

module.exports = requireNearley
