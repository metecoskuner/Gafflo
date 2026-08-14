import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import SelectInput from '../components/SelectInput'
import useAppState from '../context/useAppState'
import { getTodayIsoDate, isPastIsoDate } from '../utils/dateUtils'

const cityOptions = ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford']
const propertyTypeOptions = ['Apartment', 'House', 'Studio', 'One-bedroom apartment']
const occupationOptions = ['Any', 'Full-time', 'Part-time', 'Student', 'Remote worker']
const petOptions = ['Comfortable', 'Not comfortable']
const smokingOptions = ['No', 'Outside only', 'Yes']
const furnishedOptions = ['Furnished', 'Part-furnished', 'Unfurnished']
const parkingOptions = ['No', 'Street permit nearby', 'Included', 'Driveway']
const viewingTypeOptions = ['In-person', 'Virtual or in-person']

const defaultImage =
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'

function createInitialForm() {
  return {
    title: '',
    rent: '',
    deposit: '',
    billsIncluded: true,
    availableFrom: '',
    city: 'Dublin',
    area: '',
    propertyType: 'Apartment',
    bedrooms: '1',
    bathrooms: '1',
    maxOccupants: '2',
    furnished: 'Furnished',
    parking: 'No',
    minStayMonths: '6',
    viewingType: 'In-person',
    occupationPreference: 'Any',
    petsAllowed: 'Comfortable',
    smokingAllowed: 'No',
    description: '',
    listingTerms: '',
  }
}

