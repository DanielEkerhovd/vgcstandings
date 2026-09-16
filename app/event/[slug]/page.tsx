import { redirect } from "next/navigation";

/** /event/<slug> is the Masters page; nothing should sit at a bare event. */
export default async function EventRoot({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/event/${slug}/masters`);
}
