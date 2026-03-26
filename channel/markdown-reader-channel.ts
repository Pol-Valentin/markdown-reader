#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createConnection } from 'net'
import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// Resolve path to the markdown-reader binary (sibling to channel/ dir)
const __dirname = dirname(fileURLToPath(import.meta.url))
const READER_BINARY = resolve(__dirname, '../src-tauri/target/release/markdown-reader')

// --- Session ID ---
const SESSION_ID = randomUUID()

// --- Workspace detection ---
function getWorkspaceId(): number {
  try {
    const result = execSync(
      'gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell ' +
      '--method org.gnome.Shell.Eval "global.workspace_manager.get_active_workspace_index()"',
      { timeout: 2000, encoding: 'utf-8' }
    )
    const match = result.match(/'(\d+)'/)
    return match ? parseInt(match[1]) : 0
  } catch {
    return 0
  }
}

// --- Socket path ---
function getSocketPath(workspaceId: number): string {
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`
  return `${runtimeDir}/md-reader-ws-${workspaceId}.sock`
}

// --- Ensure Reader GUI is running ---
function pingSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection(socketPath)
    const timeout = setTimeout(() => { conn.destroy(); resolve(false) }, 500)
    conn.on('connect', () => {
      conn.write('__ping__')
    })
    conn.on('data', (data) => {
      clearTimeout(timeout)
      conn.destroy()
      resolve(data.toString() === '__pong__')
    })
    conn.on('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

async function ensureReaderRunning(workspaceId: number, socketPath: string): Promise<void> {
  // Try pinging — handles both missing socket and orphaned socket
  if (await pingSocket(socketPath)) return

  // Clean up orphaned socket
  try { const { unlinkSync } = await import('fs'); unlinkSync(socketPath) } catch {}

  // Launch the reader GUI using absolute path
  const binary = existsSync(READER_BINARY) ? READER_BINARY : 'markdown-reader'
  const child = spawn(binary, [], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  // Wait for socket to become responsive (up to 5s)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500))
    if (await pingSocket(socketPath)) return
  }
}

// --- MCP Server ---
const mcp = new Server(
  { name: 'markdown-reader', version: '1.0.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions:
      'Comments from the Markdown Reader arrive as <channel source="markdown-reader" file="..." heading="..." content_type="..." session_id="...">. ' +
      'They are user feedback on a document you generated or opened. Read the comment and act on the feedback. ' +
      'After acting, reply using the reply tool with the session_id from the tag so the user sees your response in the Reader. ' +
      'Use the open_file tool to open Markdown files in the Reader instead of shell commands.',
  },
)

// --- Tools ---
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'open_file',
      description: 'Open a Markdown file in the Markdown Reader',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Absolute path to the .md file' },
        },
        required: ['path'],
      },
    },
    {
      name: 'reply',
      description: 'Send a reply to the user in the Markdown Reader chat panel',
      inputSchema: {
        type: 'object' as const,
        properties: {
          session_id: { type: 'string', description: 'The session_id from the channel tag' },
          message: { type: 'string', description: 'The reply message (supports markdown)' },
        },
        required: ['session_id', 'message'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = req.params.arguments as Record<string, string>

  if (req.params.name === 'open_file') {
    const path = args.path
    await sendToSocket(`open:${SESSION_ID}:${path}\n`)
    return { content: [{ type: 'text', text: `Opened ${path} in Markdown Reader` }] }
  }

  if (req.params.name === 'reply') {
    const { session_id, message } = args as any
    if (!session_id || !message) {
      throw new Error('reply requires session_id and message parameters')
    }
    const json = JSON.stringify({ text: message })
    await sendToSocket(`reply:${session_id}:${json}\n`)
    return { content: [{ type: 'text', text: 'Reply sent' }] }
  }

  throw new Error(`Unknown tool: ${req.params.name}`)
})

// --- Socket connection ---
let socketReady = false
let socket: ReturnType<typeof createConnection> | null = null

async function sendToSocket(message: string): Promise<void> {
  // Auto-connect if not connected
  if (!socket || !socketReady) {
    await connectAndSubscribe()
    // Wait for the 'connect' event to fire and socketReady to become true
    for (let i = 0; i < 20 && !socketReady; i++) {
      await new Promise(r => setTimeout(r, 250))
    }
  }
  return new Promise((resolve, reject) => {
    if (!socket || !socketReady) {
      reject(new Error('Socket not connected — Reader may not be running'))
      return
    }
    socket.write(message, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function tryReconnectWithoutRelaunch() {
  const interval = setInterval(async () => {
    if (socketReady) {
      clearInterval(interval)
      return
    }
    const workspaceId = getWorkspaceId()
    const socketPath = getSocketPath(workspaceId)
    if (await pingSocket(socketPath)) {
      clearInterval(interval)
      try {
        await connectToSocket(workspaceId, socketPath)
      } catch {}
    }
  }, 5000)
}

async function connectAndSubscribe() {
  const workspaceId = getWorkspaceId()
  const socketPath = getSocketPath(workspaceId)

  await ensureReaderRunning(workspaceId, socketPath)
  await connectToSocket(workspaceId, socketPath)
}

async function connectToSocket(_workspaceId: number, socketPath: string) {

  socket = createConnection(socketPath)

  socket.on('connect', () => {
    socketReady = true
    // Subscribe with our session ID + metadata
    const meta = JSON.stringify({ cwd: process.cwd(), connected_at: Date.now() })
    socket!.write(`subscribe:${SESSION_ID}:${meta}\n`)
  })

  // Handle incoming data (comments from the Reader)
  let buffer = ''
  socket.on('data', (data) => {
    buffer += data.toString()
    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx)
      buffer = buffer.slice(newlineIdx + 1)

      if (line.startsWith('comment:')) {
        const json = line.slice('comment:'.length)
        try {
          const comment = JSON.parse(json)
          // Forward to Claude Code as a channel notification
          mcp.notification({
            method: 'notifications/claude/channel',
            params: {
              content: comment.comment,
              meta: {
                file: comment.file,
                heading: comment.heading,
                selected_text: comment.selected_text,
                content_type: comment.content_type,
                session_id: comment.session_id,
              },
            },
          })
        } catch (err) {
          // Ignore malformed JSON
        }
      }
    }
  })

  socket.on('error', (err) => {
    process.stderr.write(`Socket error: ${err.message}\n`)
    socketReady = false
  })

  socket.on('close', () => {
    socketReady = false
    socket = null
    // Try to reconnect periodically (without relaunching the Reader).
    // If the user manually restarts the Reader, we'll pick it up.
    tryReconnectWithoutRelaunch()
  })
}

// --- Start ---
await mcp.connect(new StdioServerTransport())

// Try to connect at startup (non-blocking). If the Reader is running,
// the session appears in the selector immediately. If not, we'll
// connect lazily on the first open_file call.
tryReconnectWithoutRelaunch()
