import { AiModuleNavbar, AiModuleBody } from "@/components/ai/ai-module-chrome";

/** AI module - persistent navbar (Admin / Storefront / Configuration) over the chat workspace and its pages. */
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 -mt-3 -mb-3 flex h-full min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-hidden max-md:mb-0 lg:-mx-4 lg:-mt-4 lg:-mb-4 lg:w-[calc(100%+2rem)]">
      <AiModuleNavbar />
      <AiModuleBody className="overflow-hidden">{children}</AiModuleBody>
    </div>
  );
}
