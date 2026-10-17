CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vertical TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  greeting TEXT NOT NULL DEFAULT '',
  presets_json TEXT NOT NULL DEFAULT '[]',
  persona TEXT NOT NULL,
  hours_json TEXT NOT NULL DEFAULT '{}',
  slot_minutes INTEGER NOT NULL DEFAULT 60,
  services_json TEXT NOT NULL DEFAULT '[]',
  escalation TEXT NOT NULL DEFAULT '',
  notify_email TEXT,
  sms_number TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  voice_number TEXT,
  transfer_number TEXT,
  voice_id TEXT,
  retell_agent_id TEXT,
  retell_llm_id TEXT
);
CREATE INDEX IF NOT EXISTS tenants_sms ON tenants (sms_number);
CREATE INDEX IF NOT EXISTS tenants_voice ON tenants (voice_number);

CREATE TABLE IF NOT EXISTS knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS knowledge_tenant ON knowledge (tenant_id);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, content, content='knowledge', content_rowid='id', tokenize='porter unicode61');

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  external_id TEXT,
  messages_json TEXT NOT NULL DEFAULT '[]',
  turns INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS conversations_ext ON conversations (tenant_id, channel, external_id);
CREATE INDEX IF NOT EXISTS conversations_updated ON conversations (updated_at);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT, email TEXT, service TEXT,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_tenant_time ON bookings (tenant_id, start_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  name TEXT, phone TEXT, email TEXT, summary TEXT,
  source TEXT NOT NULL DEFAULT 'chat',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  reason TEXT, urgency TEXT NOT NULL DEFAULT 'normal', callback_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active)
