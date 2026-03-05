import { HistoryLabSearch, loadConfig } from './src/core/index.js'

const search = new HistoryLabSearch(loadConfig({
  vectorApiKey: 'historylab-public-api-2026',
}))

async function main() {
  console.log('--- Corpus: listCorpora ---')
  const corpora = await search.listCorpora()
  console.log(`${corpora.length} corpora:`, corpora.map(c => `${c.id} (${c.docCount} docs)`).join(', '))

  console.log('\n--- Corpus: getTotals ---')
  const totals = await search.getTotals()
  console.log(`Total: ${totals.docs} docs, ${totals.pages} pages, ${totals.words} words`)

  console.log('\n--- Corpus: searchDocs (vietnam, CIA) ---')
  const corpusResults = await search.corpusSearch({
    query: 'vietnam war',
    corpus: 'cia',
    limit: 3,
  })
  console.log(`${corpusResults.totalCount} total results, showing ${corpusResults.documents.length}:`)
  for (const doc of corpusResults.documents) {
    console.log(`  [${doc.classification}] ${doc.title} (${doc.date})`)
  }

  console.log('\n--- Corpus: searchFrus (kissinger to nixon) ---')
  const frus = await search.frusSearch({
    from: 'kissinger',
    to: 'nixon',
    limit: 3,
  })
  console.log(`${frus.totalCount} total results, showing ${frus.documents.length}:`)
  for (const doc of frus.documents) {
    console.log(`  ${doc.from} → ${doc.to}: ${doc.title} (${doc.date})`)
  }

  console.log('\n--- Corpus: getEntities (cuba) ---')
  const entities = await search.lookupEntities({ query: 'cuba', limit: 5 })
  for (const e of entities) {
    console.log(`  ${e.name} (${e.group}) - ${e.docCount} docs - ${e.wikidataId}`)
  }

  console.log('\n--- Vector: search (Cuban Missile Crisis) ---')
  const vectorResults = await search.vectorSearch({
    query: 'Cuban Missile Crisis nuclear confrontation',
    limit: 3,
  })
  for (const r of vectorResults) {
    console.log(`  [${r.bestScore.toFixed(3)}] ${r.fileInfo.metadata?.title ?? r.fileInfo.name}`)
    console.log(`    Chunk: ${r.chunks[0]?.text.slice(0, 120)}...`)
  }

  console.log('\n--- All tests passed ---')
}

main().catch(console.error)
