import { useState } from "react";
import { Link } from "react-router-dom";
import SmsConsent, { SMS_CONSENT_TEXT } from "@/components/SmsConsent";

// /sms — public SMS program disclosure + call-to-action page. This is the page carriers and
// Twilio reviewers verify for A2P 10DLC (error 30909 = CTA not verifiable). It shows, in one place:
// the program description, both opt-in methods word for word, and every required disclosure.

const BRAND = "Mesa Intelligence LLC";
const PHONE = "(575) 254-1185";
const h2 = "font-display text-xl sm:text-2xl font-light tracking-tight mt-12 mb-3";
const p = "text-[#C9C5BF] font-light leading-relaxed mb-4";
const li = "text-[#C9C5BF] font-light leading-relaxed mb-2 ml-5 list-disc";
const box = "border border-white/15 bg-[#14161A] p-5 my-4 text-[#F5F3EF] font-light leading-relaxed";

const field = "w-full bg-transparent border border-white/15 px-4 py-3 text-sm font-light placeholder:text-[#9E9AA3]/60 focus:outline-none focus:border-[#D96B43]";

// Live web opt-in form — the exact Call-to-Action reviewers can test at mesaintelligence.ai/sms.
function OptInForm() {
  const [f, setF] = useState({ name: "", phone: "", email: "", website: "", sms_consent: false });
  const [state, setState] = useState({ busy: false, done: false, error: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.sms_consent) return setState({ busy: false, done: false, error: "Check the box to agree to receive texts." });
    if (f.phone.replace(/\D/g, "").length < 10) return setState({ busy: false, done: false, error: "Enter a 10-digit mobile number." });
    setState({ busy: true, done: false, error: "" });
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, source: "sms_optin", sms_consent_text: SMS_CONSENT_TEXT }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Something went wrong — please try again.");
      setState({ busy: false, done: true, error: "" });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message });
    }
  };
  if (state.done) {
    return (
      <div className={box} data-testid="sms-optin-success">
        Thanks — you're opted in. Mesa Intelligence will text you about your request from {PHONE}. Reply STOP at any time to opt out or HELP for help.
      </div>
    );
  }
  return (
    <form onSubmit={submit} data-testid="sms-optin-form" className="border border-white/15 bg-[#14161A] p-5 my-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="text" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input required value={f.name} onChange={set("name")} placeholder="Your name" className={field} data-testid="sms-optin-name" />
      <input required type="tel" value={f.phone} onChange={set("phone")} placeholder="Mobile number" className={field} data-testid="sms-optin-phone" />
      <input type="email" value={f.email} onChange={set("email")} placeholder="Email (optional)" className={`${field} sm:col-span-2`} />
      <SmsConsent id="sms-optin-consent" testid="sms-optin-consent" checked={f.sms_consent} onChange={(v) => setF((x) => ({ ...x, sms_consent: v }))} />
      {state.error && <p className="sm:col-span-2 text-sm text-[#E5A93C]">{state.error}</p>}
      <button type="submit" disabled={state.busy} data-testid="sms-optin-submit"
              className="sm:col-span-2 bg-[#D96B43] text-[#0B0C0E] font-mono text-xs uppercase tracking-[0.2em] px-6 py-4 hover:bg-[#E5A93C] disabled:opacity-50">
        {state.busy ? "Sending…" : "Text me"}
      </button>
    </form>
  );
}

