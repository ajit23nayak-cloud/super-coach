import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../..')

describe('no-send invariant', () => {
  it('gmail module exports no send function', async () => {
    const gmail = await import('@/lib/gmail')
    const sendExports = Object.keys(gmail).filter(k =>
      k.toLowerCase().includes('send'),
    )
    expect(sendExports).toHaveLength(0)
  })

  it('no send API route file exists', () => {
    const sendRoute = path.join(srcRoot, 'app', 'api', 'career', 'send', 'route.ts')
    expect(fs.existsSync(sendRoute)).toBe(false)
  })

  it('career-service exports no send function', async () => {
    const svc = await import('@/lib/career-service')
    const sendExports = Object.keys(svc).filter(k =>
      k.toLowerCase().includes('send') && !k.toLowerCase().includes('draft'),
    )
    expect(sendExports).toHaveLength(0)
  })

  it('draft route file does not contain sendMessage call', () => {
    const draftRoute = path.join(srcRoot, 'app', 'api', 'career', 'draft', 'route.ts')
    if (!fs.existsSync(draftRoute)) return // not yet created → trivially passes
    const content = fs.readFileSync(draftRoute, 'utf-8')
    expect(content).not.toMatch(/users\/me\/messages\/send/)
    expect(content).not.toMatch(/\.send\(/)
  })
})
