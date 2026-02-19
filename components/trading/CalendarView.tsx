'use client';

import { useState } from 'react';
import { Calendar, Upload, FileSpreadsheet } from 'lucide-react';

export default function CalendarView() {
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header with Import Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-[#F97316]" />
          <h2 className="text-xl font-bold text-white">Trade Calendar</h2>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg transition-colors font-medium"
        >
          <Upload className="w-4 h-4" />
          Import Spreadsheet
        </button>
      </div>

      {/* Calendar Placeholder */}
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <Calendar className="w-16 h-16 text-[#8b949e] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Calendar View</h3>
        <p className="text-[#8b949e] mb-4">Monthly calendar with daily P&L coloring coming soon...</p>
        
        <div className="flex items-center justify-center gap-2 text-sm text-[#8b949e]">
          <FileSpreadsheet className="w-4 h-4" />
          <span>CSV/Excel import supported</span>
        </div>
      </div>

      {/* Import Modal Placeholder */}
      {showImport && (
        <SpreadsheetImportModal onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

function SpreadsheetImportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileSpreadsheet className="w-6 h-6 text-[#238636]" />
          <h2 className="text-xl font-bold text-white">Import Trades from Spreadsheet</h2>
        </div>
        
        <div className="border-2 border-dashed border-[#30363d] rounded-xl p-8 text-center">
          <Upload className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Drag & drop CSV or Excel file</p>
          <p className="text-sm text-[#8b949e] mb-4">Supports ThinkOrSwim, Interactive Brokers, and generic formats</p>
          <button className="px-4 py-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors">
            Select File
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#8b949e] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button className="px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors">
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
