import UsageBoard from "@/components/UsageBoard";
import { eventViewMetadata, one, type Params, type SP } from "@/lib/eventView";

/** Sixty seconds: this HTML carries live scores, so an hour-old copy is worse
 *  than none. The catalogue behind it is still cached hourly. */
export const revalidate = 60;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SP }) {
  return eventViewMetadata(params, searchParams, "usage");
}

/** The event, the chrome and the rows are all the layout's — see it for why.
 *  All that's left per view is which board, and the one search param it reads. */
export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <UsageBoard initialMon={one(sp.mon)} />;
}
