import { ProductSelect } from './ProductSelect'
export function ProductTime({
  value,
  onChange,
  label,
  end = false,
  disabled = false,
}: {
  value: number
  onChange: (value: number) => void
  label: string
  end?: boolean
  disabled?: boolean
}) {
  const values = Array.from({ length: end ? 97 : 96 }, (_, i) => i * 15)
  if (!values.includes(value)) values.push(value)
  return (
    <ProductSelect
      ariaLabel={label}
      value={String(value)}
      disabled={disabled}
      options={values
        .sort((a, b) => a - b)
        .map((n) => ({
          value: String(n),
          label: n === 1440 ? '00:00 (dia seguinte)' : `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`,
        }))}
      onChange={(v) => onChange(Number(v))}
    />
  )
}
