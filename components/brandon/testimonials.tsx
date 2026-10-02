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

const TESTIMONIALS: TestimonialItem[] = [
  {
    name: 'Camille',
    flag: '🇫🇷',
    roleEmoji: '💔',
    role: 'Ex',
    image: '/images/testimonials/camille.webp',
    quote:
      'He left three weeks ago and I was rereading everything at 3am. Brandon found the exact week he started pulling away and explained what I kept excusing. It said the love was real and the capacity wasn\'t. I finally slept.',
  },
  {
    name: 'Valeria',
    flag: '🇲🇽',
    roleEmoji: '🌀',
    role: 'Situationship',
    image: '/images/testimonials/valeria.jpg',
    quote:
      'Eight months of "we\'re not anything" and I couldn\'t tell if I was crazy. Brandon read our chat and put the whole pattern on one page: who initiated, who disappeared, what I said yes to. The second report told me what to do about it.',
  },
  {
    name: 'Hugo',
    flag: '🇫🇷',
    roleEmoji: '🐐',
    role: 'Boys group',
    image: '/images/testimonials/hugo.webp',
    quote:
      'Fifteen years of group chat and Brandon nailed all seven of us in one page each. The awards section got screenshotted into the chat within a minute and we argued about the predictions for a week. Nobody was spared, nobody\'s angry.',
  },
  {
    name: 'Chloé',
    flag: '🇫🇷',
    roleEmoji: '🤝',
    role: 'Best friend',
    image: '/images/testimonials/chloe.webp',
    quote:
      'Twelve years of messages with my best friend. It found the exact month things shifted and put into words what each of us was actually saying underneath. We read it together on the phone and both cried, then laughed at the "diet discipline: 1/5" rating.',
  },
  {
    name: 'Margaux',
    flag: '🇫🇷',
    roleEmoji: '🏠',
    role: 'Family group',
    image: '/images/testimonials/margaux.jpg',
    quote:
      'He gave my mum the title Minister of the Interior for her weather alerts and my dad a full paragraph for only ever posting door codes. Then one section about my grandmother that made all five of us cry at Sunday lunch.',
  },
  {
    name: 'Nadia',
    flag: '🇫🇷',
    roleEmoji: '💍',
    role: 'Husband',
    image: '/images/testimonials/nadia.webp',
    quote:
      'Twelve years, two kids, and a WhatsApp thread that had become a logistics desk. Brandon read it like a neutral witness: what we stopped saying, when, and why. Harder than couples therapy and more useful. We\'ve started talking again.',
  },
  {
    name: 'Thiago',
    flag: '🇧🇷',
    roleEmoji: '🎓',
    role: 'Uni group',
    image: '/images/testimonials/thiago.webp',
    quote:
      'Four of us from the same course. Brandon worked out who carries the group, who only shows up to split the bill, and wrote a glossary of our slang that was scarily accurate. I dropped it in the chat during a lecture. Three hundred messages by the end of the hour.',
  },
  {
    name: 'Jonas',
    flag: '🇩🇪',
    roleEmoji: '💌',
    role: 'Couple',
    image: '/images/testimonials/jonas.jpg',
    quote:
      'Honestly we uploaded it for a laugh. The awards section roasted us both and my girlfriend read it out loud. Then the last part got quiet and very accurate about how I go silent when I\'m stressed. We\'re keeping it.',
  },
];

export function Testimonials({ items = TESTIMONIALS, className = '' }: TestimonialsProps = {}) {
  const displayItems = items && items.length > 0 ? items : TESTIMONIALS;

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
