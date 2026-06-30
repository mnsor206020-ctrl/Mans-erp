const STATUS_COLORS: Record<string, string> = {
  DRAFT:        "bg-slate-100 text-slate-700 border border-slate-200",
  UNDER_REVIEW: "bg-amber-100 text-amber-800 border border-amber-200",
  APPROVED:     "bg-blue-100 text-blue-800 border border-blue-200",
  POSTED:       "bg-green-100 text-green-800 border border-green-200",
};

const MOCK_ENTRIES = [
  { number: "JE-2026-0003", date: "2026-06-30", type: "Manual",     status: "DRAFT",        descEn: "Office supplies purchase",   dr: "1,500.00", cr: "1,500.00" },
  { number: "JE-2026-0002", date: "2026-06-28", type: "Manual",     status: "UNDER_REVIEW", descEn: "Vendor payment — Al Salam",  dr: "8,200.00", cr: "8,200.00" },
  { number: "JE-2026-0001", date: "2026-06-15", type: "Opening",    status: "POSTED",       descEn: "Opening balances FY 2026",   dr: "250,000.00", cr: "250,000.00" },
  { number: "JE-2025-0042", date: "2025-12-31", type: "Closing",    status: "POSTED",       descEn: "Year-end closing entry",     dr: "180,000.00", cr: "180,000.00" },
  { number: "JE-2025-0041", date: "2025-12-28", type: "Adjustment", status: "APPROVED",     descEn: "Depreciation adjustment Q4", dr: "3,750.00",  cr: "3,750.00" },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", UNDER_REVIEW: "Under Review", APPROVED: "Approved", POSTED: "Posted",
};

export default function JEList() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Journal Entries</h1>
            <p className="text-sm text-gray-500 mt-0.5">Double-entry bookkeeping and accounting workflow</p>
          </div>
          <button className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">
            <span>+</span> New Journal Entry
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search journal entries..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select className="text-sm border border-gray-200 rounded-lg bg-white px-3 py-2 focus:outline-none">
            <option>All Types</option>
            <option>Manual</option>
            <option>Opening</option>
            <option>Closing</option>
            <option>Adjustment</option>
          </select>
          <button className="text-sm border border-gray-200 rounded-lg bg-white px-3 py-2 text-gray-600">↻ Refresh</button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
          {["All", "Draft", "Under Review", "Approved", "Posted", "Locked", "Reversed", "Voided"].map((tab, i) => (
            <button
              key={tab}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                i === 0 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Number", "Date", "Type", "Status", "Description", "Debit (SAR)", "Credit (SAR)", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_ENTRIES.map(e => (
                <tr key={e.number} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-600 text-xs">{e.number}</td>
                  <td className="px-4 py-3 text-gray-700">{e.date}</td>
                  <td className="px-4 py-3 text-gray-600">{e.type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] || ""}`}>
                      {STATUS_LABELS[e.status] || e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{e.descEn}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">{e.dr}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">{e.cr}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-gray-400 hover:text-gray-600 px-2">⋯</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">Showing 5 of 5 entries</span>
            <div className="flex items-center gap-1">
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded text-gray-500 disabled:opacity-40">‹ Prev</button>
              <button className="px-2.5 py-1 text-xs border border-blue-500 bg-blue-50 text-blue-600 rounded font-medium">1</button>
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded text-gray-500 disabled:opacity-40">Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
