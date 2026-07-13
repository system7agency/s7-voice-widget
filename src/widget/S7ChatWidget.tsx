import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'

import { OUTBOUND_CALL_PATH, TEXT_DEFAULTS, type WidgetConfig } from './config'

/**
 * Class-name accessor. The widget's CSS (widget.css) is injected into the host
 * element's Shadow DOM with plain, un-hashed class names, so each style key maps
 * to an identically-named class. This Proxy reproduces the ergonomics of the
 * original CSS-Modules `styles` import (`styles.callCardGlow` -> "callCardGlow")
 * without a build-time CSS-Modules transform, keeping the component body
 * identical to the s7labs original.
 */
const styles = new Proxy(
  {},
  { get: (_target, key: string) => key }
) as Record<string, string>

/** Dispatch this window event to open the chat widget from anywhere (e.g. a header CTA). */
export const OPEN_CHAT_WIDGET_EVENT = 's7:open-chat-widget'

type Role = 'user' | 'ai'
type Mode = 'chat' | 'voice'

type ChatMessage = {
  id: string
  role: Role
  text: string
  timestamp: string
}

type SDKConversation = {
  sendUserMessage: (text: string) => void
  endSession: () => Promise<void>
}

function formatTimestamp(date: Date) {
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

function formatSessionDivider(date: Date) {
  return `${date.toUTCString().slice(17, 22)} UTC`
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Accept any valid CSS color, drop anything else. Values land in inline
 * `style` custom properties (never innerHTML), so this guards against broken
 * styling rather than injection — but embedders pass arbitrary attribute
 * strings, so validate anyway.
 */
function sanitizeColor(value?: string): string | undefined {
  const v = value?.trim()
  if (!v) return undefined
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    if (CSS.supports('color', v)) return v
    console.warn(`[S7ChatWidget] ignoring invalid color value: "${v}"`)
    return undefined
  }
  // No CSS.supports available: allow plain color-ish tokens only.
  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(v) ? v : undefined
}

/**
 * Embed-time color overrides as CSS custom properties, applied inline on the
 * widget root. widget.css defines the defaults on `.root`; inline styles win,
 * and custom properties cascade to everything inside — so one variable drives
 * every use of that color. Returns undefined when nothing is overridden, so a
 * stock embed renders exactly as before.
 */
function themeVars(config: WidgetConfig): React.CSSProperties | undefined {
  const vars: Record<string, string> = {}

  const accent = sanitizeColor(config.accent)
  if (accent) {
    vars['--s7-accent'] = accent
    vars['--s7-accent-dim'] = `color-mix(in srgb, ${accent} 18%, transparent)`
    vars['--s7-accent-glow'] = `color-mix(in srgb, ${accent} 35%, transparent)`
  }

  const bg = sanitizeColor(config.bg)
  if (bg) vars['--s7-panel-bg'] = bg

  const fg = sanitizeColor(config.textColor)
  if (fg) vars['--s7-fg'] = fg

  // The orb gradient (launcher button, header dot, avatar, voice orb) keys
  // off `buttonBg`, falling back to the accent per the theming contract.
  // Glossy glass sphere: a top sheen over a specular-lit body (white
  // highlight → accent core → dark rim), matching the default look while
  // adapting to any override color. See --s7-orb-bg in widget.css.
  const orb = sanitizeColor(config.buttonBg) ?? accent
  if (orb) {
    vars['--s7-orb-bg'] =
      `radial-gradient(90% 55% at 50% 5%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 46%), ` +
      `radial-gradient(circle at 33% 27%, #ffffff 0%, ` +
      `color-mix(in srgb, ${orb} 30%, #ffffff) 7%, ` +
      `color-mix(in srgb, ${orb} 80%, #ffffff) 40%, ${orb} 60%, ` +
      `color-mix(in srgb, ${orb} 55%, #000000) 84%, color-mix(in srgb, ${orb} 22%, #000000) 100%)`
  }

  return Object.keys(vars).length ? (vars as React.CSSProperties) : undefined
}

export function S7ChatWidget({ config }: { config: WidgetConfig }) {
  const agentId = config.agentId
  const enabled = config.enabled

  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const openWidget = () => setOpen(true)
    window.addEventListener(OPEN_CHAT_WIDGET_EVENT, openWidget)
    return () => window.removeEventListener(OPEN_CHAT_WIDGET_EVENT, openWidget)
  }, [])

  useEffect(() => {
    if (!(open && isMobile)) return
    // iOS Safari: `overflow: hidden` on body doesn't reliably block scroll
    // and loses scroll position on toggle. Use the position:fixed pattern.
    const scrollY = window.scrollY
    const body = document.body
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [open, isMobile])

  if (!enabled || !agentId) return null

  if (!open) {
    return (
      <div className={styles.root} style={themeVars(config)}>
        <button
          type="button"
          className={styles.bubble}
          onClick={() => setOpen(true)}
          aria-label={config.title ? `Open ${config.title} chat` : 'Open system7 chat'}
        >
          <span className={styles.orb} aria-hidden />
          <span className={styles.pill}>
            {config.buttonLabel ?? (
              <>
                {'Ask system'}
                <sup className="wordmark-superscript">7</sup>
              </>
            )}{' '}
            <span className={styles.pillArrow}>→</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <ConversationProvider>
      <S7ChatPanel
        config={config}
        isMobile={isMobile}
        onClose={() => setOpen(false)}
        onMinimize={() => setOpen(false)}
      />
    </ConversationProvider>
  )
}

const COUNTRY_CODES = [
  { flag: '🇺🇸', code: '+1', country: 'United States' },
  { flag: '🇬🇧', code: '+44', country: 'United Kingdom' },
  { flag: '🇮🇳', code: '+91', country: 'India' },
  { flag: '🇵🇰', code: '+92', country: 'Pakistan' },
  { flag: '🇫🇷', code: '+33', country: 'France' },
  { flag: '🇩🇪', code: '+49', country: 'Germany' },
  { flag: '🇦🇺', code: '+61', country: 'Australia' },
  { flag: '🇦🇪', code: '+971', country: 'United Arab Emirates' },
]

type VoiceView = 'options' | 'getcall'
type CallFormStatus = 'idle' | 'loading' | 'success'

function S7ChatPanel({
  config,
  isMobile,
  onClose,
  onMinimize,
}: {
  config: WidgetConfig
  isMobile: boolean
  onClose: () => void
  onMinimize: () => void
}) {
  const agentId = config.agentId
  const PUBLIC_PHONE = config.publicPhone

  const [mode, setMode] = useState<Mode>('chat')
  // Optional embed-time greeting, seeded as the first assistant message.
  // Absent (the default) the chat starts empty, as it always has.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    config.greeting
      ? [{ id: makeId(), role: 'ai', text: config.greeting, timestamp: formatTimestamp(new Date()) }]
      : []
  )
  const [input, setInput] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [sessionStart] = useState(() => new Date())

  const [callDuration, setCallDuration] = useState(0)
  const [voiceStatusText, setVoiceStatusText] = useState<string>('')

  // "Get a call" / "Call us directly" picker state (voice-idle).
  const [voiceView, setVoiceView] = useState<VoiceView>('options')
  const [countryCode, setCountryCode] = useState('+1')
  const [phoneInput, setPhoneInput] = useState('')
  const [callFormStatus, setCallFormStatus] = useState<CallFormStatus>('idle')
  const [callFormError, setCallFormError] = useState<string | null>(null)
  const [successMasked, setSuccessMasked] = useState('')
  const [copied, setCopied] = useState(false)
  const successTimerRef = useRef<number | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const chatConvoRef = useRef<SDKConversation | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const lastSentRef = useRef<string | null>(null)

  const conversation = useConversation({
    onDisconnect: () => {
      setVoiceStatusText('')
      setCallDuration(0)
    },
    onModeChange: ({ mode: agentMode }: { mode: 'speaking' | 'listening' }) => {
      setVoiceStatusText(agentMode === 'speaking' ? 'SPEAKING…' : 'LISTENING…')
    },
    onError: (msg: string, context?: unknown) => {
      console.error('[S7ChatWidget] voice onError:', msg, context)
    },
  })

  const voiceStatus = conversation.status
  const isCallActive = voiceStatus === 'connecting' || voiceStatus === 'connected'

  const pushMessage = useCallback((role: Role, text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role, text, timestamp: formatTimestamp(new Date()) },
    ])
  }, [])

  useEffect(() => {
    if (mode !== 'chat' || chatConvoRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const { Conversation } = await import('@elevenlabs/client')
        if (cancelled) return
        const convo = await Conversation.startSession({
          agentId,
          connectionType: 'websocket',
          overrides: { conversation: { textOnly: true } },
          onConnect: ({ conversationId }: { conversationId: string }) => {
            console.warn('[S7ChatWidget] Connection established (chat):', conversationId)
          },
          onMessage: ({ source, message }: { source: Role; message: string }) => {
            if (source === 'ai') {
              setIsWaiting(false)
              pushMessage('ai', message)
            } else if (source === 'user' && message !== lastSentRef.current) {
              pushMessage('user', message)
            }
          },
          onError: (msg: string, context?: unknown) => {
            console.error('[S7ChatWidget] chat onError:', msg, context)
            setIsWaiting(false)
            setErrorMsg(msg || 'Connection error')
          },
          onDisconnect: () => {
            chatConvoRef.current = null
          },
        })
        if (cancelled) {
          await convo.endSession()
          return
        }
        chatConvoRef.current = convo as unknown as SDKConversation
      } catch (err) {
        console.error('[S7ChatWidget] chat connect catch:', err)
        setErrorMsg(err instanceof Error ? err.message : 'Failed to connect')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, agentId, pushMessage])

  useEffect(() => {
    return () => {
      chatConvoRef.current?.endSession().catch(() => {})
      chatConvoRef.current = null
    }
  }, [])

  useEffect(() => {
    if (mode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isWaiting, mode])

  useEffect(() => {
    if (voiceStatus !== 'connected') return
    const id = window.setInterval(() => {
      setCallDuration((d) => d + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [voiceStatus])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isWaiting) return
    setErrorMsg(null)
    pushMessage('user', text)
    setInput('')
    lastSentRef.current = text
    setIsWaiting(true)
    try {
      if (chatConvoRef.current) {
        chatConvoRef.current.sendUserMessage(text)
      } else {
        setErrorMsg('Not connected yet. Try again in a moment.')
        setIsWaiting(false)
      }
    } catch (err) {
      setIsWaiting(false)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send')
    }
  }, [input, isWaiting, pushMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startVoiceCall = useCallback(() => {
    // iOS Safari: getUserMedia MUST be initiated synchronously inside the
    // gesture handler — no awaits, no setState before it. Capture the promise
    // first, resolve later.
    const micPromise = navigator.mediaDevices.getUserMedia({ audio: true })

    // iOS Safari: audio playback is muted unless an AudioContext is created
    // and a buffer played within the user gesture. Do both synchronously.
    let audioContext: AudioContext | null = null
    try {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AC) {
        audioContext = new AC()
        const buffer = audioContext.createBuffer(1, 1, 22050)
        const source = audioContext.createBufferSource()
        source.buffer = buffer
        source.connect(audioContext.destination)
        source.start(0)
      }
    } catch (e) {
      console.warn('[S7ChatWidget] audio unlock failed:', e)
    }

    // Eager UI feedback now that the gesture-bound work is done.
    setCallDuration(0)
    setVoiceStatusText('')
    setErrorMsg(null)

    void (async () => {
      try {
        if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume()
        }

        // Resolve the mic permission promise so any rejection surfaces here
        // (rather than from the SDK's own getUserMedia call). Then release our
        // hold — the SDK will reacquire; iOS keeps the permission cached.
        const stream = await micPromise
        stream.getTracks().forEach((t) => t.stop())

        await conversation.startSession({ agentId, connectionType: 'websocket' })

        // Ensure any <audio> elements the SDK created play inline on iOS
        // instead of triggering the fullscreen player.
        requestAnimationFrame(() => {
          document.querySelectorAll('audio').forEach((a) => {
            ;(a as unknown as { playsInline: boolean }).playsInline = true
            a.setAttribute('playsinline', '')
            a.setAttribute('webkit-playsinline', '')
          })
        })
      } catch (err) {
        console.error('[S7ChatWidget] voice start failed:', err)
        const name = (err as { name?: string })?.name
        if (name === 'NotAllowedError') {
          setErrorMsg('Microphone access denied. Enable it in Settings → Safari → Microphone.')
        } else if (name === 'NotFoundError') {
          setErrorMsg('No microphone found.')
        } else if (name === 'NotReadableError') {
          setErrorMsg('Microphone in use by another app. Close other apps and try again.')
        } else {
          setErrorMsg(err instanceof Error ? `Voice failed: ${err.message}` : 'Voice failed')
        }
      }
    })()
  }, [agentId, conversation])

  const endVoiceCall = useCallback(() => {
    setVoiceStatusText('')
    try {
      conversation.endSession()
    } catch {
      /* ignore */
    }
  }, [conversation])

  // --- "Get a call" form ---
  const phoneDigits = phoneInput.replace(/\D/g, '')
  const phoneValid = phoneDigits.length >= 7 && phoneDigits.length <= 15
  const e164 = `${countryCode}${phoneDigits}`

  const resetCallForm = useCallback(() => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
    setVoiceView('options')
    setCallFormStatus('idle')
    setCallFormError(null)
    setPhoneInput('')
    setSuccessMasked('')
  }, [])

  const handleGetCallSubmit = useCallback(async () => {
    if (!phoneValid || callFormStatus === 'loading') return
    setCallFormStatus('loading')
    setCallFormError(null)
    try {
      const res = await fetch(`${config.apiBase}${OUTBOUND_CALL_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: e164 }),
      })
      if (res.ok) {
        setSuccessMasked(`${countryCode}•••••${phoneDigits.slice(-4)}`)
        setCallFormStatus('success')
        successTimerRef.current = window.setTimeout(() => {
          resetCallForm()
        }, 30_000)
        return
      }
      setCallFormStatus('idle')
      if (res.status === 400) {
        setCallFormError('Invalid phone number')
      } else if (res.status === 429) {
        setCallFormError('Too many requests. Try again in an hour')
      } else {
        setCallFormError('Couldn’t place call. Please try again or use browser voice instead')
      }
    } catch {
      setCallFormStatus('idle')
      setCallFormError('Couldn’t place call. Please try again or use browser voice instead')
    }
  }, [phoneValid, callFormStatus, e164, countryCode, phoneDigits, resetCallForm, config.apiBase])

  const handleCopyNumber = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_PHONE)
      setCopied(true)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }, [PUBLIC_PHONE])

  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (mode === 'voice') {
      if (isCallActive) endVoiceCall()
      resetCallForm()
    }
    setMode(next)
  }

  const closeWidget = () => {
    chatConvoRef.current?.endSession().catch(() => {})
    chatConvoRef.current = null
    if (isCallActive) {
      conversation.endSession()
    }
    resetCallForm()
    onClose()
  }

  return (
    <div className={`${styles.root} ${styles.rootOpen}`} style={themeVars(config)}>
      <div className={styles.panel} role="dialog" aria-label={config.title || 'system7'}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerLabelRow}>
              <span className={styles.miniOrb} aria-hidden />
              <span className={styles.headerLabel}>
                {config.title ?? (
                  <>
                    system<sup className="wordmark-superscript">7</sup>
                  </>
                )}
              </span>
            </div>
            <div className={styles.statusLine}>
              {mode === 'voice' && voiceStatus === 'connected' ? (
                <>
                  <span className={styles.statusDotGreen}>●</span> CONNECTED
                </>
              ) : (
                <>
                  <span className={styles.statusDot}>●</span> ONLINE
                </>
              )}
            </div>
            <div className={styles.modeToggle} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'chat'}
                className={`${styles.modeBtn} ${mode === 'chat' ? styles.modeBtnActive : ''}`}
                onClick={() => switchMode('chat')}
              >
                CHAT
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'voice'}
                className={`${styles.modeBtn} ${mode === 'voice' ? styles.modeBtnActive : ''}`}
                onClick={() => switchMode('voice')}
              >
                VOICE
              </button>
            </div>
          </div>
          <div className={styles.headerButtons}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onMinimize}
              aria-label="Minimize"
            >
              –
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={closeWidget}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {mode === 'chat' ? (
          <>
            <div className={styles.messages}>
              <div className={styles.divider}>{formatSessionDivider(sessionStart)}</div>

              {messages.map((m) => {
                const isUser = m.role === 'user'
                return (
                  <div key={m.id} className={`${styles.msg} ${isUser ? styles.msgUser : ''}`}>
                    {isUser ? (
                      <span className={`${styles.avatar} ${styles.avatarUser}`}>YOU</span>
                    ) : (
                      <span className={styles.avatar} aria-hidden />
                    )}
                    <div className={styles.msgBody}>
                      <div className={styles.msgMeta}>
                        {isUser ? 'you' : 'system7'} · {m.timestamp}
                      </div>
                      <div className={`${styles.bubbleBody} ${isUser ? styles.bubbleUser : ''}`}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                )
              })}

              {isWaiting && (
                <div className={styles.msg}>
                  <span className={styles.avatar} aria-hidden />
                  <div className={styles.msgBody}>
                    <div className={styles.msgMeta}>system7</div>
                    <div className={styles.bubbleBody}>
                      <span className={styles.typing}>
                        thinking
                        <span className={styles.caret} />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className={styles.msg}>
                  <span className={styles.avatar} aria-hidden />
                  <div className={styles.msgBody}>
                    <div className={styles.msgMeta}>system7 · error</div>
                    <div className={`${styles.bubbleBody} ${styles.error}`}>{errorMsg}</div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className={styles.input}>
              <input
                className={styles.field}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={config.placeholder ?? TEXT_DEFAULTS.placeholder}
                aria-label="Chat input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="button"
                className={`${styles.send} ${config.cta ? styles.sendWide : ''}`}
                onClick={handleSend}
                disabled={!input.trim() || isWaiting}
                aria-label="Send message"
              >
                {config.cta ?? TEXT_DEFAULTS.cta}
              </button>
            </div>
          </>
        ) : isCallActive || voiceStatus === 'error' ? (
          /* Active in-browser WebRTC call (unchanged flow). */
          <div className={styles.voicePane}>
            <span
              className={`${styles.voiceOrb} ${isCallActive ? styles.voiceOrbActive : ''}`}
              aria-hidden
            />

            {voiceStatus === 'connecting' && (
              <>
                <div className={styles.voicePrompt}>CONNECTING…</div>
                <button
                  type="button"
                  className={`${styles.voiceStartBtn} ${styles.voiceEndBtn}`}
                  onClick={endVoiceCall}
                  aria-label="Cancel"
                >
                  <PhoneIcon rotated />
                </button>
              </>
            )}

            {voiceStatus === 'connected' && (
              <>
                <div className={styles.voiceTimer}>{formatDuration(callDuration)}</div>
                {voiceStatusText && <div className={styles.voiceStatusText}>{voiceStatusText}</div>}
                <button
                  type="button"
                  className={`${styles.voiceStartBtn} ${styles.voiceEndBtn}`}
                  onClick={endVoiceCall}
                  aria-label="End call"
                >
                  <PhoneIcon rotated />
                </button>
              </>
            )}

            {voiceStatus === 'error' && (
              <>
                <div className={styles.voicePrompt}>Voice error</div>
                <button type="button" className={styles.voiceRetry} onClick={startVoiceCall}>
                  TRY AGAIN
                </button>
              </>
            )}

            {errorMsg && voiceStatus !== 'connected' && (
              <div className={styles.voiceError}>{errorMsg}</div>
            )}
          </div>
        ) : (
          /* voice-idle: three-option picker / get-a-call form. */
          <div className={styles.voicePane}>
            <span className={`${styles.voiceOrb} ${styles.voiceOrbSm}`} aria-hidden />

            {voiceView === 'options' ? (
              <div className={styles.callOptions}>
                <button
                  type="button"
                  className={`${styles.callCard} ${styles.callCardGlow}`}
                  onClick={startVoiceCall}
                >
                  <span className={styles.callCardIcon} aria-hidden>
                    <HeadphonesIcon />
                  </span>
                  <span className={styles.callCardText}>
                    <span className={styles.callCardLabel}>Talk in browser</span>
                    <span className={styles.callCardSub}>
                      Voice chat through your speakers and mic
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className={`${styles.callCard} ${styles.callCardGlow}`}
                  onClick={() => {
                    setCallFormError(null)
                    setVoiceView('getcall')
                  }}
                >
                  <span className={styles.callCardIcon} aria-hidden>
                    <PhoneIncomingIcon />
                  </span>
                  <span className={styles.callCardText}>
                    <span className={styles.callCardLabel}>Get a call</span>
                    <span className={styles.callCardSub}>
                      Enter your number, our agent will call you
                    </span>
                  </span>
                </button>

                {isMobile && PUBLIC_PHONE ? (
                  <a
                    className={styles.callCard}
                    href={`tel:${PUBLIC_PHONE.replace(/[^\d+]/g, '')}`}
                  >
                    <span className={styles.callCardIcon} aria-hidden>
                      <PhoneOutgoingIcon />
                    </span>
                    <span className={styles.callCardText}>
                      <span className={styles.callCardLabel}>Call us directly</span>
                      <span className={`${styles.callCardSub} ${styles.callCardSubMono}`}>
                        {PUBLIC_PHONE}
                      </span>
                    </span>
                  </a>
                ) : PUBLIC_PHONE ? (
                  <button type="button" className={styles.callCard} onClick={handleCopyNumber}>
                    <span className={styles.callCardIcon} aria-hidden>
                      <PhoneOutgoingIcon />
                    </span>
                    <span className={styles.callCardText}>
                      <span className={styles.callCardLabel}>
                        Call us directly
                        {copied && <span className={styles.copiedToast}>Copied</span>}
                      </span>
                      <span className={`${styles.callCardSub} ${styles.callCardSubMono}`}>
                        {PUBLIC_PHONE}
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            ) : callFormStatus === 'success' ? (
              <div className={styles.callSuccess}>
                <span className={styles.callRing} aria-hidden />
                <div className={styles.callSuccessText}>
                  Calling you at {successMasked} — answer your phone
                </div>
                <button type="button" className={styles.voiceBack} onClick={resetCallForm}>
                  ← BACK TO OPTIONS
                </button>
              </div>
            ) : (
              <form
                className={styles.callForm}
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleGetCallSubmit()
                }}
              >
                <div className={styles.callFormRow}>
                  <select
                    className={styles.callCode}
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="Country code"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {`${c.flag}  ${c.code}`}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.callPhoneInput}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="phone number"
                    aria-label="Phone number"
                  />
                </div>

                {callFormError && <div className={styles.callFormError}>{callFormError}</div>}

                <button
                  type="submit"
                  className={styles.callSubmit}
                  disabled={!phoneValid || callFormStatus === 'loading'}
                >
                  {callFormStatus === 'loading' ? (
                    <>
                      <span className={styles.callSpinner} aria-hidden /> Calling…
                    </>
                  ) : (
                    'Call me'
                  )}
                </button>

                <button
                  type="button"
                  className={styles.voiceBack}
                  onClick={resetCallForm}
                  disabled={callFormStatus === 'loading'}
                >
                  ← BACK
                </button>
              </form>
            )}

            {errorMsg && <div className={styles.voiceError}>{errorMsg}</div>}
          </div>
        )}

        <div className={styles.footer}>
          <span>POWERED BY ELEVENLABS</span>
          <span>
            system<sup className="wordmark-superscript">7</sup> · v1.0
          </span>
        </div>
      </div>
    </div>
  )
}

function PhoneIcon({ rotated = false }: { rotated?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={rotated ? { transform: 'rotate(135deg)' } : undefined}
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function cardIconProps() {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

function HeadphonesIcon() {
  return (
    <svg {...cardIconProps()}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

function PhoneIncomingIcon() {
  return (
    <svg {...cardIconProps()}>
      <polyline points="16 2 16 8 22 8" />
      <line x1="22" y1="2" x2="16" y2="8" />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function PhoneOutgoingIcon() {
  return (
    <svg {...cardIconProps()}>
      <polyline points="23 7 23 1 17 1" />
      <line x1="16" y1="8" x2="23" y2="1" />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}
