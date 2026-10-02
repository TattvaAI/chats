import Image from 'next/image';

export interface HeroClusterProps {
  className?: string;
}

export function HeroCluster({ className = '' }: HeroClusterProps = {}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center -space-x-2.5 min-[380px]:-space-x-3 sm:-space-x-4 select-none ${className}`.trim()}
    >
      {/* 1. Clara Ladder */}
      <span className="relative flex size-11 min-[380px]:size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#18181b] bg-[#ffd36e] shadow-xs sm:size-16 sm:border-[3px] md:size-[4.5rem]">
        <Image
          src="/images/clara/ladder.webp"
          alt=""
          width={96}
          height={96}
          className="size-full object-cover"
        />
      </span>

      {/* 2. WhatsApp Icon */}
      <span className="relative flex size-11 min-[380px]:size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#25d366] bg-white shadow-xs sm:size-16 sm:border-[3px] md:size-[4.5rem]">
        <Image
          src="/icons/whatsapp.svg"
          alt=""
          width={72}
          height={72}
          className="size-[70%]"
        />
      </span>

      {/* 3. Heartbreak Emoji */}
      <span className="relative flex size-11 min-[380px]:size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#fb7185] bg-[#fff1f2] text-xl min-[380px]:text-2xl shadow-xs sm:size-16 sm:border-[3px] sm:text-3xl md:size-[4.5rem] md:text-4xl">
        💔
      </span>

      {/* 4. Center Brandon Avatar */}
      <span className="relative z-10 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#18181b] bg-[#ffd36e] shadow-md sm:size-[4.5rem]">
        <Image
          src="/images/brandon/avatar.webp"
          alt="Brandon"
          width={112}
          height={112}
          className="size-full object-cover"
          priority
        />
      </span>

      {/* 5. Laugh Emoji */}
      <span className="relative flex size-11 min-[380px]:size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#f59e0b] bg-[#fff7d6] text-xl min-[380px]:text-2xl shadow-xs sm:size-16 sm:border-[3px] sm:text-3xl md:size-[4.5rem] md:text-4xl">
        😂
      </span>

      {/* 6. House Emoji */}
      <span className="relative flex size-11 min-[380px]:size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#a78bfa] bg-[#f5f1ff] text-xl min-[380px]:text-2xl shadow-xs sm:size-16 sm:border-[3px] sm:text-3xl md:size-[4.5rem] md:text-4xl">
        🏡
      </span>

      {/* 7. iMessage Icon */}
      <span className="relative flex size-11 min-[380px]:size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#60a5fa] bg-white shadow-xs sm:size-16 sm:border-[3px] md:size-[4.5rem]">
        <Image
          src="/icons/imessage.svg"
          alt=""
          width={72}
          height={72}
          className="size-[70%]"
        />
      </span>
    </div>
  );
}
