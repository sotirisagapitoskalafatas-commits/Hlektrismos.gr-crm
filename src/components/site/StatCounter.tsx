import { useRef, useEffect, useState } from 'react'
import { useInView } from 'framer-motion'

interface Props { value?: number; suffix?: string; raw?: string; label: string }

export function StatCounter({ value, suffix='', raw, label }: Props) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once:true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!inView || value == null) return
    let start: number | null = null
    const duration = 1500
    const tick = (ts: number) => {
      if (!start) start = ts
      const ease = 1 - Math.pow(1 - Math.min((ts-start)/duration, 1), 3)
      setCount(Math.floor(ease * value))
      if (ease < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, value])

  return (
    <div ref={ref} className="stat-cell">
      <strong>{raw ?? `${count}${suffix}`}</strong>
      <span>{label}</span>
    </div>
  )
}
