// SMS consent wording, shared by the contact form and the /sms opt-in form so carriers see the
// same disclosure everywhere. The checkbox is never pre-checked and is never required to submit
// the contact form (consent is not a condition of purchase).

export const SMS_CONSENT_TEXT =
  "Yes, text me about my enquiry. By checking this box, I agree to receive text messages from Mesa Intelligence LLC at the number provided " +
  "(replies to my enquiry, appointment confirmations and reminders). Message frequency varies. Msg & data rates may apply. " +
  "Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.";

export default function SmsConsent({ checked, onChange, id = "sms-consent", testid = "sms-consent-checkbox" }) {
  return (
    <label htmlFor={id} className="sm:col-span-2 flex items-start gap-3 cursor-pointer text-xs leading-relaxed text-[#9E9AA3] font-light">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testid}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#D96B43]"
      />
      <span>
        {SMS_CONSENT_TEXT}{" "}
        <a href="/sms" className="underline hover:text-[#E5A93C]">SMS Terms</a> ·{" "}
        <a href="/privacy" className="underline hover:text-[#E5A93C]">Privacy Policy</a> ·{" "}
        <a href="/terms" className="underline hover:text-[#E5A93C]">Terms</a>
      </span>
    </label>
  );
}
