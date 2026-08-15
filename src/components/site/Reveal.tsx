import { useRef, ReactNode } from 'react'
import { motion, useInView } from 'framer-motion'

interface RevealProps {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}

export function Reveal({ children, delay=0, y=22, className }: RevealProps) {
  const ref   = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once:true, margin:'-8% 0px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity:0, y }}
      animate={inView ? { opacity:1, y:0 } : {}}
      transition={{ duration:0.65, delay, ease:[0.22,1,0.36,1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
