export default function JEEdit() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Edit Journal Entry</h1>
          <span className="ml-2 font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">JE-2026-0003</span>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">Draft</span>
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
                <option selected>FY 2026 (Jan 1 – Dec 31, 2026)</option>
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
                <option selected>Manual</option>
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
                  <option selected>SAR — Saudi Riyal</option>
                  <option>USD — US Dollar</option>
                </select>
                <input
                  type="number"
                  defaultValue="1"
                  className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Description (English) — pre-populated */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description (English)</label>
              <input
                type="text"
                defaultValue="Office supplies purchase"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 border-blue-200"
              />
            </div>

            {/* Description (Arabic) — pre-populated */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description (Arabic)</label>
              <input
                type="text"
                dir="rtl"
                defaultValue="شراء مستلزمات مكتبية"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
              />
            </div>

            {/* Reference — pre-populated */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reference</label>
              <input
                type="text"
                defaultValue="INV-2026-0548"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

          </div>
        </div>

        {/* Edit guard notice */}
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 flex items-start gap-3">
          <span className="text-green-600 text-sm mt-0.5">✓</span>
          <p className="text-sm text-green-800">
            <strong>DRAFT status — editable.</strong> Posted entries are locked and cannot be edited.
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
