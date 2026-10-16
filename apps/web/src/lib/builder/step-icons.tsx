import type { SVGProps } from "react";
import {
  Fan,
  Gamepad2,
  Headphones,
  Keyboard,
  Mic,
  MonitorSmartphone,
  Mouse,
  RectangleHorizontal,
  Speaker,
  Video,
  Wifi,
  Wrench,
} from "lucide-react";
import type { PcBuilderStepId } from "@/lib/builder/types";
import {
  IconCase,
  IconCooler,
  IconCpu,
  IconGpu,
  IconHdd,
  IconMonitor,
  IconMotherboard,
  IconPsu,
  IconRam,
  IconSsd,
} from "@/lib/builder/step-icons-svg";

export type StepIcon = (props: SVGProps<SVGSVGElement> & { className?: string }) => JSX.Element;

export const PC_BUILDER_STEP_ICONS: Record<PcBuilderStepId, StepIcon> = {
  cpu: IconCpu,
  motherboard: IconMotherboard,
  ram: IconRam,
  gpu: IconGpu,
  ssd: IconSsd,
  hdd: IconHdd,
  psu: IconPsu,
  case: IconCase,
  cooler: IconCooler,
  os: MonitorSmartphone as unknown as StepIcon,
  case_fans: Fan as unknown as StepIcon,
  wifi: Wifi as unknown as StepIcon,
  accessories: Wrench as unknown as StepIcon,
  monitor: IconMonitor,
  mouse: Mouse as unknown as StepIcon,
  keyboard: Keyboard as unknown as StepIcon,
  mousepad: RectangleHorizontal as unknown as StepIcon,
  controller: Gamepad2 as unknown as StepIcon,
  headset: Headphones as unknown as StepIcon,
  microphone: Mic as unknown as StepIcon,
  speakers: Speaker as unknown as StepIcon,
  webcam: Video as unknown as StepIcon,
};
