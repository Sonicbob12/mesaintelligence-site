// Content for the static, crawlable landing pages. Edit here, then run:
//   node scripts/seo/build.mjs
// which writes public/<slug>/index.html, public/sitemap.xml and public/robots.txt.
// Rules: no invented statistics, testimonials or client names. Everything stated here must be true of the product.

export const SITE = {
  url: "https://mesaintelligence.ai",
  name: "Mesa Intelligence",
  legal: "Mesa Intelligence LLC",
  phone: "(575) 254-1185",
  phoneE164: "+15752541185",
  demo: "(575) 741-4070",
  demoE164: "+15757414070",
  email: "hello@mesaintelligence.ai",
  areas: ["Las Cruces, NM", "El Paso, TX", "Doña Ana County, NM", "Mesilla, NM", "Santa Teresa, NM", "Sunland Park, NM", "Anthony, NM"],
  price: { audit: 0, pro: 99, plan: 249, annual: 2388 },
};

// Shared building blocks (kept factual and identical to what the product does).
const PLAN_BULLETS = [
  "A 24/7 chat agent on your website that answers questions, books appointments and emails you every lead",
  "A voice line that answers your calls 24/7, books appointments and emails you a summary of every call",
  "One-tap review requests to customers after each job",
  "A monthly re-audit of your Google listing, website and search rank, with a “what changed” email",
  "A private dashboard for hours, services, your review link, the website widget and billing",
];

