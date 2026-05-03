import React, { useState } from 'react'

interface ButtonProps {
  label: string
  onClick: () => void
}

export const MyButton = ({ label, onClick }: ButtonProps) => {
  const [count, setCount] = useState(0)

  const handleClick = () => {
    setCount(count + 1)
    onClick()
  }

  return (
    <button onClick={handleClick} className="my-button">
      {label} ({count})
    </button>
  )
}
