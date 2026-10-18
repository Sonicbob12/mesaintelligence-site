import { Link, useLocation } from "react-router-dom";

// /privacy and /terms — plain legal pages. The SMS sections carry the exact statements carriers
// require for A2P 10DLC campaign registration (brand name, "message and data rates may apply",
// no selling/sharing of SMS opt-in data, STOP/HELP).

const BRAND = "Mesa Intelligence LLC";
const UPDATED = "October 17, 2026";
const h2 = "font-display text-xl sm:text-2xl font-light tracking-tight mt-12 mb-3";
const p = "text-[#C9C5BF] font-light leading-relaxed mb-4";
const li = "text-[#C9C5BF] font-light leading-relaxed mb-2 ml-5 list-disc";

export default function LegalPage() {
  const isTerms = useLocation().pathname.startsWith("/terms");
  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-6 sm:px-12 lg:px-20 py-16 sm:py-24">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">← Mesa Intelligence</Link>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-8 mb-2">{isTerms ? "Terms & Conditions" : "Privacy Policy"}</h1>
        <p className="text-sm text-[#9E9AA3] mb-10">{BRAND} · Last updated {UPDATED}</p>
        {isTerms ? <Terms /> : <Privacy />}
        <p className="text-sm text-[#9E9AA3] mt-16">
          Questions: <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a> · (575) 254-1185 · {BRAND}, Las Cruces, New Mexico.
          {" "}See also our <Link to={isTerms ? "/privacy" : "/terms"} className="text-[#E5A93C]">{isTerms ? "Privacy Policy" : "Terms & Conditions"}</Link>.
        </p>
      </div>
    </main>
  );
}

function Privacy() {
  return (
    <>
      <p className={p}>{BRAND} ("Mesa Intelligence", "we", "us") builds AI receptionist, scheduling, and follow-up tools for local businesses, and runs demonstrations of those tools on this website. This policy explains what we collect, how we use it, and your choices. It applies to mesaintelligence.ai and to messages sent by the systems we operate for our clients.</p>

      <h2 className={h2}>What we collect</h2>
      <ul>
        <li className={li}>Information you give us: your name, email, phone number, business name, and what you type or say to our agents (chat, voice, or SMS), including appointment details and callback requests.</li>
        <li className={li}>Information from our clients' customers: when a business uses our tools, their customers' names, phone numbers, and appointment details pass through our systems so we can book appointments, send confirmations, and notify the business.</li>
        <li className={li}>Public listing data: for the free Local Discovery audit we retrieve public business information from Google Maps for the business you ask us to audit.</li>
        <li className={li}>Technical data: IP address and basic request logs, used for security and rate limiting.</li>
      </ul>

      <h2 className={h2}>How we use it</h2>
      <ul>
        <li className={li}>To do what you asked: answer questions, book appointments, take messages, send confirmations and reminders, and email the business.</li>
        <li className={li}>To respond to enquiries and audit requests you send us.</li>
        <li className={li}>To operate, secure, and improve the service. We do not use your messages to train AI models.</li>
      </ul>

      <h2 className={h2}>SMS / text messaging</h2>
      <p className={p}>When you give a business that uses Mesa Intelligence your mobile number while booking an appointment or requesting a callback (by phone, website chat, or in person), you agree to receive text messages from that business about your appointment or request, such as confirmations, reminders, and replies to your questions. Message frequency varies by your activity. Message and data rates may apply.</p>
      <p className={p}>You can opt out at any time by replying <strong>STOP</strong> to any message. Reply <strong>HELP</strong> for help, or contact the business directly. Consent to receive text messages is not a condition of purchasing any goods or services.</p>
      <p className={p}><strong>We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.</strong> Mobile information is used only to deliver the messages described above. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</p>

      <h2 className={h2}>Who we share data with</h2>
      <ul>
        <li className={li}>The business you are communicating with (our client), which receives your messages, bookings, and contact details.</li>
        <li className={li}>Service providers that run our infrastructure: Cloudflare (hosting and database), Anthropic (AI language model), Retell AI (voice calls), Twilio (text messaging), Google (calendar and spreadsheets for our clients), Resend (email), and Google Maps Platform (public listing data). They process data only to provide their service to us.</li>
        <li className={li}>Authorities when required by law.</li>
      </ul>
      <p className={p}>We never sell personal information.</p>

      <h2 className={h2}>Retention and security</h2>
      <p className={p}>Conversation records, bookings, and leads are kept for as long as the client business needs them to serve you, and are deleted on request. Data is encrypted in transit and stored with access limited to the people who need it.</p>

      <h2 className={h2}>Your choices</h2>
      <p className={p}>You can ask us to see, correct, or delete the information we hold about you by emailing hello@mesaintelligence.ai. Reply STOP to any text to stop receiving texts. Our services are not directed to children under 13.</p>

      <h2 className={h2}>Changes</h2>
      <p className={p}>We will post any changes to this policy on this page and update the date above.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p className={p}>These terms govern your use of mesaintelligence.ai and the demonstration tools on it, and the AI messaging, voice, and scheduling services {BRAND} operates for its clients. By using the site or interacting with one of our agents, you agree to them.</p>

      <h2 className={h2}>Demonstrations</h2>
      <p className={p}>The demo businesses on this site (for example "Desert Peak HVAC") are fictional. Bookings made in a demo are not real appointments. Demos are rate-limited and may be paused at any time.</p>

      <h2 className={h2}>AI agents</h2>
      <p className={p}>Our agents are automated. They work from the information each business provides and can make mistakes. Always confirm important details, prices, and times with the business. In an emergency, call 911.</p>

      <h2 className={h2}>SMS terms</h2>
      <p className={p}>Businesses using {BRAND} may send you text messages about appointments and requests you made with them: confirmations, reminders, and replies to your questions. By providing your mobile number to such a business, you consent to receive these messages. <strong>Message and data rates may apply.</strong> Message frequency varies.</p>
      <p className={p}>Reply <strong>STOP</strong> at any time to stop receiving messages from that business. Reply <strong>HELP</strong> for help. Carriers are not liable for delayed or undelivered messages. Consent is not a condition of purchase. See our <Link to="/privacy" className="text-[#E5A93C]">Privacy Policy</Link> for how we handle your information; we do not sell or share your SMS opt-in data with third parties for marketing purposes.</p>

      <h2 className={h2}>Acceptable use</h2>
      <p className={p}>Don't use the site or our agents to send spam, attempt to extract other people's data, interfere with the service, or break the law.</p>

      <h2 className={h2}>Client services</h2>
      <p className={p}>Services we build for business clients are governed by the written agreement with that client. Clients own their accounts, prompts, and data. We may suspend service for non-payment or misuse.</p>

      <h2 className={h2}>Disclaimer and liability</h2>
      <p className={p}>The site and demos are provided "as is" without warranties of any kind. To the fullest extent permitted by law, {BRAND} is not liable for indirect, incidental, or consequential damages arising from use of the site or services, and our total liability is limited to the amount you paid us in the twelve months before the claim.</p>

      <h2 className={h2}>Governing law</h2>
      <p className={p}>These terms are governed by the laws of the State of New Mexico. Disputes will be handled in the courts of Doña Ana County, New Mexico.</p>

      <h2 className={h2}>Changes</h2>
      <p className={p}>We may update these terms; the current version is always at mesaintelligence.ai/terms.</p>
    </>
  );
}
