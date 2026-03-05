/**
 * CLI output helpers. Handles --json and --markdown flags.
 */

export type OutputFormat = 'terminal' | 'json' | 'markdown'

export function getFormat(opts: { json?: boolean; markdown?: boolean }): OutputFormat {
  if (opts.json) return 'json'
  if (opts.markdown) return 'markdown'
  return 'terminal'
}

export function output(data: unknown, markdownFn: () => string, format: OutputFormat): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(data, null, 2))
      break
    case 'markdown':
      console.log(markdownFn())
      break
    case 'terminal':
      console.log(markdownFn())
      break
  }
}

export function errorOut(message: string): never {
  console.error(`Error: ${message}`)
  process.exit(1)
}
