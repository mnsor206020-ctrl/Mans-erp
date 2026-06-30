export default function JECreate() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">New Journal Entry</h1>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
          <h2 className="text-base font-semibold text-gray-800 mb-5">Entry Header</h2>

          <div className="grid grid-cols-2 gap-5">

            {/* Fiscal Year */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Fiscal Year <span className="text-red-500">*</span>
              </label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>FY 2026 (Jan 1 – Dec 31, 2026)</option>
              </select>
            </div>

            {/* Entry Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Entry Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                defaultValue="2026-06-30"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Type</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>Manual</option>
                <option>Automatic</option>
                <option>Opening</option>
                <option>Closing</option>
                <option>Adjustment</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Currency</label>
              <div className="flex gap-2">
                <select className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>SAR — Saudi Riyal</option>
                  <option>USD — US Dollar</option>
                  <option>EUR — Euro</option>
                </select>
                <div className="w-28">
                  <input
                    type="number"
                    defaultValue="1"
                    placeholder="Rate"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Description (English) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description (English)</label>
              <input
                type="text"
                placeholder="Enter description in English"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description (Arabic) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description (Arabic)</label>
              <input
                type="text"
                dir="rtl"
                placeholder="أدخل الوصف بالعربية"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
              />
            </div>

            {/* Reference */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reference</label>
              <input
                type="text"
                placeholder="Invoice / PO / Contract reference (optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

          </div>
        </div>

        {/* Sprint 2.1 info banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 flex items-start gap-3">
          <span className="text-amber-600 text-sm mt-0.5">ℹ</span>
          <p className="text-sm text-amber-800">
            <strong>Sprint 2.1 — Header-only draft.</strong> Journal lines will be added in Sprint 2.2.
            You can save this draft and add line items later.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 bg-white hover:bg-gray-50">
            Cancel
          </button>
          <button className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save as Draft
          </button>
        </div>

      </div>
    </div>
  );
}
