// Knowledge documents for the four demo businesses. In production each client's
// docs live in D1 (`knowledge` table) and are retrieved by full-text search;
// these are the fallback so the demos work before D1 is attached, and they are
// also what schema.sql seeds.
//
// Keep each doc focused on one topic — retrieval pulls the top few matches per
// message, so narrow docs beat one giant one.

export const DEMO_KNOWLEDGE = {
  "desert-peak-hvac": [
    { title: "Hours and service area",
      content: "Desert Peak HVAC is open Monday through Saturday, 7:00 AM to 7:00 PM. Closed Sundays except for emergency calls. We serve Las Cruces, Mesilla, Santa Teresa, Sunland Park, Anthony, and Vado. We do not currently serve El Paso or Alamogordo." },
    { title: "Pricing",
      content: "Diagnostic visit: $89, which is waived if you approve the repair the same day. Emergency after-hours fee: $89 on top of the repair. AC tune-up: $129. Furnace tune-up: $129. Spring and fall tune-up bundle: $219. Refrigerant recharge starts at $150 depending on type. We give written quotes before any repair work begins. We accept cash, card, and financing through Wisetack on approved credit." },
    { title: "Maintenance plan (Peak Club)",
      content: "The Peak Club maintenance plan is $18 per month per system. It includes two tune-ups per year (spring AC, fall furnace), priority scheduling, no after-hours emergency fee, 15% off repairs, and a one-inch filter at each visit. Members can cancel any time after the first 12 months." },
    { title: "Emergency triage guidance",
      content: "Treat as emergency: no cooling when the outdoor temperature is above 95°F, no heat when below 40°F, water leaking from the air handler near electrical, burning smell from vents, or any gas smell. For a gas smell, tell the customer to leave the building immediately and call the gas company (New Mexico Gas Co. 1-888-664-2726) before we dispatch. Emergency slots are offered the same day; a technician usually arrives within 2 to 4 hours." },
    { title: "Brands, warranties, and what we don't do",
      content: "We install and service Carrier, Trane, Lennox, Goodman, and Rheem. We honor manufacturer warranties on units we installed; for units installed by others we can service them but warranty claims go through the original installer. We do not do duct cleaning, swamp cooler installs, or commercial rooftop units over 10 tons — for those we refer out. Full system replacement quotes require an in-home visit from a comfort advisor, which is free." },
  ],
  "juniper-vine": [
    { title: "Hours and location",
      content: "Juniper & Vine is at 2140 Calle de Guadalupe, Mesilla, NM. Dinner Tuesday to Thursday 5:00 to 9:30 PM, Friday and Saturday 5:00 to 10:00 PM. Sunday brunch 10:00 AM to 2:00 PM. Closed Mondays. Free parking on the plaza lot after 5 PM." },
    { title: "Reservations and parties",
      content: "We take reservations for parties of 1 to 12. Tables are held 15 minutes past the reservation time. Parties of 7 or more are seated on a 90-minute turn and a 20% service charge is added. For 13 or more, or a full buyout, a manager will call back; private dining room seats 8 to 24 with a $500 deposit applied to the bill. Walk-ins are welcome at the bar." },
    { title: "Menu overview and dietary options",
      content: "The menu changes seasonally and is sourced from Mesilla Valley farms. Typical dinner: starters $9 to $16, mains $24 to $42, desserts $10. Current favorites: green chile braised short rib, pecan-crusted trout, roasted squash risotto (vegan), and a rotating wood-fired flatbread. Vegan and gluten-free options are available every night and marked on the menu; the kitchen can adapt most dishes with notice. We cannot guarantee a nut-free kitchen. Sunday brunch is $14 to $22 per plate with bottomless mimosas for $18." },
    { title: "Drinks and corkage",
      content: "Full bar with New Mexico wines, local beers from Spotted Dog and Bosque, and a seasonal cocktail list. Corkage is $25 per 750ml bottle, limit two bottles per table. Happy hour Tuesday to Thursday 5 to 6 PM: $2 off drinks and half-price flatbreads at the bar only." },
    { title: "Policies",
      content: "Dress is casual. Children are welcome; high chairs available. Dogs are welcome on the patio. We do not split checks more than four ways. Gift cards are sold in-house and online. Cancellations: please cancel at least 4 hours ahead; private dining deposits are refundable with 72 hours notice." },
  ],
  "red-rock-dental": [
    { title: "Hours and location",
      content: "Red Rock Dental is at 1875 N Main St, Las Cruces, NM. Open Monday to Thursday 8:00 AM to 5:00 PM and Friday 8:00 AM to 1:00 PM. Closed weekends. Same-day emergency visits are held open each morning; call early. Free parking in front." },
    { title: "Insurance and payment",
      content: "In-network with Delta Dental, Cigna, MetLife, Aetna, and United Concordia. We file out-of-network claims for most other PPO plans. We do not accept Medicaid or Centennial Care. Cash-pay pricing: cleaning and exam $149, new patient exam with x-rays $199, emergency exam $95, fillings from $180, crowns from $950. CareCredit financing is available. Payment is due at the time of service unless a treatment plan is set up." },
    { title: "Appointments and new patients",
      content: "New patients should arrive 15 minutes early or complete forms online. Bring a photo ID and insurance card. Cleanings take about an hour; new patient exams about 90 minutes. We send text reminders 2 days and 2 hours before each visit. Please give 24 hours notice to cancel; a $50 fee applies to no-shows." },
    { title: "Urgent dental symptoms",
      content: "Severe toothache, swelling of the face or jaw, a cracked or knocked-out tooth, or bleeding that will not stop should be seen the same day. For a knocked-out adult tooth, keep it moist in milk and come in immediately. Facial swelling with a fever after hours is a medical emergency — go to urgent care or the ER. The office does not give clinical advice over chat; the dentist evaluates at the visit." },
    { title: "Services and comfort options",
      content: "Services include cleanings, exams, fillings, crowns, bridges, implants, Invisalign, whitening, and extractions. Dr. Elena Ruiz and Dr. Marcus Hale are the dentists. Nervous patients can request nitrous oxide, a blanket, and headphones. Whitening consultations are free. We offer a free second opinion on treatment plans over $1,500." },
  ],
  "mesa-grant-legal": [
    { title: "Practice areas and what we do not handle",
      content: "Mesa & Grant Legal serves small businesses in Southern New Mexico: contract drafting and review, commercial lease disputes, LLC and corporation formation, operating agreements, employment agreements and handbooks, trademark registration, and business purchase or sale. We do not handle criminal matters, family law, personal injury, immigration, or bankruptcy, and will refer those out." },
    { title: "Consultation and fees",
      content: "The first consultation is free, 20 minutes, by phone or video, with attorney Dana Grant or Luis Mesa. Flat fees: contract review $350 for documents under 15 pages; LLC formation $900 including state filing fees and an operating agreement; trademark application $1,200 plus USPTO fees. Hourly matters are billed at $275 per hour with a $2,000 retainer. Written fee agreements are signed before any work begins." },
    { title: "Hours and location",
      content: "Office at 300 N Downtown Mall, Suite 210, Las Cruces, NM. Monday to Thursday 9:00 AM to 5:00 PM, Friday 9:00 AM to 4:00 PM. Closed weekends. Consultations are scheduled in 30-minute blocks. Parking is in the city garage on Water Street, validated for clients." },
    { title: "Intake rules for the assistant",
      content: "Collect the caller's name, phone, business name, and a one-sentence description of the matter. Do not collect Social Security numbers, financial account numbers, or details of any criminal matter in chat. If the caller has a court date or deadline within 7 days, flag it as urgent and request a same-day attorney callback. The assistant never gives legal advice or predicts outcomes; it can describe what the firm does and how engagement works." },
    { title: "Lease disputes — what to bring",
      content: "For commercial lease disputes, the attorney will want a copy of the signed lease, any amendments, written notices exchanged with the landlord or tenant, and a timeline of events. New Mexico generally requires written notice before most lease remedies; the consultation will cover next steps. Clients should not sign anything from the other party before the consultation." },
  ],
};
