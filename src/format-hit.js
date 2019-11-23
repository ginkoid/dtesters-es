const he = require('he')
const requestKinds = require('./request-kinds')

const findEms = (text) => {
  const result = []
  let lastIndex = -1
  let inTag = false
  while (true) {
    let idx
    if (inTag) {
      idx = text.indexOf('</em>', lastIndex + 1)
    } else {
      idx = text.indexOf('<em>', lastIndex + 1)
    }
    if (idx === -1) {
      return result
    }
    if (inTag) {
      result[result.length - 1].end = idx - (result.length - 1) * 9 - 4
    } else {
      result.push({
        start: idx - result.length * 9
      })
    }
    inTag = !inTag
    lastIndex = idx
  }
}

const formatHit = ({
  hit,
  requestKind,
  includeKeys,
  highlightsParam
}) => {
  let highlightResult
  let event
  if (requestKind === requestKinds.search) {
    highlightResult = []
    const highlight = hit.highlight || {}
    let hightlightEntries = Object.entries(highlight)
    if (highlightsParam === 'first' && hightlightEntries.length > 0) {
      hightlightEntries = [hightlightEntries[0]]
    }
    hightlightEntries.forEach(([key, highlightsValue]) => {
      let highlights = highlightsValue
      if (highlightsParam === 'first' && highlights.length > 0) {
        highlights = [highlights[0]]
      }
      highlights.forEach((text) => {
        const positions = findEms(he.decode(text))
        highlightResult.push({
          key,
          text: he.decode(text.replace(/(<em>|<\/em>)/g, '')),
          positions
        })
      })
    })
    if (includeKeys === undefined) {
      event = hit._source
    } else {
      event = {}
      Object.keys(hit._source).forEach((key) => {
        if (includeKeys.includes(key)) {
          event[key] = hit._source[key]
        }
      })
    }
  }
  return {
    event,
    user: requestKind === requestKinds.users ? hit._source.user : undefined,
    highlights: highlightResult
  }
}

module.exports = formatHit
