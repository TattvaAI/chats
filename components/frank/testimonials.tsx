import Image from 'next/image';

export interface TestimonialItem {
  name: string;
  flag: string;
  roleEmoji: string;
  role: string;
  image: string;
  quote: string;
}

export interface TestimonialsProps {
  items?: TestimonialItem[];
  className?: string;
}

const TESTIMONIALS: TestimonialItem[] = [];

export function Testimonials({ items = TESTIMONIALS, className = '' }: TestimonialsProps = {}) {
  const displayItems = items && items.length > 0 ? items : TESTIMONIALS;

  if (!displayItems.length) return null;
  return (
    <section className={`flex w-full flex-col pt-10 sm:pt-14 ${className}`.trim()}>
      <h2 className="pb-8 text-center font-serif text-3xl font-medium tracking-tight text-foreground sm:pb-10 sm:text-4xl lg:text-5xl">
        Testimonials
      </h2>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-8 pt-2 sm:-mx-6 sm:gap-6 sm:px-10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {displayItems.map((t, idx) => (
          <figure
            key={`${t.name}-${idx}`}
            className="flex w-[min(19.5rem,85vw)] shrink-0 snap-center flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20 sm:w-[22rem] sm:p-6"
          >
            <figcaption className="flex items-center gap-3.5">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full ring-1 ring-border/50 sm:size-14">
                <Image
                  src={t.image}
                  alt={t.name}
                  width={56}
                  height={56}
                  className="size-full object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <span className="truncate text-sm sm:text-base">{t.name}</span>
                  <span className="text-base">{t.flag}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span aria-hidden="true">{t.roleEmoji}</span>
                  <span className="truncate">{t.role}</span>
                </div>
              </div>
            </figcaption>

            <blockquote className="mt-4 text-xs font-normal leading-relaxed text-muted-foreground sm:text-sm">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
          </figure>
        ))}
      </div>
    </section>
  );
}
