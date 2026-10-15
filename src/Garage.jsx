import { useEffect, useRef, useState } from 'react'

const SOCKET_URL = import.meta.env.VITE_GARAGE_WEBSOCKET_URL

export default function Garage() {
  const [key, setKey] = useState(() => sessionStorage.getItem('garage-key') || '')
  const [savedKey, setSavedKey] = useState(() => sessionStorage.getItem('garage-key') || '')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('Ready when you are')
  const [controllerOnline, setControllerOnline] = useState(false)
  const socketRef = useRef(null)
  const retryRef = useRef(null)
  const pendingCommandRef = useRef(null)

  useEffect(() => {
    if (!savedKey) return undefined
    let stopped = false

    const connect = () => {
      if (stopped) return
      if (!SOCKET_URL) {
        setStatus('error')
        setMessage('WebSocket relay is not configured')
        return
      }

      setStatus('connecting')
      setMessage('Connecting to garage…')
      const socket = new WebSocket(SOCKET_URL)
      socketRef.current = socket

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'auth', role: 'client', key: savedKey }))
      })

      socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'ready' || data.type === 'controller-status') {
          const online = data.controllerOnline ?? data.online
          setControllerOnline(online)
          setStatus(online ? 'idle' : 'error')
          setMessage(online ? 'Connected — controller online' : 'Garage controller is offline')
        }
        if (data.type === 'delivered' && data.id === pendingCommandRef.current) {
          setStatus('sent')
          setMessage('Command delivered — the door should respond now')
        }
        if (data.type === 'ack' && data.id === pendingCommandRef.current) {
          pendingCommandRef.current = null
          setStatus('sent')
          setMessage('Garage relay activated')
        }
        if (data.type === 'error') {
          setStatus('error')
          setMessage(data.message || 'Garage command failed')
        }
      })

      socket.addEventListener('close', (event) => {
        socketRef.current = null
        setControllerOnline(false)
        if (stopped) return
        setStatus('error')
        setMessage(event.code === 4003 ? 'Incorrect access key' : 'Connection lost — reconnecting…')
        retryRef.current = window.setTimeout(connect, 2000)
      })

      socket.addEventListener('error', () => {
        setStatus('error')
        setMessage('Could not connect to the garage relay')
      })
    }

    connect()
    return () => {
      stopped = true
      window.clearTimeout(retryRef.current)
      socketRef.current?.close()
    }
  }, [savedKey])

  const unlock = (event) => {
    event.preventDefault()
    const trimmedKey = key.trim()
    if (!trimmedKey) return
    sessionStorage.setItem('garage-key', trimmedKey)
    setSavedKey(trimmedKey)
  }

  const triggerGarage = () => {
    const socket = socketRef.current
    if (!controllerOnline || socket?.readyState !== WebSocket.OPEN) return

    const id = crypto.randomUUID()
    pendingCommandRef.current = id
    setStatus('sending')
    setMessage('Sending command…')
    socket.send(JSON.stringify({ type: 'command', action: 'pulse', id, issuedAt: Date.now() }))
  }

  const forgetKey = () => {
    sessionStorage.removeItem('garage-key')
    socketRef.current?.close()
    setSavedKey('')
    setKey('')
    setStatus('idle')
    setMessage('Ready when you are')
  }

  if (!savedKey) {
    return (
      <main className="garage-page">
        <section className="garage-card garage-login">
          <div className="garage-mark" aria-hidden="true">⌂</div>
          <p className="garage-eyebrow">Petal Studios</p>
          <h1>Garage access</h1>
          <p className="garage-copy">Enter your private garage key to continue.</p>
          <form onSubmit={unlock} className="garage-form">
            <label htmlFor="garage-key">Access key</label>
            <input id="garage-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" placeholder="••••••••••••" autoFocus />
            <button type="submit">Unlock controls</button>
          </form>
          <p className="garage-privacy">Stored only in this browser tab.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="garage-page">
      <section className="garage-card">
        <div className="garage-topline">
          <div><p className="garage-eyebrow">Petal Studios</p><h1>Garage</h1></div>
          <span className={`garage-dot ${status}`} aria-hidden="true" />
        </div>
        <div className="garage-door" aria-hidden="true"><div className="garage-door-frame"><span /><span /><span /><span /></div></div>
        <button className={`garage-trigger ${status}`} type="button" onClick={triggerGarage} disabled={!controllerOnline || status === 'sending'}>
          <span className="garage-trigger-icon">↑</span>
          <span>{status === 'sending' ? 'Sending…' : 'Open / close'}</span>
        </button>
        <p className={`garage-status ${status}`} role="status" aria-live="polite">{message}</p>
        <p className="garage-warning">Only operate the door when the doorway is clear and visible.</p>
        <button className="garage-signout" type="button" onClick={forgetKey}>Forget access key</button>
      </section>
    </main>
  )
}
