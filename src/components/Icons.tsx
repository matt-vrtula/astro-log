import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14" /></Icon>
);
export const EditIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
);
export const LayersIcon = (p: IconProps) => (
  <Icon {...p}><path d="m12 2 10 5-10 5L2 7Z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></Icon>
);
export const LocationIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="10" r="2.5" /></Icon>
);
export const ListIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" /></Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}><path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7" /></Icon>
);
export const CameraIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 8h4l2-3h6l2 3h4v12H3Z" /><circle cx="12" cy="13" r="3.5" /></Icon>
);
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 22V4M4 4h13l-2 4 2 4H4" /></Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);
