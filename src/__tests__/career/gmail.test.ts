import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/google-auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

const THREAD_ID = 'thread-001'
const MSG_ID = '<original-id@mail.gmail.com>'

const MOCK_MESSAGE = {
  id: 'msg-001',
  threadId: THREAD_ID,
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'Reply-To', value: 'reply@example.com' },
      { name: 'Subject', value: 'Test thread' },
      { name: 'Message-ID', value: MSG_ID },
      { name: 'References', value: '' },
    ],
    body: { data: Buffer.from('Hello body').toString('base64'), size: 10 },
    parts: [],
  },
}

beforeEach(() => {
  vi.resetModules()
  global.fetch = vi.fn()
})

describe('listMessages', () => {
  it('returns message summaries from inbox', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-001', threadId: THREAD_ID }] }),
      } as unknown as Response)

    const { listMessages } = await import('@/lib/gmail')
    const msgs = await listMessages(10)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].id).toBe('msg-001')
  })

  it('returns empty array when inbox is empty', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as unknown as Response)

    const { listMessages } = await import('@/lib/gmail')
    const msgs = await listMessages()
    expect(msgs).toEqual([])
  })
})

describe('getMessage', () => {
  it('returns full message with headers', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_MESSAGE,
    } as unknown as Response)

    const { getMessage } = await import('@/lib/gmail')
    const msg = await getMessage('msg-001')
    expect(msg.threadId).toBe(THREAD_ID)
    expect(msg.payload.headers.find(h => h.name === 'Subject')?.value).toBe('Test thread')
  })
})

describe('createDraftReply', () => {
  it('creates a draft in the correct thread with Re: subject', async () => {
    vi.mocked(global.fetch)
      // first: getMessage
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_MESSAGE,
      } as unknown as Response)
      // second: drafts.create
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'draft-001', message: { threadId: THREAD_ID } }),
      } as unknown as Response)

    const { createDraftReply } = await import('@/lib/gmail')
    const draft = await createDraftReply('msg-001', 'Hi, here is my reply.')

    expect(draft.id).toBe('draft-001')

    // Inspect what was sent to the drafts endpoint
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(url).toContain('/drafts')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    const raw = Buffer.from(body.message.raw, 'base64url').toString('utf-8')

    expect(raw).toMatch(/^Subject: Re: Test thread/m)
    expect(raw).toMatch(/^To: reply@example.com/m)
    expect(raw).toMatch(`In-Reply-To: ${MSG_ID}`)
    expect(raw).toMatch(`References: ${MSG_ID}`)
    expect(raw).toContain('Hi, here is my reply.')
    expect(body.message.threadId).toBe(THREAD_ID)
  })

  it('does not double-prefix Re: when subject already starts with Re:', async () => {
    const reMsg = {
      ...MOCK_MESSAGE,
      payload: {
        ...MOCK_MESSAGE.payload,
        headers: MOCK_MESSAGE.payload.headers.map(h =>
          h.name === 'Subject' ? { ...h, value: 'Re: Test thread' } : h,
        ),
      },
    }
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => reMsg } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'draft-002', message: { threadId: THREAD_ID } }),
      } as unknown as Response)

    const { createDraftReply } = await import('@/lib/gmail')
    await createDraftReply('msg-001', 'body')

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1]
    const raw = Buffer.from(JSON.parse(init.body).message.raw, 'base64url').toString()
    expect(raw).toMatch(/^Subject: Re: Test thread$/m)
    expect(raw).not.toMatch(/^Subject: Re: Re:/m)
  })
})
