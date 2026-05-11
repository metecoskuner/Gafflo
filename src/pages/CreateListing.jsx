import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import SelectInput from '../components/SelectInput'
import useAppState from '../context/useAppState'

const cityOptions = ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford']
const roomTypeOptions = ['Single room', 'Double room', 'Large single', 'Ensuite']
const genderOptions = ['Any', 'Female preferred', 'Male preferred']
const occupationOptions = ['Any', 'Full-time', 'Part-time', 'Student', 'Remote worker']
const petOptions = ['Comfortable', 'Not comfortable']
const smokingOptions = ['No', 'Outside only', 'Yes']
const lifestyleOptions = ['Quiet', 'Balanced', 'Social']

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
    roomType: 'Double room',
    genderPreference: 'Any',
    occupationPreference: 'Any',
    petsAllowed: 'Comfortable',
    smokingAllowed: 'No',
    lifestyleTags: ['Balanced'],
    description: '',
    flatmateSummary: '',
  }
}

export default function CreateListing() {
  const navigate = useNavigate()
  const { addCreatedListing } = useAppState()
  const [form, setForm] = useState(createInitialForm)
  const [imagePreviews, setImagePreviews] = useState([])
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const selectedLifestyle = form.lifestyleTags[0] || 'Balanced'

  const previewImages = useMemo(() => (imagePreviews.length ? imagePreviews : [defaultImage]), [imagePreviews])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleImageChange = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 4)
    const previews = await Promise.all(files.map(readFileAsDataUrl))
    setImagePreviews(previews)
  }

  const validate = () => {
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Add a clear listing title.'
    if (!form.rent || Number(form.rent) <= 0) nextErrors.rent = 'Add the monthly rent.'
    if (!form.deposit || Number(form.deposit) < 0) nextErrors.deposit = 'Add the deposit amount.'
    if (!form.availableFrom) nextErrors.availableFrom = 'Choose the move-in date.'
    if (!form.area.trim()) nextErrors.area = 'Add the area or neighbourhood.'
    if (!form.description.trim()) nextErrors.description = 'Add a short room description.'
    if (!form.flatmateSummary.trim()) nextErrors.flatmateSummary = 'Add a flatmate summary.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return

    setIsSaving(true)
    const listingId = addCreatedListing({
      title: form.title.trim(),
      area: form.area.trim(),
      city: form.city,
      rent: Number(form.rent),
      deposit: Number(form.deposit),
      billsIncluded: Boolean(form.billsIncluded),
      availableFrom: form.availableFrom,
      minStayMonths: 6,
      roomType: form.roomType,
      housematesCount: 2,
      lifestyle: selectedLifestyle,
      cleanliness: 'Very clean',
      smokingAllowed: form.smokingAllowed,
      petsAllowed: form.petsAllowed,
      genderPreference: form.genderPreference,
      occupationTypes: form.occupationPreference === 'Any' ? occupationOptions.filter((item) => item !== 'Any') : [form.occupationPreference],
      description: form.description.trim(),
      flatmateSummary: form.flatmateSummary.trim(),
      images: previewImages,
      landlordName: 'Your listing',
      features: [
        form.billsIncluded ? 'Bills included' : 'Bills separate',
        `${selectedLifestyle} home`,
        form.roomType,
        form.occupationPreference === 'Any' ? 'Flexible occupation' : form.occupationPreference,
      ],
      houseRules: [
        form.smokingAllowed === 'No' ? 'No smoking indoors' : 'Smoking by agreement',
        form.petsAllowed === 'Comfortable' ? 'Pets considered' : 'No pets preferred',
        'Respect shared spaces',
      ],
      source: 'created',
    })

    window.setTimeout(() => {
      setIsSaving(false)
      navigate(`/rooms/${listingId}`)
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
              {form.title || 'List your room'}
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              {form.area || 'Area'}, {form.city} {form.rent ? `· €${form.rent}/mo` : ''}
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSection title="Photos" description="Upload a few room photos. They are stored locally for this prototype.">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Room images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="min-h-12 w-full rounded-[18px] border border-orange-100 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-700"
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
              label="Title"
              placeholder="Bright double room in Rathmines"
              value={form.title}
              error={errors.title}
              onChange={(event) => updateField('title', event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="Rent (€)"
                type="number"
                value={form.rent}
                error={errors.rent}
                onChange={(event) => updateField('rent', event.target.value)}
              />
              <FormInput
                label="Deposit (€)"
                type="number"
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
              value={form.availableFrom}
              error={errors.availableFrom}
              onChange={(event) => updateField('availableFrom', event.target.value)}
            />
          </div>
        </FormSection>

        <FormSection title="Location and room" description="These details drive matching and filtering.">
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
              error={errors.area}
              onChange={(event) => updateField('area', event.target.value)}
            />
            <SelectInput
              label="Room type"
              value={form.roomType}
              onChange={(event) => updateField('roomType', event.target.value)}
              options={roomTypeOptions.map((item) => ({ label: item, value: item }))}
            />
            <SelectInput
              label="Gender preference"
              value={form.genderPreference}
              onChange={(event) => updateField('genderPreference', event.target.value)}
              options={genderOptions.map((item) => ({ label: item, value: item }))}
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

        <FormSection title="Lifestyle" description="Pick the strongest signal for the household vibe.">
          <div className="grid grid-cols-3 gap-2">
            {lifestyleOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateField('lifestyleTags', [option])}
                className={`min-h-12 rounded-[18px] border px-3 text-sm font-semibold transition ${
                  selectedLifestyle === option
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-soft'
                    : 'border-orange-100 bg-white text-slate-600'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Description" description="Explain the room and who it suits.">
          <div className="grid gap-4">
            <FormInput
              textarea
              rows={4}
              label="Room description"
              placeholder="Describe the room, transport, light, storage and shared spaces."
              value={form.description}
              error={errors.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
            <FormInput
              textarea
              rows={4}
              label="Flatmate summary"
              placeholder="Who lives there, household rhythm, cleaning style, guest expectations."
              value={form.flatmateSummary}
              error={errors.flatmateSummary}
              onChange={(event) => updateField('flatmateSummary', event.target.value)}
            />
          </div>
        </FormSection>

        {Object.keys(errors).length ? (
          <div className="rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Check the highlighted fields before publishing.
          </div>
        ) : null}

        <div className="sticky bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-20 grid grid-cols-[0.9fr_1.1fr] gap-3 rounded-[28px] border border-white/70 bg-white/94 p-2 shadow-soft backdrop-blur-xl">
          <Button variant="secondary" onClick={() => navigate('/rooms')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Publishing...' : 'Publish listing'}
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
