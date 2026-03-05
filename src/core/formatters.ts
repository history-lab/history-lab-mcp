import type {
  Document, FrusDocument, EnrichedDocument,
  VectorSearchResult, CorpusSearchResult, FrusSearchResult,
  Corpus, Entity, Topic, TopicDoc,
  ClassificationInfo, Totals, DecadeStats,
} from './types.js'

// ============================================================
// Search Results
// ============================================================

export function formatVectorResults(results: VectorSearchResult[]): string {
  if (results.length === 0) return 'No results found.'

  const lines: string[] = [`**${results.length} results:**\n`]

  for (const r of results) {
    const meta = r.fileInfo.metadata as Record<string, string | undefined>
    const title = meta?.title ?? r.fileInfo.name
    const corpus = meta?.corpus ? `[${meta.corpus}]` : ''
    const date = meta?.date ? formatDate(meta.date) : ''
    const classification = meta?.classification ? ` | ${meta.classification}` : ''

    lines.push(`### ${title}`)
    lines.push(`Score: **${r.bestScore.toFixed(3)}** ${corpus} ${date}${classification}\n`)

    for (const chunk of r.chunks.slice(0, 2)) {
      lines.push(`> ${chunk.text.slice(0, 500)}${chunk.text.length > 500 ? '...' : ''}\n`)
    }

    if (r.fileInfo.r2Key) {
      lines.push(`Document key: \`${r.fileInfo.r2Key}\`\n`)
    }
  }

  return lines.join('\n')
}

export function formatCorpusResults(result: CorpusSearchResult): string {
  if (result.documents.length === 0) return 'No results found.'

  const countInfo = result.totalCount != null
    ? `Showing ${result.documents.length} of ${result.totalCount.toLocaleString()} results`
    : `${result.documents.length} results`

  const lines: string[] = [`**${countInfo}:**\n`]

  for (const doc of result.documents) {
    lines.push(formatDocSummary(doc))
  }

  return lines.join('\n')
}

export function formatFrusResults(result: FrusSearchResult): string {
  if (result.documents.length === 0) return 'No results found.'

  const countInfo = result.totalCount != null
    ? `Showing ${result.documents.length} of ${result.totalCount.toLocaleString()} results`
    : `${result.documents.length} results`

  const lines: string[] = [`**${countInfo}:**\n`]

  for (const doc of result.documents) {
    lines.push(formatFrusDocSummary(doc))
  }

  return lines.join('\n')
}

// ============================================================
// Documents
// ============================================================

export function formatDocument(doc: Document): string {
  const lines: string[] = [
    `# ${doc.title}\n`,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Doc ID | \`${doc.docId}\` |`,
    `| Corpus | ${doc.corpus} |`,
    `| Date | ${doc.date ? formatDate(doc.date) : 'Unknown'} |`,
    `| Classification | ${doc.classification ?? 'Unknown'} |`,
  ]

  if (doc.wordCount) lines.push(`| Words | ${doc.wordCount.toLocaleString()} |`)
  if (doc.pageCount) lines.push(`| Pages | ${doc.pageCount.toLocaleString()} |`)
  if (doc.language) lines.push(`| Language | ${doc.language} |`)
  if (doc.source) lines.push(`| Source | ${doc.source} |`)

  lines.push('')

  if (doc.body) {
    lines.push(`## Text\n`)
    lines.push(doc.body)
  }

  return lines.join('\n')
}

export function formatFrusDocument(doc: FrusDocument): string {
  const lines: string[] = [
    `# ${doc.title}\n`,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Doc ID | \`${doc.docId}\` |`,
    `| Date | ${doc.date ? formatDate(doc.date) : 'Unknown'} |`,
    `| Classification | ${doc.classification ?? 'Unknown'} |`,
  ]

  if (doc.from) lines.push(`| From | ${doc.from} |`)
  if (doc.to) lines.push(`| To | ${doc.to} |`)
  if (doc.location) lines.push(`| Location | ${doc.location} |`)
  if (doc.chapterTitle) lines.push(`| Chapter | ${doc.chapterTitle} |`)
  if (doc.subject) lines.push(`| Subject | ${doc.subject} |`)
  if (doc.source) lines.push(`| Source | ${doc.source} |`)

  lines.push('')

  if (doc.keyContentSummary) {
    const s = doc.keyContentSummary
    lines.push(`## AI Summary\n`)
    if (s.primaryCorrespondence) lines.push(`**Primary:** ${s.primaryCorrespondence}\n`)
    if (s.secondaryDocument) lines.push(`**Secondary:** ${s.secondaryDocument}\n`)
    if (s.mainThemes?.length) lines.push(`**Themes:** ${s.mainThemes.join(', ')}\n`)
    if (s.keyQuote) lines.push(`**Key Quote:** "${s.keyQuote}"\n`)
    if (s.dateRange) lines.push(`**Date Range:** ${s.dateRange}\n`)
  }

  if (doc.body) {
    lines.push(`## Text\n`)
    lines.push(doc.body)
  }

  return lines.join('\n')
}

export function formatEnrichedDocument(doc: EnrichedDocument): string {
  const base = formatDocument(doc)
  const lines: string[] = [base]

  if (doc.entities.length > 0) {
    lines.push(`\n## Entities\n`)
    for (let i = 0; i < doc.entities.length; i++) {
      const wikidata = doc.wikidataIds[i] ? ` (${doc.wikidataIds[i]})` : ''
      lines.push(`- **${doc.entities[i]}** [${doc.entityGroups[i]}]${wikidata}`)
    }
  }

  if (doc.topicNames.length > 0) {
    lines.push(`\n## Topics\n`)
    for (let i = 0; i < doc.topicNames.length; i++) {
      const score = doc.topicScores[i] != null ? ` (${doc.topicScores[i].toFixed(3)})` : ''
      lines.push(`- ${doc.topicNames[i]}${score}`)
    }
  }

  return lines.join('\n')
}

