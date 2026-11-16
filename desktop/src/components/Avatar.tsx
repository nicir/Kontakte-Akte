import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-24 text-2xl",
} as const;

export function Avatar({
  initials,
  src,
  size = "md",
  className,
}: {
  initials: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light font-semibold text-brand-dark ring-1 ring-orange-100",
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="size-full object-cover" draggable={false} /> : initials}
    </div>
  );
}
