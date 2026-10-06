export interface MarqueePill {
  emoji: string;
  text: string;
}

export interface MarqueePillsProps {
  items?: MarqueePill[];
  className?: string;
}

const PILLS: MarqueePill[] = [
  { emoji: '💔', text: 'Ex' },
  { emoji: '🌀', text: 'Situationship' },
  { emoji: '💌', text: 'Boyfriend' },
  { emoji: '🤝', text: 'Best friend' },
  { emoji: '🐐', text: 'Boys group' },
  { emoji: '🏠', text: 'Family group' },
  { emoji: '💍', text: 'Husband' },
  { emoji: '💅', text: 'Girls group' },
  { emoji: '👀', text: 'Crush' },
  { emoji: '👫', text: 'Siblings' },
  { emoji: '💬', text: 'Talking stage' },
  { emoji: '🎓', text: 'Uni group' },
];

export function MarqueePills({ items = PILLS, className = '' }: MarqueePillsProps = {}) {
  const activeItems = items && items.length > 0 ? items : PILLS;

  return (
    <div
      aria-label="Popular chat types"
      className={`relative -my-1.5 w-full overflow-x-clip py-2 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] sm:[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)] select-none ${className}`.trim()}
    >
      <ul className="marquee-pills flex w-max gap-2 sm:gap-2.5">
        {/* Render twice for seamless continuous scroll loop */}
        {[...activeItems, ...activeItems].map((pill, i) => (
          <li
            key={`${pill.text}-${i}`}
            aria-hidden={i >= activeItems.length}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-2xs transition-colors hover:border-foreground/30 hover:text-foreground sm:px-3.5 sm:py-1 sm:text-sm"
          >
            <span aria-hidden="true">{pill.emoji}</span>
            <span>{pill.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
