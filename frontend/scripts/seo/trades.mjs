// Trade landing pages (the Oct 24 pivot: trades in southern NM, El Paso and West Texas).
//   • one hub per trade (ai-for-<trade>) — HVAC keeps its existing slug ai-for-hvac-companies
//   • one page per trade × city for the two home markets (<trade>-answering-service-<city>)
// Each page is built from trade facts + city facts so the copy is specific, not a find-and-replace.
// Same rules as pages.mjs: no invented stats, testimonials or client names; everything must be true of the product.

const TRIAL = "14 days free";

const TRADES = {
  hvac: {
    key: "hvac", label: "HVAC", plural: "HVAC companies", owner: "HVAC contractors", noun: "HVAC company",
    hubSlug: "ai-for-hvac-companies", citySlug: "hvac-answering-service",
    kicker: "HVAC · refrigerated air · evaporative coolers · heating",
    search: "HVAC contractor",
    calls: [
      "No-cool calls in the heat — the homeowner calls until someone answers",
      "Tune-ups and maintenance-plan visits before summer and before winter",
      "Swamp cooler start-ups and shut-downs, and refrigerated-air conversion quotes",
      "No-heat calls on cold nights, and the occasional gas-smell call that needs the right first instruction",
      "Replacement quotes — the big tickets that go to whoever calls back first",
    ],
    asks: "system type, what it's doing (blowing warm, not turning on, leaking, making noise), the address, whether anyone vulnerable is in the house, and the best callback number",
    urgent: "No cooling in extreme heat, no heat in a freeze, or an elderly person or infant in the house is treated as urgent — the line offers your first emergency window and alerts you. A gas smell gets one instruction first: leave the house and call the gas company.",
    season: "Your phone doesn't ring evenly. The first 100-degree week, every AC company in the valley gets slammed at the same time, and the calls that ring out don't wait — they call the next listing.",
    faq: [
      ["Can it tell a tune-up from an emergency?", "Yes. You set the rules — for example no-cool when it's over 100, no-heat in a freeze, water near electrical — and it books routine work into normal windows and flags the urgent ones to your phone right away."],
      ["Does it work with ServiceTitan, Housecall Pro or Jobber?", "It books into a Google Calendar out of the box. If you dispatch from ServiceTitan, Housecall Pro or Jobber, we'll set up the cleanest handoff on the setup call."],
      ["Will it quote a price?", "Only prices you approve — a diagnostic fee or a tune-up special. It never makes up a number for a repair or a new system."],
    ],
  },
  plumbing: {
    key: "plumbing", label: "Plumbing", plural: "plumbing companies", owner: "plumbers", noun: "plumbing company",
    hubSlug: "ai-for-plumbers", citySlug: "plumber-answering-service",
    kicker: "Plumbing · drains · water heaters · emergency service",
    search: "plumber",
    calls: [
      "Active leaks and burst pipes — the call goes to whoever picks up",
      "Water heaters that quit, leak or won't light",
      "Backed-up drains and sewer lines, often on a weekend or holiday",
      "Fixture swaps, repipe estimates and remodel rough-ins",
      "Realtor and property-manager calls that need a time, not a voicemail",
    ],
    asks: "what's happening and where, whether water is actively running, the address, and the best callback number — and on an active leak it tells the caller where the main shutoff usually is before anything else",
    urgent: "An active leak, a burst pipe or sewage backing up is urgent — the line gives the shutoff instruction, offers your first emergency window and alerts you. A gas smell gets one instruction: leave the house and call the gas company.",
    season: "A burst pipe at 9 PM goes to the first plumber who answers, and that customer rarely calls the second number. The same goes for the freeze nights in January, when every plumber in town is already on a job.",
    faq: [
      ["What does it say on a burst-pipe call?", "It tells the caller to shut off the main valve first — usually near the meter or where the line enters the house — then takes the address and number and alerts you right away."],
      ["Can it handle realtors and property managers?", "Yes. It takes the property address, the tenant's contact and access details, and books the visit into the windows you open."],
      ["Will it quote a price?", "Only what you approve — a trip charge, a drain-cleaning starting price. It never prices a repair it hasn't seen."],
    ],
  },
  electrical: {
    key: "electrical", label: "Electrical", plural: "electrical contractors", owner: "electricians", noun: "electrical contractor",
    hubSlug: "ai-for-electricians", citySlug: "electrician-answering-service",
    kicker: "Electrical · service calls · panels · EV chargers",
    search: "electrician",
    calls: [
      "Partial outages and tripping breakers",
      "Panel upgrades and service changes — often tied to solar or an addition",
      "EV charger installs, which are mostly quote requests from new customers",
      "Lighting, new circuits and outlets, ceiling fans",
      "Hot outlets, sparking or a burning smell — the calls that can't sit in voicemail",
    ],
    asks: "what's happening, whether anything is sparking, hot or smells like burning, the address, and the best callback number",
    urgent: "Sparking, a burning smell or a hot panel is treated as urgent — the line tells the caller to stay clear, switch that breaker off only if it's safe and call 911 if there's smoke, then alerts you.",
    season: "Electricians spend the day on ladders and in attics, and the phone rings in the truck. The calls that ring out become the other shop's estimate — especially the EV-charger and panel-upgrade quotes that are worth the most.",
    faq: [
      ["Can it qualify EV charger and panel quotes?", "Yes. It asks the questions you'd ask — panel size and age, where the charger goes, distance from the panel — and books the estimate visit."],
      ["What does it do with a sparking or burning-smell call?", "Gives the safety instruction first, takes the address and number, and alerts you right away instead of booking it into next week."],
      ["Will it quote a price?", "Only prices you approve, like a service-call fee. It never prices a job it hasn't seen."],
    ],
  },
  roofing: {
    key: "roofing", label: "Roofing", plural: "roofing companies", owner: "roofers", noun: "roofing company",
    hubSlug: "ai-for-roofers", citySlug: "roofing-answering-service",
    kicker: "Roofing · repairs · re-roofs · stucco and gutters",
    search: "roofing contractor",
    calls: [
      "Leaks during and after monsoon storms — the phone rings for days",
      "Inspection requests for insurance claims and home sales",
      "Re-roof and flat-roof recoat quotes",
      "Stucco, parapet and gutter repairs that start as a roof call",
      "Storm-week overflow, when you're on roofs from sunrise to sunset",
    ],
    asks: "what kind of roof (flat, pitched, tile, shingle), where it's leaking and how bad, whether it's an insurance claim, the address, and the best callback number",
    urgent: "An active leak during or after a storm is treated as urgent — the line suggests a bucket and moving valuables, offers your first inspection or tarp window and alerts you.",
    season: "After a hail or wind day the phone rings for three days straight, and every missed call is a roof somebody else sells. That's exactly when nobody is in the office to answer it.",
    faq: [
      ["Can it handle insurance-claim calls?", "It takes the claim details the homeowner has, the address and the damage description, and books the inspection. It doesn't give insurance advice."],
      ["What about storm weeks?", "That's when it earns its keep: it answers every call at once, triages active leaks first, and fills your inspection windows in order."],
      ["Will it quote a price?", "No — roofing prices depend on the inspection. It books the inspection and tells the caller when to expect you."],
    ],
  },
};

