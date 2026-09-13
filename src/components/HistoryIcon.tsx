export function HistoryIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/luma/history.svg"
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