VALUES ('desert-peak-hvac', 'Desert Peak HVAC', 'hvac', 'America/Denver', 'Desert Peak HVAC, this is Mesa — how can I help you today?', '["My AC died and it''s 110° outside","Do you offer maintenance plans?","Book me a tune-up next week"]', 'You are the AI dispatch assistant for Desert Peak HVAC, a family-run heating and cooling company in Las Cruces, NM. Act like their best front-desk dispatcher: warm, quick, and always moving toward a booked job. Triage first: no cooling in extreme heat, gas smell, or water leaking near electrical is an EMERGENCY — offer the next emergency slot and quote the after-hours fee. Keep replies to 2–4 sentences. Never invent prices or policies; use the knowledge provided. If something is outside what you know, say so and offer a callback.', '{"mon":["07:00","19:00"],"tue":["07:00","19:00"],"wed":["07:00","19:00"],"thu":["07:00","19:00"],"fri":["07:00","19:00"],"sat":["07:00","19:00"],"sun":null}', 120, '[{"name":"Diagnostic visit","minutes":120,"price":89},{"name":"AC tune-up","minutes":90,"price":129},{"name":"Furnace tune-up","minutes":90,"price":129},{"name":"Emergency service","minutes":120,"price":89,"note":"after-hours fee, plus repair"},{"name":"Maintenance plan enrollment","minutes":30,"price":18,"note":"per month"}]', 'Escalate to a human for: gas smell (tell caller to leave the house and call the gas company first), commercial jobs, warranty disputes, anything about pricing a full system replacement.', NULL, NULL, 1, 1)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, vertical=excluded.vertical, timezone=excluded.timezone, greeting=excluded.greeting, presets_json=excluded.presets_json, persona=excluded.persona, hours_json=excluded.hours_json, slot_minutes=excluded.slot_minutes, services_json=excluded.services_json, escalation=excluded.escalation, notify_email=excluded.notify_email, sms_number=excluded.sms_number, demo=excluded.demo, active=excluded.active;
INSERT INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active)
VALUES ('juniper-vine', 'Juniper & Vine', 'restaurant', 'America/Denver', 'Good evening, Juniper & Vine — how may I seat you?', '["Table for two this Friday at 7?","Do you have vegan options?","Can you do a party of 12?"]', 'You are the host AI for Juniper & Vine, a farm-to-table bistro in Mesilla, NM. Handle reservations (party size, date, time, name, phone), menu and dietary questions, and private-event enquiries. Be charming and concise (2–4 sentences). Always confirm the details back like a real host before booking. Never invent menu items or prices; use the knowledge provided.', '{"mon":null,"tue":["17:00","21:30"],"wed":["17:00","21:30"],"thu":["17:00","21:30"],"fri":["17:00","22:00"],"sat":["17:00","22:00"],"sun":["10:00","14:00"]}', 30, '[{"name":"Dinner reservation","minutes":90,"price":0},{"name":"Sunday brunch reservation","minutes":90,"price":0},{"name":"Private dining (8–24 guests)","minutes":180,"price":0,"note":"deposit required"}]', 'Escalate to a human for: parties larger than 12, buyouts, allergy questions you cannot answer from the knowledge base, complaints about a past visit.', NULL, NULL, 1, 1)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, vertical=excluded.vertical, timezone=excluded.timezone, greeting=excluded.greeting, presets_json=excluded.presets_json, persona=excluded.persona, hours_json=excluded.hours_json, slot_minutes=excluded.slot_minutes, services_json=excluded.services_json, escalation=excluded.escalation, notify_email=excluded.notify_email, sms_number=excluded.sms_number, demo=excluded.demo, active=excluded.active;
INSERT INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active)
VALUES ('red-rock-dental', 'Red Rock Dental', 'dental', 'America/Denver', 'Thanks for calling Red Rock Dental — what can I do for you?', '["I need to book a cleaning","Do you take Delta Dental?","My tooth is killing me"]', 'You are the patient intake assistant for Red Rock Dental in Las Cruces, NM. Help patients book cleanings and appointments, answer insurance and pricing questions from the knowledge provided, and calm anxious patients. Be reassuring and concise (2–4 sentences). You are not a clinician: never diagnose. Severe pain, swelling, or a knocked-out tooth is urgent — offer the next same-day slot. Collect name and phone before booking.', '{"mon":["08:00","17:00"],"tue":["08:00","17:00"],"wed":["08:00","17:00"],"thu":["08:00","17:00"],"fri":["08:00","13:00"],"sat":null,"sun":null}', 60, '[{"name":"Cleaning & exam","minutes":60,"price":149},{"name":"New patient exam + x-rays","minutes":90,"price":199},{"name":"Emergency / toothache visit","minutes":60,"price":95},{"name":"Whitening consult","minutes":30,"price":0}]', 'Escalate to a human for: billing disputes, prescription questions, anything clinical beyond scheduling, facial swelling with fever (tell them to seek urgent care if after hours).', NULL, NULL, 1, 1)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, vertical=excluded.vertical, timezone=excluded.timezone, greeting=excluded.greeting, presets_json=excluded.presets_json, persona=excluded.persona, hours_json=excluded.hours_json, slot_minutes=excluded.slot_minutes, services_json=excluded.services_json, escalation=excluded.escalation, notify_email=excluded.notify_email, sms_number=excluded.sms_number, demo=excluded.demo, active=excluded.active;
INSERT INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active)
VALUES ('mesa-grant-legal', 'Mesa & Grant Legal', 'legal', 'America/Denver', 'Mesa & Grant Legal, intake desk — tell me briefly what''s going on.', '["I need help with a lease dispute","What does a consultation cost?","Can you form an LLC for me?"]', 'You are the intake assistant for Mesa & Grant Legal, a small-business law firm in Las Cruces, NM. Screen enquiries (contract review, lease disputes, entity formation, employment matters), explain the free 20-minute consultation, and book it. Be professional and concise (2–4 sentences). You never give legal advice and you say so plainly if asked for it. Collect name, phone, and a one-line summary of the matter before booking. Do not ask for sensitive details in chat.', '{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","17:00"],"fri":["09:00","16:00"],"sat":null,"sun":null}', 30, '[{"name":"Free consultation (20 min)","minutes":30,"price":0},{"name":"Contract review","minutes":60,"price":350,"note":"flat fee for documents under 15 pages"},{"name":"LLC formation","minutes":60,"price":900,"note":"includes state filing fees"}]', 'Escalate to a human for: criminal matters, family law, personal injury (the firm does not handle these — refer out), anyone describing an emergency or a court date within 7 days.', NULL, NULL, 1, 1)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, vertical=excluded.vertical, timezone=excluded.timezone, greeting=excluded.greeting, presets_json=excluded.presets_json, persona=excluded.persona, hours_json=excluded.hours_json, slot_minutes=excluded.slot_minutes, services_json=excluded.services_json, escalation=excluded.escalation, notify_email=excluded.notify_email, sms_number=excluded.sms_number, demo=excluded.demo, active=excluded.active;

