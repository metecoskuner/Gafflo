import GaffloSelect from './GaffloSelect'

export default function SelectInput({ label, error, options, ...props }) {
  return <GaffloSelect label={label} error={error} options={options} {...props} />
}
