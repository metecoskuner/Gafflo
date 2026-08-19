import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import PropertyDetailsModal from '../components/PropertyDetailsModal'
import SelectInput from '../components/SelectInput'
import Toggle from '../components/Toggle'
import {
  bathroomArrangementOptions,
  bedTypeOptions,
  domainLabel,
  furnishedOptions,
  parkingOptions,
  petPolicyOptions,
  propertyTypeOptions,
  roomParentPropertyTypeOptions,
  roomTypeOptions,
  smokingOptions,
} from '../config/domainOptions'
import {
  LISTING_CATEGORIES,
  canChangeListingCategory,
  isRoomListing,
  listingCategoryLabel,
  listingCategoryOptions,
  normalizeListingDraftForStorage,
  normalizeListingForStorage,
  normalizeListingFormState,
  validateListingForReview,
} from '../config/listingCategories'
import { cityOptions } from '../config/locationOptions'
import { MAX_LISTING_PHOTOS, validatePhotoFiles } from '../config/photoMetadata'
import useAccountProfile from '../context/useAccountProfile'
import useAppState from '../context/useAppState'
import useListings from '../context/useListings'
import { getTodayIsoDate } from '../utils/dateUtils'

const viewingTypeOptions = ['In-person', 'Virtual or in-person']
const roomOccupancyOptions = [
  { label: '1 person', value: '1' },
  { label: 'Up to 2 people', value: '2' },
]
const defaultImage =
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'

function createInitialForm() {
  return normalizeListingFormState({
    listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY,
    title: '',
    rent: '',
    deposit: '',
    billsIncluded: true,
    availableFrom: '',
    city: 'Dublin',
    area: '',
    propertyType: 'apartment',
    parentPropertyType: 'apartment',
    roomType: 'double',
    bedType: 'double',
    bedrooms: '1',
    totalBedrooms: '2',
    bathrooms: '1',
    bathroomArrangement: 'shared',
    maxOccupants: '2',
    currentHouseholdSize: '0',
    maxHouseholdSize: '2',
    furnished: 'furnished',
    parking: 'none',
    minStayMonths: '6',
    viewingType: 'In-person',
    petsAllowed: 'considered',
    smokingAllowed: 'no',
    couplesAccepted: false,
    petsInHome: false,
    washingMachine: true,
    dryer: false,
    dishwasher: false,
    balcony: false,
    garden: false,
    lift: false,
    bikeStorage: false,
    workspace: false,
    internet: true,
    sharedKitchen: true,
    sharedLivingRoom: true,
    laundry: true,
    wardrobeStorage: true,
    description: '',
    householdSummary: '',
  })
}

