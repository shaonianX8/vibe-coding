import { requireUser } from "@/lib/auth";
import { Tabs } from "@/components/Tabs";
import { ServiceWorker } from "@/components/ServiceWorker";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <main>{children}</main>
      <Tabs />
      <ServiceWorker />
    </>
  );
}