const CITIES = {
  "las-cruces": {
    key: "las-cruces", label: "Las Cruces", full: "Las Cruces, NM", region: "Las Cruces, Mesilla and Doña Ana County",
    places: "Las Cruces, Mesilla, Doña Ana, Organ, Anthony, Santa Teresa and Sunland Park",
    local: "Mesa Intelligence is based in the Mesilla Valley — Bobby sets up every line himself, and can meet you in person if you'd rather.",
    weather: {
      hvac: "Las Cruces summers run past 100 degrees, and a lot of homes still run evaporative coolers — so spring brings a wave of cooler start-ups and refrigerated-air conversion quotes on top of the no-cool calls.",
      plumbing: "Las Cruces is mostly mild, which is exactly why the occasional hard freeze catches people out — exposed lines, older homes and RV hookups all start calling at once.",
      electrical: "Between new subdivisions on the East Mesa, older homes near downtown and a steady stream of solar and EV-charger work, Las Cruces electricians field a wide mix of calls.",
      roofing: "Monsoon season brings sudden storms to the Mesilla Valley, and flat roofs with parapets — common across Las Cruces — are where the leak calls start.",
    },
  },
  "el-paso": {
    key: "el-paso", label: "El Paso", full: "El Paso, TX", region: "El Paso and the Upper Valley",
    places: "El Paso — West Side, Upper Valley, Northeast, East Side and Lower Valley — plus Horizon City, Socorro, Canutillo and Santa Teresa",
    local: "Mesa Intelligence is based just across the state line in Santa Teresa — Bobby sets up every line himself and works El Paso in person.",
    weather: {
      hvac: "El Paso summers push past 100 degrees, and with a mix of refrigerated air and evaporative coolers across the city, the phone rings for no-cool calls, cooler start-ups and conversion quotes at the same time.",
      plumbing: "El Paso is mostly mild, which is why a hard freeze hits hard — older East and Central homes and exposed lines all start calling the same night.",
      electrical: "From new construction on the East Side and in Horizon City to older homes in Central, El Paso electricians field everything from panel upgrades to EV chargers.",
      roofing: "Monsoon storms roll across El Paso in the summer, and flat roofs — common across the city — are where the leak calls start.",
    },
    spanishNote: true,
  },
};

const PLAN_LINE = `$249 a month after ${TRIAL}, with 500 call minutes included. A one-time $299 setup applies to monthly plans and is waived on the annual plan ($2,388 a year). Cancel any time.`;

