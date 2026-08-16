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

// Compact horizontal lockup for the mobile app header: the existing mark image paired with real
// rendered text (never another raster export), so it stays sharp at any size and needs no
// background-matching. The "ff" is tinted to echo the brand wordmark's accent without faking a
// gradient. No tagline — this is the compact treatment; the full lockup (with tagline baked into
// the image) is reserved for larger brand moments like Role Selection.
export function BrandLockup({ className = '' }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}>
      <img src="/brand/gafflo-mark.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" />
      <span className="text-2xl font-bold leading-none tracking-tight text-slate-950">
        Ga<span className="text-indigo-600">ff</span>lo
      </span>
    </span>
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
