import { SetupFrame } from "@/components/setup-frame";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SetupFrame>{children}</SetupFrame>;
}