function hub(t, PLAN_BULLETS) {
  return {
    slug: t.hubSlug,
    title: `AI Receptionist & After-Hours Answering for ${t.plural.replace(/^\w/, (c) => c.toUpperCase())} | Mesa Intelligence`,
    description: `An AI phone line for ${t.owner}: answers when you can't, sorts urgent calls from routine ones, books the job into your calendar, texts the customer and emails you every call. ${TRIAL}.`,
    h1: `An AI phone line for ${t.owner} that books the job when you can't answer`,
    kicker: t.kicker,
    lede: `${t.season} The line answers in your company's name, asks what your dispatcher would ask, books the work into your calendar and sends you the details — and you keep your own number.`,
    area: "Las Cruces, NM, El Paso, TX and West Texas",
    trade: t.key,
    sections: [
      { h: `The calls ${t.owner} miss`, list: t.calls },
      { h: "What it does on every call", p: [
        `It answers with your business name, then asks for ${t.asks}. ${t.urgent}`,
        "Routine work gets two open windows from your calendar; the caller picks one, gets a text confirmation and a reminder the day before, and you get an email with the summary.",
      ]},
      { h: "You keep your number", p: [
        "Forward the calls you don't pick up to the line — on most carriers that's *72 and the number, or a setting on your office phone. Customers keep calling the number on your truck and your Google listing.",
      ]},
      { h: "Everything in the Local Growth Plan", list: PLAN_BULLETS },
    ],
    faq: [
      ...t.faq,
      ["Does it sound like a robot?", "Call the demo line at (575) 741-4070 and judge for yourself. Better yet, run the free audit for your shop and press “Call it” on your report — you'll hear it answer as your company."],
      ["What does it cost?", PLAN_LINE],
    ],
    cta: { label: "Hear it answer as your company", href: "/#audit" },
  };
}

function cityPage(t, c, PLAN_BULLETS) {
  const tradeTitle = t.label === "HVAC" ? "HVAC" : t.label;
  return {
    slug: `${t.citySlug}-${c.key}`,
    title: `${tradeTitle} Answering Service in ${c.full} — AI That Books the Job | Mesa Intelligence`,
    description: `After-hours answering for ${t.owner} in ${c.label}: an AI line that answers every call, flags emergencies, books into your calendar and texts the customer. ${TRIAL}, keep your number.`,
    h1: `An answering service for ${c.label} ${t.owner} that books the job`,
    kicker: `${t.label} · ${c.region}`,
    lede: `${c.weather[t.key]} An AI phone line answers the calls you can't get to, in your company's name, and books the work before the caller tries the next ${t.noun} on the list.`,
    area: c.full,
    trade: t.key,
    sections: [
      { h: `Built for ${t.owner}, not a generic call center`, p: [
        `A message service takes a name and number. This line asks for ${t.asks}, and books the visit into the windows you open.`,
        t.urgent,
      ]},
      { h: `What ${c.label} callers get`, list: [
        `An answer in your company's name — nights, weekends and while you're on a job`,
        "Two open times from your calendar, and a text confirmation once they pick one",
        "A reminder text the day before, so fewer wasted trips",
        "Your callback, fast, on anything urgent — the line alerts you right away",
      ]},
      { h: "What you get", list: [
        "An email summary of every call: name, number, address, what they need",
        "The job on your calendar, with the details your tech needs",
        "Review requests after the job, which is what moves you up the Google map listings",
        `A free audit of where you rank for “${t.search} in ${c.label}” — and a monthly re-audit on the plan`,
      ]},
      { h: "Local setup", p: [
        `${c.local} We serve ${c.places}.`,
        ...(c.spanishNote ? ["The phone line answers in English today. Website chat replies in Spanish when customers write in Spanish — if Spanish calls are a big share of your business, tell us on the setup call."] : []),
      ]},
      { h: "Included in the Local Growth Plan", list: PLAN_BULLETS },
    ],
    faq: [
      [`Do I need a new number?`, "No. Forward the calls you don't answer to the line (on most carriers that's *72 and the number). Customers keep calling the number they already have."],
      ...t.faq.slice(0, 2),
      ["Can I hear it first?", `Yes. Run the free audit for your shop, then press “Call it” on your report — you'll hear the line answer as your company. Or call the sample line at (575) 741-4070.`],
      ["What does it cost?", PLAN_LINE],
    ],
    cta: { label: "Hear it answer as your company", href: "/#audit" },
  };
}

export function tradePages(PLAN_BULLETS) {
  const out = [];
  for (const t of Object.values(TRADES)) {
    out.push(hub(t, PLAN_BULLETS));
    for (const c of Object.values(CITIES)) out.push(cityPage(t, c, PLAN_BULLETS));
  }
  return out;
}
export const TRADE_LABELS = Object.fromEntries(Object.values(TRADES).map((t) => [t.key, t]));
