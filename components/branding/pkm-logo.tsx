import Image from "next/image";

interface PkmLogoProps {
  alt?: string;
  className?: string;
  priority?: boolean;
  size?: number;
}

export function PkmLogo({
  alt = "Pambayang Kolehiyo ng Mauban logo",
  className,
  priority = false,
  size = 40,
}: PkmLogoProps) {
  return (
    <Image
      src="/branding/pkm-logo.png"
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 object-contain ${className || ""}`}
    />
  );
}
