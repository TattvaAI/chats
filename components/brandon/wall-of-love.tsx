import Image from 'next/image';

export interface WallItem {
  emoji: string;
  label: string;
  image: string;
  alt: string;
}

const ROW_1: WallItem[] = [
  {
    emoji: '👨‍👩‍👦',
    label: 'Family',
    image: '/images/wall-of-love/family-group.webp',
    alt: 'A family WhatsApp group lighting up the moment someone drops their group-chat report into the chat.',
  },
  {
    emoji: '💑',
    label: 'Situationship',
    image: '/images/wall-of-love/couple.webp',
    alt: 'A situationship reacting on iMessage after one of them drops the report into the chat.',
  },
  {
    emoji: '💘',
    label: 'Boyfriend',
    image: '/images/wall-of-love/boyfriend.webp',
    alt: 'A couple on WhatsApp laughing at their report.',
  },
  {
    emoji: '👭',
    label: 'Best friends · part 1',
    image: '/images/wall-of-love/best-friends-1.webp',
    alt: 'Two best friends reading through their report at 2am.',
  },
  {
    emoji: '👭',
    label: 'Best friends · part 2',
    image: '/images/wall-of-love/best-friends-2.webp',
    alt: 'Reacting to the inside joke glossary in the group.',
  },
  {
    emoji: '👭',
    label: 'Best friends · part 3',
    image: '/images/wall-of-love/best-friends-3.webp',
    alt: 'The awards section dropped straight into iMessage.',
  },
  {
    emoji: '🥹',
    label: '11 months',
    image: '/images/wall-of-love/eleven-months.webp',
    alt: 'An 11-month relationship chat analyzed by Brandon.',
  },
  {
    emoji: '🍾',
    label: "Lads' trip",
    image: '/images/wall-of-love/friends-trip.webp',
    alt: 'A lads trip WhatsApp group detonating after the report lands.',
  },
];

const ROW_2: WallItem[] = [
  {
    emoji: '👯‍♀️',
    label: 'Girls',
    image: '/images/wall-of-love/girls.jpg',
    alt: 'A girls WhatsApp group erupting after their friend drops the report into the chat.',
  },
  {
    emoji: '🦫',
    label: 'Boyzzz',
    image: '/images/wall-of-love/founding-fathers.webp',
    alt: 'A boys group chat detonating after someone fires their report into the chat.',
  },
  {
    emoji: '💔',
    label: 'Ex',
    image: '/images/wall-of-love/ex-boyfriend.webp',
    alt: 'A friend on WhatsApp losing it the moment someone drops in their report about an ex.',
  },
  {
    emoji: '❤️',
    label: 'Love report · part 1',
    image: '/images/wall-of-love/love-report-1.webp',
    alt: 'A couple reacting on iMessage as the report lands in their chat. (part 1)',
  },
  {
    emoji: '❤️',
    label: 'Love report · part 2',
    image: '/images/wall-of-love/love-report-2.webp',
    alt: 'A couple reacting on iMessage as the report lands in their chat. (part 2)',
  },
  {
    emoji: '🍺',
    label: 'Old friend',
    image: '/images/wall-of-love/old-friends.webp',
    alt: 'Two old friends on WhatsApp, laughing and tearing up when the report hits the chat.',
  },
  {
    emoji: '🏡',
    label: 'Extended family',
    image: '/images/wall-of-love/extended-family.webp',
    alt: 'An extended-family WhatsApp group reacting the moment someone shares the report.',
  },
  {
    emoji: '👨‍👦',
    label: 'Father & son',
    image: '/images/wall-of-love/dad-son.webp',
    alt: 'A father and son on WhatsApp howling after the report drops into their chat.',
  },
  {
    emoji: '🤙',
    label: "Boys' group",
    image: '/images/wall-of-love/boys-group.webp',
    alt: "A huge boys' WhatsApp group cracking up the second their group-chat report lands.",
  },
];

function WallCard({ item }: { item: WallItem }) {
  return (
    <li className="flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs sm:w-52">
      <div className="flex items-center justify-center border-b border-border px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span aria-hidden="true">{item.emoji}</span>
          <span>{item.label}</span>
        </span>
      </div>
      <div className="relative aspect-[1200/2250] w-full overflow-hidden bg-muted">
        <Image
          src={item.image}
          alt={item.alt}
          width={400}
          height={750}
          className="size-full object-cover"
          sizes="(min-width: 640px) 208px, 176px"
        />
      </div>
    </li>
  );
}

export function WallOfLove({ className = '' }: { className?: string } = {}) {
  return (
    <section className={`w-full overflow-hidden py-14 sm:py-20 ${className}`.trim()}>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 pb-10 text-center sm:gap-4 sm:pb-14">
        <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl text-foreground">
          Wall of Love
        </h2>
        <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
          Brandon’s reports are so good, people share them.
        </p>
      </div>

      <div className="-my-2 flex flex-col gap-4 overflow-x-clip py-2 select-none sm:gap-6 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        {/* Row 1 track */}
        <div className="relative w-full overflow-x-clip">
          <ul className="marquee-pills flex w-max gap-4 sm:gap-6">
            {[...ROW_1, ...ROW_1].map((item, idx) => (
              <WallCard key={`row1-${item.label}-${idx}`} item={item} />
            ))}
          </ul>
        </div>

        {/* Row 2 track */}
        <div className="relative w-full overflow-x-clip">
          <ul className="marquee-pills flex w-max gap-4 sm:gap-6" style={{ animationDirection: 'reverse' }}>
            {[...ROW_2, ...ROW_2].map((item, idx) => (
              <WallCard key={`row2-${item.label}-${idx}`} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
