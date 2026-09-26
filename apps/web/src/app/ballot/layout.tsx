import { ServiceWorker } from "@/components/pwa/service-worker";

/** The ballot pages install the service worker that keeps the cheat sheet available offline. */
export default function BallotLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorker />
      {children}
    </>
  );
}