export default function CreateListing() {
  const navigate = useNavigate()
  const { propertyId } = useParams()
  const { landlordProperties } = useAppState()
  const { landlordProfile, profile } = useAccountProfile()
  const { createListing, deleteImage, loading: listingsLoading, reorderImages, requestReview, setCoverImage, updateListing, uploadImage } = useListings()

  const isEditing = Boolean(propertyId)
  const editingProperty = useMemo(() => landlordProperties.find((property) => property.id === propertyId), [landlordProperties, propertyId])
  const [draftError, setDraftError] = useState('')

  // A real listings row must exist before any photo can be uploaded (the Storage path is
  // {listing_id}/{image_id}.ext — see services/listingsService.js) and before any field edit has
  // somewhere real to persist to. For a brand-new listing this creates that real, empty draft row
  // immediately on entering the screen — a real DB UUID from the first render onward, never a
  // client-generated `property-local-${Date.now()}` id — then replaces the URL with that
  // listing's real /listings/:id/edit route. Staying on /listings/new instead would mean a
  // reload (or the back button) re-runs this effect and silently creates a second, abandoned
  // draft every time; redirecting means a reload always lands back on THIS same draft via the
  // ordinary isEditing path below.
  useEffect(() => {
    if (isEditing) return
    let cancelled = false
    createListing({ listingCategory: LISTING_CATEGORIES.ENTIRE_PROPERTY }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setDraftError('Could not start a new listing. Please go back and try again.')
        return
      }
      navigate(`/listings/${data.id}/edit`, { replace: true })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  const listingId = editingProperty?.id || null
  const listingPhotos = useMemo(() => editingProperty?.photoMetadata || [], [editingProperty])

  const [form, setForm] = useState(() => (editingProperty ? propertyToForm(editingProperty) : createInitialForm()))
  // Direct navigation to /listings/:id/edit (a fresh page load — bookmark, reload, or a real
  // link click) mounts this component before ListingsProvider's async fetch has resolved, so
  // editingProperty is still undefined at the useState initializer above and the form would
  // silently start empty. Once editingProperty actually loads, sync form from it exactly once.
  //
  // Deliberately gated on wasEditingRouteAtMount, not just "isEditing": the redirect right after
  // creating a new draft (the effect above) does NOT remount this component — React Router keeps
  // the same CreateListing instance and just updates its params/route match — so a plain "sync
  // once editingProperty appears" would also fire partway through that flow, after the landlord
  // has already been typing into the freshly-defaulted (createInitialForm()) form, and clobber
  // their in-progress edits with the still-nearly-empty real row (confirmed: this exact
  // regression happened during the skip-audit fix and was caught by a real e2e run, not just
  // reasoning about it). wasEditingRouteAtMount distinguishes the two cases precisely: true only
  // when this component's very first render already had a real :propertyId in the URL — never
  // true for a listing created and redirected to within this same mounted instance.
  const wasEditingRouteAtMount = useRef(isEditing)
  const hasSyncedFormFromServer = useRef(Boolean(editingProperty))
  useEffect(() => {
    if (!wasEditingRouteAtMount.current || hasSyncedFormFromServer.current || !editingProperty) return
    hasSyncedFormFromServer.current = true
    setForm(propertyToForm(editingProperty))
  }, [editingProperty])
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [pendingImageId, setPendingImageId] = useState(null)
  const previewImages = useMemo(() => (listingPhotos.length ? listingPhotos.map((photo) => photo.src) : [defaultImage]), [listingPhotos])
  const today = getTodayIsoDate()
  const roomListing = isRoomListing(form.listingCategory)
  const lockedCategory = editingProperty && !canChangeListingCategory(editingProperty, form.listingCategory).allowed

  // Tenant-facing preview of the in-progress draft — real presentation component, nothing new
  // persisted beyond what's already saved, no score (landlord role never sees Rental Fit), no
  // publish side effect.
  const previewProperty = useMemo(
    () => ({
      ...form,
      id: listingId || 'preview-draft',
      ownerId: profile?.id,
      ownerName: landlordProfile?.displayName || '',
      ownerType: 'Private landlord',
      listingStatus: editingProperty?.listingStatus || 'draft',
      rent: Number(form.rent) || 0,
      deposit: Number(form.deposit) || 0,
      bedrooms: Number(form.bedrooms) || 0,
      totalBedrooms: Number(form.totalBedrooms) || 0,
      bathrooms: Number(form.bathrooms) || 0,
      maxOccupants: Number(form.maxOccupants) || 1,
      currentHouseholdSize: Number(form.currentHouseholdSize) || 0,
      maxHouseholdSize: Number(form.maxHouseholdSize) || 0,
      minStayMonths: Number(form.minStayMonths) || 0,
      billsIncluded: Boolean(form.billsIncluded),
      images: previewImages,
      amenities: buildAmenities(form),
      features: buildFeatures(form),
      listingRules: buildListingRules(form),
      approximateAddress: `${form.area.trim() || 'Area'} area`,
      trust: null,
      promotion: null,
    }),
    [form, previewImages, listingId, profile, landlordProfile, editingProperty],
  )

  const updateField = (field, value) => {
    setForm((current) => normalizeListingFormState({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      if (field === 'propertyType') delete next.bedrooms
      return next
    })
  }

  const changeCategory = (nextCategory) => {
    if (nextCategory === form.listingCategory) return
    const safety = canChangeListingCategory(editingProperty || form, nextCategory)
    if (!safety.allowed) {
      setErrors((current) => ({ ...current, listingCategory: safety.reason }))
      return
    }
    if (safety.requiresConfirmation && !window.confirm('Changing category will reset fields that do not apply to the new listing type. Continue?')) return
    setErrors((current) => {
      const next = { ...current }
      delete next.listingCategory
      return next
    })
    setForm((current) => applyCategoryDefaults(current, nextCategory))
  }

  const handlePhotoUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!listingId) return
    const validation = validatePhotoFiles(files, listingPhotos)
    setUploadError(validation.errors[0] || '')
    if (!validation.accepted.length) return

    setIsUploadingPhoto(true)
    for (const { file } of validation.accepted) {
      const { error } = await uploadImage(listingId, file, { label: listingPhotos.length === 0 ? 'cover' : 'other' })
      if (error) {
        setUploadError(error)
        break
      }
    }
    setIsUploadingPhoto(false)
  }

  const removePhoto = async (photo) => {
    setPendingImageId(photo.id)
    const { error } = await deleteImage(photo.id, photo.storagePath)
    setPendingImageId(null)
    if (error) setUploadError(error)
  }

  const movePhoto = async (photo, direction) => {
    const index = listingPhotos.findIndex((item) => item.id === photo.id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= listingPhotos.length) return
    const reordered = [...listingPhotos]
    const [item] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, item)
    setPendingImageId(photo.id)
    const { error } = await reorderImages(listingId, reordered.map((entry) => entry.id))
    setPendingImageId(null)
    if (error) setUploadError(error)
  }

  const chooseCover = async (photo) => {
    setPendingImageId(photo.id)
    const { error } = await setCoverImage(listingId, photo.id)
    setPendingImageId(null)
    if (error) setUploadError(error)
  }

  const validate = () => {
    const result = validateListingForReview(form, today, { photoCount: listingPhotos.length })
    setErrors(result.errors)
    return result.valid
  }

  // request_listing_review() only accepts a listing whose status is 'draft' or 'rejected' — a
  // listing that already went live (published/paused/rented) or is already mid-review
  // (pending_verification) has nothing to "request"; editing it is just a plain field save. A
  // brand-new listing defaults to true since it is always created as 'draft' (see the draft
  // useEffect above) and editingProperty may not have caught up to that yet on the very first render.
  const canRequestReview = ['draft', 'rejected'].includes(editingProperty?.listingStatus || 'draft')

  const handleSubmit = async (event, targetStatus = 'pending_verification') => {
    event.preventDefault()
    if (!listingId) return
    const isDraft = targetStatus === 'draft'
    const willRequestReview = !isDraft && canRequestReview
    if (willRequestReview && !validate()) return

    setIsSaving(true)
    setSaveError('')
    const normalized = isDraft ? normalizeListingDraftForStorage(form) : normalizeListingForStorage(form)
    const fields = {
      ...normalized,
      title: form.title.trim(),
      description: form.description.trim(),
      area: form.area.trim(),
      city: form.city,
      approximateAddress: `${form.area.trim()} area`,
      rent: isDraft ? nullableFormNumber(form.rent) : Number(form.rent),
      deposit: isDraft ? nullableFormNumber(form.deposit) : Number(form.deposit || 0),
      billsIncluded: Boolean(form.billsIncluded),
      availableFrom: form.availableFrom || null,
      minStayMonths: isDraft ? nullableFormInteger(form.minStayMonths) : Number(form.minStayMonths),
      viewingType: form.viewingType,
      amenities: buildAmenities(form),
      features: buildFeatures(form),
      listingRules: buildListingRules(form),
      householdSummary: form.householdSummary.trim(),
    }

    const { error: updateError } = await updateListing(listingId, fields)
    if (updateError) {
      setIsSaving(false)
      setSaveError('Something went wrong saving this listing. Please try again.')
      return
    }

    if (!willRequestReview) {
      setIsSaving(false)
      navigate('/properties')
      return
    }

    const { error: reviewError } = await requestReview(listingId)
    setIsSaving(false)
    if (reviewError) {
      setSaveError(reviewError)
      return
    }
    navigate('/properties')
  }

  if (draftError) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="text-sm font-medium text-rose-600">{draftError}</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/properties')}>Back to properties</Button>
      </div>
    )
  }

  if (!listingId) {
    // isEditing but landlordProperties hasn't resolved this id (still loading, or it belongs to
    // someone else / never existed) — never a silent infinite spinner for the latter case.
    if (isEditing && !listingsLoading) {
      return (
        <div className="mx-auto max-w-lg py-16 text-center">
          <p className="text-sm font-medium text-slate-600">This listing could not be found.</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/properties')}>Back to properties</Button>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" role="status" aria-label="Starting your listing" />
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <section className="card-surface card-shadow overflow-hidden rounded-[28px]">
        <div className="relative h-56 min-[390px]:h-64">
          <img src={previewImages[0]} alt="Listing preview" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/82 via-slate-950/16 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">{isEditing ? 'Edit listing' : 'Create listing'}</p>
            <h1 className="text-balance mt-2 text-[1.65rem] font-semibold leading-tight tracking-tight min-[390px]:text-3xl">{form.title || 'List your property'}</h1>
            <p className="mt-2 text-sm text-slate-200">
              {listingCategoryLabel(form.listingCategory)} · {form.area || 'Area'}, {form.city} {form.rent ? `· €${form.rent}/mo` : ''}
            </p>
          </div>
        </div>
      </section>

      <form noValidate onSubmit={(event) => handleSubmit(event, 'pending_verification')} className="space-y-4 pb-24">
        <FormSection title="What are you listing?" description="Choose the listing category before entering the details.">
          <div className="grid gap-2 min-[390px]:gap-3 md:grid-cols-3">
            {listingCategoryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeCategory(option.value)}
                aria-pressed={form.listingCategory === option.value}
                className={`min-h-24 rounded-[20px] border p-3 text-left transition min-[390px]:min-h-28 min-[390px]:p-4 ${
                  form.listingCategory === option.value
                    ? 'border-emerald-300 bg-emerald-50 ring-4 ring-emerald-100'
                    : 'border-indigo-100 bg-white hover:border-emerald-200'
                } ${lockedCategory ? 'opacity-70' : ''}`}
              >
                <span className="flex items-start justify-between gap-2 text-sm font-semibold leading-5 text-slate-950 min-[390px]:text-base">
                  <span>{option.label}</span>
                  {form.listingCategory === option.value ? <span className="text-emerald-600" aria-hidden="true">✓</span> : null}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600 min-[390px]:text-sm">{option.description}</span>
              </button>
            ))}
          </div>
          {errors.listingCategory ? <p className="mt-3 text-sm font-medium text-rose-600">{errors.listingCategory}</p> : null}
        </FormSection>

        <PhotoSection
          photos={listingPhotos}
          fallbackImage={defaultImage}
          error={errors.images || uploadError}
          isUploading={isUploadingPhoto}
          pendingImageId={pendingImageId}
          onChange={handlePhotoUpload}
          onCover={chooseCover}
          onMove={movePhoto}
          onRemove={removePhoto}
        />
        <BasicsSection form={form} errors={errors} today={today} updateField={updateField} />

        {roomListing ? (
          <>
            <RoomSection form={form} errors={errors} updateField={updateField} />
            <HouseholdSection form={form} errors={errors} updateField={updateField} />
          </>
        ) : (
          <EntirePropertySection form={form} errors={errors} updateField={updateField} />
        )}

        <AmenitiesSection form={form} roomListing={roomListing} updateField={updateField} />
        <TermsSection form={form} errors={errors} roomListing={roomListing} updateField={updateField} />

        {Object.keys(errors).length ? (
          <div className="rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Check the highlighted fields before requesting review.
          </div>
        ) : null}
        {saveError ? (
          <div className="rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{saveError}</div>
        ) : null}

        <Button type="button" variant="secondary" className="w-full" onClick={() => setShowPreview(true)}>
          Preview listing
        </Button>

        <div className={`grid gap-2 rounded-[24px] border border-slate-200 bg-white/96 p-2 shadow-soft ${canRequestReview ? 'grid-cols-[0.9fr_1.1fr]' : 'grid-cols-1'}`}>
          {canRequestReview ? (
            <Button variant="secondary" disabled={isSaving} onClick={(event) => handleSubmit(event, 'draft')}>
              Save draft
            </Button>
          ) : null}
          <Button type="submit" disabled={isSaving} isLoading={isSaving}>
            {isSaving ? 'Saving' : canRequestReview ? 'Request review' : 'Save changes'}
          </Button>
        </div>
      </form>

      {showPreview ? <PropertyDetailsModal previewProperty={previewProperty} onClose={() => setShowPreview(false)} /> : null}
    </div>
  )
}

