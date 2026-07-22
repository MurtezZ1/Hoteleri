const rooms = [
  ['101', 'Deluxe King', 'Ready'],
  ['102', 'Deluxe King', 'Available'],
  ['201', 'Family Suite', 'Reserved'],
  ['202', 'Family Suite', 'Cleaning'],
  ['301', 'Studio Apartment', 'Maintenance'],
] as const;
const days = [
  'Tue 21',
  'Wed 22',
  'Thu 23',
  'Fri 24',
  'Sat 25',
  'Sun 26',
  'Mon 27',
];

export function CalendarBoard(): React.ReactElement {
  return (
    <section className="w-full overflow-x-auto rounded-md border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,31,61,0.06)]">
      <div className="min-w-[940px]">
        <div className="grid grid-cols-[164px_repeat(7,minmax(104px,1fr))] border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <div className="px-4 py-3">Room</div>
          {days.map((day) => (
            <div key={day} className="border-l border-slate-200 px-3 py-3">
              {day}
            </div>
          ))}
        </div>
        {rooms.map(([room, type, status], index) => (
          <div
            key={room}
            className="grid min-h-[72px] grid-cols-[164px_repeat(7,minmax(104px,1fr))] border-b border-slate-100 last:border-b-0"
          >
            <div className="flex flex-col justify-center px-4">
              <span className="text-sm font-semibold text-navy">
                Room {room}
              </span>
              <span className="text-xs text-slate-500">{type}</span>
              <span className="mt-1 w-fit rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {status}
              </span>
            </div>
            {days.map((day) => (
              <div
                key={`${room}-${day}`}
                className="border-l border-slate-100 p-2"
              />
            ))}
            {index === 0 ? (
              <div className="col-start-2 col-end-5 row-start-1 m-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm">
                <span className="block">Elena Novak</span>
                <span className="font-medium text-blue-100">
                  Confirmed - Paid
                </span>
              </div>
            ) : null}
            {index === 2 ? (
              <div className="col-start-5 col-end-8 row-start-1 m-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm">
                <span className="block">Direct booking</span>
                <span className="font-medium text-emerald-100">
                  Arrives Fri
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