// ============================================================
// Browse / Reference
// ============================================================

export function formatCorpora(corpora: Corpus[]): string {
  const lines: string[] = [
    `**${corpora.length} collections:**\n`,
    `| Corpus | Title | Docs | Pages | Words | Date Range |`,
    `|--------|-------|------|-------|-------|------------|`,
  ]

  for (const c of corpora) {
    const pages = c.pageCount != null ? c.pageCount.toLocaleString() : '--'
    const dateRange = c.beginDate && c.endDate
      ? `${c.beginDate.slice(0, 4)}-${c.endDate.slice(0, 4)}`
      : '--'
    lines.push(
      `| \`${c.id}\` | ${c.title} | ${c.docCount.toLocaleString()} | ${pages} | ${c.wordCount.toLocaleString()} | ${dateRange} |`
    )
  }

  return lines.join('\n')
}

export function formatEntities(entities: Entity[]): string {
  if (entities.length === 0) return 'No entities found.'

  const lines: string[] = [
    `**${entities.length} entities:**\n`,
    `| Entity | Type | Documents | Wikidata |`,
    `|--------|------|-----------|----------|`,
  ]

  for (const e of entities) {
    const wikidata = e.wikidataId ? `[${e.wikidataId}](https://www.wikidata.org/wiki/${e.wikidataId})` : '--'
    lines.push(`| ${e.name} | ${e.group} | ${e.docCount.toLocaleString()} | ${wikidata} |`)
  }

  return lines.join('\n')
}

export function formatTopics(topics: Topic[], corpus: string): string {
  if (topics.length === 0) return `No topics found for corpus "${corpus}".`

  const lines: string[] = [
    `**${topics.length} topics for \`${corpus}\`:**\n`,
    `| ID | Title | Keywords |`,
    `|----|-------|----------|`,
  ]

  for (const t of topics) {
    lines.push(`| ${t.topicId} | ${t.title} | ${t.name ?? '--'} |`)
  }

  return lines.join('\n')
}

export function formatTopicDocs(docs: TopicDoc[], corpus: string, topicId: number): string {
  if (docs.length === 0) return 'No documents found for this topic.'

  const lines: string[] = [`**Top ${docs.length} documents for topic ${topicId} in \`${corpus}\`:**\n`]

  for (const d of docs) {
    lines.push(`- \`${d.docId}\` (score: ${d.score.toFixed(3)})`)
  }

  return lines.join('\n')
}

export function formatClassifications(classifications: ClassificationInfo[]): string {
  const lines: string[] = [
    `| Classification | Sensitivity Level |`,
    `|----------------|-------------------|`,
  ]

  for (const c of classifications) {
    lines.push(`| ${c.name} | ${c.sensitivityLevel} (${c.sensitivityLevel === 1 ? 'most sensitive' : c.sensitivityLevel >= 5 ? 'least sensitive' : 'mid'}) |`)
  }

  return lines.join('\n')
}

export function formatTotals(totals: Totals): string {
  return [
    `**Archive Totals:**`,
    `- Documents: ${totals.docs.toLocaleString()}`,
    `- Pages: ${totals.pages.toLocaleString()}`,
    `- Words: ${totals.words.toLocaleString()}`,
  ].join('\n')
}

export function formatDecadeStats(stats: DecadeStats[]): string {
  const lines: string[] = [
    `**Documents by decade:**\n`,
    `| Decade | Documents | Pages | Words |`,
    `|--------|-----------|-------|-------|`,
  ]

  for (const s of stats) {
    lines.push(`| ${s.decade} | ${s.docs.toLocaleString()} | ${s.pages.toLocaleString()} | ${s.words.toLocaleString()} |`)
  }

  return lines.join('\n')
}

// ============================================================
// Helpers
// ============================================================

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

function formatDocSummary(doc: Document): string {
  const date = doc.date ? formatDate(doc.date) : 'Unknown date'
  const classification = doc.classification ? `[${doc.classification}]` : ''
  const words = doc.wordCount ? `${doc.wordCount.toLocaleString()} words` : ''
  const meta = [doc.corpus, date, classification, words].filter(Boolean).join(' | ')

  const lines = [`- **${doc.title}**`, `  ${meta}`, `  ID: \`${doc.docId}\``]

  if (doc.body) {
    lines.push(`  > ${doc.body.slice(0, 200)}${doc.body.length > 200 ? '...' : ''}`)
  }

  lines.push('')
  return lines.join('\n')
}

function formatFrusDocSummary(doc: FrusDocument): string {
  const date = doc.date ? formatDate(doc.date) : 'Unknown date'
  const classification = doc.classification ? `[${doc.classification}]` : ''
  const correspondence = [doc.from, doc.to].filter(Boolean).join(' → ')
  const location = doc.location ? `at ${doc.location}` : ''
  const meta = [date, classification, correspondence, location].filter(Boolean).join(' | ')

  const lines = [`- **${doc.title}**`, `  ${meta}`, `  ID: \`${doc.docId}\``]

  if (doc.subject) {
    lines.push(`  Subject: ${doc.subject}`)
  }

  lines.push('')
  return lines.join('\n')
}
