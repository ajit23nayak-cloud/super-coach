import { vi } from 'vitest'

// server-only throws outside Next.js server context; silence it in tests
vi.mock('server-only', () => ({}))