export default function CreateListing() {
  const navigate = useNavigate()
  const { addProperty } = useAppState()
  const [form, setForm] = useState(createInitialForm)
  const [imagePreviews, setImagePreviews] = useState([])
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const previewImages = useMemo(() => (imagePreviews.length ? imagePreviews : [defaultImage]), [imagePreviews])
  const today = getTodayIsoDate()

  const validateField = (field, value, nextForm = form) => {
    const validators = {
      title: () => {
        const length = String(value || '').trim().length
        if (!length) return 'Add a clear listing title.'
        if (length < 8) return 'Use a little more detail in the title.'
        if (length > 90) return 'Keep the title under 90 characters.'
        return ''
      },
      rent: () => (!value || !Number.isFinite(Number(value)) || Number(value) <= 0 ? 'Monthly rent must be more than €0.' : ''),
      deposit: () => (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? 'Deposit cannot be negative.' : ''),
      availableFrom: () => {
        if (!value) return 'Choose the available-from date.'
        if (isPastIsoDate(value, today)) return 'Available-from date cannot be in the past.'
        return ''
      },
      area: () => {
        const length = String(value || '').trim().length
        if (!length) return 'Add the area or neighbourhood.'
        if (length > 70) return 'Keep the area under 70 characters.'
        return ''
      },
      bedrooms: () => (!Number.isFinite(Number(value)) || Number(value) < 0 ? 'Bedrooms cannot be negative.' : ''),
      bathrooms: () => (!Number.isFinite(Number(value)) || Number(value) < 0 ? 'Bathrooms cannot be negative.' : ''),
      maxOccupants: () => {
        if (!value || !Number.isFinite(Number(value)) || Number(value) < 1) return 'Maximum occupancy must be at least 1.'
        if (Number(nextForm.bedrooms) > 0 && Number(value) < 1) return 'Add at least one occupant.'
        return ''
      },
      minStayMonths: () => (!value || !Number.isFinite(Number(value)) || Number(value) < 1 ? 'Minimum stay must be at least 1 month.' : ''),
      description: () => {
        const length = String(value || '').trim().length
        if (length < 40) return 'Add at least 40 characters so renters understand the property.'
        if (length > 900) return 'Keep the description under 900 characters.'
        return ''
      },
      listingTerms: () => {
        const length = String(value || '').trim().length
        if (length < 20) return 'Add basic lease terms or tenant requirements.'
        if (length > 700) return 'Keep listing terms under 700 characters.'
        return ''
      },
    }
    return validators[field]?.() || ''
  }

  const updateField = (field, value) => {
    setForm((current) => {
      const next = {
        ...current,
        [field]: field === 'propertyType' && value === 'Studio' ? value : value,
      }
      if (field === 'propertyType' && value === 'Studio') {
        next.bedrooms = '0'
        next.maxOccupants = current.maxOccupants || '1'
      }
      setErrors((currentErrors) => {
        const nextErrors = { ...currentErrors }
        const error = validateField(field, value, next)
        if (error) nextErrors[field] = error
        else delete nextErrors[field]
        if (field === 'propertyType') {
          const bedroomError = validateField('bedrooms', next.bedrooms, next)
          if (bedroomError) nextErrors.bedrooms = bedroomError
          else delete nextErrors.bedrooms
        }
        return nextErrors
      })
      return next
    })
  }

  const handleImageChange = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 4)
    const previews = await Promise.all(files.map(readFileAsDataUrl))
    setImagePreviews(previews)
  }

  const validate = () => {
    const fields = ['title', 'rent', 'deposit', 'availableFrom', 'area', 'bedrooms', 'bathrooms', 'maxOccupants', 'minStayMonths', 'description', 'listingTerms']
    const nextErrors = fields.reduce((acc, field) => {
      const error = validateField(field, form[field], form)
      if (error) acc[field] = error
      return acc
    }, {})
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return

    setIsSaving(true)
    const listingId = addProperty({
      title: form.title.trim(),
      description: form.description.trim(),
      propertyType: form.propertyType,
      area: form.area.trim(),
      city: form.city,
      approximateAddress: `${form.area.trim()} area`,
      eircode: '',
      rent: Number(form.rent),
      deposit: Number(form.deposit),
      billsIncluded: Boolean(form.billsIncluded),
      availableFrom: form.availableFrom,
      bedrooms: form.propertyType === 'Studio' ? 0 : Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      maxOccupants: Number(form.maxOccupants),
      furnished: form.furnished,
      parking: form.parking,
      minStayMonths: Number(form.minStayMonths),
      smokingAllowed: form.smokingAllowed,
      petsAllowed: form.petsAllowed,
      amenities: [
        form.billsIncluded ? 'Bills included' : 'Bills separate',
        form.furnished,
        form.propertyType,
        form.occupationPreference === 'Any' ? 'Flexible applicants' : form.occupationPreference,
      ],
      images: previewImages,
      viewingType: form.viewingType,
      listingStatus: 'pending_verification',
      listingRules: [
        form.smokingAllowed === 'No' ? 'No smoking indoors' : 'Smoking by agreement',
        form.petsAllowed === 'Comfortable' ? 'Pets considered' : 'No pets preferred',
        'Tenant references by request',
      ],
      listingTerms: form.listingTerms.trim(),
    })

    window.setTimeout(() => {
      setIsSaving(false)
      if (listingId) navigate(`/properties/${listingId}`)
    }, 180)
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <section className="card-surface card-shadow overflow-hidden rounded-[30px]">
        <div className="relative h-72">
          <img src={previewImages[0]} alt="Listing preview" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/82 via-slate-950/16 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Create listing</p>
            <h1 className="text-balance mt-2 text-3xl font-semibold tracking-tight">
              {form.title || 'List your property'}
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              {form.area || 'Area'}, {form.city} {form.rent ? `· €${form.rent}/mo` : ''}
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSection title="Photos" description="Upload a few property photos for the listing preview.">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Property images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="min-h-12 w-full rounded-[18px] border border-indigo-100 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-700"
            />
          </label>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {previewImages.map((image, index) => (
              <div key={`${image}-${index}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-[18px] bg-slate-200">
                <img src={image} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </FormSection>

        <FormSection title="Listing basics" description="Keep this concise and scannable for renters.">
          <div className="grid gap-4">
            <FormInput
              id="listing-title"
              label="Title"
              placeholder="Bright apartment in Rathmines"
              value={form.title}
              maxLength={90}
              error={errors.title}
              onChange={(event) => updateField('title', event.target.value)}
            />
            <div className="grid gap-3 min-[380px]:grid-cols-2">
              <FormInput
                label="Rent (€)"
                type="number"
                min="1"
                inputMode="numeric"
                value={form.rent}
                error={errors.rent}
                onChange={(event) => updateField('rent', event.target.value)}
              />
              <FormInput
                label="Deposit (€)"
                type="number"
                min="0"
                inputMode="numeric"
                value={form.deposit}
                error={errors.deposit}
                onChange={(event) => updateField('deposit', event.target.value)}
              />
            </div>
            <label className="surface-line flex items-center justify-between rounded-[20px] bg-white px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Bills included</span>
              <input
                type="checkbox"
                checked={form.billsIncluded}
                onChange={(event) => updateField('billsIncluded', event.target.checked)}
                className="h-5 w-5 accent-emerald-500"
              />
            </label>
            <FormInput
              label="Move-in date"
              type="date"
              min={today}
              value={form.availableFrom}
              error={errors.availableFrom}
              onChange={(event) => updateField('availableFrom', event.target.value)}
            />
          </div>
        </FormSection>

        <FormSection title="Location and property" description="These details drive matching and filtering.">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectInput
              label="City"
              value={form.city}
              onChange={(event) => updateField('city', event.target.value)}
              options={cityOptions.map((item) => ({ label: item, value: item }))}
            />
            <FormInput
              label="Area"
              placeholder="Rathmines"
              value={form.area}
              maxLength={70}
              error={errors.area}
              onChange={(event) => updateField('area', event.target.value)}
            />
            <SelectInput
              label="Property type"
              value={form.propertyType}
              onChange={(event) => updateField('propertyType', event.target.value)}
              options={propertyTypeOptions.map((item) => ({ label: item, value: item }))}
            />
            <FormInput
              label="Bedrooms"
              type="number"
              min="0"
              inputMode="numeric"
              value={form.bedrooms}
              error={errors.bedrooms}
              disabled={form.propertyType === 'Studio'}
              onChange={(event) => updateField('bedrooms', event.target.value)}
            />
            <FormInput
              label="Bathrooms"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={form.bathrooms}
              error={errors.bathrooms}
              onChange={(event) => updateField('bathrooms', event.target.value)}
            />
            <FormInput
              label="Max occupants"
              type="number"
              min="1"
              inputMode="numeric"
              value={form.maxOccupants}
              error={errors.maxOccupants}
              onChange={(event) => updateField('maxOccupants', event.target.value)}
            />
            <SelectInput
              label="Furnished"
              value={form.furnished}
              onChange={(event) => updateField('furnished', event.target.value)}
              options={furnishedOptions.map((item) => ({ label: item, value: item }))}
            />
            <SelectInput
              label="Parking"
              value={form.parking}
              onChange={(event) => updateField('parking', event.target.value)}
              options={parkingOptions.map((item) => ({ label: item, value: item }))}
            />
            <FormInput
              label="Minimum stay (months)"
              type="number"
              min="1"
              inputMode="numeric"
              value={form.minStayMonths}
              error={errors.minStayMonths}
              onChange={(event) => updateField('minStayMonths', event.target.value)}
            />
            <SelectInput
              label="Viewing"
              value={form.viewingType}
              onChange={(event) => updateField('viewingType', event.target.value)}
              options={viewingTypeOptions.map((item) => ({ label: item, value: item }))}
            />
            <SelectInput
              label="Occupation preference"
              value={form.occupationPreference}
              onChange={(event) => updateField('occupationPreference', event.target.value)}
              options={occupationOptions.map((item) => ({ label: item, value: item }))}
            />
            <SelectInput
              label="Pets"
              value={form.petsAllowed}
              onChange={(event) => updateField('petsAllowed', event.target.value)}
              options={petOptions.map((item) => ({ label: item, value: item }))}
            />
            <SelectInput
              label="Smoking"
              value={form.smokingAllowed}
              onChange={(event) => updateField('smokingAllowed', event.target.value)}
              options={smokingOptions.map((item) => ({ label: item, value: item }))}
            />
          </div>
        </FormSection>

        <FormSection title="Description" description="Explain the property and the ideal tenancy.">
          <div className="grid gap-4">
            <FormInput
              textarea
              rows={4}
              label="Property description"
              placeholder="Describe the property, transport, light, storage and amenities."
              value={form.description}
              maxLength={900}
              error={errors.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
            <FormInput
              textarea
              rows={4}
              label="Listing terms"
              placeholder="Add lease terms, viewing notes, document expectations or tenant requirements."
              value={form.listingTerms}
              maxLength={700}
              error={errors.listingTerms}
              onChange={(event) => updateField('listingTerms', event.target.value)}
            />
          </div>
        </FormSection>

        {Object.keys(errors).length ? (
          <div className="rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Check the highlighted fields before publishing.
          </div>
        ) : null}

        <div className="sticky bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-20 grid grid-cols-[0.9fr_1.1fr] gap-3 rounded-[28px] border border-white/70 bg-white/94 p-2 shadow-soft backdrop-blur-xl">
          <Button variant="secondary" onClick={() => navigate('/properties')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving} isLoading={isSaving}>
            {isSaving ? 'Submitting' : 'Submit listing'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function FormSection({ title, description, children }) {
  return (
    <section className="card-surface card-shadow rounded-[28px] p-5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
