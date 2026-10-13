// Client Work Assistant compliance evaluation CLI.
// Uses synthetic fixtures only and writes the review transcript under .work/.

import { loadEnvConfig } from '@next/env'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAssistantEvaluation } from '../src/lib/portal/assistant-eval-runner'

loadEnvConfig(process.cwd())

async function main(): Promise<void> {
  const transcript = await runAssistantEvaluation()

  console.log(`Model smoke check: ${transcript.model} present on the live key.`)
  for (const result of transcript.results) {
    console.log(
      `${result.pass ? 'PASS' : 'FAIL'}  [${result.cls}] ${result.id} ` +
      `(${result.path}: ${result.outcome})${result.pass ? '' : ' - ' + result.reason}`,
    )
  }

  console.log('\n--- Summary ---')
  for (const [cls, bucket] of Object.entries(transcript.classSummary)) {
    console.log(`${cls}: ${bucket.pass}/${bucket.total}`)
  }
  console.log(
    `\nUsefulness: cited web answers ` +
    `${transcript.usefulness.citedWebAnswers}/${transcript.usefulness.webFixtures}`,
  )

  mkdirSync('.work', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const transcriptPath = `.work/assistant-eval-transcript-${stamp}.json`
  writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2))
  console.log(`\nTranscript for compliance review: ${transcriptPath}`)

  if (!transcript.launchGatePass) {
    console.log('\n=== EVAL FAILED: the assistant switch must stay OFF. ===')
    process.exit(1)
  }
  console.log('\n=== All launch gates passed. Hand the transcript to Anastasia for sign-off. ===')
}

main().catch((error) => {
  console.error('FATAL:', error instanceof Error ? error.message : error)
  process.exit(1)
})
