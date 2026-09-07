import { redirect } from 'next/navigation';

type NotesLegacyRedirectProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy alias — billing agents use `/portal-billing/claims`. */
export default async function NotesLegacyRedirect({ searchParams }: NotesLegacyRedirectProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
  }
  const query = qs.toString();
  redirect(`/portal-billing/claims${query ? `?${query}` : ''}`);
}
