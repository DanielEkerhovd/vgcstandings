import BracketBoard from "@/components/BracketBoard";
import { eventViewMetadata, type Params, type SP } from "@/lib/eventView";

/** Sixty seconds: this HTML carries live scores, so an hour-old copy is worse
 *  than none. The catalogue behind it is still cached hourly. */
export const revalidate = 60;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SP }) {
  return eventViewMetadata(params, searchParams, "bracket");
}

/** The event, the chrome and the rows are all the layout's — see it for why. */
export default function Page() {
  return <BracketBoard />;
}