export const PAGES = [
  // ---------------------------------------------------------------- consulting (city)
  {
    slug: "ai-consulting-las-cruces",
    title: "AI Consulting for Small Business in Las Cruces, NM | Mesa Intelligence",
    description: "Practical AI for Las Cruces small businesses: an AI receptionist, website chat that books jobs, review requests and a free Google listing audit. Local, owner-run, $249/month.",
    h1: "AI for small businesses in Las Cruces — the practical kind",
    kicker: "Las Cruces · Mesilla · Doña Ana County",
    lede: "Most “AI for business” advice is written for companies with an IT department. Mesa Intelligence is a Las Cruces-area company that sets up a few specific tools for owner-run businesses — the ones that answer the phone, book the job and get you found on Google — and keeps them running.",
    area: "Las Cruces, NM",
    sections: [
      { h: "Where AI actually pays off for a local business", p: [
        "Skip the strategy deck. For a shop, a practice or an office in Las Cruces, the useful jobs for AI are narrow and boring: answer every call and website question, put the appointment on the calendar, follow up with the customer, and ask for the review. Those are the jobs that fall through the cracks when you're running the business yourself.",
        "Everything we set up is built around those jobs. If a tool doesn't save you time or bring in work you'd otherwise miss, we don't sell it.",
      ]},
      { h: "What we set up", list: PLAN_BULLETS },
      { h: "Start with your numbers, not a sales call", p: [
        "Run the free audit on our homepage: it pulls your Google Business Profile, checks your website, and shows where you rank when someone in Las Cruces searches for what you do — next to the businesses they see beside you. It takes about 15 seconds and you see the score before you give anyone your email.",
      ]},
    ],
    faq: [
      ["Do you only work with businesses in Las Cruces?", "We're based in the Mesilla Valley and work in person across Las Cruces, Mesilla, Santa Teresa, Sunland Park, Anthony and El Paso. The software works anywhere, so we take remote clients too."],
      ["Do I need to understand AI to use this?", "No. You tell us your hours, services and how you want calls handled; we set it up and keep it running. Your staff keeps working the way they do now."],
      ["What does it cost?", "The listing audit is free. The full Pro report is $99, credited toward the plan. The Local Growth Plan is $249 a month or $2,388 a year, month to month, cancel any time."],
      ["Can I hear it before I buy?", "Yes — call (575) 741-4070. That's a live demo agent for a sample HVAC company; ask it to book a tune-up."],
    ],
  },
  {
    slug: "ai-consulting-el-paso",
    title: "AI Consulting for Small Business in El Paso, TX | Mesa Intelligence",
    description: "AI receptionist, website chat that books jobs, review requests and a free Google listing audit for El Paso small businesses. Local setup, month-to-month, $249/month.",
    h1: "AI for El Paso small businesses that answers, books and follows up",
    kicker: "El Paso · West Side · Horizon City · Canutillo",
    lede: "El Paso businesses compete on who picks up first and who shows up first on Google. Mesa Intelligence sets up the tools that handle both — an AI receptionist, a website chat agent that books jobs, automatic review requests — and keeps them tuned month to month.",
    area: "El Paso, TX",
    sections: [
      { h: "Built for owner-run businesses, not enterprises", p: [
        "You don't need a data strategy. You need the 6:40 pm call answered, the appointment booked, the customer reminded, and a review requested once the job's done. That's what we set up, using the phone number, calendar and website you already have.",
        "We're across the state line in the Mesilla Valley, close enough to sit down with you in El Paso and walk through the setup.",
      ]},
      { h: "What's included in the Local Growth Plan", list: PLAN_BULLETS },
      { h: "See how you show up first", p: [
        "Our free audit checks your Google listing, your website and where you rank for searches like “{your trade} in El Paso”, then lines you up against the five businesses customers see next to you. No email required to see your score.",
      ]},
    ],
    faq: [
      ["Do you work on both sides of the state line?", "Yes — El Paso, Las Cruces and everything between. Pricing and service are the same in Texas and New Mexico."],
      ["Will this replace my front desk?", "It covers what the front desk can't: after hours, lunch, weekends and the rush when three calls come in at once. Anything it can't handle is passed to you with the caller's details."],
      ["Is there a contract?", "No. Month to month, cancel from your dashboard. Yearly ($2,388) works out to $199 a month."],
      ["How fast is it live?", "The chat agent and review requests are live within minutes of signing up. The voice line is set up with you within 2 business days."],
    ],
  },

  // ---------------------------------------------------------------- receptionist (city)
  {
    slug: "ai-receptionist-las-cruces",
    title: "AI Receptionist & After-Hours Answering in Las Cruces, NM | Mesa Intelligence",
    description: "An AI receptionist for Las Cruces businesses: answers calls 24/7, books appointments on your calendar and emails you every lead. Hear the live demo.",
    h1: "An AI receptionist for Las Cruces businesses",
    kicker: "After hours · lunch hour · overflow",
    lede: "A caller who gets voicemail usually calls the next business on the list. An AI receptionist picks up every time, answers the common questions from your own information, books the appointment, and sends you a summary.",
    area: "Las Cruces, NM",
    sections: [
      { h: "What it does on a call", list: [
        "Answers in your business name, with your hours, services and service area",
        "Books into the times you've opened on your calendar",
        "Takes a message and flags urgent calls to you right away",
        "Hands anything it can't answer to you, with the caller's name and number",
        "Emails you a summary and transcript of every call",
      ]},
      { h: "Hear it before you decide", p: [
        `Call our live demo line at (575) 741-4070. It's set up as a sample HVAC company — ask about a tune-up, ask what areas they serve, or try to book a time. What you hear is what your callers would hear, with your business's details.`,
      ]},
      { h: "Part of the Local Growth Plan", list: PLAN_BULLETS },
    ],
    faq: [
      ["Does it sound like a robot?", "Call the demo line and judge for yourself: (575) 741-4070. It speaks naturally, handles interruptions and asks follow-up questions."],
      ["Can it speak Spanish?", "The website chat replies in Spanish when visitors write in Spanish. The phone agent currently answers in English — ask us if Spanish calls matter for your business."],
      ["Do I need a new phone number?", "No. You can forward your existing line to it after hours or when you don't pick up, or give it its own number."],
      ["What happens with an emergency call?", "You decide the rules. Typically it takes the details and texts or calls you immediately instead of booking."],
    ],
  },
  {
    slug: "ai-receptionist-el-paso",
    title: "AI Receptionist & Answering Service in El Paso, TX | Mesa Intelligence",
    description: "AI answering service for El Paso businesses: 24/7 call answering, appointment booking and a summary of every call in your inbox. Try the live demo line.",
    h1: "AI answering service for El Paso businesses",
    kicker: "24/7 · books the job · no per-minute billing",
    lede: "Plenty of El Paso customers call after 5, at lunch, or while you're on a job. An AI receptionist answers every one of those calls, books the appointment, and sends you the details — without adding someone to payroll.",
    area: "El Paso, TX",
    sections: [
      { h: "What changes on day one", list: [
        "Every call answered, including nights, weekends and lunch",
        "Appointments booked into the hours you choose, with a text confirmation",
        "Questions answered from your own information — hours, services, service area, pricing you approve",
        "Urgent calls flagged to your phone immediately",
        "A summary and transcript of each call in your inbox",
      ]},
      { h: "Try it right now", p: [
        "Call (575) 741-4070 — a live demo agent for a sample HVAC company. Ask it a question, then try to book a visit.",
      ]},
      { h: "Included in the Local Growth Plan", list: PLAN_BULLETS },
    ],
    faq: [
      ["How is this different from an answering service?", "A traditional answering service takes messages. This books the appointment and answers questions from your own information — and it doesn't bill by the minute."],
      ["Can I keep my number?", "Yes. Forward your line to it when you can't pick up, or use a separate number."],
      ["What does it cost?", "$249 a month as part of the Local Growth Plan, which also includes the website chat agent, review requests and a monthly listing audit. Cancel any time."],
      ["Who sets it up?", "We do, with you, within 2 business days of signing up."],
    ],
  },

  // ---------------------------------------------------------------- industries
  {
    slug: "ai-for-hvac-companies",
    title: "AI Receptionist & Dispatch Help for HVAC Companies | Las Cruces & El Paso",
    description: "AI call answering for HVAC contractors in Las Cruces and El Paso: books service calls 24/7, flags no-heat/no-AC emergencies, emails every call summary and requests reviews after each job.",
    h1: "AI call answering for HVAC companies in Las Cruces and El Paso",
    kicker: "HVAC · refrigerated air · heating",
    lede: "When the AC quits in a Mesilla Valley July or the furnace goes out on a January night, the homeowner calls until someone answers. An AI receptionist makes sure that someone is you — booking the visit and flagging the emergency to your phone.",
    area: "Las Cruces, NM and El Paso, TX",
    sections: [
      { h: "Built around how HVAC calls actually go", list: [
        "Asks the questions your dispatcher would: system type, symptoms, address, best callback number",
        "Separates no-cool / no-heat emergencies from tune-ups and quotes, using your rules",
        "Books maintenance and estimates into the windows you open",
        "Alerts you or your on-call tech right away when it's urgent",
        "Requests a Google review after the job, which is what moves you up the map listings",
      ]},
      { h: "Hear the HVAC demo", p: [
        "Our demo line, (575) 741-4070, is set up as a sample HVAC company. Call it and book a tune-up, or tell it your AC is blowing warm air and listen to how it handles the urgency.",
      ]},
      { h: "Where you rank matters as much as who answers", p: [
        "Run the free audit for your shop: it shows where you land for “HVAC contractor in Las Cruces” (or El Paso), how your reviews compare with the shops around you, and the specific fixes that move you up.",
      ]},
    ],
    faq: [
      ["Can it dispatch a tech?", "It collects everything a tech needs and alerts you or your on-call tech right away. Assigning the truck stays with you."],
      ["Does it work with my scheduling software?", "It books into a Google Calendar out of the box. If you run ServiceTitan, Housecall Pro or Jobber, we'll talk through the best handoff on a call."],
      ["What about price questions?", "It answers with the prices you approve — diagnostic fees, tune-up specials — and never makes up a number."],
      ["What does it cost?", "$249 a month on the Local Growth Plan, which also includes website chat, review requests and a monthly listing audit."],
    ],
  },
  {
    slug: "ai-for-dental-offices",
    title: "AI Front Desk & New-Patient Intake for Dental Offices | Las Cruces & El Paso",
    description: "AI phone and website intake for dental practices in Las Cruces and El Paso: answers new-patient calls after hours, books consults, emails every inquiry and requests reviews.",
    h1: "New-patient intake that doesn't stop at 5 pm",
    kicker: "Dental · orthodontics · pediatric dentistry",
    lede: "People look for a new dentist in the evening and on weekends, and they usually book with the first office that responds. An AI front desk answers those calls and website questions, collects the new-patient details and books the consult — so Monday morning starts with appointments, not voicemails.",
    area: "Las Cruces, NM and El Paso, TX",
    sections: [
      { h: "What it handles for the front desk", list: [
        "New-patient questions: insurance you take, location, hours, what a first visit includes",
        "Booking new-patient exams and consults into the slots you release",
        "Overflow answering during the busy parts of the day",
        "Routing anything clinical or urgent to your team instead of answering it",
        "Review requests after visits, sent the way your office prefers",
      ]},
      { h: "Your data stays yours", p: [
        "The agent works from the practice information you give it — services, insurance, policies. It doesn't diagnose, and it hands clinical questions to your staff. We'll walk through what it may and may not say before it goes live.",
      ]},
      { h: "Check your practice's listing first", p: [
        "The free audit shows how your Google listing, website and rank for “dentist in Las Cruces” or “dentist in El Paso” compare with the practices patients see next to yours.",
      ]},
    ],
    faq: [
      ["Does it connect to our practice management software?", "It books into a shared calendar out of the box. Direct connections to practice-management systems vary; we'll tell you honestly what's possible for yours on a call."],
      ["Can it answer insurance questions?", "It can tell callers which plans you accept, using the list you provide. Benefit and coverage questions go to your team."],
      ["Is it bilingual?", "The website chat replies in Spanish to Spanish-speaking patients. The phone agent currently answers in English."],
      ["What does it cost?", "$249 a month on the Local Growth Plan, month to month."],
    ],
  },
  {
    slug: "ai-for-law-firms",
    title: "AI Client Intake & After-Hours Answering for Law Firms | Las Cruces & El Paso",
    description: "AI intake for small law firms in Las Cruces and El Paso: answers potential-client calls 24/7, collects case details, books consultations and routes urgent matters to you.",
    h1: "Client intake for small law firms — answered the first time",
    kicker: "Personal injury · family law · criminal defense · immigration",
    lede: "Someone who needs a lawyer tonight calls firms in order until one answers. An AI intake agent picks up, collects the basics of the matter, books the consultation and sends you a clean summary — without giving legal advice.",
    area: "Las Cruces, NM and El Paso, TX",
    sections: [
      { h: "What intake looks like", list: [
        "Answers potential-client calls and website chats 24/7",
        "Collects the caller's details and a short description of the matter, using your intake questions",
        "Books consultations into the times you open",
        "Flags time-sensitive matters to you immediately",
        "Never gives legal advice — it says so, and passes the question to you",
      ]},
      { h: "You control what it says", p: [
        "You approve the script: practice areas, consult fees, what it should and shouldn't discuss. Every call produces a transcript you can review.",
      ]},
      { h: "How does your firm show up?", p: [
        "Run the free audit to see your Google listing, website and rank for searches like “family lawyer in Las Cruces” next to the firms prospective clients see first.",
      ]},
    ],
    faq: [
      ["Does it give legal advice?", "No. It's set up to collect information and book consultations only, and it tells callers that any legal question will be answered by an attorney."],
      ["Can it screen for conflicts?", "It collects the names you need to run a conflict check and includes them in the summary. The check itself stays with your office."],
      ["Do I keep my number?", "Yes. Forward after-hours or unanswered calls to it, or give it its own intake line."],
      ["What does it cost?", "$249 a month on the Local Growth Plan, month to month."],
    ],
  },
  {
    slug: "ai-for-restaurants",
    title: "AI Phone Host & Reservations for Restaurants | Las Cruces & El Paso",
    description: "AI phone host for restaurants in Las Cruces and El Paso: answers hours, menu and parking questions, takes reservations and large-party requests, and requests reviews.",
    h1: "A phone host that answers during the dinner rush",
    kicker: "Restaurants · cafés · catering",
    lede: "The phone rings hardest when nobody can pick it up. An AI host answers every call — hours, directions, menu questions, gluten-free options, reservations and large-party requests — so your staff can stay on the floor.",
    area: "Las Cruces, NM and El Paso, TX",
    sections: [
      { h: "What it handles", list: [
        "Hours, location, parking and menu questions from your own information",
        "Reservations into the times you open; large-party and catering requests sent to you",
        "Website chat that answers the same questions and takes the same bookings",
        "Review requests after visits, which keep your listing fresh",
        "A summary of every call so nothing gets lost between shifts",
      ]},
      { h: "Your Google listing is your front door", p: [
        "Most people decide where to eat from the listing — photos, hours, reviews, and whether they can book in two taps. The free audit shows how yours stacks up against the restaurants listed next to you.",
      ]},
    ],
    faq: [
      ["Does it take to-go orders?", "Not by default. It can point callers to your online ordering link, or take a message for a callback."],
      ["Does it work with OpenTable or Resy?", "If you already use one, it can send callers there. If you don't, it books into a calendar you control."],
      ["Spanish?", "The website chat replies in Spanish. The phone agent currently answers in English."],
      ["What does it cost?", "$249 a month on the Local Growth Plan, month to month."],
    ],
  },

  // ---------------------------------------------------------------- audit
  {
    slug: "free-google-business-profile-audit",
    title: "Free Google Business Profile Audit — Las Cruces & El Paso | Mesa Intelligence",
    description: "Free Google listing audit: your Google Business Profile, website and search rank scored against the five businesses customers see next to you. Results in 15 seconds.",
    h1: "Free Google listing audit — see where you rank in 15 seconds",
    kicker: "Google Business Profile · website · local search rank",
    lede: "Type your business name and city. In about 15 seconds you'll see a score for your Google listing and website, where you rank for “{your trade} in {your city}”, and how you compare with the five businesses customers see next to you. No email needed to see the score.",
    area: "Las Cruces, NM and El Paso, TX",
    sections: [
      { h: "What the free audit checks", list: [
        "Google listing: hours, phone, website link, category, rating and review count against your local competitors, review recency, photos",
        "Website: loads, secure, mobile-friendly, tap-to-call, booking or request form, local business markup, address and phone match Google",
        "Search visibility: your position for “{your trade} in {your city}”",
        "Your top three problems, ranked by how much they cost you in calls",
      ]},
      { h: "The $99 Pro report goes further", list: [
        "Rank for “near me” and “best …” searches",
        "Duplicate or conflicting listings",
        "A teardown of the #1 competitor's website — what they have that you don't",
        "What your reviews say customers love and complain about",
        "Google PageSpeed mobile scores and an 8-step plan with a 30-day order",
      ]},
      { h: "Then fix it — or have it fixed", p: [
        "Most of the fixes you can make yourself in an afternoon, and the report tells you how. If you'd rather it be handled and kept up every month, that's what the Local Growth Plan is for — and the $99 is credited toward it.",
      ]},
    ],
    faq: [
      ["Is it really free?", "Yes. The score, rank, competitor comparison and top three problems are free and shown before you enter an email."],
      ["Where does the data come from?", "Your public Google listing (via Google's Places API), your public website, and Google search results for your trade and city. Scores are our assessment, not Google's."],
      ["Do I have to be in Las Cruces or El Paso?", "No — it works for any business with a Google listing. We just happen to be local here."],
      ["Will you call me?", "Only if you book a call. The report is emailed if you ask for it; there's no automatic sales call."],
    ],
    cta: { label: "Run my free audit", href: "/#audit" },
  },
];
