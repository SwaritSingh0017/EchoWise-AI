'use client'

import { useEffect, useState } from 'react'
import { Leaf } from 'lucide-react'

export default function LeavesBackground() {
  const [leaves, setLeaves] = useState<{ id: number; left: string; top: string; duration: string; delay: string; size: number; rotation: number }[]>([])

  useEffect(() => {
    const newLeaves = Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      duration: `${Math.random() * 20 + 20}s`, // Original: 20-40s
      delay: `${Math.random() * -20}s`,
      size: Math.random() * 20 + 10, // Original: 10-30px
      rotation: Math.random() * 360,
    }))
    setLeaves(newLeaves)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-20">
      {leaves.map((leaf) => (
        <div
          key={leaf.id}
          className="absolute animate-float"
          style={{
            left: leaf.left,
            top: leaf.top,
            animationDuration: leaf.duration,
            animationDelay: leaf.delay,
          }}
        >
          <Leaf
            size={leaf.size}
            className="text-green-500"
            style={{ transform: `rotate(${leaf.rotation}deg)` }}
          />
        </div>
      ))}
    </div>
  )
}
