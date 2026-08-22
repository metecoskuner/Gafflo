import { LISTING_CATEGORIES, isRoomListing, normalizeListingCategory } from './listingCategories'

export const MAX_LISTING_PHOTOS = 8
export const MAX_LISTING_PHOTO_BYTES = 2 * 1024 * 1024
// Must match the input's accept list, the Storage bucket's allowed_mime_types, and the
// listing_images_mime_allowed CHECK constraint exactly — see the listings/Storage migration.
// A plain `startsWith('image/')` check here would accept e.g. HEIC (common on iPhone) or GIF
// client-side, only to have the actual Storage upload reject it with a raw backend error
// instead of a clear, friendly one.
export const ACCEPTED_LISTING_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export const entirePropertyPhotoLabels = ['Cover', 'Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Exterior', 'Other']
export const roomPhotoLabels = ['Cover / Room', 'Bathroom', 'Kitchen', 'Shared living area', 'Exterior', 'Other']

export function getPhotoLabelOptions(listingCategory) {
  return isRoomListing(listingCategory) ? roomPhotoLabels : entirePropertyPhotoLabels
}

export function normalizePhotoMetadata(photos = [], listingCategory = LISTING_CATEGORIES.ENTIRE_PROPERTY) {
  const labels = getPhotoLabelOptions(normalizeListingCategory(listingCategory))
  const fallbackLabel = labels[0]
  const seen = new Set()

  return photos
    .map((photo, index) => {
      const normalizedPhoto = typeof photo === 'string' ? { src: photo } : photo || {}
      const src = normalizedPhoto.src || normalizedPhoto.url || normalizedPhoto.previewUrl || ''
      if (!src || seen.has(src)) return null
      seen.add(src)

      return {
        id: normalizedPhoto.id || `photo-${index}-${String(src).slice(-18)}`,
        src,
        label: labels.includes(normalizedPhoto.label) ? normalizedPhoto.label : fallbackLabel,
        name: normalizedPhoto.name || '',
        size: Number(normalizedPhoto.size || 0),
        type: normalizedPhoto.type || '',
        isCover: Boolean(normalizedPhoto.isCover),
      }
    })
    .filter(Boolean)
    .slice(0, MAX_LISTING_PHOTOS)
    .map((photo, index) => ({ ...photo, isCover: index === 0 }))
}

export function isSessionObjectUrl(src) {
  return String(src || '').startsWith('blob:')
}

export function getDurablePhotoMetadata(photos = [], listingCategory = LISTING_CATEGORIES.ENTIRE_PROPERTY) {
  return normalizePhotoMetadata(photos, listingCategory).filter((photo) => !isSessionObjectUrl(photo.src))
}

export function getDurableListingImages(photos = [], fallbackImage, listingCategory = LISTING_CATEGORIES.ENTIRE_PROPERTY) {
  const durableImages = getDurablePhotoMetadata(photos, listingCategory).map((photo) => photo.src)
  return durableImages.length ? durableImages : [fallbackImage]
}

export function validatePhotoFiles(files = [], existingPhotos = []) {
  const accepted = []
  const errors = []
  const existingKeys = new Set(existingPhotos.map((photo) => photo.fileKey || `${photo.name}:${photo.size}`).filter((key) => key !== ':'))
  const remaining = Math.max(0, MAX_LISTING_PHOTOS - existingPhotos.length)

  if (files.length > remaining) {
    errors.push(`You can add ${remaining} more ${remaining === 1 ? 'photo' : 'photos'} for this listing.`)
  }

  files.slice(0, remaining).forEach((file) => {
    if (!ACCEPTED_LISTING_PHOTO_TYPES.includes(file.type)) {
      errors.push(`${file.name || 'One file'} isn't a supported photo format. Use JPEG, PNG, or WEBP.`)
      return
    }
    if (file.size > MAX_LISTING_PHOTO_BYTES) {
      errors.push(`${file.name || 'One image'} is larger than 2 MB.`)
      return
    }
    const fileKey = `${file.name}:${file.size}`
    if (existingKeys.has(fileKey) || accepted.some((item) => item.fileKey === fileKey)) {
      errors.push(`${file.name || 'One image'} already looks added.`)
      return
    }
    accepted.push({ file, fileKey })
  })

  return { accepted, errors }
}
