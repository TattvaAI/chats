import Image from 'next/image';

export interface WallOfLoveProps {
  className?: string;
}

const WALL_ITEMS = [
  {
    image: '/images/wall-of-love/best-friends-1.webp',
    title: '👭 Best friends · part 1',
    caption: 'Two best friends reading through their report at 2am.',
  },
  {
    image: '/images/wall-of-love/best-friends-2.webp',
    title: '👭 Best friends · part 2',
    caption: 'Reacting to the inside joke glossary in the group.',
  },
  {
    image: '/images/wall-of-love/best-friends-3.webp',
    title: '👭 Best friends · part 3',
    caption: 'The awards section dropped straight into iMessage.',
  },
];

export function WallOfLove({ className = '' }: WallOfLoveProps = {}) {
  return (
    <section className={`w-full px-4 py-14 sm:px-8 sm:py-20 lg:px-10 ${className}`.trim()}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 text-center sm:gap-12">
        <div className="flex flex-col gap-2.5 sm:gap-3">
          <span className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground sm:text-xs">
            WhatsApp & iMessage
          </span>
          <h2 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl lg:text-5xl text-balance">
            Wall of Love
          </h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base text-pretty">
            Frank’s reports are so good, people share them.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 md:gap-6 lg:gap-8">
          {WALL_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-md"
            >
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              </div>
              <div className="flex flex-col gap-1 p-4 text-left sm:p-4.5">
                <span className="text-xs font-semibold text-foreground sm:text-sm">{item.title}</span>
                <p className="text-xs text-muted-foreground leading-normal">{item.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
