import { useCallback, useEffect, useState } from 'react'

const API_URL = '/api/garage'

export default function Garage() {
  const [key, setKey] = useState(() => sessionStorage.getItem('garage-key') || '')
  const [savedKey, setSavedKey] = useState(() => sessionStorage.getItem('garage-key') || '')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('Ready when you are')

  const request = useCallback(async (options = {}) => {
    const response = await fetch(API_URL, {
      ...options,
      headers: {
        Authorization: `Bearer ${savedKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Garage service unavailable')
    return data
  }, [savedKey])

  useEffect(() => {
    if (!savedKey) return
    let cancelled = false
    request()
      .then((data) => {
        if (cancelled) return
        setStatus(data.status === 'pending' ? 'sending' : 'idle')
        setMessage(
          data.status === 'pending'
            ? 'Command waiting for the garage'
            : data.status === 'expired'
              ? 'Previous command expired — you can try again'
              : 'Connected securely'
        )
      })
      .catch((error) => {
        if (cancelled) return
        setStatus('error')
        setMessage(error.message)
      })
    return () => { cancelled = true }
  }, [request, savedKey])

  const unlock = (event) => {
    event.preventDefault()
    const trimmedKey = key.trim()
    if (!trimmedKey) return
    sessionStorage.setItem('garage-key', trimmedKey)
    setSavedKey(trimmedKey)
  }

  const triggerGarage = async () => {
    if (status === 'sending') return
    setStatus('sending')
    setMessage('Sending command…')
    try {
      await request({ method: 'POST', body: JSON.stringify({ action: 'pulse' }) })
      setStatus('sent')
      setMessage('Command sent — the door should respond shortly')
      window.setTimeout(() => setStatus('idle'), 5000)
    } catch (error) {
      setStatus('error')
      setMessage(error.message)
    }
  }

  const forgetKey = () => {
    sessionStorage.removeItem('garage-key')
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
            <input
              id="garage-key"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••••••"
              autoFocus
            />
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
          <div>
            <p className="garage-eyebrow">Petal Studios</p>
            <h1>Garage</h1>
          </div>
          <span className={`garage-dot ${status}`} aria-hidden="true" />
        </div>

        <div className="garage-door" aria-hidden="true">
          <div className="garage-door-frame">
            <span /><span /><span /><span />
          </div>
        </div>

        <button
          className={`garage-trigger ${status}`}
          type="button"
          onClick={triggerGarage}
          disabled={status === 'sending'}
        >
          <span className="garage-trigger-icon">↑</span>
          <span>{status === 'sending' ? 'Sending…' : 'Open / close'}</span>
        </button>

        <p className={`garage-status ${status}`} role="status" aria-live="polite">
          {message}
        </p>
        <p className="garage-warning">Only operate the door when the doorway is clear and visible.</p>
        <button className="garage-signout" type="button" onClick={forgetKey}>Forget access key</button>
      </section>
    </main>
  )
}
