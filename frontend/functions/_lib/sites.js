// Client websites hosted on this Pages project. Each lives in public/sites/<slug>/ and is served at the
// root of the client's own domain (add the domain under Pages → Custom domains). Extra domains 301 to the primary.
// Until the domain is connected the site previews at https://mesaintelligence.ai/sites/<slug>/ (noindex).
export const CLIENT_SITES = [
  {
    slug: "lloyd-family-dobermans",
    tenant: "lloyd-family-dobermans",
    primary: "lloydfamilydobermans.com",
    aliases: ["www.lloydfamilydobermans.com", "lloydfamilydoberman.com", "www.lloydfamilydoberman.com"],
  },
];

export function siteForHost(host) {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  for (const s of CLIENT_SITES) {
    if (h === s.primary) return { site: s, redirect: false };
    if (s.aliases.includes(h)) return { site: s, redirect: true };
  }
  return null;
}
