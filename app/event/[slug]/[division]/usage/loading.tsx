import { ViewSkeleton } from "@/components/shared";

/** Below the layout, so only the tally is replaced — see the standings' own
 *  `loading.tsx` beside it. */
export default function Loading() {
  return <ViewSkeleton view="usage" />;
}