export default function SmsPage() {
  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-6 sm:px-12 lg:px-20 py-16 sm:py-24">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">← Mesa Intelligence</Link>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-8 mb-2">SMS Program &amp; Consent</h1>
        <p className="text-sm text-[#9E9AA3] mb-10">{BRAND} · Appointment confirmations, reminders and replies</p>

        <h2 className={h2}>Sign up for texts</h2>
        <p className={p}>Want Mesa Intelligence to text you about your enquiry or appointment? Enter your mobile number and check the box. The box is never pre-checked, and you can still contact us without agreeing to texts.</p>
        <OptInForm />

        <h2 className={h2}>What this program is</h2>
        <p className={p}>{BRAND} ("Mesa Intelligence") operates AI receptionist and scheduling software for local service businesses (HVAC, plumbing, dental, legal and similar). Mesa Intelligence texts people from {PHONE} only after they opt in: replies to enquiries sent to Mesa Intelligence, consultation confirmations and reminders, and — when a customer books an appointment or asks for a callback through one of our client businesses — an appointment confirmation, a reminder the day before, and replies to the customer's own questions. We do not send marketing or promotional texts.</p>

        <h2 className={h2}>Program disclosures</h2>
        <ul>
          <li className={li}><strong>Program name:</strong> Mesa Intelligence appointment texts (sent on behalf of the business you contacted).</li>
          <li className={li}><strong>Message frequency:</strong> varies by your activity — typically 1–3 messages per appointment or request.</li>
          <li className={li}><strong>Message and data rates may apply.</strong></li>
          <li className={li}><strong>Opt out:</strong> reply <strong>STOP</strong> to any message at any time. You will receive one final confirmation and no further texts.</li>
          <li className={li}><strong>Help:</strong> reply <strong>HELP</strong>, email <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a>, or call {PHONE}.</li>
          <li className={li}><strong>Consent is not a condition of purchase</strong> of any goods or services.</li>
          <li className={li}>We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. See our <Link to="/privacy" className="text-[#E5A93C]">Privacy Policy</Link> and <Link to="/terms" className="text-[#E5A93C]">Terms &amp; Conditions</Link>.</li>
        </ul>

        <h2 className={h2}>How customers opt in</h2>
        <p className={p}>People opt in in one of four ways. In every case, consent is collected before any text is sent, and consent is never required to buy anything or to contact us.</p>

        <p className={p}><strong>1. Web opt-in form (this page).</strong> The form at the top of <a href="/sms" className="text-[#E5A93C]">mesaintelligence.ai/sms</a> asks for a name and mobile number and an unchecked checkbox that reads:</p>
        <blockquote className={box}>"{SMS_CONSENT_TEXT}" — with links to SMS Terms, Privacy Policy and Terms.</blockquote>
        <p className={p}>The form cannot be submitted for texts unless the box is checked. Each opt-in is recorded with the date, time, IP address and the exact wording agreed to.</p>

        <p className={p}><strong>2. Website contact form.</strong> The contact form at <a href="/#contact" className="text-[#E5A93C]">mesaintelligence.ai/#contact</a> has an optional mobile number field and the same unchecked checkbox. The enquiry can be sent without checking it; texts are only sent when it is checked.</p>

        <p className={p}><strong>3. By phone (verbal opt-in).</strong> After the customer provides a mobile number, the business's phone assistant reads this script and waits for a "yes":</p>
        <blockquote className={box}>"Just so you know, [Business Name] will send you a text confirmation of this appointment and a reminder the day before. Message frequency varies and message and data rates may apply. Reply STOP at any time to opt out or HELP for help. Is that okay?"</blockquote>
        <p className={p}>If the customer declines, no texts are sent and the booking proceeds without them.</p>

        <p className={p}><strong>4. By website chat.</strong> This notice is displayed directly beneath the chat message box on every page where a customer can book or leave a number, before they enter it:</p>
        <blockquote className={box}>"If you give a mobile number, [Business Name] may text you about your appointment or request (confirmations, reminders, replies). Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. SMS terms · Privacy · Terms"</blockquote>
        <p className={p}>The chat assistant also repeats the disclosure when it takes the number. Screenshot of the notice as shown on <a href="/#demo" className="text-[#E5A93C]">mesaintelligence.ai</a>:</p>
        <img src="/sms-consent-closeup.png" alt="Close-up of the SMS consent notice beneath the chat message box" className="border border-white/15 my-4 max-w-full" />
        <img src="/sms-consent.png" alt="Full page: website chat with the SMS consent notice beneath the message box" className="border border-white/15 my-4 max-w-full" />

        <h2 className={h2}>Sample messages</h2>
        <blockquote className={box}>Hi Maria, this is Bobby at Mesa Intelligence. Thanks for your enquiry — are you free for a 15-minute call tomorrow at 10 AM? Reply STOP to opt out.</blockquote>
        <blockquote className={box}>Hi Robert, this is Desert Peak HVAC. You're booked: AC tune-up on Mon, Oct 20, 10:00 AM. Confirmation A1B2C3. Reply if anything changes. Reply STOP to opt out.</blockquote>
        <blockquote className={box}>Hi Robert, reminder from Desert Peak HVAC: your AC tune-up is Mon, Oct 20, 10:00 AM. Reply if you need to reschedule. Reply STOP to opt out.</blockquote>
        <p className="text-sm text-[#9E9AA3]">"Desert Peak HVAC" is the fictional demonstration business on this site. Live messages carry the name of the real business the customer contacted and identify Mesa Intelligence as the sender platform in the business's privacy terms.</p>

        <p className="text-sm text-[#9E9AA3] mt-16">
          {BRAND} · Las Cruces, New Mexico · <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a> · {PHONE}
        </p>
      </div>
    </main>
  );
}
