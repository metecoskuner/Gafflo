import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import SelectInput from '../components/SelectInput'
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
  normalizeListingForStorage,
  normalizeListingFormState,
  validateListingForReview,
} from '../config/listingCategories'
import { cityOptions } from '../config/locationOptions'
import { getDurableListingImages, getDurablePhotoMetadata, getPhotoLabelOptions, isSessionObjectUrl, normalizePhotoMetadata, validatePhotoFiles } from '../config/photoMetadata'
import useAppState from '../context/useAppState'
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
    listingTerms: '',
    householdSummary: '',
  })
}

export default function CreateListing() {
  const navigate = useNavigate()
  const { propertyId } = useParams()
  const { addProperty, landlordProperties, updateProperty } = useAppState()
  const editingProperty = useMemo(() => landlordProperties.find((property) => property.id === propertyId), [landlordProperties, propertyId])
  const [form, setForm] = useState(() => (editingProperty ? propertyToForm(editingProperty) : createInitialForm()))
  const [photoItems, setPhotoItems] = useState(() => normalizePhotoMetadata(editingProperty?.photoMetadata || editingProperty?.images || [], editingProperty?.listingCategory))
  const photoItemsRef = useRef(photoItems)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const listingPhotos = useMemo(() => normalizePhotoMetadata(photoItems, form.listingCategory), [form.listingCategory, photoItems])
  const previewImages = useMemo(() => (listingPhotos.length ? listingPhotos.map((photo) => photo.src) : [defaultImage]), [listingPhotos])
  const today = getTodayIsoDate()
  const roomListing = isRoomListing(form.listingCategory)
  const lockedCategory = editingProperty && !canChangeListingCategory(editingProperty, form.listingCategory).allowed

  useEffect(() => {
    photoItemsRef.current = photoItems
  }, [photoItems])

  useEffect(() => {
    return () => {
      const sessionUrls = photoItemsRef.current.map((photo) => photo.src).filter(isSessionObjectUrl)
      sessionUrls.forEach((src) => URL.revokeObjectURL(src))
    }
  }, [])

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
    const hasSessionPhotos = listingPhotos.some((photo) => photo.sessionOnly || isSessionObjectUrl(photo.src))
    const resetMessage = hasSessionPhotos
      ? 'Changing category will reset fields that do not apply to the new listing type and remove photos from this editing session. Continue?'
      : 'Changing category will reset fields that do not apply to the new listing type. Continue?'
    if (safety.requiresConfirmation && !window.confirm(resetMessage)) return
    setErrors((current) => {
      const next = { ...current }
      delete next.listingCategory
      return next
    })
    if (hasSessionPhotos) {
      listingPhotos.forEach((photo) => {
        if (isSessionObjectUrl(photo.src)) URL.revokeObjectURL(photo.src)
      })
      setPhotoItems([])
    } else {
      setPhotoItems((current) => normalizePhotoMetadata(current, nextCategory))
    }
    setForm((current) => applyCategoryDefaults(current, nextCategory))
  }

  const handlePhotoUpload = (event) => {
    const files = Array.from(event.target.files || [])
    const validation = validatePhotoFiles(files, listingPhotos)
    setErrors((current) => {
      const next = { ...current }
      if (validation.errors.length) next.images = validation.errors[0]
      else delete next.images
      return next
    })
    if (!validation.accepted.length) {
      event.target.value = ''
      return
    }

    const nextPhotos = validation.accepted.map(({ file, fileKey }) => ({
      id: `photo-${Date.now()}-${fileKey}`,
      src: URL.createObjectURL(file),
      sessionOnly: true,
      label: getPhotoLabelOptions(form.listingCategory)[0],
      name: file.name,
      size: file.size,
      type: file.type,
      fileKey,
      isCover: false,
    }))
    setPhotoItems((current) => normalizePhotoMetadata([...current, ...nextPhotos], form.listingCategory))
    event.target.value = ''
  }

  const updatePhotoLabel = (photoId, label) => {
    setPhotoItems((current) => normalizePhotoMetadata(current.map((photo) => (photo.id === photoId ? { ...photo, label } : photo)), form.listingCategory))
  }

  const removePhoto = (photoId) => {
    setPhotoItems((current) => {
      const removedPhoto = current.find((photo) => photo.id === photoId)
      if (removedPhoto?.src && isSessionObjectUrl(removedPhoto.src)) URL.revokeObjectURL(removedPhoto.src)
      return normalizePhotoMetadata(current.filter((photo) => photo.id !== photoId), form.listingCategory)
    })
  }

  const movePhoto = (photoId, direction) => {
    setPhotoItems((current) => {
      const index = current.findIndex((photo) => photo.id === photoId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return normalizePhotoMetadata(next, form.listingCategory)
    })
  }

  const chooseCover = (photoId) => {
    setPhotoItems((current) => {
      const cover = current.find((photo) => photo.id === photoId)
      if (!cover) return current
      return normalizePhotoMetadata([cover, ...current.filter((photo) => photo.id !== photoId)], form.listingCategory)
    })
  }

  const validate = () => {
    const result = validateListingForReview(form, today, { photoCount: listingPhotos.length })
    setErrors(result.errors)
    return result.valid
  }

  const handleSubmit = (event, listingStatus = 'pending_verification') => {
    event.preventDefault()
    if (listingStatus !== 'draft' && !validate()) return

    setIsSaving(true)
    const normalized = normalizeListingForStorage(form)
    const durablePhotoMetadata = getDurablePhotoMetadata(listingPhotos, form.listingCategory)
    const payload = {
      ...normalized,
      title: form.title.trim(),
      description: form.description.trim(),
      area: form.area.trim(),
      city: form.city,
      approximateAddress: `${form.area.trim()} area`,
      eircode: '',
      rent: Number(form.rent || 0),
      deposit: Number(form.deposit || 0),
      billsIncluded: Boolean(form.billsIncluded),
      availableFrom: form.availableFrom,
      minStayMonths: Number(form.minStayMonths || 1),
      images: getDurableListingImages(listingPhotos, defaultImage, form.listingCategory),
      viewingType: form.viewingType,
      listingStatus,
      photoMetadata: durablePhotoMetadata.map(({ id, label, name, size, type, src, isCover }) => ({ id, label, name, size, type, src, isCover })),
      amenities: buildAmenities(form),
      features: buildFeatures(form),
      listingRules: buildListingRules(form),
      listingTerms: form.listingTerms.trim(),
      householdSummary: form.householdSummary.trim(),
    }
    const listingId = editingProperty ? updateProperty(editingProperty.id, payload) : addProperty(payload)

    window.setTimeout(() => {
      setIsSaving(false)
      if (listingId) navigate('/properties')
    }, 180)
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <section className="card-surface card-shadow overflow-hidden rounded-[28px]">
        <div className="relative h-56 min-[390px]:h-64">
          <img src={previewImages[0]} alt="Listing preview" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/82 via-slate-950/16 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">{editingProperty ? 'Edit listing' : 'Create listing'}</p>
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
          category={form.listingCategory}
          fallbackImage={defaultImage}
          error={errors.images}
          onChange={handlePhotoUpload}
          onCover={chooseCover}
          onLabel={updatePhotoLabel}
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

        <div className="grid grid-cols-[0.9fr_1.1fr] gap-2 rounded-[24px] border border-slate-200 bg-white/96 p-2 shadow-soft">
          <Button variant="secondary" onClick={(event) => handleSubmit(event, 'draft')}>
            Save draft
          </Button>
          <Button type="submit" disabled={isSaving} isLoading={isSaving}>
            {isSaving ? 'Saving' : 'Request review'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function PhotoSection({ category, error, fallbackImage, onChange, onCover, onLabel, onMove, onRemove, photos }) {
  const labels = getPhotoLabelOptions(category)
  const displayPhotos = photos.length ? photos : [{ id: 'fallback', src: fallbackImage, label: labels[0], isCover: true }]

  return (
    <FormSection title="Photos" description="Manage listing photos for previews. Uploaded files stay local to this browser session.">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Add photos</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          className="min-h-12 w-full rounded-[18px] border border-indigo-100 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-700"
        />
        {error ? <span className="mt-2 block text-xs font-medium text-rose-500">{error}</span> : null}
        <span className="mt-2 block text-xs leading-5 text-slate-500">Up to 8 images. Each image must be under 2 MB.</span>
      </label>
      <div className="mt-4 grid gap-3">
        {displayPhotos.map((photo, index) => (
          <div key={photo.id} className="surface-line grid gap-3 rounded-[20px] bg-white p-3 min-[390px]:grid-cols-[7rem_1fr]">
            <PhotoPreview src={photo.src} alt={`Preview ${index + 1}`} />
            <div className="min-w-0 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{index === 0 ? 'Cover image' : `Photo ${index + 1}`}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{photo.name || 'Listing preview'}</p>
                </div>
                {photo.id !== 'fallback' ? (
                  <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => onRemove(photo.id)} className="min-h-10 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                    Remove
                  </button>
                ) : null}
              </div>

              {photo.id !== 'fallback' ? (
                <>
                  <SelectInput label="Photo label" value={photo.label} onChange={(event) => onLabel(photo.id, event.target.value)} options={labels.map((label) => ({ label, value: label }))} />
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant="secondary" className="px-2" disabled={index === 0} aria-label={`Move photo ${index + 1} up`} onClick={() => onMove(photo.id, -1)}>Up</Button>
                    <Button type="button" variant="secondary" className="px-2" disabled={index === photos.length - 1} aria-label={`Move photo ${index + 1} down`} onClick={() => onMove(photo.id, 1)}>Down</Button>
                    <Button type="button" variant={index === 0 ? 'primary' : 'secondary'} className="px-2" disabled={index === 0} aria-label={`Make photo ${index + 1} the cover`} onClick={() => onCover(photo.id)}>
                      {index === 0 ? 'Cover' : 'Set cover'}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </FormSection>
  )
}

function PhotoPreview({ alt, src }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
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
    <FormSection title="Description and terms" description="Describe the listing without adding demographic or personality matching requirements.">
      <div className="grid gap-4">
        <FormInput textarea rows={4} label={roomListing ? 'Room description' : 'Property description'} value={form.description} maxLength={900} error={errors.description} onChange={(event) => updateField('description', event.target.value)} />
        {roomListing ? (
          <FormInput textarea rows={3} label="Household summary" value={form.householdSummary} maxLength={500} error={errors.householdSummary} onChange={(event) => updateField('householdSummary', event.target.value)} />
        ) : null}
        <FormInput textarea rows={4} label="Listing terms" value={form.listingTerms} maxLength={700} error={errors.listingTerms} onChange={(event) => updateField('listingTerms', event.target.value)} />
      </div>
    </FormSection>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="surface-line flex min-h-12 items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
    </label>
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
