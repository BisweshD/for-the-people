import {
  Container,
  Coins,
  Cpu,
  Globe,
  GraduationCap,
  HardHat,
  HeartPulse,
  Landmark,
  Leaf,
  Scale,
  Signpost,
  Stethoscope,
  Target,
  Vote,
  type LucideIcon,
} from "lucide-react";

/** Issue areas store a Lucide icon name; this explicit map keeps unused icons out of the bundle. */
const ICONS: Record<string, LucideIcon> = {
  Container,
  Coins,
  Cpu,
  Globe,
  GraduationCap,
  HardHat,
  HeartPulse,
  Landmark,
  Leaf,
  Scale,
  Signpost,
  Stethoscope,
  Target,
  Vote,
};

export function IssueIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Landmark;
  return <Icon className={className} aria-hidden strokeWidth={1.75} />;
}
