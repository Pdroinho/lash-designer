import { ProductSelect } from '../../components/ProductSelect'
import { clock, weekdays, type Hours } from './teamTypes'
export function TeamTime({
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
          label: n === 1440 ? '00:00 (dia seguinte)' : clock(n),
        }))}
      onChange={(v) => onChange(Number(v))}
    />
  )
}
export function TeamHours({
  custom,
  onCustom,
  hours,
  onChange,
  inherited,
  disabled,
}: {
  custom: boolean
  onCustom: (value: boolean) => void
  hours: Hours[]
  onChange: (value: Hours[]) => void
  inherited: Hours[]
  disabled: boolean
}) {
  return (
    <div>
      <p className="team-help">
        Use o horário do estúdio ou escolha uma rotina diferente para esta
        profissional. As folgas são cadastradas separadamente.
      </p>
      <div className="team-choice-row">
        <button
          type="button"
          aria-pressed={!custom}
          disabled={disabled}
          onClick={() => onCustom(false)}
        >
          Horário do estúdio<span>Segue as configurações gerais</span>
        </button>
        <button
          type="button"
          aria-pressed={custom}
          disabled={disabled}
          onClick={() => {
            if (!hours.length) onChange(inherited.map((row) => ({ ...row })))
            onCustom(true)
          }}
        >
          Horário personalizado<span>Escolha os dias e períodos</span>
        </button>
      </div>
      {!custom && !inherited.length ? (
        <p className="team-notice">
          O estúdio ainda não tem horários configurados. Defina-os em Agenda ou
          escolha um horário personalizado.
        </p>
      ) : null}
      <div className="team-week">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const source = custom ? hours : inherited
          const rows = source
            .map((row, index) => ({ ...row, index }))
            .filter((row) => row.weekday === day)
          return (
            <div className="team-day" key={day}>
              <div className="team-day-heading">
                {custom ? (
                  <button
                    type="button"
                    className="team-day-toggle"
                    role="switch"
                    aria-checked={rows.length > 0}
                    aria-label={`Atender ${weekdays[day]}`}
                    disabled={disabled}
                    onClick={() =>
                      onChange(
                        rows.length
                          ? hours.filter((row) => row.weekday !== day)
                          : [
                              ...hours,
                              {
                                weekday: day,
                                startMinute: 540,
                                endMinute: 1080,
                              },
                            ],
                      )
                    }
                  >
                    <span className="team-switch" aria-hidden="true" />
                    {weekdays[day]}
                  </button>
                ) : (
                  <strong>{weekdays[day]}</strong>
                )}
                {!rows.length ? <small>Não atende</small> : null}
              </div>
              <div className="team-day-periods">
                {rows.map((row, n) => (
                  <div className="team-period" key={row.index}>
                    {custom ? (
                      <>
                        <TeamTime
                          label={`Início ${weekdays[day]} período ${n + 1}`}
                          value={row.startMinute}
                          disabled={disabled}
                          onChange={(value) =>
                            onChange(
                              hours.map((h, index) =>
                                index === row.index
                                  ? { ...h, startMinute: value }
                                  : h,
                              ),
                            )
                          }
                        />
                        <span>até</span>
                        <TeamTime
                          end
                          label={`Fim ${weekdays[day]} período ${n + 1}`}
                          value={row.endMinute}
                          disabled={disabled}
                          onChange={(value) =>
                            onChange(
                              hours.map((h, index) =>
                                index === row.index
                                  ? { ...h, endMinute: value }
                                  : h,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-ghost team-remove"
                          aria-label={`Remover período ${n + 1} ${weekdays[day]}`}
                          disabled={disabled}
                          onClick={() =>
                            onChange(
                              hours.filter((_, index) => index !== row.index),
                            )
                          }
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <span>
                        {clock(row.startMinute)} —{' '}
                        {row.endMinute === 1440
                          ? '00:00 (dia seguinte)'
                          : clock(row.endMinute)}
                      </span>
                    )}
                  </div>
                ))}
                {custom && rows.length > 0 && rows.length < 4 ? (
                  <button
                    type="button"
                    className="team-text-button"
                    disabled={disabled}
                    onClick={() => {
                      const previous = rows.at(-1)!
                      onChange([
                        ...hours,
                        {
                          weekday: day,
                          startMinute: Math.min(previous.endMinute + 60, 1380),
                          endMinute: Math.min(previous.endMinute + 180, 1440),
                        },
                      ])
                    }}
                  >
                    + Adicionar período
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
