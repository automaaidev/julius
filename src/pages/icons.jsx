const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconMic(props) {
  return (
    <svg viewBox="0 0 24 24" {...common} {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

export function IconHash(props) {
  return (
    <svg viewBox="0 0 24 24" {...common} {...props}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  )
}

export function IconQueue(props) {
  return (
    <svg viewBox="0 0 24 24" {...common} {...props}>
      <circle cx="8" cy="7" r="3" />
      <path d="M2 21v-1a6 6 0 0 1 6-6" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M14.5 21v-1a5 5 0 0 1 8-4" />
    </svg>
  )
}

export function IconPin(props) {
  return (
    <svg viewBox="0 0 24 24" {...common} {...props}>
      <path d="M12 22s7-7.5 7-12.5a7 7 0 1 0-14 0C5 14.5 12 22 12 22Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  )
}

export function IconPhone(props) {
  return (
    <svg viewBox="0 0 24 24" {...common} {...props}>
      <path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2C9.5 21 3 14.5 3 6a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

export function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" {...common} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}
