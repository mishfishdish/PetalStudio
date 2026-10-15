import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const port = Number(process.env.PORT || 8080)
const garageKey = process.env.GARAGE_API_KEY || ''
const clients = new Set()
const controllers = new Set()

const safeEqual = (left, right) => {
  const a = Buffer.from(left || '')
  const b = Buffer.from(right || '')
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

const send = (socket, message) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

const broadcastControllerStatus = () => {
  const message = { type: 'controller-status', online: controllers.size > 0 }
  clients.forEach((socket) => send(socket, message))
}

const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ ok: true, controllers: controllers.size }))
})

const sockets = new WebSocketServer({ server, path: '/garage' })

sockets.on('connection', (socket) => {
  socket.isAlive = true
  socket.role = null

  const authTimeout = setTimeout(() => socket.close(4001, 'Authentication timeout'), 5000)

  socket.on('pong', () => { socket.isAlive = true })

  socket.on('message', (data) => {
    let message
    try {
      message = JSON.parse(data.toString())
    } catch {
      return socket.close(4002, 'Invalid message')
    }

    if (!socket.role) {
      if (message.type !== 'auth' || !safeEqual(message.key, garageKey)) {
        return socket.close(4003, 'Authentication failed')
      }
      if (message.role !== 'client' && message.role !== 'controller') {
        return socket.close(4004, 'Invalid role')
      }

      clearTimeout(authTimeout)
      socket.role = message.role
      const group = socket.role === 'controller' ? controllers : clients
      group.add(socket)
      send(socket, { type: 'ready', controllerOnline: controllers.size > 0 })
      broadcastControllerStatus()
      return
    }

    if (socket.role === 'client' && message.type === 'command') {
      if (message.action !== 'pulse' || typeof message.id !== 'string') return
      if (controllers.size === 0) {
        return send(socket, { type: 'error', id: message.id, message: 'Garage controller is offline' })
      }
      controllers.forEach((controller) => send(controller, message))
      send(socket, { type: 'delivered', id: message.id })
    }

    if (socket.role === 'controller' && message.type === 'ack') {
      clients.forEach((client) => send(client, message))
    }
  })

  socket.on('close', () => {
    clearTimeout(authTimeout)
    clients.delete(socket)
    const controllerDisconnected = controllers.delete(socket)
    if (controllerDisconnected) broadcastControllerStatus()
  })
})

const heartbeat = setInterval(() => {
  sockets.clients.forEach((socket) => {
    if (!socket.isAlive) return socket.terminate()
    socket.isAlive = false
    socket.ping()
  })
}, 30000)

sockets.on('close', () => clearInterval(heartbeat))

server.listen(port, () => {
  console.log(`Garage WebSocket relay listening on port ${port}`)
})
