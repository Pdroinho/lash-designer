import { X } from '../../components/Icons'
import { Switch } from '../../components/SharedUi'
import { clock, weekdays, type Hours } from './teamTypes'
import { ProductTime as TeamTime } from '../../components/ProductTime'
export { TeamTime }
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
      <div className="team-hours-mode">
        <Switch
          label="Personalizar horários"
          ariaLabel="Personalizar horários"
          checked={custom}
          disabled={disabled}
          onChange={(value) => {
            if (value && !hours.length)
              onChange(inherited.map((row) => ({ ...row })))
            onCustom(value)
          }}
        />
        <small className="form-help">
          {custom
            ? 'Escolha os dias e períodos desta profissional.'
            : 'Esta profissional segue o horário do estúdio.'}
        </small>
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
                  <Switch
                    checked={rows.length > 0}
                    ariaLabel={`Atender ${weekdays[day]}`}
                    label={weekdays[day]}
                    disabled={disabled}
                    onChange={(checked) =>
                      onChange(
                        checked
                          ? [
                              ...hours,
                              {
                                weekday: day,
                                startMinute: 540,
                                endMinute: 1080,
                              },
                            ]
                          : hours.filter((row) => row.weekday !== day),
                      )
                    }
                  />
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
                        <div className="team-hour-field">
                          <span className="label">Das</span>
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
                        </div>
                        <div className="team-hour-field">
                          <span className="label">Até</span>
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
                        </div>
                        <button
                          type="button"
                          className="icon-btn team-remove"
                          aria-label={`Remover período ${n + 1} ${weekdays[day]}`}
                          disabled={disabled}
                          onClick={() =>
                            onChange(
                              hours.filter((_, index) => index !== row.index),
                            )
                          }
                        >
                          <X size={16} />
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
                    className="btn btn-ghost team-text-button"
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