DELETE FROM knowledge WHERE tenant_id IN ('desert-peak-hvac', 'juniper-vine', 'red-rock-dental', 'mesa-grant-legal');
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('desert-peak-hvac', 'Hours and service area', 'Desert Peak HVAC is open Monday through Saturday, 7:00 AM to 7:00 PM. Closed Sundays except for emergency calls. We serve Las Cruces, Mesilla, Santa Teresa, Sunland Park, Anthony, and Vado. We do not currently serve El Paso or Alamogordo.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('desert-peak-hvac', 'Pricing', 'Diagnostic visit: $89, which is waived if you approve the repair the same day. Emergency after-hours fee: $89 on top of the repair. AC tune-up: $129. Furnace tune-up: $129. Spring and fall tune-up bundle: $219. Refrigerant recharge starts at $150 depending on type. We give written quotes before any repair work begins. We accept cash, card, and financing through Wisetack on approved credit.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('desert-peak-hvac', 'Maintenance plan (Peak Club)', 'The Peak Club maintenance plan is $18 per month per system. It includes two tune-ups per year (spring AC, fall furnace), priority scheduling, no after-hours emergency fee, 15% off repairs, and a one-inch filter at each visit. Members can cancel any time after the first 12 months.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('desert-peak-hvac', 'Emergency triage guidance', 'Treat as emergency: no cooling when the outdoor temperature is above 95°F, no heat when below 40°F, water leaking from the air handler near electrical, burning smell from vents, or any gas smell. For a gas smell, tell the customer to leave the building immediately and call the gas company (New Mexico Gas Co. 1-888-664-2726) before we dispatch. Emergency slots are offered the same day; a technician usually arrives within 2 to 4 hours.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('desert-peak-hvac', 'Brands, warranties, and what we don''t do', 'We install and service Carrier, Trane, Lennox, Goodman, and Rheem. We honor manufacturer warranties on units we installed; for units installed by others we can service them but warranty claims go through the original installer. We do not do duct cleaning, swamp cooler installs, or commercial rooftop units over 10 tons — for those we refer out. Full system replacement quotes require an in-home visit from a comfort advisor, which is free.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('juniper-vine', 'Hours and location', 'Juniper & Vine is at 2140 Calle de Guadalupe, Mesilla, NM. Dinner Tuesday to Thursday 5:00 to 9:30 PM, Friday and Saturday 5:00 to 10:00 PM. Sunday brunch 10:00 AM to 2:00 PM. Closed Mondays. Free parking on the plaza lot after 5 PM.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('juniper-vine', 'Reservations and parties', 'We take reservations for parties of 1 to 12. Tables are held 15 minutes past the reservation time. Parties of 7 or more are seated on a 90-minute turn and a 20% service charge is added. For 13 or more, or a full buyout, a manager will call back; private dining room seats 8 to 24 with a $500 deposit applied to the bill. Walk-ins are welcome at the bar.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('juniper-vine', 'Menu overview and dietary options', 'The menu changes seasonally and is sourced from Mesilla Valley farms. Typical dinner: starters $9 to $16, mains $24 to $42, desserts $10. Current favorites: green chile braised short rib, pecan-crusted trout, roasted squash risotto (vegan), and a rotating wood-fired flatbread. Vegan and gluten-free options are available every night and marked on the menu; the kitchen can adapt most dishes with notice. We cannot guarantee a nut-free kitchen. Sunday brunch is $14 to $22 per plate with bottomless mimosas for $18.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('juniper-vine', 'Drinks and corkage', 'Full bar with New Mexico wines, local beers from Spotted Dog and Bosque, and a seasonal cocktail list. Corkage is $25 per 750ml bottle, limit two bottles per table. Happy hour Tuesday to Thursday 5 to 6 PM: $2 off drinks and half-price flatbreads at the bar only.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('juniper-vine', 'Policies', 'Dress is casual. Children are welcome; high chairs available. Dogs are welcome on the patio. We do not split checks more than four ways. Gift cards are sold in-house and online. Cancellations: please cancel at least 4 hours ahead; private dining deposits are refundable with 72 hours notice.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('red-rock-dental', 'Hours and location', 'Red Rock Dental is at 1875 N Main St, Las Cruces, NM. Open Monday to Thursday 8:00 AM to 5:00 PM and Friday 8:00 AM to 1:00 PM. Closed weekends. Same-day emergency visits are held open each morning; call early. Free parking in front.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('red-rock-dental', 'Insurance and payment', 'In-network with Delta Dental, Cigna, MetLife, Aetna, and United Concordia. We file out-of-network claims for most other PPO plans. We do not accept Medicaid or Centennial Care. Cash-pay pricing: cleaning and exam $149, new patient exam with x-rays $199, emergency exam $95, fillings from $180, crowns from $950. CareCredit financing is available. Payment is due at the time of service unless a treatment plan is set up.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('red-rock-dental', 'Appointments and new patients', 'New patients should arrive 15 minutes early or complete forms online. Bring a photo ID and insurance card. Cleanings take about an hour; new patient exams about 90 minutes. We send text reminders 2 days and 2 hours before each visit. Please give 24 hours notice to cancel; a $50 fee applies to no-shows.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('red-rock-dental', 'Urgent dental symptoms', 'Severe toothache, swelling of the face or jaw, a cracked or knocked-out tooth, or bleeding that will not stop should be seen the same day. For a knocked-out adult tooth, keep it moist in milk and come in immediately. Facial swelling with a fever after hours is a medical emergency — go to urgent care or the ER. The office does not give clinical advice over chat; the dentist evaluates at the visit.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('red-rock-dental', 'Services and comfort options', 'Services include cleanings, exams, fillings, crowns, bridges, implants, Invisalign, whitening, and extractions. Dr. Elena Ruiz and Dr. Marcus Hale are the dentists. Nervous patients can request nitrous oxide, a blanket, and headphones. Whitening consultations are free. We offer a free second opinion on treatment plans over $1,500.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('mesa-grant-legal', 'Practice areas and what we do not handle', 'Mesa & Grant Legal serves small businesses in Southern New Mexico: contract drafting and review, commercial lease disputes, LLC and corporation formation, operating agreements, employment agreements and handbooks, trademark registration, and business purchase or sale. We do not handle criminal matters, family law, personal injury, immigration, or bankruptcy, and will refer those out.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('mesa-grant-legal', 'Consultation and fees', 'The first consultation is free, 20 minutes, by phone or video, with attorney Dana Grant or Luis Mesa. Flat fees: contract review $350 for documents under 15 pages; LLC formation $900 including state filing fees and an operating agreement; trademark application $1,200 plus USPTO fees. Hourly matters are billed at $275 per hour with a $2,000 retainer. Written fee agreements are signed before any work begins.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('mesa-grant-legal', 'Hours and location', 'Office at 300 N Downtown Mall, Suite 210, Las Cruces, NM. Monday to Thursday 9:00 AM to 5:00 PM, Friday 9:00 AM to 4:00 PM. Closed weekends. Consultations are scheduled in 30-minute blocks. Parking is in the city garage on Water Street, validated for clients.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('mesa-grant-legal', 'Intake rules for the assistant', 'Collect the caller''s name, phone, business name, and a one-sentence description of the matter. Do not collect Social Security numbers, financial account numbers, or details of any criminal matter in chat. If the caller has a court date or deadline within 7 days, flag it as urgent and request a same-day attorney callback. The assistant never gives legal advice or predicts outcomes; it can describe what the firm does and how engagement works.', unixepoch());
INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES ('mesa-grant-legal', 'Lease disputes — what to bring', 'For commercial lease disputes, the attorney will want a copy of the signed lease, any amendments, written notices exchanged with the landlord or tenant, and a timeline of events. New Mexico generally requires written notice before most lease remedies; the consultation will cover next steps. Clients should not sign anything from the other party before the consultation.', unixepoch());

INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild');
