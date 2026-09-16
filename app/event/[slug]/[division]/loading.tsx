import { ViewSkeleton } from "@/components/shared";

/** Shown while the standings segment renders. It sits *below* the layout, so
 *  the masthead, the nav and the division control above it stay exactly where
 *  they are — only the table is replaced. The same placeholder is what
 *  `EventShell` has already drawn by the time this can appear. */
export default function Loading() {
  return <ViewSkeleton view="standings" />;
}
