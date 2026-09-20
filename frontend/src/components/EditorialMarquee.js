const items = [
  "24/7 HVAC DISPATCH", "AFTER-HOURS CALL ANSWERING", "AUTO RESTAURANT BOOKINGS",
  "PATIENT INTAKE AI", "SMART INVENTORY SIGNALS", "AFTER-HOURS LEAD CAPTURE",
];

export default function EditorialMarquee() {
  const row = [...items, ...items];
  return (
    <div className="border-y border-white/8 py-6 overflow-hidden bg-[#0D0E11]" data-testid="editorial-marquee">
      <div className="flex whitespace-nowrap animate-marquee w-max">
        {row.map((item, i) => (
          <span key={i} className="flex items-center font-serif-accent italic font-light text-2xl sm:text-3xl text-[#9E9AA3]/50 px-8">
            {item}
            <span className="ml-16 w-1.5 h-1.5 rounded-full bg-[#D96B43]/50 inline-block" />
          </span>
        ))}
      </div>
    </div>
  );
}