function nullableFormInteger(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nullableFormNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function PhotoSection({ error, fallbackImage, isUploading, onChange, onCover, onMove, onRemove, pendingImageId, photos }) {
  const displayPhotos = photos.length ? photos : [{ id: 'fallback', src: fallbackImage, isCover: true }]

  return (
    <FormSection title="Photos" description="Photos are uploaded and saved to your listing as soon as you add them — no separate save step. At least one photo is required before requesting review.">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Add photos</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={isUploading || photos.length >= MAX_LISTING_PHOTOS}
          onChange={onChange}
          className="min-h-12 w-full rounded-[18px] border border-indigo-100 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 disabled:opacity-60"
        />
        {error ? <span className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
        <span className="mt-2 block text-xs leading-5 text-slate-500">
          {isUploading ? 'Uploading…' : `JPEG, PNG or WEBP. Up to ${MAX_LISTING_PHOTOS} images. Each image must be under 2 MB.`}
        </span>
      </label>
      <div className="mt-4 grid gap-3">
        {displayPhotos.map((photo, index) => {
          const isPending = pendingImageId === photo.id
          return (
            <div key={photo.id} className="surface-line grid gap-3 rounded-[20px] bg-white p-3 min-[390px]:grid-cols-[7rem_1fr]">
              <PhotoPreview src={photo.src} alt={`Preview ${index + 1}`} />
              <div className="min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{photo.isCover ? 'Cover image' : `Photo ${index + 1}`}</p>
                  </div>
                  {photo.id !== 'fallback' ? (
                    <button
                      type="button"
                      aria-label={`Remove photo ${index + 1}`}
                      disabled={isPending}
                      onClick={() => onRemove(photo)}
                      className="min-h-10 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                {photo.id !== 'fallback' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant="secondary" className="px-2" disabled={isPending || index === 0} aria-label={`Move photo ${index + 1} up`} onClick={() => onMove(photo, -1)}>Up</Button>
                    <Button type="button" variant="secondary" className="px-2" disabled={isPending || index === photos.length - 1} aria-label={`Move photo ${index + 1} down`} onClick={() => onMove(photo, 1)}>Down</Button>
                    <Button type="button" variant={photo.isCover ? 'primary' : 'secondary'} className="px-2" disabled={isPending || photo.isCover} aria-label={`Make photo ${index + 1} the cover`} onClick={() => onCover(photo)}>
                      {photo.isCover ? 'Cover' : 'Set cover'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </FormSection>
  )
}

function PhotoPreview({ alt, src }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-[18px] bg-slate-100 px-3 text-center text-xs font-medium text-slate-500 min-[390px]:h-28 min-[390px]:w-28">
        Preview unavailable
      </div>
    )
  }
  return (
    <div className="h-36 w-full overflow-hidden rounded-[18px] bg-slate-200 min-[390px]:h-28 min-[390px]:w-28">
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
    </div>
  )
}

function BasicsSection({ form, errors, today, updateField }) {
  return (
    <FormSection title="Listing basics" description="Core details renters need before opening the listing.">
      <div className="grid gap-4">
        <FormInput label="Title" placeholder="Bright double room in Rathmines" value={form.title} maxLength={90} error={errors.title} onChange={(event) => updateField('title', event.target.value)} />
        <div className="grid gap-3 min-[380px]:grid-cols-2">
          <FormInput label="Monthly rent (€)" type="number" min="1" inputMode="numeric" value={form.rent} error={errors.rent} onChange={(event) => updateField('rent', event.target.value)} />
          <FormInput label="Deposit (€)" type="number" min="0" inputMode="numeric" value={form.deposit} error={errors.deposit} onChange={(event) => updateField('deposit', event.target.value)} />
        </div>
        <div className="grid gap-3 min-[380px]:grid-cols-2">
          <SelectInput label="City" value={form.city} onChange={(event) => updateField('city', event.target.value)} options={cityOptions.map((item) => ({ label: item, value: item }))} />
          <FormInput label="Area" placeholder="Rathmines" value={form.area} maxLength={70} error={errors.area} onChange={(event) => updateField('area', event.target.value)} />
        </div>
        <div className="grid gap-3 min-[380px]:grid-cols-2">
          <FormInput label="Available from" type="date" min={today} value={form.availableFrom} error={errors.availableFrom} onChange={(event) => updateField('availableFrom', event.target.value)} />
          <FormInput label="Minimum stay (months)" type="number" min="1" inputMode="numeric" value={form.minStayMonths} error={errors.minStayMonths} onChange={(event) => updateField('minStayMonths', event.target.value)} />
        </div>
        <Toggle label="Bills included" checked={Boolean(form.billsIncluded)} onChange={(value) => updateField('billsIncluded', value)} />
      </div>
    </FormSection>
  )
}

function EntirePropertySection({ form, errors, updateField }) {
  return (
    <FormSection title="Property" description="Whole-home attributes are separate from the listing category.">
      <div className="grid gap-3 min-[430px]:grid-cols-2">
        <SelectInput label="Property type" value={form.propertyType} onChange={(event) => updateField('propertyType', event.target.value)} options={propertyTypeOptions} error={errors.propertyType} />
        {form.propertyType !== 'studio' ? (
          <FormInput label="Bedrooms" type="number" min="1" inputMode="numeric" value={form.bedrooms} error={errors.bedrooms} onChange={(event) => updateField('bedrooms', event.target.value)} />
        ) : (
          <div className="rounded-[18px] border border-indigo-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">Studio listings are stored with 0 bedrooms.</div>
        )}
        <FormInput label="Bathrooms" type="number" min="0.5" step="0.5" inputMode="decimal" value={form.bathrooms} error={errors.bathrooms} onChange={(event) => updateField('bathrooms', event.target.value)} />
        <FormInput label="Max occupants" type="number" min="1" inputMode="numeric" value={form.maxOccupants} error={errors.maxOccupants} onChange={(event) => updateField('maxOccupants', event.target.value)} />
        <SelectInput label="Furnished" value={form.furnished} onChange={(event) => updateField('furnished', event.target.value)} options={furnishedOptions} />
        <SelectInput label="Parking" value={form.parking} onChange={(event) => updateField('parking', event.target.value)} options={parkingOptions} />
        <SelectInput label="Pets" value={form.petsAllowed} onChange={(event) => updateField('petsAllowed', event.target.value)} options={petPolicyOptions} />
        <SelectInput label="Smoking" value={form.smokingAllowed} onChange={(event) => updateField('smokingAllowed', event.target.value)} options={smokingOptions} />
        <SelectInput label="Viewing" value={form.viewingType} onChange={(event) => updateField('viewingType', event.target.value)} options={viewingTypeOptions.map((item) => ({ label: item, value: item }))} />
      </div>
    </FormSection>
  )
}

function RoomSection({ form, errors, updateField }) {
  return (
    <FormSection title={form.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? 'Room in owner-occupied home' : 'Room'} description="Room details stay separate from the parent property type.">
      <div className="grid gap-3 min-[430px]:grid-cols-2">
        <SelectInput label="Room type" value={form.roomType} onChange={(event) => updateField('roomType', event.target.value)} options={roomTypeOptions} error={errors.roomType} />
        <SelectInput label="Parent property" value={form.parentPropertyType} onChange={(event) => updateField('parentPropertyType', event.target.value)} options={roomParentPropertyTypeOptions} />
        <SelectInput label="Furnished" value={form.furnished} onChange={(event) => updateField('furnished', event.target.value)} options={furnishedOptions} />
        <SelectInput label="Bed type" value={form.bedType} onChange={(event) => updateField('bedType', event.target.value)} options={bedTypeOptions} />
        <SelectInput label="Bathroom arrangement" value={form.bathroomArrangement} onChange={(event) => updateField('bathroomArrangement', event.target.value)} options={bathroomArrangementOptions} error={errors.bathroomArrangement} />
        <Toggle label="Workspace" checked={Boolean(form.workspace)} onChange={(value) => updateField('workspace', value)} />
        <Toggle label="Wardrobe/storage" checked={Boolean(form.wardrobeStorage)} onChange={(value) => updateField('wardrobeStorage', value)} />
      </div>
    </FormSection>
  )
}

function HouseholdSection({ form, errors, updateField }) {
  return (
    <FormSection title="Parent property and household" description="Practical household context for a shared home.">
      <div className="grid gap-3 min-[430px]:grid-cols-2">
        <FormInput label="Total bedrooms" type="number" min="1" inputMode="numeric" value={form.totalBedrooms} error={errors.totalBedrooms} onChange={(event) => updateField('totalBedrooms', event.target.value)} />
        <FormInput label="Total bathrooms" type="number" min="0.5" step="0.5" inputMode="decimal" value={form.bathrooms} error={errors.bathrooms} onChange={(event) => updateField('bathrooms', event.target.value)} />
        <FormInput label="Current household size" type="number" min={form.listingCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? '1' : '0'} inputMode="numeric" value={form.currentHouseholdSize} error={errors.currentHouseholdSize} onChange={(event) => updateField('currentHouseholdSize', event.target.value)} />
        <FormInput label="Max household size after move-in" type="number" min="2" inputMode="numeric" value={form.maxHouseholdSize} error={errors.maxHouseholdSize} onChange={(event) => updateField('maxHouseholdSize', event.target.value)} />
        <SelectInput label="Room occupancy" value={form.maxOccupants} onChange={(event) => updateField('maxOccupants', event.target.value)} options={roomOccupancyOptions} error={errors.maxOccupants} />
      </div>
      <div className="mt-4 rounded-[18px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
        Household after move-in: up to {form.maxHouseholdSize || 0} people in a {domainLabel('roomParentPropertyType', form.parentPropertyType)}.
      </div>
      <div className="mt-4 grid gap-3 min-[430px]:grid-cols-2">
        <Toggle label="Couples accepted" checked={Boolean(form.couplesAccepted)} onChange={(value) => updateField('couplesAccepted', value)} />
        <Toggle label="Pets currently in home" checked={Boolean(form.petsInHome)} onChange={(value) => updateField('petsInHome', value)} />
        <SelectInput label="Pets accepted" value={form.petsAllowed} onChange={(event) => updateField('petsAllowed', event.target.value)} options={petPolicyOptions} />
        <SelectInput label="Smoking" value={form.smokingAllowed} onChange={(event) => updateField('smokingAllowed', event.target.value)} options={smokingOptions} />
      </div>
    </FormSection>
  )
}

function AmenitiesSection({ form, roomListing, updateField }) {
  const amenities = roomListing
    ? ['sharedKitchen', 'sharedLivingRoom', 'laundry', 'internet', 'parking']
    : ['washingMachine', 'dryer', 'dishwasher', 'balcony', 'garden', 'lift', 'bikeStorage', 'workspace', 'internet']
  return (
    <FormSection title={roomListing ? 'Shared spaces' : 'Amenities'} description="Select the practical features that apply.">
      <div className="grid gap-3 min-[430px]:grid-cols-2">
        {amenities.map((field) =>
          field === 'parking' ? (
            <SelectInput key={field} label="Parking" value={form.parking} onChange={(event) => updateField('parking', event.target.value)} options={parkingOptions} />
          ) : (
            <Toggle key={field} label={amenityLabels[field]} checked={Boolean(form[field])} onChange={(value) => updateField(field, value)} />
          ),
        )}
      </div>
    </FormSection>
  )
}

function TermsSection({ form, errors, roomListing, updateField }) {
  return (
    <FormSection title="Description" description="Describe the listing without adding demographic or personality matching requirements.">
      <div className="grid gap-4">
        <FormInput textarea rows={4} label={roomListing ? 'Room description' : 'Property description'} value={form.description} maxLength={900} error={errors.description} onChange={(event) => updateField('description', event.target.value)} />
        {roomListing ? (
          <FormInput textarea rows={3} label="Household summary" value={form.householdSummary} maxLength={500} error={errors.householdSummary} onChange={(event) => updateField('householdSummary', event.target.value)} />
        ) : null}
      </div>
    </FormSection>
  )
}

function FormSection({ title, description, children }) {
  return (
    <section className="card-surface card-shadow rounded-[24px] p-4 min-[390px]:rounded-[28px] min-[390px]:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function propertyToForm(property) {
  return normalizeListingFormState({ ...createInitialForm(), ...property })
}

function applyCategoryDefaults(current, nextCategory) {
  return normalizeListingFormState({
    ...current,
    listingCategory: nextCategory,
    propertyType: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? 'apartment' : undefined,
    parentPropertyType: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? undefined : 'apartment',
    roomType: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? undefined : 'double',
    bedrooms: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? '1' : '1',
    totalBedrooms: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? undefined : '2',
    currentHouseholdSize: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? undefined : nextCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM ? '1' : '0',
    maxHouseholdSize: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? undefined : '2',
    maxOccupants: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? '2' : '1',
    bathroomArrangement: nextCategory === LISTING_CATEGORIES.ENTIRE_PROPERTY ? undefined : 'shared',
    ownerLivesInProperty: nextCategory === LISTING_CATEGORIES.OWNER_OCCUPIED_ROOM,
  })
}

function buildAmenities(form) {
  const labels = {
    washingMachine: 'Washing machine',
    dryer: 'Dryer',
    dishwasher: 'Dishwasher',
    balcony: 'Balcony',
    garden: 'Garden',
    lift: 'Lift',
    bikeStorage: 'Bike storage',
    workspace: 'Workspace',
    internet: 'Internet',
    sharedKitchen: 'Shared kitchen',
    sharedLivingRoom: 'Shared living room',
    laundry: 'Laundry',
    wardrobeStorage: 'Wardrobe/storage',
  }
  const values = Object.entries(labels).filter(([field]) => form[field]).map(([, label]) => label)
  values.push(form.billsIncluded ? 'Bills included' : 'Bills separate')
  if (form.parking && form.parking !== 'none') values.push(domainLabel('parking', form.parking))
  return values
}

function buildFeatures(form) {
  if (isRoomListing(form.listingCategory)) {
    return [
      domainLabel('roomType', form.roomType),
      domainLabel('bathroomArrangement', form.bathroomArrangement),
      form.ownerLivesInProperty ? 'Owner occupied' : 'Shared home',
      form.internet ? 'Internet' : null,
    ].filter(Boolean)
  }
  return [
    domainLabel('propertyType', form.propertyType),
    form.propertyType === 'studio' ? 'Studio' : `${form.bedrooms} bedrooms`,
    domainLabel('furnished', form.furnished),
    form.parking !== 'none' ? 'Parking' : null,
  ].filter(Boolean)
}

function buildListingRules(form) {
  return [
    form.smokingAllowed === 'no' ? 'No smoking indoors' : 'Smoking by agreement',
    form.petsAllowed === 'allowed' ? 'Pets allowed' : form.petsAllowed === 'considered' ? 'Pets considered' : 'Pets not allowed',
    form.couplesAccepted ? 'Couples accepted' : null,
    form.petsInHome ? 'Pets currently in the home' : null,
    'Tenant references by request',
  ].filter(Boolean)
}

const amenityLabels = {
  washingMachine: 'Washing machine',
  dryer: 'Dryer',
  dishwasher: 'Dishwasher',
  balcony: 'Balcony',
  garden: 'Garden',
  lift: 'Lift',
  bikeStorage: 'Bike storage',
  workspace: 'Workspace',
  internet: 'Internet',
  sharedKitchen: 'Shared kitchen',
  sharedLivingRoom: 'Shared living room',
  laundry: 'Laundry',
}
