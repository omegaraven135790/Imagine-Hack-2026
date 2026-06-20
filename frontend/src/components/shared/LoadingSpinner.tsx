interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }

export default function LoadingSpinner({ size = 'md', className = '' }: Props) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-700 border-t-brand-500 ${SIZES[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
