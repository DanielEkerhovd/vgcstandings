import { ViewSkeleton } from "@/components/shared";

/** Below the layout, so only the tree is replaced — see the standings' own
 *  `loading.tsx` two directories up. */
export default function Loading() {
  return <ViewSkeleton view="bracket" />;
}
