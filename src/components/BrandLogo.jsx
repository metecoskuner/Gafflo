const sizeClasses = {
  sm: {
    mark: 'h-9 w-9',
    logo: 'h-10 w-[126px]',
  },
  md: {
    mark: 'h-11 w-11',
    logo: 'h-12 w-[152px]',
  },
  lg: {
    mark: 'h-14 w-14',
    logo: 'h-16 w-[204px]',
  },
}

export function BrandMark({ className = '', size = 'md' }) {
  const sizes = sizeClasses[size] || sizeClasses.md

  return (
    <img
      src="/brand/gafflo-mark.png"
      alt=""
      aria-hidden="true"
      className={`inline-block shrink-0 object-contain ${sizes.mark} ${className}`}
    />
  )
}

export default function BrandLogo({ className = '', size = 'md', theme = 'light' }) {
  const sizes = sizeClasses[size] || sizeClasses.md
  const src = theme === 'dark' ? '/brand/gafflo-logo-dark.png' : '/brand/gafflo-logo-light.png'

  return (
    <img
      src={src}
      alt="Gafflo — Find a place that fits"
      className={`block shrink-0 object-contain ${sizes.logo} ${className}`}
    />
  )
}
